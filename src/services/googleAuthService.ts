export interface GoogleAccountInfo {
  name?: string;
  email?: string;
  picture?: string;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

interface StoredTokenInfo {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope: string;
}

const GOOGLE_AUTH_KEY = 'google_auth_token';
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

// PKCE utility functions
const generateCodeVerifier = (): string => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
};

const base64UrlEncode = (array: Uint8Array): string => {
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

const generateCodeChallenge = async (verifier: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(hash));
};

// Refresh access token using refresh token
const refreshAccessToken = async (refreshToken: string): Promise<StoredTokenInfo> => {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('토큰 갱신 실패:', response.status, errorText);
    throw new Error('토큰 갱신에 실패했습니다.');
  }

  const data = await response.json();
  const tokenInfo: StoredTokenInfo = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken, // Keep old refresh token if new one not provided
    expiresAt: Date.now() + (data.expires_in * 1000),
    scope: data.scope || '',
  };

  localStorage.setItem(GOOGLE_AUTH_KEY, JSON.stringify(tokenInfo));
  console.log('토큰 갱신 성공');
  return tokenInfo;
};

// Google OAuth 2.0 popup login with PKCE
export const loginGoogle = async (): Promise<GoogleAccountInfo | null> => {
  return new Promise(async (resolve, reject) => {
    // Generate PKCE parameters
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    // Store code verifier for later use
    sessionStorage.setItem('google_code_verifier', codeVerifier);

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.append('client_id', GOOGLE_CLIENT_ID);
    authUrl.searchParams.append('redirect_uri', window.location.origin);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', SCOPES.join(' '));
    authUrl.searchParams.append('access_type', 'offline'); // Request refresh token
    authUrl.searchParams.append('prompt', 'consent'); // Force consent to get refresh token
    authUrl.searchParams.append('code_challenge', codeChallenge);
    authUrl.searchParams.append('code_challenge_method', 'S256');

    const width = 500;
    const height = 600;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      authUrl.toString(),
      'Google Login',
      `width=${width},height=${height},left=${left},top=${top}`
    );

    if (!popup) {
      reject(new Error('팝업이 차단되었습니다.'));
      return;
    }

    // Listen for OAuth redirect
    const checkPopup = setInterval(() => {
      try {
        if (popup.closed) {
          clearInterval(checkPopup);
          sessionStorage.removeItem('google_code_verifier');
          reject(new Error('로그인이 취소되었습니다.'));
          return;
        }

        // Check if popup redirected back to our domain
        if (popup.location.origin === window.location.origin) {
          const searchParams = new URLSearchParams(popup.location.search);
          const code = searchParams.get('code');
          clearInterval(checkPopup);
          popup.close();

          if (code) {
            // Exchange authorization code for tokens
            exchangeCodeForTokens(code, codeVerifier)
              .then(resolve)
              .catch(reject);
          } else {
            sessionStorage.removeItem('google_code_verifier');
            reject(new Error('인증 코드를 받지 못했습니다.'));
          }
        }
      } catch (e) {
        // Cross-origin error, popup not on our domain yet
      }
    }, 500);
  });
};

// Exchange authorization code for access and refresh tokens
const exchangeCodeForTokens = async (
  code: string,
  codeVerifier: string
): Promise<GoogleAccountInfo> => {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        code,
        code_verifier: codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: window.location.origin,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('토큰 교환 실패:', response.status, errorText);
      throw new Error('토큰 교환에 실패했습니다.');
    }

    const data = await response.json();

    // Store tokens
    const tokenInfo: StoredTokenInfo = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (data.expires_in * 1000),
      scope: data.scope || '',
    };
    localStorage.setItem(GOOGLE_AUTH_KEY, JSON.stringify(tokenInfo));
    sessionStorage.removeItem('google_code_verifier');

    console.log('Google 로그인 성공, refresh token 획득:', !!data.refresh_token);

    // Get user info
    return await getUserInfo(data.access_token);
  } catch (error) {
    sessionStorage.removeItem('google_code_verifier');
    throw error;
  }
};

// Silent login - check for existing valid token
export const loginGoogleSilently = async (): Promise<GoogleAccountInfo | null> => {
  const stored = localStorage.getItem(GOOGLE_AUTH_KEY);
  if (!stored) {
    return null;
  }

  try {
    let tokenInfo: StoredTokenInfo = JSON.parse(stored);

    // Check if token is expired
    if (Date.now() >= tokenInfo.expiresAt) {
      console.log('Google access token이 만료되었습니다.');

      // Try to refresh using refresh token
      if (tokenInfo.refreshToken) {
        console.log('Refresh token으로 자동 갱신 시도...');
        try {
          tokenInfo = await refreshAccessToken(tokenInfo.refreshToken);
          console.log('토큰 자동 갱신 성공!');
        } catch (error) {
          console.error('토큰 갱신 실패:', error);
          localStorage.removeItem(GOOGLE_AUTH_KEY);
          return null;
        }
      } else {
        console.log('Refresh token이 없습니다. 재로그인이 필요합니다.');
        localStorage.removeItem(GOOGLE_AUTH_KEY);
        return null;
      }
    }

    // Token is valid, get user info
    const userInfo = await getUserInfo(tokenInfo.accessToken);
    console.log('Google 자동 로그인 성공:', userInfo.email);
    return userInfo;
  } catch (error) {
    console.error('Google 자동 로그인 실패:', error);
    localStorage.removeItem(GOOGLE_AUTH_KEY);
    return null;
  }
};

// Logout
export const logoutGoogle = async (): Promise<void> => {
  localStorage.removeItem(GOOGLE_AUTH_KEY);
  console.log('Google 로그아웃 완료');
};

// Get current Google account (with auto-refresh)
export const getGoogleAccount = async (): Promise<GoogleAccountInfo | null> => {
  const stored = localStorage.getItem(GOOGLE_AUTH_KEY);
  if (!stored) {
    return null;
  }

  try {
    let tokenInfo: StoredTokenInfo = JSON.parse(stored);

    // Check if token is expired
    if (Date.now() >= tokenInfo.expiresAt) {
      console.log('Google access token이 만료되었습니다.');

      // Try to refresh using refresh token
      if (tokenInfo.refreshToken) {
        console.log('Refresh token으로 자동 갱신 시도...');
        try {
          tokenInfo = await refreshAccessToken(tokenInfo.refreshToken);
          console.log('토큰 자동 갱신 성공!');
        } catch (error) {
          console.error('토큰 갱신 실패:', error);
          localStorage.removeItem(GOOGLE_AUTH_KEY);
          return null;
        }
      } else {
        console.log('Refresh token이 없습니다.');
        localStorage.removeItem(GOOGLE_AUTH_KEY);
        return null;
      }
    }

    return await getUserInfo(tokenInfo.accessToken);
  } catch (error) {
    console.error('Google 계정 정보 가져오기 실패:', error);
    localStorage.removeItem(GOOGLE_AUTH_KEY);
    return null;
  }
};

// Get access token (with validity check and auto-refresh)
export const getGoogleAccessToken = async (): Promise<string> => {
  const stored = localStorage.getItem(GOOGLE_AUTH_KEY);
  if (!stored) {
    throw new Error('Google 로그인이 필요합니다');
  }

  let tokenInfo: StoredTokenInfo = JSON.parse(stored);

  // Check if token is expired or expiring soon (within 5 minutes)
  const timeUntilExpiry = tokenInfo.expiresAt - Date.now();
  if (timeUntilExpiry <= 5 * 60 * 1000) {
    // Try to refresh using refresh token
    if (tokenInfo.refreshToken) {
      console.log('토큰이 만료되었거나 곧 만료됩니다. 자동 갱신 시도...');
      try {
        tokenInfo = await refreshAccessToken(tokenInfo.refreshToken);
        console.log('토큰 자동 갱신 성공!');
      } catch (error) {
        console.error('토큰 갱신 실패:', error);
        localStorage.removeItem(GOOGLE_AUTH_KEY);
        throw new Error('Google 토큰 갱신에 실패했습니다. 다시 로그인해주세요.');
      }
    } else {
      localStorage.removeItem(GOOGLE_AUTH_KEY);
      throw new Error('Google 토큰이 만료되었습니다. 다시 로그인해주세요.');
    }
  }

  return tokenInfo.accessToken;
};

// Helper: Get user info from Google API
const getUserInfo = async (accessToken: string): Promise<GoogleAccountInfo> => {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google 사용자 정보 API 오류:', response.status, errorText);
      throw new Error(`사용자 정보를 가져올 수 없습니다. (${response.status})`);
    }

    const data = await response.json();
    return {
      name: data.name,
      email: data.email,
      picture: data.picture,
    };
  } catch (error) {
    console.error('getUserInfo 오류:', error);
    throw error;
  }
};
