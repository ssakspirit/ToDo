import { PublicClientApplication, AccountInfo, InteractionRequiredAuthError } from "@azure/msal-browser";

const msalConfig = {
  auth: {
    clientId: import.meta.env.VITE_MICROSOFT_CLIENT_ID || "",
    authority: "https://login.microsoftonline.com/common",
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: "localStorage" as const,
    storeAuthStateInCookie: false,
  },
};

const loginRequest = {
  scopes: ["User.Read", "Tasks.ReadWrite"]
};

let msalInstance: PublicClientApplication | null = null;

export const initializeMsal = async (): Promise<PublicClientApplication> => {
  if (!msalInstance) {
    msalInstance = new PublicClientApplication(msalConfig);
    await msalInstance.initialize();
  }
  return msalInstance;
};

export const login = async (): Promise<AccountInfo | null> => {
  const msal = await initializeMsal();

  try {
    const response = await msal.loginPopup(loginRequest);
    return response.account;
  } catch (error) {
    console.error("로그인 실패:", error);
    throw error;
  }
};

export const loginSilently = async (): Promise<AccountInfo | null> => {
  const msal = await initializeMsal();

  // Check if we already have an account
  const accounts = msal.getAllAccounts();
  if (accounts.length > 0) {
    return accounts[0];
  }

  // Try silent login (SSO)
  try {
    const response = await msal.ssoSilent(loginRequest);
    return response.account;
  } catch (error) {
    // Silent login failed, user needs to login manually
    console.log("자동 로그인 불가능, 수동 로그인이 필요합니다.");
    return null;
  }
};

export const logout = async (): Promise<void> => {
  const msal = await initializeMsal();
  const accounts = msal.getAllAccounts();

  if (accounts.length > 0) {
    await msal.logoutPopup({
      account: accounts[0],
    });
  }
};

export const getAccount = async (): Promise<AccountInfo | null> => {
  const msal = await initializeMsal();
  const accounts = msal.getAllAccounts();
  return accounts.length > 0 ? accounts[0] : null;
};

export const getAccessToken = async (): Promise<string> => {
  const msal = await initializeMsal();
  const accounts = msal.getAllAccounts();

  if (accounts.length === 0) {
    throw new Error("로그인이 필요합니다");
  }

  const request = {
    scopes: loginRequest.scopes,
    account: accounts[0],
  };

  try {
    const response = await msal.acquireTokenSilent(request);
    return response.accessToken;
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      const response = await msal.acquireTokenPopup(request);
      return response.accessToken;
    }
    throw error;
  }
};
