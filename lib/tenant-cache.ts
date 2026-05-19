"use client";

/**
 * lib/tenant-cache.ts — Guardia de aislamiento multi-tenant en cliente.
 *
 * BUG QUE PREVIENE (Ley 29733 + integridad de negocio):
 *   El admin cachea data en localStorage (productos, ventas, dashboard, etc.)
 *   con keys GLOBALES sin tenant prefix. Cuando el superadmin entra a un
 *   tenant A y luego a un tenant B, el segundo ve los datos del primero
 *   porque localStorage está compartido entre pestañas del mismo origen.
 *
 *   Eso es FILTRACIÓN de datos cross-tenant: inventario, pedidos,
 *   notificaciones, ventas — todo aparece mezclado.
 *
 * SOLUCIÓN:
 *   1. `assertTenantOwnership()` se llama al montar el panel admin.
 *      Lee la cookie `active-tenant-slug` y la compara con el slug que
 *      "marca" el cache anterior (`__tenant-cache-owner`). Si cambian,
 *      borra TODAS las keys conocidas que cachean data de tenant.
 *
 *   2. `tenantCacheKey(base)` devuelve una key con prefix de tenant para
 *      cualquier consumidor que quiera blindar su cache directamente.
 *
 *   3. `clearAllTenantCache()` está expuesto para usarse en logout y al
 *      salir de impersonación.
 *
 * Storage scheme:
 *   - localStorage["__tenant-cache-owner"] = "<tenantSlug>"
 *   - localStorage[<key>-<tenantSlug>] = data prefixada (opt-in para nuevos)
 */

/** Lista de keys que deben borrarse cuando cambia el tenant. */
const TENANT_SCOPED_KEYS: readonly string[] = [
  // useAdminPrefetch
  "poc-products-cache",
  "poc-suppliers-cache",
  "admin-customers-cache",
  "admin-sales-cache",
  "admin-dashboard-cache",
  "admin-goals-cache",
  // ComprasModule / PuntoCompraView / ReceivingTab
  "poc-templates",
  "admin-recepciones-cache",
  // Onboarding/UI per-tenant — el slug ya está en la key, pero cleamos por consistencia
  // si alguien las setea sin slug
];

/** Prefijos cuyas keys completas también se deben limpiar (startsWith). */
const TENANT_SCOPED_PREFIXES: readonly string[] = [
  "poc-",
  "admin-",
  "dashboard-data-",
  "buleje-admin-",
  "morning-summary-",
];

/**
 * Keys que matchean los prefijos anteriores pero son PLATFORM-GLOBAL, no
 * tenant-scoped. NO se deben borrar al cambiar de tenant porque las configura
 * el superadmin para toda la plataforma (no por negocio).
 *
 * Borrarlas causa que el sidebar del admin muestre solo módulos default en
 * el primer paint tras cambiar de tenant — Brandon tenía que refrescar la
 * página para que aparecieran los módulos configurados en superadmin.
 */
const PLATFORM_GLOBAL_KEYS: ReadonlySet<string> = new Set([
  "buleje-admin-template",   // plantilla de módulos visibles del superadmin (PlatformSetting)
  "buleje-admin-theme-set",  // flag UI: el dueño ya eligió tema una vez (preferencia personal)
]);

const OWNER_KEY = "__tenant-cache-owner";

/** Lee el tenant slug actual de la cookie httpOnly:false `active-tenant-slug`. */
export function getActiveTenantSlug(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)active-tenant-slug=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** Borra TODAS las keys conocidas (lista + prefijos). */
export function clearAllTenantCache(): number {
  if (typeof window === "undefined") return 0;
  let removed = 0;
  try {
    // 0) sessionStorage: cualquier key con prefijo de tenant
    try {
      const sessionKeys: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k) sessionKeys.push(k);
      }
      for (const k of sessionKeys) {
        if (PLATFORM_GLOBAL_KEYS.has(k)) continue;
        if (TENANT_SCOPED_PREFIXES.some((p) => k.startsWith(p))) {
          sessionStorage.removeItem(k);
          removed++;
        }
      }
    } catch { /* sessionStorage no disponible */ }
    // 1) Keys exactas conocidas
    for (const k of TENANT_SCOPED_KEYS) {
      if (localStorage.getItem(k) !== null) {
        localStorage.removeItem(k);
        removed++;
      }
    }
    // 2) Cualquier key cuyo nombre empiece con un prefijo conocido
    const allKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) allKeys.push(k);
    }
    for (const k of allKeys) {
      if (TENANT_SCOPED_PREFIXES.some((p) => k.startsWith(p))) {
        // No borrar el propio OWNER_KEY ni keys que YA tienen un slug por-tenant
        // diferente al actual (no las cuento, podrían ser parte de otro perfil).
        if (k === OWNER_KEY) continue;
        if (PLATFORM_GLOBAL_KEYS.has(k)) continue; // config global del superadmin
        if (TENANT_SCOPED_KEYS.includes(k)) continue; // ya borradas arriba
        localStorage.removeItem(k);
        removed++;
      }
    }
  } catch {
    // localStorage no disponible
  }
  // 3) Service Worker / fetch caches — fire-and-forget. Si hay un SW que cachea
  // /api/admin/* o assets de tenant, los borramos para que la próxima petición
  // golpee al server con el JWT del nuevo tenant.
  if (typeof window !== "undefined" && "caches" in window) {
    void caches.keys()
      .then((names) =>
        Promise.all(
          names
            .filter((n) => n.includes("admin") || n.includes("tenant") || n.startsWith("workbox"))
            .map((n) => caches.delete(n)),
        ),
      )
      .catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });
  }
  return removed;
}

/**
 * Compara el tenant actual con el "dueño" del cache previo. Si cambia:
 *   - borra todo el cache
 *   - actualiza el owner
 * Devuelve `true` si el tenant cambió y se limpió cache, `false` si no.
 *
 * Llamar en el mount del shell admin (app/admin/page.tsx).
 */
export function assertTenantOwnership(): boolean {
  if (typeof window === "undefined") return false;
  const currentSlug = getActiveTenantSlug();
  if (!currentSlug) return false;

  let previousOwner: string | null = null;
  try {
    previousOwner = localStorage.getItem(OWNER_KEY);
  } catch {
    return false;
  }

  if (previousOwner === currentSlug) return false;

  // Cambio detectado — limpiar cache cross-tenant + actualizar owner
  const removed = clearAllTenantCache();
  try {
    localStorage.setItem(OWNER_KEY, currentSlug);
  } catch {
    // ignore
  }
  if (removed > 0 && process.env.NODE_ENV === "development") {
    console.info(
      `[tenant-cache] Tenant changed from "${previousOwner ?? "(none)"}" → "${currentSlug}". Cleared ${removed} stale cache entries.`,
    );
  }
  return true;
}

/** Devuelve una key prefijada con el tenant actual. Para nuevos consumers. */
export function tenantCacheKey(baseKey: string): string {
  const slug = getActiveTenantSlug();
  return slug ? `${baseKey}::${slug}` : baseKey;
}
