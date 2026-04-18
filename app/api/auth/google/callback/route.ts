import "server-only";
import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForTokens,
  getGoogleUserInfo,
} from "@/lib/auth/oauth-google";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { logger } from "@/lib/logger";
import { CustomersDB } from "@/lib/db/customers.db";
import {
  createCustomerToken,
  CUSTOMER_SESSION,
} from "@/lib/auth/customer-session";

const PLATFORM_TENANT_ID = "main";

/**
 * GET /api/auth/google/callback
 *
 * Handles the OAuth 2.0 callback from Google.
 * Validates CSRF state, exchanges the code for tokens, fetches the user profile,
 * creates or finds the customer in DB, and sets a customer session cookie.
 */
export async function GET(req: NextRequest) {
  const tenantId =
    req.cookies.get("oauth-tenant")?.value ??
    req.headers.get("x-tenant-id") ??
    PLATFORM_TENANT_ID;

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
      new URL(`/?oauth=error&provider=google`, req.url)
    );
  }

  // CSRF state validation
  if (!state || !storedState || state !== storedState) {
    logger.warn("[oauth/google] CSRF state mismatch", {
      hasState: !!state,
      hasStoredState: !!storedState,
      tenantId,
    });
    return NextResponse.redirect(new URL("/?oauth=error&reason=csrf", req.url));
  }

  if (!code) {
    logger.warn("[oauth/google] No authorization code received", { tenantId });
    return NextResponse.redirect(new URL("/?oauth=error&reason=no_code", req.url));
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

    // ── Upsert customer by email ──
    // Google OAuth users may not have a phone, so we use a synthetic phone
    // derived from the Google ID as the PK (Customer.phone is the @id).
    // If a customer with that email already exists (e.g. from a previous OTP
    // registration), we link to them instead.
    const existing = await CustomersDB.getByEmail(googleUser.email, tenantId);
    const syntheticPhone = `google_${googleUser.id}`;
    const phone = existing?.phone ?? syntheticPhone;
    const isNew = !existing;

    const customer = await CustomersDB.upsert(
      {
        phone,
        name: existing?.name || googleUser.name,
        email: googleUser.email,
        location: existing?.location ?? "",
        reference: existing?.reference ?? "",
        locations: existing?.locations ?? [],
        activeLocationId: existing?.activeLocationId ?? null,
        loyaltyPoints: existing?.loyaltyPoints ?? 0,
        loyaltyTier: existing?.loyaltyTier ?? "bronce",
        totalSpent: existing?.totalSpent ?? 0,
        creditBalance: existing?.creditBalance ?? 0,
        creditLimit: existing?.creditLimit ?? 0,
        notifOrderUpdates: existing?.notifOrderUpdates ?? true,
        notifPromotions: existing?.notifPromotions ?? true,
        notifRestock: existing?.notifRestock ?? false,
      },
      tenantId,
    );

    // ── Create customer session ──
    const token = await createCustomerToken({
      customerId: customer.phone,
      email: googleUser.email,
      name: customer.name,
      tenantId,
      provider: "google",
    });

    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const response = NextResponse.redirect(
      new URL(
        `/?oauth=success&provider=google`,
        baseUrl
      )
    );

    // Set customer session cookie
    response.cookies.set(CUSTOMER_SESSION.COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: CUSTOMER_SESSION.MAX_AGE,
      path: "/",
    });

    // Clear OAuth cookies
    response.cookies.set("oauth-state", "", { maxAge: 0, path: "/" });
    response.cookies.set("oauth-tenant", "", { maxAge: 0, path: "/" });

    logger.info("[oauth/google] Customer session created", {
      phone: customer.phone,
      email: googleUser.email,
      isNew,
      tenantId,
    });

    return response;
  } catch (err) {
    logger.error("[oauth/google] Callback failed", {
      error: String(err),
      tenantId,
    });
    return NextResponse.redirect(
      new URL("/?oauth=error&provider=google", req.url)
    );
  }
}
