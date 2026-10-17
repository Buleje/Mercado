import "server-only";
import { prisma } from "@/lib/prisma";
import { SettingsDB } from "@/lib/db/settings.db";
import { armarMembrete, type Membrete } from "@/lib/admin/membrete";

/**
 * MembreteDB — nombre, logo y contacto del negocio para los PDF del panel.
 *
 * Junta lo configurado (`Settings`, con su caché) con lo registrado (`Tenant`)
 * como respaldo. `tenantId` SIEMPRE 1er parámetro.
 */
export const MembreteDB = {
  async del(tenantId: string): Promise<Membrete> {
    if (!tenantId) throw new Error("tenantId is required");
    const [settings, tenant] = await Promise.all([
      SettingsDB.get(tenantId),
      // Primero por id; el slug sólo si no hay: "main" es a la vez el id de sesión
      // y el slug del negocio principal. Con `OR` y sin orden, un negocio cuyo slug
      // fuera igual al id de otro podía poner su nombre en los PDF de ese otro.
      prisma.tenant
        .findUnique({ where: { id: tenantId }, select: { name: true, logoUrl: true } })
        .then((t) => t ?? prisma.tenant.findUnique({ where: { slug: tenantId }, select: { name: true, logoUrl: true } })),
    ]);
    return armarMembrete(settings, tenant);
  },
};
