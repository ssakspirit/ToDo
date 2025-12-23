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

// Token refresh timer
let tokenRefreshTimer: number | null = null;

// Schedule token refresh before expiration
const scheduleTokenRefresh = (expiresAt: number) => {
  // Clear existing timer
  if (tokenRefreshTimer) {
    clearTimeout(tokenRefreshTimer);
  }

  // Calculate time until token expires (refresh 5 minutes before expiration)
  const refreshTime = expiresAt - Date.now() - 5 * 60 * 1000;

  if (refreshTime > 0) {
    tokenRefreshTimer = window.setTimeout(async () => {
      console.log('토큰 자동 갱신 시도...');
      try {
        await refreshTokenSilently();
      } catch (error) {
        console.error('토큰 자동 갱신 실패:', error);
      }
    }, refreshTime);
  }
};

// Silently refresh token using prompt=none in a small popup
const refreshTokenSilently = (): Promise<GoogleAccountInfo | null> => {
  return new Promise((resolve, reject) => {
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.append('client_id', GOOGLE_CLIENT_ID);
    authUrl.searchParams.append('redirect_uri', window.location.origin);
    authUrl.searchParams.append('response_type', 'token');
    authUrl.searchParams.append('scope', SCOPES.join(' '));
    authUrl.searchParams.append('prompt', 'none'); // No user interaction

    // Open a small, hidden popup
    const width = 1;
    const height = 1;
    const left = -1000;
    const top = -1000;

    const popup = window.open(
      authUrl.toString(),
      'Google Token Refresh',
      `width=${width},height=${height},left=${left},top=${top}`
    );

    if (!popup) {
      reject(new Error('팝업이 차단되었습니다.'));
      return;
    }

    const timeout = setTimeout(() => {
      if (popup && !popup.closed) {
        popup.close();
      }
      reject(new Error('토큰 갱신 타임아웃'));
    }, 10000);

    // Check for OAuth redirect
    const checkPopup = setInterval(() => {
      try {
        if (popup.closed) {
          clearInterval(checkPopup);
          clearTimeout(timeout);
          reject(new Error('토큰 갱신이 취소되었습니다.'));
          return;
        }

        // Check if popup redirected back to our domain
        if (popup.location.origin === window.location.origin) {
          const hash = popup.location.hash;
          clearInterval(checkPopup);
          clearTimeout(timeout);
          popup.close();

          if (hash && hash.includes('access_token')) {
            const params = new URLSearchParams(hash.substring(1));
            const accessToken = params.get('access_token');
            const expiresIn = parseInt(params.get('expires_in') || '3600');
            const scope = params.get('scope') || '';

            if (accessToken) {
              const tokenInfo: StoredTokenInfo = {
                accessToken,
                expiresAt: Date.now() + expiresIn * 1000,
                scope,
              };
              localStorage.setItem(GOOGLE_AUTH_KEY, JSON.stringify(tokenInfo));
              scheduleTokenRefresh(tokenInfo.expiresAt);

              getUserInfo(accessToken)
                .then(resolve)
                .catch(reject);
            } else {
              reject(new Error('액세스 토큰을 받지 못했습니다.'));
            }
          } else if (hash && hash.includes('error')) {
            // Check for errors (e.g., user not logged in to Google)
            const params = new URLSearchParams(hash.substring(1));
            const error = params.get('error');
            console.error('토큰 갱신 오류:', error);
            reject(new Error(`토큰 갱신 실패: ${error}`));
          } else {
            reject(new Error('토큰 갱신에 실패했습니다.'));
          }
        }
      } catch (e) {
        // Cross-origin error, popup not on our domain yet
      }
    }, 100);
  });
};

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
              // Store token info
              const tokenInfo: StoredTokenInfo = {
                accessToken,
                expiresAt: Date.now() + expiresIn * 1000,
                scope,
              };
              localStorage.setItem(GOOGLE_AUTH_KEY, JSON.stringify(tokenInfo));

              // Schedule automatic token refresh
              scheduleTokenRefresh(tokenInfo.expiresAt);

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

    // Check if token is expired or expiring soon (within 10 minutes)
    const timeUntilExpiry = tokenInfo.expiresAt - Date.now();

    if (timeUntilExpiry <= 0) {
      // Token expired, remove it
      localStorage.removeItem(GOOGLE_AUTH_KEY);
      return null;
    }

    // Schedule automatic refresh for this token
    scheduleTokenRefresh(tokenInfo.expiresAt);

    // If token is expiring soon (within 10 minutes), try to refresh it now
    if (timeUntilExpiry < 10 * 60 * 1000) {
      console.log('토큰이 곧 만료됩니다. 자동 갱신 시도...');
      try {
        return await refreshTokenSilently();
      } catch (error) {
        console.error('토큰 갱신 실패, 기존 토큰 사용:', error);
        // If refresh fails, still use the current token if it's valid
        return await getUserInfo(tokenInfo.accessToken);
      }
    }

    // Token is valid, get user info
    return await getUserInfo(tokenInfo.accessToken);
  } catch (error) {
    console.error('자동 로그인 실패:', error);
    localStorage.removeItem(GOOGLE_AUTH_KEY);
    return null;
  }
};

// Logout
export const logoutGoogle = async (): Promise<void> => {
  // Clear refresh timer
  if (tokenRefreshTimer) {
    clearTimeout(tokenRefreshTimer);
    tokenRefreshTimer = null;
  }
  localStorage.removeItem(GOOGLE_AUTH_KEY);
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
      localStorage.removeItem(GOOGLE_AUTH_KEY);
      return null;
    }

    // Schedule automatic refresh for this token
    scheduleTokenRefresh(tokenInfo.expiresAt);

    return await getUserInfo(tokenInfo.accessToken);
  } catch (error) {
    console.error('계정 정보 가져오기 실패:', error);
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
    throw new Error('토큰이 만료되었습니다. 다시 로그인해주세요.');
  }

  // If token is expiring soon (within 5 minutes), try to refresh it in background
  const timeUntilExpiry = tokenInfo.expiresAt - Date.now();
  if (timeUntilExpiry < 5 * 60 * 1000 && timeUntilExpiry > 0) {
    console.log('토큰이 곧 만료됩니다. 백그라운드에서 갱신 시도...');
    refreshTokenSilently().catch(error => {
      console.error('백그라운드 토큰 갱신 실패:', error);
    });
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
