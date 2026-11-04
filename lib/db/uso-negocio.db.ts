import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { SaludNegocioDB, type SenalesDeUso } from "@/lib/db/salud-negocio.db";

/**
 * lib/db/uso-negocio.db.ts — datos de la pantalla «Uso vs límites» del superadmin (04-11).
 *
 * Es una vista de PLATAFORMA (todos los negocios, sólo lectura): por eso no recibe `tenantId`;
 * quien la llama ya pasó por `requirePlatformAPI`. Antes la ruta usaba `prisma` directo; ahora toda
 * la lectura vive acá. Las operaciones de cada negocio (pedidos, ventas, libro CTP, trozas) y sus
 * ingresos salen de `SaludNegocioDB.senalesDeUso`, la misma fuente del puntaje de salud.
 */

export interface NegocioParaUso {
  id: string;
  slug: string;
  name: string;
  plan: string;
  trialEndsAt: Date | null;
  createdAt: Date;
}

export interface DatosDeUso {
  negocios: NegocioParaUso[];
  /** Pedidos creados desde `desdeMes`, por negocio. */
  pedidosDelMes: Map<string, number>;
  productos: Map<string, number>;
  /** Usuarios admin activos. */
  admins: Map<string, number>;
  /** Señales de uso real; `null` = no se pudieron leer para ese negocio (se loguea). */
  senales: Map<string, SenalesDeUso | null>;
}

/** Negocios medidos a la vez: cada uno lanza 3 consultas; 4 × 3 cabe en el pool sin hacer fila. */
const LOTE_DE_NEGOCIOS = 4;

export const UsoNegocioDB = {
  /**
   * Todo lo que necesita la pantalla en una lectura: negocios + conteos del mes + señales de 30 días.
   * Un negocio cuyas señales fallan no tumba la lista: queda en `null` y se loguea.
   */
  async leerTodo(desdeMes: Date, desde7: Date, desde30: Date): Promise<DatosDeUso> {
    const [negocios, pedidos, productos, admins] = await Promise.all([
      prisma.tenant.findMany({
        select: { id: true, slug: true, name: true, plan: true, trialEndsAt: true, createdAt: true },
      }),
      prisma.order.groupBy({ by: ["tenantId"], where: { createdAt: { gte: desdeMes } }, _count: { _all: true } }),
      prisma.product.groupBy({ by: ["tenantId"], _count: { _all: true } }),
      prisma.adminUser.groupBy({ by: ["tenantId"], where: { active: true }, _count: { _all: true } }),
    ]);

    const senales = new Map<string, SenalesDeUso | null>();
    for (let i = 0; i < negocios.length; i += LOTE_DE_NEGOCIOS) {
      const lote = negocios.slice(i, i + LOTE_DE_NEGOCIOS);
      const medidas = await Promise.all(
        lote.map((n) =>
          SaludNegocioDB.senalesDeUso(n.id, desde7, desde30).catch((err) => {
            logger.error("[uso-negocio] señales de uso fallaron", { tenantId: n.id, error: String(err) });
            return null;
          }),
        ),
      );
      lote.forEach((n, j) => senales.set(n.id, medidas[j] ?? null));
    }

    return {
      negocios,
      pedidosDelMes: new Map(pedidos.map((r) => [r.tenantId, r._count._all])),
      productos: new Map(productos.map((r) => [r.tenantId, r._count._all])),
      admins: new Map(admins.map((r) => [r.tenantId, r._count._all])),
      senales,
    };
  },
};
