/**
 * lib/store-metadata.ts
 *
 * Helper compartido para construir el `title` de las páginas dentro del grupo
 * `(store)`. Resuelve el nombre real del comercio leyendo `settings` con
 * fallback a `tenantSlug`, y aplica `title.absolute` cuando el middleware
 * `slug-routes.ts` marcó la request con `x-tenant-store-route: 1`.
 *
 * Razón: el root layout tiene `template: "%s | Buleje"`. Una tienda
 * individual no debe ver el sufijo del marketplace en su propia página.
 */

import { cache } from "react";
import { headers } from "next/headers";
import { connection } from "next/server";
import type { Metadata } from "next";
import { SettingsDB } from "@/lib/db/settings.db";

/**
 * Dedupe per-request: layout.generateMetadata + page.generateMetadata + el
 * body del page todos llaman a SettingsDB.get del mismo tenantId. React
 * `cache()` hace que la primera llamada siga al DB y las siguientes reciban
 * la promesa cacheada — elimina los 3x N+1 warnings que aparecían en logs.
 */
export const getCachedSettings = cache(async (tenantId: string) => {
  return SettingsDB.get(tenantId).catch(() => null);
});

/**
 * Resuelve el nombre público del comercio + el flag de ruta tenant.
 * Cacheado per-request para que múltiples páginas/layouts del mismo render
 * compartan resultado.
 */
export const resolveStoreContext = cache(async (): Promise<{ name: string; tenantId: string; isTenant: boolean }> => {
  // Next 16 Cache Components: opt-out explícito de pre-render estático — esta
  // función lee headers() + hace una query no cacheada (settings por tenant).
  // Debe ir FUERA del try/catch: connection() lanza una excepción especial
  // durante el prerender que React captura internamente; si quedara dentro
  // del try, el catch la tragaría y Next perdería la señal de "dinámico".
  await connection();
  try {
    const hdrs = await headers();
    const tenantId = hdrs.get("x-tenant-id") ?? "main";
    // "Tienda individual" del comerciante: o bien una ruta /t/<slug>/* marcada
    // por el middleware (x-tenant-store-route), o bien un subdominio/customDomain
    // de tenant (x-tenant-id ≠ "main"). El dominio principal = "main" = marketplace.
    // Brandon 2026-06-07: el subdominio NO setea x-tenant-store-route, así que
    // antes la tienda por subdominio caía en el chrome del marketplace.
    const isTenant =
      hdrs.get("x-tenant-store-route") === "1" || tenantId !== "main";
    const settings = await getCachedSettings(tenantId);
    const themeName = (settings?.storeTheme as Record<string, unknown> | undefined)?.["storeName"];
    const name =
      (typeof themeName === "string" && themeName.trim()) ||
      (typeof settings?.businessName === "string" && settings.businessName.trim()) ||
      "tu tienda";
    return { name, tenantId, isTenant };
  } catch {
    return { name: "tu tienda", tenantId: "main", isTenant: false };
  }
});

/** Lee el nombre público del comercio. Cadena de fallback robusta. */
async function readStoreName(): Promise<{ name: string; isTenant: boolean }> {
  const ctx = await resolveStoreContext();
  return { name: ctx.name, isTenant: ctx.isTenant };
}

/**
 * Construye `Metadata.title` con el nombre del comercio.
 *
 * @param prefix - Prefijo descriptivo de la página (ej. "Mis cupones",
 *                 "Mi Cuenta"). El resultado será `${prefix} — ${name}`.
 * @param description - Descripción opcional para SEO.
 * @param robots - Opciones de robots (por defecto noindex en /cuenta).
 */
export async function buildTenantTitle(
  prefix: string,
  description?: string,
  robots?: Metadata["robots"],
): Promise<Metadata> {
  const { name, isTenant } = await readStoreName();
  // Designer audit P1: cuando no es tenant (= plataforma global), antes
  // generaba "Prefix — Buleje" y el template root añadía otro "| Buleje"
  // dando "Prefix — Buleje | Buleje". Ahora si name === "Buleje" (sin
  // tenant) devolvemos solo el prefix y dejamos que el template haga
  // su trabajo.
  if (!isTenant) {
    return {
      title: prefix,
      ...(description ? { description } : {}),
      ...(robots !== undefined ? { robots } : {}),
    };
  }
  const title = `${prefix} — ${name}`;
  return {
    title: { absolute: title },
    ...(description ? { description } : {}),
    ...(robots !== undefined ? { robots } : {}),
  };
}
