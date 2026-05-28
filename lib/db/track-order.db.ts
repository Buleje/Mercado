/**
 * lib/db/track-order.db.ts
 *
 * Audit project-wide 2026-05-19 — elimina acceso prisma.* directo en
 * app/api/track/[orderId]/route.ts.
 *
 * Tres consultas encapsuladas:
 *   1. findOrderForTracking — raw SQL necesario porque los campos D1.4
 *      (deliveryStatus, dropoffLat, dropoffLng, etc.) se aplicaron
 *      manualmente y aún no están en schema.prisma.
 *   2. findStoreNameByTenantId — nombre de la tienda asociada al tenant.
 *   3. findDriverNameByRoute — nombre del repartidor desde DeliveryRoute.
 *
 * Todos los raw SQL usan parámetros posicionales ($1 $2) — NUNCA
 * string interpolation (CLAUDE.md regla #11).
 */
import "server-only";
import { prisma } from "@/lib/prisma";

export type TrackOrderRow = {
  id: string;
  tenantId: string;
  customerName: string;
  deliveryStatus: string | null;
  driverId: string | null;
  deliveredAt: Date | null;
  estimatedDeliveryAt: Date | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
};

export const TrackOrderDB = {
  /**
   * Busca un pedido por id para mostrar al cliente en el link de tracking.
   * Usa raw SQL porque los campos de D1.4 no están en schema.prisma todavía.
   * Retorna null si no existe o fue borrado (deletedAt IS NOT NULL).
   */
  async findOrderForTracking(orderId: string): Promise<TrackOrderRow | null> {
    const rows = await prisma.$queryRawUnsafe<TrackOrderRow[]>(
      `SELECT "id","tenantId","customerName","deliveryStatus","driverId",
              "deliveredAt","estimatedDeliveryAt","dropoffLat","dropoffLng"
         FROM "Order"
        WHERE "id" = $1 AND "deletedAt" IS NULL
        LIMIT 1`,
      orderId,
    );
    return rows[0] ?? null;
  },

  /**
   * Retorna el nombre de la tienda asociada al tenant dado.
   * Devuelve null si no existe store para ese tenant.
   */
  async findStoreNameByTenantId(tenantId: string): Promise<string | null> {
    const store = await prisma.store.findFirst({
      where: { tenantId },
      select: { name: true },
    });
    return store?.name ?? null;
  },

  /**
   * Resuelve tenantId desde slug (subdomain). Usado por el endpoint público
   * `/api/track/[orderId]` para verificar que el orderId pertenece al tenant
   * del host (defensa en profundidad — el orderId ya es entropy-based pero
   * esto evita IDOR cross-tenant aún si hubo colisión / leak).
   *
   * Brandon 2026-05-28 P0 (audit #1 SEC).
   */
  async findTenantIdBySlug(slug: string): Promise<string | null> {
    if (!slug) return null;
    const tenant = await prisma.tenant.findUnique({
      where: { slug },
      select: { id: true },
    });
    return tenant?.id ?? null;
  },

  /**
   * Busca el nombre del repartidor a partir de la ruta de delivery más reciente.
   * Retorna null si no hay ruta o no hay driverId.
   */
  async findDriverNameByRoute(
    driverId: string,
    tenantId: string,
  ): Promise<string | null> {
    const rows = await prisma.$queryRawUnsafe<Array<{ driverName: string }>>(
      `SELECT "driverName" FROM "DeliveryRoute"
        WHERE "driverId" = $1 AND "tenantId" = $2
        ORDER BY "createdAt" DESC
        LIMIT 1`,
      driverId,
      tenantId,
    );
    return rows[0]?.driverName ?? null;
  },
};
