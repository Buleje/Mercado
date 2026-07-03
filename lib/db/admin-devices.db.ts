import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * AdminDevicesDB — dispositivos/IP conocidos por un admin (tabla AdminLoginDevice,
 * poblada en cada login por `alertNewDeviceLogin`). Para el card "Dispositivos y
 * accesos" de Configuración → Seguridad (#3a "último ingreso").
 *
 * `tenantId` 1er argumento (aislamiento multi-tenant).
 */

export type DbLoginDevice = {
  id: string;
  ip: string | null;
  userAgent: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
};

export const AdminDevicesDB = {
  /**
   * Dispositivos del admin, más reciente primero. El primero (lastSeenAt mayor)
   * es el dispositivo actual (el login recién actualizó su lastSeenAt).
   */
  async listByUser(
    tenantId: string,
    username: string,
    limit = 10,
  ): Promise<DbLoginDevice[]> {
    const rows = await prisma.adminLoginDevice.findMany({
      where: { tenantId, username },
      orderBy: { lastSeenAt: "desc" },
      take: limit,
      select: { id: true, ip: true, userAgent: true, firstSeenAt: true, lastSeenAt: true },
    });
    return rows.map((r) => ({
      id: r.id,
      ip: r.ip,
      userAgent: r.userAgent,
      firstSeenAt: r.firstSeenAt.toISOString(),
      lastSeenAt: r.lastSeenAt.toISOString(),
    }));
  },
};
