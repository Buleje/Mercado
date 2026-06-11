/**
 * lib/middleware/constants.ts
 *
 * Compile-time constants used by the edge middleware (proxy.ts).
 * Pure values — no runtime logic, no imports from next/server.
 *
 * Extracted from proxy.ts on 2026-04-08 as part of the TD-013 refactor
 * (see docs/adr/014-middleware-module-split.md). Keeping these in a
 * separate file makes them trivially testable and prevents the
 * proxy.ts orchestrator from ballooning again.
 */

/**
 * Root domain for tenant routing (strip port).
 * Set ROOT_DOMAIN=bodegasaas.com in production .env
 */
export const ROOT_DOMAIN = (process.env.ROOT_DOMAIN ?? "localhost").split(":")[0];

/**
 * Prefix used when an incoming request comes from a fully custom domain
 * (not a subdomain of ROOT_DOMAIN). The tenant resolver mints a synthetic
 * slug `custom--{host}` so multi-tenant DB queries still have a stable id.
 */
export const CUSTOM_DOMAIN_PREFIX = "custom--";

/**
 * Default tenant slug used when no strategy resolved a specific tenant.
 * This matches the legacy hard-coded "main" value scattered across the app.
 */
export const DEFAULT_TENANT_ID = "main";

/**
 * Path prefixes whose tenant may be resolved from the ADMIN SESSION context
 * (JWT → active-tenant cookie → Referer) when the host is the bare main
 * domain. These are backend/admin surfaces that operate ON a specific tenant
 * and need to know which one even without a subdomain (e.g. an owner opening
 * `localhost:3000/admin`).
 *
 * PUBLIC storefront pages (`/`, `/marketplace`, `/tiendas`, `/cuenta`, …) are
 * intentionally EXCLUDED. On the main host they must ALWAYS resolve to the
 * marketplace ("main"), even if an admin session cookie is present — otherwise
 * the marketplace home at "/" would render the logged-in admin's OWN storefront
 * (TenantStoreHome) instead of the marketplace catalog. Brandon 2026-06-11.
 *
 * Note: subdomain / custom-domain hosts and `/t/[slug]` paths resolve the
 * tenant earlier (host resolution / Source 0) and never reach this gate.
 */
export const SESSION_TENANT_PATH_PREFIXES = [
  "/api",
  "/admin",
  "/superadmin",
  "/panel",
  "/cms",
  "/supplier",
] as const;

/**
 * API routes that are admin-only (all HTTP methods require a valid
 * admin session cookie). Any request whose pathname starts with one
 * of these prefixes is gated in proxy.ts → authGuards.requireAdminApi.
 */
export const ADMIN_ONLY_API_PREFIXES = [
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
] as const;

/**
 * Shared API routes where only write operations (POST/PUT/PATCH/DELETE)
 * require admin auth. GET stays public so the storefront can call them.
 */
export const WRITE_PROTECTED_API_PREFIXES = [
  "/api/products",
  "/api/orders",
  "/api/customers",
  "/api/reviews",
  "/api/settings",
  "/api/promotions",
  "/api/coupons",
  "/api/loyalty",
] as const;

/**
 * Allow-list of (pathname, method) pairs that bypass the write guard
 * on WRITE_PROTECTED_API_PREFIXES. These are endpoints the storefront
 * legitimately calls without a logged-in admin (e.g. customer creating
 * an order, reading own orders by phone, spinning a coupon).
 *
 * A function is used instead of a plain list because some entries
 * depend on query-string conditions (GET /api/orders?phone=xxx).
 */
export type PublicWriteRule = (pathname: string, method: string, searchParams: URLSearchParams) => boolean;

export const PUBLIC_WRITE_ALLOWLIST: PublicWriteRule[] = [
  // Customer placing an order
  (pathname, method) => pathname === "/api/orders" && method === "POST",
  // Storefront reading own orders by phone (LastOrderBanner, CheckoutModal)
  (pathname, method, params) =>
    pathname === "/api/orders" && method === "GET" && params.has("phone"),
  // Customer posting a review
  (pathname, method) => pathname === "/api/reviews" && method === "POST",
  // Public spin-wheel coupon generation
  (pathname, method) => pathname === "/api/coupons/spin" && method === "POST",
  // Customer validating a coupon at checkout (no login required)
  (pathname, method) => pathname === "/api/coupons/validate" && method === "POST",
];
