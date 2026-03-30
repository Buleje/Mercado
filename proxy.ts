import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionToken, SESSION } from "@/lib/session";

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

  const isLocalhost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".localhost");
  const isVercelHost = hostname === "vercel.app" || hostname.endsWith(".vercel.app");

  if (isLocalhost) return "main";
  if (isVercelHost) return "main";

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

  // ── Tenant injection ── always runs
  // Priority: 1) client header, 2) session token tenantId, 3) hostname resolution
  const clientTenantId = request.headers.get("x-tenant-id");
  let tenantId = clientTenantId || resolveTenantFromHost(request);

  // If tenant is "main" (default from localhost), check if the session token has a specific tenantId
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

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-tenant-id", tenantId);
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

  // Superadmin routes — handled by their own cookie auth
  if (pathname.startsWith("/superadmin") || pathname.startsWith("/api/superadmin")) {
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

  return NextResponse.next(withTenant);
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
