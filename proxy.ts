import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionToken, SESSION } from "@/lib/session";

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
  "/api/loyalty",
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

  // Rate-limit all API routes (skip in development)
  if (pathname.startsWith("/api/") && process.env.NODE_ENV !== "development") {
    const rlResponse = checkRateLimit(request);
    if (rlResponse) return rlResponse;
  }

  // Login page is always public
  if (pathname === "/admin/login") return NextResponse.next();

  // Public order tracking page
  if (pathname.startsWith("/pedido/")) return NextResponse.next();

  // Protect all /admin routes
  if (pathname.startsWith("/admin")) {
    const token = request.cookies.get(SESSION.COOKIE_NAME)?.value;
    if (!token || !(await verifySessionToken(token))) {
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("from", encodeURIComponent(pathname));
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
      return NextResponse.next();
    }
    // Allow review creation by customers
    if (pathname === "/api/reviews" && request.method === "POST") {
      return NextResponse.next();
    }
    const token = request.cookies.get(SESSION.COOKIE_NAME)?.value;
    if (!token || !(await verifySessionToken(token))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/:path*"],
};
