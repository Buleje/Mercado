import "server-only";
import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForTokens,
  getGoogleUserInfo,
} from "@/lib/auth/oauth-google";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { logger } from "@/lib/logger";

/**
 * GET /api/auth/google/callback
 *
 * Handles the OAuth 2.0 callback from Google.
 * Validates CSRF state, exchanges the code for tokens, and fetches the user profile.
 *
 * TODO: Create or find customer in DB, create customer session cookie.
 * For now redirects to the storefront with success/error indicators.
 */
export async function GET(req: NextRequest) {
  const tenantId =
    req.cookies.get("oauth-tenant")?.value ??
    req.headers.get("x-tenant-id") ??
    "main";

  const enabled = isFeatureEnabled("oauth-google", tenantId);
  if (!enabled) {
    return NextResponse.json(
      { error: "Google OAuth not enabled for this tenant" },
      { status: 404 }
    );
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const storedState = req.cookies.get("oauth-state")?.value;
  const errorParam = req.nextUrl.searchParams.get("error");

  // Google returned an error (user denied consent, etc.)
  if (errorParam) {
    logger.warn("[oauth/google] Google returned error", {
      error: errorParam,
      tenantId,
    });
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(errorParam)}`, req.url)
    );
  }

  // CSRF state validation
  if (!state || !storedState || state !== storedState) {
    logger.warn("[oauth/google] CSRF state mismatch", {
      hasState: !!state,
      hasStoredState: !!storedState,
      tenantId,
    });
    return NextResponse.redirect(new URL("/login?error=csrf", req.url));
  }

  if (!code) {
    logger.warn("[oauth/google] No authorization code received", { tenantId });
    return NextResponse.redirect(new URL("/login?error=no_code", req.url));
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const googleUser = await getGoogleUserInfo(tokens.access_token);

    logger.info("[oauth/google] User authenticated", {
      email: googleUser.email,
      name: googleUser.name,
      googleId: googleUser.id,
      verified: googleUser.verified_email,
      tenantId,
    });

    // TODO: Phase 2 — Create or find Customer in DB using googleUser.email,
    //   create a customer session cookie (separate from admin bsm-admin-sess),
    //   and store the Google refresh_token for future use.

    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const response = NextResponse.redirect(
      new URL(
        `/?oauth=success&provider=google&name=${encodeURIComponent(googleUser.name)}`,
        baseUrl
      )
    );

    // Clear OAuth cookies
    response.cookies.set("oauth-state", "", { maxAge: 0, path: "/" });
    response.cookies.set("oauth-tenant", "", { maxAge: 0, path: "/" });

    return response;
  } catch (err) {
    logger.error("[oauth/google] Callback failed", {
      error: String(err),
      tenantId,
    });
    return NextResponse.redirect(
      new URL("/login?error=oauth_failed", req.url)
    );
  }
}
