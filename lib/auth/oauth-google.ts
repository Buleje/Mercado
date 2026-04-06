/**
 * lib/auth/oauth-google.ts
 *
 * Google OAuth 2.0 implementation using native fetch.
 * No external auth libraries — keeps the same lightweight approach as lib/session.ts.
 *
 * Endpoints used:
 *   - Authorization: https://accounts.google.com/o/oauth2/v2/auth
 *   - Token exchange: https://oauth2.googleapis.com/token
 *   - User info: https://www.googleapis.com/oauth2/v2/userinfo
 */

import "server-only";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

function getConfig(): GoogleOAuthConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  if (!clientId || !clientSecret) {
    throw new Error(
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required for OAuth"
    );
  }

  return {
    clientId,
    clientSecret,
    redirectUri: `${baseUrl}/api/auth/google/callback`,
  };
}

export interface GoogleUser {
  id: string;
  email: string;
  name: string;
  picture: string;
  verified_email: boolean;
}

/** Generate the Google OAuth authorization URL with CSRF state parameter. */
export function getGoogleAuthUrl(state?: string): string {
  const config = getConfig();
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent",
    ...(state ? { state } : {}),
  });
  return `${GOOGLE_AUTH_URL}?${params}`;
}

/** Exchange authorization code for access and ID tokens. */
export async function exchangeCodeForTokens(
  code: string
): Promise<{
  access_token: string;
  id_token: string;
  refresh_token?: string;
}> {
  const config = getConfig();
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Google token exchange failed: ${res.status} ${body}`
    );
  }

  return res.json();
}

/** Fetch user profile from Google using an access token. */
export async function getGoogleUserInfo(
  accessToken: string
): Promise<GoogleUser> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google userinfo failed: ${res.status} ${body}`);
  }

  return res.json();
}
