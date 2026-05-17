/**
 * lib/admin-cache.ts
 *
 * Brandon 2026-05-16 (Fase 4 perf):
 *
 * Centraliza la invalidación de caches del admin tras writes. Se llama
 * desde los endpoints que crean/actualizan/eliminan entidades cuyo
 * resultado afecta los dashboards/KPIs del panel.
 *
 * Patrón actual: `getOrSet(key, ttl, ...)` cachea respuestas con TTL ciego.
 * Sin invalidación, las KPIs muestran datos viejos hasta que expira el TTL
 * (15s-300s según endpoint) — el bodeguero hace un pedido y ve el contador
 * sin actualizar.
 *
 * Con este helper: tras un write llamamos `invalidateAdminCache.afterOrder(tenantId)`
 * y los próximos GETs golpean DB y devuelven datos frescos. La complejidad
 * de saber qué cache keys borrar queda encapsulada acá.
 *
 * Migración futura: cuando los endpoints adopten `"use cache"` Next 16 +
 * `cacheTag()`, este helper se convierte en wrappers de `revalidateTag()`
 * sin cambios en los call sites.
 */
import { invalidate, invalidateByPrefix } from "@/lib/cache";

export const invalidateAdminCache = {
  /**
   * Llamar tras crear/actualizar/eliminar un Order (incluye marketplace orders).
   * Invalida: dashboard, stats, overview, today-summary, alerts-summary, doc-badges.
   */
  afterOrder(tenantId: string): void {
    invalidateByPrefix(`admin:overview:${tenantId}`);
    invalidate(`admin:stats:${tenantId}`);
    invalidate(`admin:alerts-summary:${tenantId}`);
    invalidate(`admin:doc-badges:${tenantId}`);
    invalidateByPrefix(`admin:dashboard:${tenantId}`);
    invalidateByPrefix(`admin:today-summary:${tenantId}`);
  },

  /**
   * Llamar tras crear/actualizar Product (stock, precio).
   * Invalida: overview (top products), eoq-suggest, stats (lowStock).
   */
  afterProduct(tenantId: string): void {
    invalidateByPrefix(`admin:overview:${tenantId}`);
    invalidateByPrefix(`admin:eoq:${tenantId}`);
    invalidate(`admin:stats:${tenantId}`);
  },

  /**
   * Llamar tras crear/actualizar Customer.
   * Invalida: stats (totalCustomers), overview (newCustomers).
   */
  afterCustomer(tenantId: string): void {
    invalidate(`admin:stats:${tenantId}`);
    invalidateByPrefix(`admin:overview:${tenantId}`);
  },

  /**
   * Llamar tras Document write (cotización, GRR, nota crédito).
   * Invalida: doc-badges (counts por tipo de documento).
   */
  afterDocument(tenantId: string): void {
    invalidate(`admin:doc-badges:${tenantId}`);
  },

  /**
   * Llamar tras Payable write (compras / proveedores).
   * Invalida: stats (overduePayables), overview.
   */
  afterPayable(tenantId: string): void {
    invalidate(`admin:stats:${tenantId}`);
    invalidateByPrefix(`admin:overview:${tenantId}`);
  },

  /**
   * Llamar tras Purchase / Supplier write.
   * Audit 2026-05-17 Q-P0-4: purchases.db.ts no invalidaba cache → POS
   * mostraba inventario incorrecto tras recibir mercadería.
   * Invalida: stats (lowStock), overview (top products), payable (compras pendientes).
   */
  afterPurchase(tenantId: string): void {
    invalidate(`admin:stats:${tenantId}`);
    invalidateByPrefix(`admin:overview:${tenantId}`);
    invalidateByPrefix(`admin:dashboard:${tenantId}`);
  },
};
