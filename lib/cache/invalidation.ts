/**
 * lib/cache/invalidation.ts
 *
 * Helpers de invalidación de caché por dominio de negocio.
 * Centraliza las claves de caché para que escrituras en cualquier módulo
 * puedan invalidar sin conocer las claves exactas.
 *
 * REGLA: La invalidación ocurre en las clases DB, no en route handlers.
 * Estos helpers son para ser llamados desde ProductsDB.update(), SettingsDB.set(), etc.
 *
 * Convención de claves (caching-strategy.instructions.md):
 *   {recurso}:{tenantId}           → products:tenant_abc
 *   {recurso}:{tenantId}:{id}      → product-ratings:tenant_abc:prod_456
 *   marketplace:catalog:{tenantId} → catálogo marketplace por tenant
 */

import { invalidate, invalidateByPrefix } from "@/lib/cache";

// ── Settings ──────────────────────────────────────────────────────────────────

/**
 * Invalida la configuración de una tienda.
 * Llamar después de SettingsDB.set() o cualquier PUT a /api/settings.
 */
export function invalidateSettingsCache(tenantId: string): void {
  invalidate(`settings:${tenantId}`);
}

// ── Productos ─────────────────────────────────────────────────────────────────

/**
 * Invalida el catálogo completo de productos de un tenant.
 * Llamar después de ProductsDB.upsert(), .update(), .delete().
 */
export function invalidateProductsCache(tenantId: string): void {
  invalidateByPrefix(`products:${tenantId}`);
}

/**
 * Invalida solo las ratings de un producto específico.
 * Llamar después de crear/aprobar una reseña.
 */
export function invalidateProductRatingsCache(
  tenantId: string,
  productId: string | number
): void {
  invalidate(`product-ratings:${tenantId}:${productId}`);
}

// ── Marketplace ───────────────────────────────────────────────────────────────

/**
 * Invalida el catálogo del marketplace para un tenant.
 * Llamar cuando cambia el inventario o configuración de store en el marketplace.
 */
export function invalidateMarketplaceCatalogCache(tenantId: string): void {
  invalidateByPrefix(`marketplace:catalog:${tenantId}`);
}

/**
 * Invalida todos los datos de caché de un tenant completo.
 * Nuclear — usar solo cuando un tenant cambia datos fundamentales (migración, etc.).
 */
export function invalidateTenantCache(tenantId: string): void {
  invalidateByPrefix(`settings:${tenantId}`);
  invalidateByPrefix(`products:${tenantId}`);
  invalidateByPrefix(`categories:${tenantId}`);
  invalidateByPrefix(`promotions:${tenantId}`);
  invalidateByPrefix(`marketplace:catalog:${tenantId}`);
  invalidateByPrefix(`dashboard-stats:${tenantId}`);
}
