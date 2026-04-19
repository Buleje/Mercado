import "server-only";
import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForToken,
  getFacebookUserInfo,
} from "@/lib/auth/oauth-facebook";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { logger } from "@/lib/logger";
import { CustomersDB } from "@/lib/db/customers.db";
import {
  createCustomerToken,
  CUSTOMER_SESSION,
} from "@/lib/auth/customer-session";

const PLATFORM_TENANT_ID = "main";

/**
 * GET /api/auth/facebook/callback
 *
 * Handles the OAuth 2.0 callback from Facebook.
 * Validates CSRF state, exchanges the code for a token, fetches the user profile,
 * creates or finds the customer in DB, and sets a customer session cookie.
 */
export async function GET(req: NextRequest) {
  const tenantId =
    req.cookies.get("oauth-tenant")?.value ??
    req.headers.get("x-tenant-id") ??
    PLATFORM_TENANT_ID;

  const enabled = isFeatureEnabled("oauth-facebook", tenantId);
  if (!enabled) {
    return NextResponse.json(
      { error: "Facebook OAuth not enabled for this tenant" },
      { status: 404 },
    );
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const storedState = req.cookies.get("oauth-state")?.value;
  const errorParam = req.nextUrl.searchParams.get("error");

  // Facebook returned an error (user denied consent, etc.)
  if (errorParam) {
    logger.warn("[oauth/facebook] Facebook returned error", {
      error: errorParam,
      tenantId,
    });
    return NextResponse.redirect(
      new URL("/?oauth=error&provider=facebook", req.url),
    );
  }

  // CSRF state validation
  if (!state || !storedState || state !== storedState) {
    logger.warn("[oauth/facebook] CSRF state mismatch", {
      hasState: !!state,
      hasStoredState: !!storedState,
      tenantId,
    });
    return NextResponse.redirect(new URL("/?oauth=error&reason=csrf", req.url));
  }

  if (!code) {
    logger.warn("[oauth/facebook] No authorization code received", { tenantId });
    return NextResponse.redirect(new URL("/?oauth=error&reason=no_code", req.url));
  }

  try {
    const tokens = await exchangeCodeForToken(code);
    const fbUser = await getFacebookUserInfo(tokens.access_token);

    const email = fbUser.email ?? `fb_${fbUser.id}@facebook.buleje.pe`;

    logger.info("[oauth/facebook] User authenticated", {
      email,
      name: fbUser.name,
      facebookId: fbUser.id,
      tenantId,
    });

    // ── Upsert customer ──
    // Facebook OAuth users may not have a phone, so we use a synthetic phone
    // derived from the Facebook ID as the PK (Customer.phone is the @id).
    // If a customer with that email already exists, we link to them instead.
    const existing = fbUser.email
      ? await CustomersDB.getByEmail(fbUser.email, tenantId)
      : null;
    const syntheticPhone = `facebook_${fbUser.id}`;
    const phone = existing?.phone ?? syntheticPhone;
    const isNew = !existing;

    const customer = await CustomersDB.upsert(
      {
        phone,
        name: existing?.name || fbUser.name,
        email,
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
      email,
      name: customer.name,
      tenantId,
      provider: "facebook",
    });

    // ── Resolver destino post-login ──
    // Prioridad: cookie `oauth-redirect` (ruta interna guardada en /api/auth/facebook)
    //           > /marketplace/explorar (default — landing -> explorar)
    const redirectCookie = req.cookies.get("oauth-redirect")?.value ?? "";
    const safeRedirect =
      redirectCookie.startsWith("/") && !redirectCookie.startsWith("//")
        ? redirectCookie
        : "/marketplace/explorar";

    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const redirectUrl = new URL(safeRedirect, baseUrl);
    redirectUrl.searchParams.set("oauth", "success");
    redirectUrl.searchParams.set("provider", "facebook");
    const response = NextResponse.redirect(redirectUrl);

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
    response.cookies.set("oauth-redirect", "", { maxAge: 0, path: "/" });

    logger.info("[oauth/facebook] Customer session created", {
      phone: customer.phone,
      email,
      isNew,
      tenantId,
    });

    return response;
  } catch (err) {
    logger.error("[oauth/facebook] Callback failed", {
      error: String(err),
      tenantId,
    });
    return NextResponse.redirect(
      new URL("/?oauth=error&provider=facebook", req.url),
    );
  }
}
