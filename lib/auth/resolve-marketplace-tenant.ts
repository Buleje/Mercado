/**
 * lib/auth/resolve-marketplace-tenant.ts
 *
 * Helper observable para resolver tenantId en endpoints PÚBLICOS del
 * marketplace (storefront cross-tenant).
 *
 * Por qué existe:
 *   El marketplace agrega productos/órdenes de TODOS los tenants en
 *   superficies como /marketplace, /api/marketplace/catalog, etc. El
 *   fallback a "main" es legítimo en estos casos (enriquecimiento de
 *   imágenes, KPIs globales). PERO el patrón `req.headers.get("x-tenant-id") ?? "main"`
 *   se repetía en 10+ archivos sin logging, ocultando casos donde el
 *   header DEBÍA venir (audit P1-1).
 *
 * Este helper:
 *   - Resuelve tenantId del header `x-tenant-id`
 *   - Si está ausente y `allowMainFallback=true` (default), emite warn
 *     observable y retorna `"main"`. NO crashea — el marketplace público
 *     debe seguir funcionando.
 *   - Si `allowMainFallback=false`, retorna `null` para que el caller
 *     decida (ej. endpoints de mutación que NO deben aceptar el fallback).
 *
 * Uso:
 *   const tenantId = resolveMarketplaceTenant(req); // siempre string
 *   const strict   = resolveMarketplaceTenant(req, { allowMainFallback: false }); // string | null
 */

import type { NextRequest } from "next/server";
import { logger } from "@/lib/logger";

const PLATFORM_TENANT = "main";

export interface ResolveOpts {
  /**
   * Si true (default), ausencia de header devuelve "main" + warn.
   * Si false, devuelve null (caller debe manejar 400/401).
   */
  allowMainFallback?: boolean;
  /** Tag opcional para el log (path o nombre del handler). */
  context?: string;
}

export function resolveMarketplaceTenant(
  req: NextRequest | Request,
  opts: ResolveOpts & { allowMainFallback: false },
): string | null;
export function resolveMarketplaceTenant(
  req: NextRequest | Request,
  opts?: ResolveOpts,
): string;
export function resolveMarketplaceTenant(
  req: NextRequest | Request,
  opts: ResolveOpts = {},
): string | null {
  const headerTenant = req.headers.get("x-tenant-id")?.trim();
  if (headerTenant) return headerTenant;

  const allowFallback = opts.allowMainFallback !== false;
  if (!allowFallback) return null;

  // Logger observable — productive surface marketplaces should always
  // have the header from the middleware proxy.ts. Missing = anomaly.
  logger.warn("[marketplace-tenant] missing x-tenant-id header, falling back to 'main'", {
    context: opts.context ?? "unknown",
    path: typeof (req as NextRequest).nextUrl?.pathname === "string"
      ? (req as NextRequest).nextUrl.pathname
      : undefined,
  });
  return PLATFORM_TENANT;
}
