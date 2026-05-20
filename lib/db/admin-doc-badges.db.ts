/**
 * lib/db/admin-doc-badges.db.ts
 *
 * Audit project-wide 2026-05-19 — migración de app/api/admin/doc-badges/route.ts.
 * Antes: 3 prisma.*.count() serializados directos en el route.
 * Ahora: Promise.all paralelo con guard cross-tenant + tenantId primer argumento.
 *
 * QW5 perf (preservado del original):
 *  - Promise.all → 3 queries en paralelo en lugar de serializadas.
 *  - Cada count envuelto en .catch(() => 0) por compatibilidad con tenants
 *    viejos que pueden no tener las tablas cotizacion/guiaRemision/notaCredito.
 *  - El cache (TTL 60s) se aplica en el route handler via getOrSet, no aquí,
 *    para no duplicar responsabilidades.
 */
import "server-only";
import { prisma } from "@/lib/prisma";

export type DocBadgeCounts = Record<string, number>;

export const AdminDocBadgesDB = {
  /**
   * Retorna conteo de documentos pendientes para badges del sidebar.
   * Guard: cada query filtra por tenantId — no hay riesgo cross-tenant.
   *
   * @param tenantId  ID del tenant autenticado
   * @returns objeto sparse con solo las claves que tienen count > 0
   */
  async getCountsForTenant(tenantId: string): Promise<DocBadgeCounts> {
    const [cotEnviadas, grrBorrador, ncBorrador] = await Promise.all([
      prisma.cotizacion
        .count({ where: { tenantId, status: "ENVIADA" } })
        .catch(() => 0),
      prisma.guiaRemision
        .count({ where: { tenantId, status: "BORRADOR" } })
        .catch(() => 0),
      prisma.notaCredito
        .count({ where: { tenantId, status: "BORRADOR" } })
        .catch(() => 0),
    ]);

    const result: DocBadgeCounts = {};
    if (cotEnviadas > 0) result["cotizaciones"] = cotEnviadas;
    if (grrBorrador > 0) result["guias-remision"] = grrBorrador;
    if (ncBorrador > 0) result["notas-credito"] = ncBorrador;
    return result;
  },
};
