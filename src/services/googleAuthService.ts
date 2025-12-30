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


// Google OAuth 2.0 popup login
export const loginGoogle = (): Promise<GoogleAccountInfo | null> => {
  return new Promise((resolve, reject) => {
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.append('client_id', GOOGLE_CLIENT_ID);
    authUrl.searchParams.append('redirect_uri', window.location.origin);
    authUrl.searchParams.append('response_type', 'token');
    authUrl.searchParams.append('scope', SCOPES.join(' '));
    authUrl.searchParams.append('prompt', 'select_account');

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
          reject(new Error('로그인이 취소되었습니다.'));
          return;
        }

        // Check if popup redirected back to our domain
        if (popup.location.origin === window.location.origin) {
          const hash = popup.location.hash;
          clearInterval(checkPopup);
          popup.close();

          if (hash && hash.includes('access_token')) {
            const params = new URLSearchParams(hash.substring(1));
            const accessToken = params.get('access_token');
            const expiresIn = parseInt(params.get('expires_in') || '3600');
            const scope = params.get('scope') || '';

            if (accessToken) {
              // Store token info with extended expiration (use full token lifetime)
              const tokenInfo: StoredTokenInfo = {
                accessToken,
                expiresAt: Date.now() + expiresIn * 1000,
                scope,
              };
              localStorage.setItem(GOOGLE_AUTH_KEY, JSON.stringify(tokenInfo));

              // Get user info
              getUserInfo(accessToken)
                .then(resolve)
                .catch(reject);
            } else {
              reject(new Error('액세스 토큰을 받지 못했습니다.'));
            }
          } else {
            reject(new Error('인증에 실패했습니다.'));
          }
        }
      } catch (e) {
        // Cross-origin error, popup not on our domain yet
      }
    }, 500);
  });
};

// Silent login - check for existing valid token
export const loginGoogleSilently = async (): Promise<GoogleAccountInfo | null> => {
  const stored = localStorage.getItem(GOOGLE_AUTH_KEY);
  if (!stored) {
    return null;
  }

  try {
    const tokenInfo: StoredTokenInfo = JSON.parse(stored);

    // Check if token is expired
    if (Date.now() >= tokenInfo.expiresAt) {
      // Token expired, remove it
      console.log('Google 토큰이 만료되었습니다. 재로그인이 필요합니다.');
      localStorage.removeItem(GOOGLE_AUTH_KEY);
      return null;
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

// Get current Google account
export const getGoogleAccount = async (): Promise<GoogleAccountInfo | null> => {
  const stored = localStorage.getItem(GOOGLE_AUTH_KEY);
  if (!stored) {
    return null;
  }

  try {
    const tokenInfo: StoredTokenInfo = JSON.parse(stored);

    // Check if token is expired
    if (Date.now() >= tokenInfo.expiresAt) {
      console.log('Google 토큰이 만료되었습니다.');
      localStorage.removeItem(GOOGLE_AUTH_KEY);
      return null;
    }

    return await getUserInfo(tokenInfo.accessToken);
  } catch (error) {
    console.error('Google 계정 정보 가져오기 실패:', error);
    localStorage.removeItem(GOOGLE_AUTH_KEY);
    return null;
  }
};

// Get access token (with validity check)
export const getGoogleAccessToken = async (): Promise<string> => {
  const stored = localStorage.getItem(GOOGLE_AUTH_KEY);
  if (!stored) {
    throw new Error('Google 로그인이 필요합니다');
  }

  const tokenInfo: StoredTokenInfo = JSON.parse(stored);

  // Check if token is expired
  if (Date.now() >= tokenInfo.expiresAt) {
    localStorage.removeItem(GOOGLE_AUTH_KEY);
    throw new Error('Google 토큰이 만료되었습니다. 다시 로그인해주세요.');
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
