/**
 * GitHub Copilot Proxy - Authentication
 *
 * Handles OAuth device flow and token management.
 */

import keytar from 'keytar';
import type {
  StoredToken,
  SessionToken,
  ConnectionStatus,
  DeviceFlowResult,
} from './types.js';

// OAuth endpoints
const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const TOKEN_MINT_URL = 'https://api.github.com/copilot_internal/v2/token';

// VS Code Copilot OAuth Client ID
const CLIENT_ID = 'Iv1.b507a08c87ecfe98';

// Keychain service identifiers
const KEYCHAIN_SERVICE = 'apprentice';
const KEYCHAIN_ACCOUNT = 'copilot-oauth-token';
const KEYCHAIN_CREATED_ACCOUNT = 'copilot-oauth-created';

// Common headers for Copilot API
export const COPILOT_HEADERS = {
  'User-Agent': 'GithubCopilot/1.155.0',
  'Editor-Version': 'vscode/1.95.0',
  'Editor-Plugin-Version': 'copilot-chat/0.22.0',
};

// Session token cache
let sessionCache: SessionToken | null = null;

/**
 * Read token from system keychain
 */
async function readTokenFromKeychain(): Promise<StoredToken | null> {
  try {
    const token = await keytar.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
    const createdAt = await keytar.getPassword(
      KEYCHAIN_SERVICE,
      KEYCHAIN_CREATED_ACCOUNT,
    );

    if (token && createdAt) {
      return {
        access_token: token,
        created_at: parseInt(createdAt, 10),
      };
    }
  } catch {
    // Keychain unavailable
  }
  return null;
}

/**
 * Write token to system keychain
 */
async function writeTokenToKeychain(token: StoredToken): Promise<boolean> {
  try {
    await keytar.setPassword(
      KEYCHAIN_SERVICE,
      KEYCHAIN_ACCOUNT,
      token.access_token,
    );
    await keytar.setPassword(
      KEYCHAIN_SERVICE,
      KEYCHAIN_CREATED_ACCOUNT,
      token.created_at.toString(),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete token from keychain
 */
async function deleteTokenFromKeychain(): Promise<void> {
  try {
    await keytar.deletePassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
    await keytar.deletePassword(KEYCHAIN_SERVICE, KEYCHAIN_CREATED_ACCOUNT);
  } catch {
    // Ignore
  }
}

/**
 * Read stored OAuth token
 */
export async function readToken(): Promise<StoredToken | null> {
  return await readTokenFromKeychain();
}

/**
 * Write OAuth token to storage
 */
export async function writeToken(token: StoredToken): Promise<void> {
  await writeTokenToKeychain(token);
}

/**
 * Delete stored OAuth token
 */
export async function deleteToken(): Promise<void> {
  sessionCache = null;
  await deleteTokenFromKeychain();
}

/**
 * Check if Copilot is configured (has stored token)
 */
export async function isConfigured(): Promise<boolean> {
  const token = await readToken();
  return !!token?.access_token;
}

/**
 * Get connection status
 */
export async function getStatus(): Promise<ConnectionStatus> {
  const keychainToken = await readTokenFromKeychain();
  if (keychainToken?.access_token) {
    return {
      connected: true,
      createdAt: new Date(keychainToken.created_at),
      storage: 'keychain',
    };
  }

  return { connected: false };
}

/**
 * Disconnect (clear stored credentials)
 */
export async function disconnect(): Promise<void> {
  await deleteToken();
}

/**
 * Start device flow authentication
 */
export async function connect(): Promise<DeviceFlowResult> {
  // Request device code
  const codeRes = await fetch(DEVICE_CODE_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ client_id: CLIENT_ID, scope: 'read:user' }),
  });

  if (!codeRes.ok) {
    throw new Error(`Failed to start device flow: ${codeRes.status}`);
  }

  const { device_code, user_code, verification_uri, expires_in, interval } =
    await codeRes.json();

  return {
    userCode: user_code,
    verificationUrl: verification_uri,
    waitForAuth: async () => {
      const deadline = Date.now() + expires_in * 1000;
      let pollInterval = interval * 1000;

      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, pollInterval));

        const tokenRes = await fetch(ACCESS_TOKEN_URL, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            client_id: CLIENT_ID,
            device_code,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          }),
        });

        const data = await tokenRes.json();

        if (data.access_token) {
          await writeToken({
            access_token: data.access_token,
            created_at: Date.now(),
          });
          return;
        }

        if (data.error === 'slow_down') {
          pollInterval += 5000;
        } else if (data.error === 'authorization_pending') {
          continue;
        } else if (data.error) {
          throw new Error(data.error_description || data.error);
        }
      }

      throw new Error('Authorization timed out');
    },
  };
}

/**
 * Get OAuth token from storage
 */
export async function getOAuthToken(): Promise<string | undefined> {
  const token = await readToken();
  return token?.access_token;
}

/**
 * Get session token for API calls (mints short-lived token from OAuth token)
 */
export async function getSessionToken(
  oauthToken: string,
): Promise<SessionToken> {
  // Return cached if valid (with 5min buffer)
  if (sessionCache && Date.now() < sessionCache.expiresAt - 5 * 60 * 1000) {
    return sessionCache;
  }

  const res = await fetch(TOKEN_MINT_URL, {
    headers: {
      Authorization: `token ${oauthToken}`,
      Accept: 'application/json',
      ...COPILOT_HEADERS,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401) {
      await deleteToken();
      throw new Error(
        "Session expired. Run 'copilot-proxy connect' to reconnect.",
      );
    }
    throw new Error(`Token mint failed: ${res.status} ${text}`);
  }

  const data = await res.json();

  sessionCache = {
    token: data.token,
    expiresAt: data.expires_at * 1000,
  };

  return sessionCache;
}

/**
 * Clear session cache (useful for testing)
 */
export function clearSessionCache(): void {
  sessionCache = null;
}
