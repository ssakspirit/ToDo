export interface GoogleAccountInfo {
  name?: string;
  email?: string;
  picture?: string;
}

interface StoredTokenInfo {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope: string;
}

const GOOGLE_AUTH_KEY = 'google_auth_token';
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
// 토큰 교환/갱신은 서버(netlify/functions/google-token.mts)가 client_secret을 붙여 대신 요청
const TOKEN_PROXY_URL = '/api/google-token';
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

// Helper: Safely check if popup is closed (handles COOP errors)
const isPopupClosed = (popup: Window | null): boolean => {
  if (!popup) return true;
  try {
    return popup.closed;
  } catch (e) {
    return false;
  }
};

// 모바일/iOS PWA 환경 감지 → 리디렉트 방식 사용
const shouldUseRedirect = (): boolean =>
  /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
  !!(window.navigator as any).standalone;

// 일시적 오류 (오프라인 등 fetch 자체 실패, 또는 서버 5xx) — 인증 오류와 구분해 토큰을 보존
const isNetworkError = (e: unknown): boolean =>
  e instanceof TypeError || (e as any)?.transient === true;

// 5xx 응답은 토큰 문제가 아니라 서버(프록시/Google) 장애이므로 일시적 오류로 표시
const httpError = (message: string, status: number): Error => {
  const error = new Error(message);
  if (status >= 500) (error as any).transient = true;
  return error;
};

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
  const response = await fetch(TOKEN_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('토큰 갱신 실패:', response.status, errorText);
    throw httpError('토큰 갱신에 실패했습니다.', response.status);
  }

  const data = await response.json();
  const tokenInfo: StoredTokenInfo = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken, // Keep old refresh token if new one not provided
    expiresAt: Date.now() + (data.expires_in * 1000),
    scope: data.scope || '',
  };

  localStorage.setItem(GOOGLE_AUTH_KEY, JSON.stringify(tokenInfo));
  console.log('✅ 토큰 갱신 성공!');
  console.log('  - 새 access token:', data.access_token ? '✓' : '✗');
  console.log('  - 새 만료 시간:', new Date(tokenInfo.expiresAt).toLocaleString('ko-KR'));
  return tokenInfo;
};

// OAuth URL 빌더 (팝업/리디렉트 공통)
const buildAuthUrl = async (): Promise<{ url: string; codeVerifier: string }> => {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.append('client_id', GOOGLE_CLIENT_ID);
  authUrl.searchParams.append('redirect_uri', window.location.origin);
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('scope', SCOPES.join(' '));
  authUrl.searchParams.append('access_type', 'offline');
  authUrl.searchParams.append('prompt', 'consent');
  authUrl.searchParams.append('code_challenge', codeChallenge);
  authUrl.searchParams.append('code_challenge_method', 'S256');

  return { url: authUrl.toString(), codeVerifier };
};

// 리디렉트 방식 로그인 (모바일/iOS PWA용)
// localStorage 사용 — iOS PWA는 리디렉트 시 sessionStorage가 초기화됨
const loginGoogleRedirect = async (): Promise<null> => {
  const { url, codeVerifier } = await buildAuthUrl();
  localStorage.setItem('google_pkce_verifier', codeVerifier);
  localStorage.setItem('google_oauth_pending', 'true');
  window.location.href = url;
  return null; // 페이지 이탈, 리턴값 없음
};

// 팝업 방식 로그인 (데스크톱용)
const loginGooglePopup = async (): Promise<GoogleAccountInfo | null> => {
  return new Promise(async (resolve, reject) => {
    const { url, codeVerifier } = await buildAuthUrl();
    sessionStorage.setItem('google_code_verifier', codeVerifier);

    const width = 500;
    const height = 600;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(url, 'Google Login', `width=${width},height=${height},left=${left},top=${top}`);

    if (!popup) {
      reject(new Error('팝업이 차단되었습니다.'));
      return;
    }

    const timeoutId = setTimeout(() => {
      clearInterval(checkPopup);
      if (!isPopupClosed(popup)) popup.close();
      sessionStorage.removeItem('google_code_verifier');
      reject(new Error('로그인 시간이 초과되었습니다.'));
    }, 120000);

    const checkPopup = setInterval(() => {
      try {
        if (isPopupClosed(popup)) {
          clearInterval(checkPopup);
          clearTimeout(timeoutId);
          sessionStorage.removeItem('google_code_verifier');
          reject(new Error('로그인이 취소되었습니다.'));
          return;
        }
        if (popup.location.origin === window.location.origin) {
          const code = new URLSearchParams(popup.location.search).get('code');
          clearInterval(checkPopup);
          clearTimeout(timeoutId);
          popup.close();
          if (code) {
            exchangeCodeForTokens(code, codeVerifier).then(resolve).catch(reject);
          } else {
            sessionStorage.removeItem('google_code_verifier');
            reject(new Error('인증 코드를 받지 못했습니다.'));
          }
        }
      } catch (e) {
        // cross-origin, 정상
      }
    }, 500);
  });
};

// 모바일이면 리디렉트, 데스크톱이면 팝업
export const loginGoogle = async (): Promise<GoogleAccountInfo | null> => {
  if (shouldUseRedirect()) return loginGoogleRedirect();
  return loginGooglePopup();
};

// 리디렉트 후 돌아왔을 때 URL의 code를 처리 (App.tsx mount 시 호출)
export const handleGoogleOAuthCallback = async (): Promise<GoogleAccountInfo | null> => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const isPending = localStorage.getItem('google_oauth_pending') === 'true';

  if (!code || !isPending) return null;

  // URL 정리 (code가 history에 남지 않도록)
  window.history.replaceState({}, document.title, window.location.pathname);

  const codeVerifier = localStorage.getItem('google_pkce_verifier');
  localStorage.removeItem('google_oauth_pending');
  localStorage.removeItem('google_pkce_verifier');

  if (!codeVerifier) throw new Error('PKCE verifier 없음');

  return exchangeCodeForTokens(code, codeVerifier);
};

// Exchange authorization code for access and refresh tokens
const exchangeCodeForTokens = async (
  code: string,
  codeVerifier: string
): Promise<GoogleAccountInfo> => {
  try {
    const response = await fetch(TOKEN_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        code_verifier: codeVerifier,
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

    console.log('✅ Google 로그인 성공!');
    console.log('  - Access token:', data.access_token ? '✓' : '✗');
    console.log('  - Refresh token:', data.refresh_token ? '✓ (획득)' : '✗ (없음)');
    console.log('  - 만료 시간:', new Date(tokenInfo.expiresAt).toLocaleString('ko-KR'));

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

    // Check if this is an old token without refresh token (from Implicit Flow)
    if (!tokenInfo.refreshToken) {
      console.warn('이전 방식의 토큰입니다. Refresh token이 없으므로 재로그인이 필요합니다.');
      localStorage.removeItem(GOOGLE_AUTH_KEY);
      return null;
    }

    // Check if token is expired
    if (Date.now() >= tokenInfo.expiresAt) {
      console.log('Google access token이 만료되었습니다.');

      // Try to refresh using refresh token
      console.log('Refresh token으로 자동 갱신 시도...');
      try {
        tokenInfo = await refreshAccessToken(tokenInfo.refreshToken);
        console.log('✅ 토큰 자동 갱신 성공!');
      } catch (error) {
        console.error('❌ 토큰 갱신 실패:', error);
        // 오프라인 등 일시적 오류면 토큰을 지우지 않고 다음 실행에서 재시도
        if (!isNetworkError(error)) localStorage.removeItem(GOOGLE_AUTH_KEY);
        return null;
      }
    }

    // Token is valid, get user info
    const userInfo = await getUserInfo(tokenInfo.accessToken);
    console.log('✅ Google 자동 로그인 성공:', userInfo.email);
    return userInfo;
  } catch (error) {
    console.error('❌ Google 자동 로그인 실패:', error);
    // 오프라인 등 일시적 오류면 토큰을 지우지 않고 다음 실행에서 재시도
    if (!isNetworkError(error)) localStorage.removeItem(GOOGLE_AUTH_KEY);
    return null;
  }
};

// Logout
export const logoutGoogle = async (): Promise<void> => {
  localStorage.removeItem(GOOGLE_AUTH_KEY);
  console.log('Google 로그아웃 완료');
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
        if (isNetworkError(error)) {
          throw new Error('네트워크 연결을 확인해주세요.');
        }
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
      throw httpError(`사용자 정보를 가져올 수 없습니다. (${response.status})`, response.status);
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
