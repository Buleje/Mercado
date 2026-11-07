import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { SaludNegocioDB, type SenalesDeUso } from "@/lib/db/salud-negocio.db";

/**
 * lib/db/automatizaciones.db.ts — lecturas de las reglas de /superadmin/automations (04-11).
 *
 * Es una vista de PLATAFORMA (todos los negocios, sólo lectura): por eso no recibe `tenantId`;
 * quien la llama ya pasó por `requirePlatformAPI` o por el secreto del cron. Antes
 * `lib/superadmin/automations.ts` usaba `prisma` directo; ahora toda la lectura vive acá.
 * El estado (`automations`, `automation-notify-log`) se guarda por `PlatformSettingsDB`.
 *
 * «Tienda dormida» ya no mira sólo pedidos: usa las señales REALES de uso
 * (`SaludNegocioDB.senalesDeUso`: pedidos + ventas + líneas del libro CTP + trozas), la misma
 * fuente del puntaje de salud. Un aserradero casi sin pedidos pero con libro diario no es «dormido».
 */

export interface TiendaBasica {
  id: string;
  slug: string;
  name: string;
}

export interface TiendaConPlan extends TiendaBasica {
  plan: string;
}

/** Negocios medidos a la vez: cada uno lanza 3 consultas; 4 × 3 cabe en el pool sin hacer fila (igual que «Uso vs límites»). */
const LOTE_DE_NEGOCIOS = 4;

const DIA_MS = 86_400_000;
const SELECT_BASICO = { id: true, slug: true, name: true } as const;

export const AutomatizacionesDB = {
  /** Negocios cuya prueba vence entre `desde` y `hasta` (ambos incluidos). */
  async tiendasConPruebaEntre(desde: Date, hasta: Date): Promise<TiendaBasica[]> {
    return prisma.tenant.findMany({
      where: { trialEndsAt: { gte: desde, lte: hasta } },
      select: SELECT_BASICO,
    });
  },

  /** Negocios activos. */
  async tiendasActivas(): Promise<TiendaBasica[]> {
    return prisma.tenant.findMany({ where: { active: true }, select: SELECT_BASICO });
  },

  /** Todos los negocios con su plan (la regla «cerca del límite» no filtra por activo). */
  async tiendasConPlan(): Promise<TiendaConPlan[]> {
    return prisma.tenant.findMany({ select: { ...SELECT_BASICO, plan: true } });
  },

  /** Pedidos creados desde `desde`, por negocio (los negocios sin pedidos no aparecen). */
  async pedidosDesde(desde: Date): Promise<Map<string, number>> {
    const filas = await prisma.order.groupBy({
      by: ["tenantId"],
      where: { createdAt: { gte: desde } },
      _count: { _all: true },
    });
    return new Map(filas.map((f) => [f.tenantId, f._count._all]));
  },

  /** Último `login_success` por negocio, en ms (los que nunca entraron no aparecen). */
  async ultimoIngresoPorTienda(): Promise<Map<string, number>> {
    const filas = await prisma.activityLog.groupBy({
      by: ["tenantId"],
      where: { action: "login_success" },
      _max: { createdAt: true },
    });
    return new Map(filas.map((f) => [f.tenantId, f._max.createdAt?.getTime() ?? 0]));
  },

  /**
   * Señales de uso real de 30 días de varios negocios (de a `LOTE_DE_NEGOCIOS`). Un negocio cuya
   * lectura falla queda en `null` y se loguea: quien decide NO debe tratarlo como «sin actividad».
   */
  async senalesDeUsoDe(tenantIds: string[], ahora: number): Promise<Map<string, SenalesDeUso | null>> {
    const desde7 = new Date(ahora - 7 * DIA_MS);
    const desde30 = new Date(ahora - 30 * DIA_MS);
    const senales = new Map<string, SenalesDeUso | null>();
    for (let i = 0; i < tenantIds.length; i += LOTE_DE_NEGOCIOS) {
      const lote = tenantIds.slice(i, i + LOTE_DE_NEGOCIOS);
      const medidas = await Promise.all(
        lote.map((id) =>
          SaludNegocioDB.senalesDeUso(id, desde7, desde30).catch((err) => {
            logger.error("[automatizaciones] señales de uso fallaron", { tenantId: id, error: String(err) });
            return null;
          }),
        ),
      );
      lote.forEach((id, j) => senales.set(id, medidas[j] ?? null));
    }
    return senales;
  },
};
