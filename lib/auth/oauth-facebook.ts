/**
 * lib/auth/oauth-facebook.ts
 *
 * Facebook OAuth 2.0 implementation using native fetch.
 * Same lightweight approach as oauth-google.ts — no external auth libraries.
 *
 * Endpoints used:
 *   - Authorization: https://www.facebook.com/v19.0/dialog/oauth
 *   - Token exchange: https://graph.facebook.com/v19.0/oauth/access_token
 *   - User info: https://graph.facebook.com/v19.0/me?fields=id,name,email,picture
 */

import "server-only";

const FB_AUTH_URL = "https://www.facebook.com/v19.0/dialog/oauth";
const FB_TOKEN_URL = "https://graph.facebook.com/v19.0/oauth/access_token";
const FB_USERINFO_URL = "https://graph.facebook.com/v19.0/me";

interface FacebookOAuthConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
}

function getConfig(): FacebookOAuthConfig {
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  if (!appId || !appSecret) {
    throw new Error(
      "FACEBOOK_APP_ID and FACEBOOK_APP_SECRET are required for OAuth"
    );
  }

  return {
    appId,
    appSecret,
    redirectUri: `${baseUrl}/api/auth/facebook/callback`,
  };
}

export interface FacebookUser {
  id: string;
  name: string;
  email?: string;
  picture?: { data?: { url?: string } };
}

/** Generate the Facebook OAuth authorization URL with CSRF state parameter. */
export function getFacebookAuthUrl(state?: string): string {
  const config = getConfig();
  const params = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "email,public_profile",
    ...(state ? { state } : {}),
  });
  return `${FB_AUTH_URL}?${params}`;
}

/** Exchange authorization code for an access token. */
export async function exchangeCodeForToken(
  code: string
): Promise<{ access_token: string }> {
  const config = getConfig();
  const params = new URLSearchParams({
    client_id: config.appId,
    client_secret: config.appSecret,
    redirect_uri: config.redirectUri,
    code,
  });

  const res = await fetch(`${FB_TOKEN_URL}?${params}`);

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Facebook token exchange failed: ${res.status} ${body}`
    );
  }

  return res.json();
}

/** Fetch user profile from Facebook using an access token. */
export async function getFacebookUserInfo(
  accessToken: string
): Promise<FacebookUser> {
  const params = new URLSearchParams({
    fields: "id,name,email,picture",
    access_token: accessToken,
  });

  const res = await fetch(`${FB_USERINFO_URL}?${params}`);

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Facebook userinfo failed: ${res.status} ${body}`);
  }

  return res.json();
}
