import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionToken, SESSION } from "@/lib/session";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { generateRequestId, generateNonce, buildCSP } from "@/lib/middleware-utils";

/**
 * Root domain for tenant routing (strip port).
 * Set ROOT_DOMAIN=bodegasaas.com in production .env
 */
const ROOT_DOMAIN = (process.env.ROOT_DOMAIN ?? "localhost").split(":")[0];
const CUSTOM_DOMAIN_PREFIX = "custom--";

/** Resolve tenantId from the incoming Host header. */
function resolveTenantFromHost(req: NextRequest): string {
  const host = req.headers.get("host") ?? "";
  const hostname = host.split(":")[0];

  const isVercelHost = hostname === "vercel.app" || hostname.endsWith(".vercel.app");
  // Cloudflare tunnel URLs (trycloudflare.com) are dev proxies — resolve to "main"
  // so the middleware falls through to the admin session JWT for tenant resolution
  const isCloudflareProxy = hostname.endsWith(".trycloudflare.com");

  // Support slug.localhost:3000 for local dev (Chrome 74+, Firefox 84+ resolve *.localhost)
  // e.g., bodega-maria.localhost:3000 → tenant = "bodega-maria"
  if (hostname.endsWith(".localhost")) {
    const slug = hostname.replace(/\.localhost$/, "");
    if (slug && slug !== "www") return slug;
    return "main";
  }
  if (hostname === "localhost" || hostname === "127.0.0.1") return "main";
  if (isVercelHost) return "main";
  if (isCloudflareProxy) return "main";

  if (
    hostname.endsWith(`.${ROOT_DOMAIN}`) &&
    hostname !== `www.${ROOT_DOMAIN}`
  ) {
    const parts = hostname.split(".");
    if (parts.length >= 3) return parts[0];
  }

  if (hostname !== ROOT_DOMAIN && hostname !== `www.${ROOT_DOMAIN}`) {
    return `${CUSTOM_DOMAIN_PREFIX}${hostname}`;
  }

  return "main";
}

/**
 * API routes that are admin-only (all methods require auth)
 */
const ADMIN_ONLY_API_PREFIXES = [
  "/api/admin",
  "/api/activity-log",
  "/api/auto-reorder",
  "/api/backup",
  "/api/barcode-lookup",
  "/api/bundles",
  "/api/cash-registers",
  "/api/demand-prediction",
  "/api/delivery-slots",
  "/api/expenses",
  "/api/inventory-movements",
  "/api/payables",
  "/api/price-history",
  "/api/purchases",
  "/api/returns",
  "/api/sales",
  "/api/shopping-lists",
  "/api/supplier-evaluations",
  "/api/suppliers",
  "/api/notifications",
  "/api/admin-users",
];

/**
 * Shared routes where only write operations (POST/PUT/PATCH/DELETE) require admin auth.
 * GET is left public so the store frontend can call them.
 */
const WRITE_PROTECTED_API_PREFIXES = [
  "/api/products",
  "/api/orders",
  "/api/customers",
  "/api/reviews",
  "/api/settings",
  "/api/promotions",
  "/api/coupons",
  "/api/loyalty",
];

// ── Security helpers ──────────────────────────────────────────────────────────

function applySecurityHeaders(
  response: NextResponse,
  pathname: string,
  nonce: string,
  requestId: string
): NextResponse {
  response.headers.set("x-request-id", requestId);
  if (!pathname.startsWith("/api/")) {
    response.headers.set("Content-Security-Policy", buildCSP(pathname, nonce));
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()"
    );
  }
  return response;
}

// ── Simple in-memory rate limiter for API routes ──
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;

type RLEntry = { count: number; resetAt: number };
const rlStore = new Map<string, RLEntry>();
let lastCleanup = Date.now();

function rlCleanup() {
  const now = Date.now();
  if (now - lastCleanup < 300_000) return;
  lastCleanup = now;
  for (const [k, v] of rlStore) {
    if (v.resetAt < now) rlStore.delete(k);
  }
}

function getIP(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

function checkRateLimit(req: NextRequest): NextResponse | null {
  rlCleanup();
  const ip = getIP(req);
  const now = Date.now();
  const entry = rlStore.get(ip);
  if (!entry || entry.resetAt < now) {
    rlStore.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return null;
  }
  entry.count++;
  if (entry.count > MAX_REQUESTS) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Intente de nuevo en un minuto." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((entry.resetAt - now) / 1000)) } }
    );
  }
  return null;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Request ID + nonce for security headers ──
  const requestId = request.headers.get("x-request-id") ?? generateRequestId();
  const nonce = generateNonce();

  // ── Slug-based tenant routing: /t/[slug]/* ─────────────────────────────────
  // Storefront paths: /t/slug/tienda → rewrite to /tienda with x-tenant-id header
  // Admin paths: /t/slug/admin* → pass through to existing impersonation page
  // Landing page: /t/slug (exact) → pass through to existing landing page
  const slugStoreMatch = pathname.match(/^\/t\/([^/]+)(\/(?!admin).+)$/);
  if (slugStoreMatch) {
    const slug = decodeURIComponent(slugStoreMatch[1]);
    const restPath = slugStoreMatch[2]; // e.g., "/tienda", "/carrito"

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-tenant-id", slug);
    requestHeaders.set("x-request-id", requestId);
    requestHeaders.set("x-nonce", nonce);

    const rewriteUrl = new URL(restPath + request.nextUrl.search, request.url);
    const response = NextResponse.rewrite(rewriteUrl, {
      request: { headers: requestHeaders },
    });
    response.cookies.set("active-tenant", slug, {
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
      sameSite: "lax",
    });
    return applySecurityHeaders(response, restPath, nonce, requestId);
  }

  // /t/[slug]/admin* → rewrite to /admin*, inject tenant header + cookie
  // URL stays as /t/slug/admin but content comes from /admin
  const slugAdminMatch = pathname.match(/^\/t\/([^/]+)(\/admin.*)$/);
  if (slugAdminMatch) {
    const slug = decodeURIComponent(slugAdminMatch[1]);
    const adminPath = slugAdminMatch[2]; // e.g. /admin, /admin/login

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-tenant-id", slug);
    requestHeaders.set("x-request-id", requestId);
    requestHeaders.set("x-nonce", nonce);

    const rewriteUrl = new URL(adminPath + request.nextUrl.search, request.url);
    const response = NextResponse.rewrite(rewriteUrl, {
      request: { headers: requestHeaders },
    });
    response.cookies.set("active-tenant", slug, {
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
      sameSite: "lax",
    });
    return applySecurityHeaders(response, adminPath, nonce, requestId);
  }

  // /t/[slug] (exact landing page) → inject tenant header, pass through
  const slugLandingMatch = pathname.match(/^\/t\/([^/]+)\/?$/);
  if (slugLandingMatch) {
    const slug = decodeURIComponent(slugLandingMatch[1]);

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-tenant-id", slug);
    requestHeaders.set("x-request-id", requestId);
    requestHeaders.set("x-nonce", nonce);

    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.cookies.set("active-tenant", slug, {
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
      sameSite: "lax",
    });
    return applySecurityHeaders(response, pathname, nonce, requestId);
  }

  // ── Tenant injection ── always runs
  // Priority: 1) hostname, 2) active-tenant cookie, 3) session token
  // SECURITY: Never trust client-sent x-tenant-id header — resolve from hostname only
  // Audit: detect if client sent an x-tenant-id header (potential injection attempt)
  const clientSentTenantHeader = request.headers.get("x-tenant-id");
  let tenantId = resolveTenantFromHost(request);

  // If tenant is "main" (default from localhost), check multiple sources for the real tenantId
  if (tenantId === "main") {
    // Source 1 (HIGHEST for multi-tab safety): Referer header contains /t/[slug]/
    // When admin at /t/luis/admin makes API calls, Referer = http://localhost:3000/t/luis/admin
    // This is per-request and per-tab, unlike cookies which are shared across tabs.
    const referer = request.headers.get("referer");
    if (referer) {
      const refTenantMatch = referer.match(/\/t\/([^/]+)\//);
      if (refTenantMatch) {
        tenantId = decodeURIComponent(refTenantMatch[1]);
      }
    }

    // Source 2: active-tenant cookie (set during login — shared across tabs, can be stale)
    if (tenantId === "main") {
      const activeTenantCookie = request.cookies.get("active-tenant")?.value;
      if (activeTenantCookie && activeTenantCookie !== "main") {
        tenantId = activeTenantCookie;
      }
    }

    // Source 3: admin session token (has tenantId in payload — always the canonical Tenant.id)
    if (tenantId === "main") {
      const sessionCookie = request.cookies.get("bsm-admin-sess")?.value;
      if (sessionCookie) {
        try {
          const dotIdx = sessionCookie.lastIndexOf(".");
          if (dotIdx > 0) {
            const encoded = sessionCookie.slice(0, dotIdx);
            const decoded = JSON.parse(Buffer.from(encoded, "base64").toString()) as { tenantId?: string };
            if (decoded.tenantId && decoded.tenantId !== "main") {
              tenantId = decoded.tenantId;
            }
          }
        } catch { /* ignore parse errors */ }
      }
    }
  }

  // ── Cross-tenant audit logging ───────────────────────────────────────────
  // If client sent an x-tenant-id header that differs from what we resolved,
  // log the potential injection attempt (fire-and-forget from Edge runtime)
  if (
    clientSentTenantHeader &&
    clientSentTenantHeader !== tenantId &&
    pathname.startsWith("/api/")
  ) {
    const internalKey = process.env.INTERNAL_API_KEY || process.env.CRON_SECRET;
    if (internalKey) {
      const auditUrl = new URL("/api/internal/audit-log", request.url);
      fetch(auditUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-key": internalKey,
        },
        body: JSON.stringify({
          event: "tenant_header_mismatch",
          resolvedTenantId: tenantId,
          clientTenantHeader: clientSentTenantHeader.substring(0, 100),
          ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()?.substring(0, 45) ?? "unknown",
          path: pathname.substring(0, 200),
          method: request.method,
          userAgent: request.headers.get("user-agent")?.substring(0, 200),
          requestId,
        }),
      }).catch(() => { /* fire-and-forget */ });
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-tenant-id", tenantId);
  requestHeaders.set("x-request-id", requestId);
  requestHeaders.set("x-nonce", nonce);
  const withTenant = { request: { headers: requestHeaders } };

  // ── API key Bearer auth pass-through ──────────────────────────────────────
  // If the request carries a Bearer sk_... token on an /api/ route, skip all
  // cookie-based auth and forward the raw key in x-api-key so route handlers
  // can call validateApiKey() from lib/api-keys.ts.
  const bearerAuth = request.headers.get("authorization") ?? "";
  if (bearerAuth.startsWith("Bearer sk_") && pathname.startsWith("/api/")) {
    requestHeaders.set("x-api-key", bearerAuth.slice("Bearer ".length));
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Rate-limit all API routes (skip in development)
  if (pathname.startsWith("/api/") && process.env.NODE_ENV !== "development") {
    const rlResponse = checkRateLimit(request);
    if (rlResponse) return rlResponse;
  }

  // Login page is always public
  if (pathname === "/admin/login") return NextResponse.next(withTenant);

  // Public order tracking page
  if (pathname.startsWith("/pedido/")) return NextResponse.next(withTenant);

  // Superadmin API routes — proteger todo excepto auth (login/logout/probe)
  if (pathname.startsWith("/api/superadmin")) {
    // Auth endpoints son públicos (el propio endpoint maneja rate limit + validación)
    if (pathname.startsWith("/api/superadmin/auth")) {
      return NextResponse.next(withTenant);
    }
    // El resto requiere token de plataforma válido
    const platformToken = request.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
    if (!platformToken) {
      return NextResponse.json({ error: "Unauthorized — platform session required" }, { status: 401 });
    }
    const session = await getPlatformSession(platformToken);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized — invalid or expired token" }, { status: 401 });
    }
    // Inyectar username de plataforma para auditoría
    requestHeaders.set("x-platform-user", session.username);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Superadmin páginas — proteger todo excepto /login
  if (pathname.startsWith("/superadmin")) {
    if (pathname === "/superadmin/login" || pathname.startsWith("/superadmin/login/")) {
      return NextResponse.next(withTenant);
    }
    // Verificar firma HMAC + expiración del token (no solo existencia de cookie)
    const platformToken = request.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
    if (!platformToken) {
      return NextResponse.redirect(new URL("/superadmin/login", request.url));
    }
    const session = await getPlatformSession(platformToken);
    if (!session) {
      // Token inválido o expirado — limpiar cookie y redirigir
      const loginUrl = new URL("/superadmin/login", request.url);
      const response = NextResponse.redirect(loginUrl);
      response.cookies.delete(PLATFORM_SESSION.COOKIE_NAME);
      return response;
    }
    return NextResponse.next(withTenant);
  }

  // Protect all /admin routes
  if (pathname.startsWith("/admin")) {
    const token = request.cookies.get(SESSION.COOKIE_NAME)?.value;
    if (!token || !(await verifySessionToken(token))) {
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Protect admin-only API routes (all methods)
  if (ADMIN_ONLY_API_PREFIXES.some((p) => pathname.startsWith(p))) {
    const token = request.cookies.get(SESSION.COOKIE_NAME)?.value;
    if (!token || !(await verifySessionToken(token))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Protect write operations on shared API routes
  if (
    WRITE_PROTECTED_API_PREFIXES.some((p) => pathname.startsWith(p)) &&
    request.method !== "GET"
  ) {
    // Allow the store's own order creation without auth (customer placing an order)
    if (pathname === "/api/orders" && request.method === "POST") {
      return NextResponse.next(withTenant);
    }
    // Allow store frontend to read orders by phone (LastOrderBanner, CheckoutModal)
    if (pathname === "/api/orders" && request.method === "GET" && request.nextUrl.searchParams.has("phone")) {
      return NextResponse.next(withTenant);
    }
    // Allow review creation by customers
    if (pathname === "/api/reviews" && request.method === "POST") {
      return NextResponse.next(withTenant);
    }
    // Allow public spin wheel coupon generation (no login required)
    if (pathname === "/api/coupons/spin" && request.method === "POST") {
      return NextResponse.next(withTenant);
    }
    // Allow coupon validation at checkout (customers validate without admin login)
    if (pathname === "/api/coupons/validate" && request.method === "POST") {
      return NextResponse.next(withTenant);
    }
    const token = request.cookies.get(SESSION.COOKIE_NAME)?.value;
    if (!token || !(await verifySessionToken(token))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const response = NextResponse.next(withTenant);
  return applySecurityHeaders(response, pathname, nonce, requestId);
}

export const config = {
  matcher: [
    /*
     * Match all paths except Next.js internals and static file extensions.
     * This ensures x-tenant-id is injected on every request including
     * /manifest.webmanifest, /sitemap.xml, /robots.txt, etc.
     */
    "/((?!_next/static|_next/image|favicon\.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2)$).*)",
  ],
};
