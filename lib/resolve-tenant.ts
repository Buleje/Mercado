import "server-only";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { tryAdmin } from "@/lib/require-admin";

/** Custom-domain prefix injected by edge middleware */
const CUSTOM_PREFIX = "custom--";
const LEGACY_CUSTOM_PREFIX = "custom:";

/**
 * In-process cache: custom_hostname → tenant_slug.
 * TTL: 5 minutes. Cleared on each server restart (good enough for
 * a low-churn SaaS where domains are rarely changed).
 */
const cache = new Map<string, { slug: string; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Given a raw `x-tenant-id` value, return the real tenant slug.
 *
 * - "main"                  → "main"
 * - "acme"                  → "acme"          (subdomain, pass-through)
 * - "custom--www.tienda.com" → looks up Tenant.customDomain in DB
 *
 * Returns null when a custom domain is not found in the DB (unknown visitor).
 */
export async function resolveTenantSlug(
  rawTenantId: string
): Promise<string | null> {
  const hostname = getCustomDomainHostname(rawTenantId);
  if (!hostname) {
    // Plain slug — trust as-is
    return rawTenantId;
  }

  // Cache hit
  const cached = cache.get(hostname);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.slug;
  }

  // DB lookup
  const tenant = await prisma.tenant.findFirst({
    where: { customDomain: hostname, active: true },
    select: { slug: true },
  });

  if (!tenant) return null;

  cache.set(hostname, { slug: tenant.slug, expiresAt: Date.now() + CACHE_TTL_MS });
  return tenant.slug;
}

/** Invalidate a cached custom domain entry (call after updating/removing). */
export function invalidateCustomDomainCache(hostname: string) {
  cache.delete(hostname.toLowerCase());
}

/**
 * In-process cache: tenant_slug → tenant_id (CUID). TTL 5 min.
 * Resolve a slug to its canonical Tenant.id (CUID).
 *
 * - "main" → "main" (legacy: id == slug for the default tenant)
 * - "mi-pollo" → "cmoevpwfk..." (DB lookup)
 *
 * Returns the input as-is when no DB row matches (preserves legacy behavior
 * for "main" and prevents test fixtures from breaking when they pass a CUID
 * directly).
 */
const slugToIdCache = new Map<string, { id: string; expiresAt: number }>();
// Dedupe in-flight DB queries — múltiples requests concurrentes con el mismo
// slug ANTES del primer write a cache disparaban N+1. Ahora la primera lookup
// crea una promise compartida que las siguientes esperan.
const slugInflight = new Map<string, Promise<string>>();

export async function resolveTenantSlugToId(slugOrId: string): Promise<string> {
  if (!slugOrId) return slugOrId;
  // Heuristic: a CUID starts with "c" and is 25+ chars → return as-is.
  if (slugOrId.length >= 24 && slugOrId.startsWith("c")) return slugOrId;
  const cached = slugToIdCache.get(slugOrId);
  if (cached && cached.expiresAt > Date.now()) return cached.id;
  const inflight = slugInflight.get(slugOrId);
  if (inflight) return inflight;

  const promise = prisma.tenant
    .findUnique({ where: { slug: slugOrId }, select: { id: true } })
    .catch(() => null)
    .then((tenant) => {
      const id = tenant?.id ?? slugOrId;
      slugToIdCache.set(slugOrId, { id, expiresAt: Date.now() + CACHE_TTL_MS });
      return id;
    })
    .finally(() => {
      slugInflight.delete(slugOrId);
    });

  slugInflight.set(slugOrId, promise);
  return promise;
}

/**
 * resolveTenantIdForRoute — resolución segura de tenantId para route handlers
 * que sirven tanto a admin (autenticado) como anónimos (storefront público).
 *
 * BUG QUE PREVIENE:
 *   Endpoints que solo leen `req.headers.get("x-tenant-id") ?? "main"` quedan
 *   vulnerables a:
 *     - Header stale (cookie del primer login no actualizada al impersonar)
 *     - Proxy mal-resolviendo en localhost (host sin subdominio → "main")
 *     - Stale read del active-tenant cookie cuando la sesión cambió
 *   Resultado: superadmin entra al tenant A, luego al B, y el B muestra
 *   datos de "main" porque el header es stale → fuga cross-tenant.
 *
 * REGLA:
 *   1. Si hay sesión admin válida (JWT firmado y vigente) → usar payload.tenantId
 *      (canonical CUID, fuente de verdad inmutable después del login).
 *   2. Si no hay JWT (anonymous storefront) → usar header del proxy.
 *   3. Último fallback "main" solo si ambos faltan.
 *
 * Para handlers que YA usan `requireAdmin(req)`, NO llamar este helper —
 * `requireAdmin` ya devuelve `auth.tenantId` correctamente. Este helper es
 * para endpoints públicos / soft-auth que SÍ deben servir a admin y anónimo.
 */
export async function resolveTenantIdForRoute(req: NextRequest): Promise<string> {
  // Source 1 (HIGHEST): Admin JWT firmado.
  const session = await tryAdmin(req);
  if (session?.tenantId) {
    // [SECURITY] SuperAdmin puede impersonar otro tenant via header — necesario
    // para que el panel de plataforma pueda gestionar tenants individuales sin
    // re-emitir JWT. Para cualquier otro rol, el JWT manda (anti-injection).
    //
    // Nota: esto DEBE alinearse con la logica del PUT en
    // `app/api/settings/route.ts` para que GET y PUT escriban/lean el mismo
    // tenant — sino el StoreCustomizer salva pero el reload muestra los
    // valores viejos (asimetria detectada 2026-05-05).
    if (session.role === "superadmin") {
      const header = req.headers.get("x-tenant-id");
      if (header && header !== session.tenantId) return header;
    }
    return session.tenantId;
  }

  // Source 2: header inyectado por proxy.ts (de active-tenant cookie / referer).
  const header = req.headers.get("x-tenant-id");
  if (header) return header;

  // Source 3: fallback al tenant principal.
  return "main";
}

function getCustomDomainHostname(rawTenantId: string): string | null {
  if (rawTenantId.startsWith(CUSTOM_PREFIX)) {
    return rawTenantId.slice(CUSTOM_PREFIX.length).toLowerCase();
  }

  if (rawTenantId.startsWith(LEGACY_CUSTOM_PREFIX)) {
    return rawTenantId.slice(LEGACY_CUSTOM_PREFIX.length).toLowerCase();
  }

  return null;
}
