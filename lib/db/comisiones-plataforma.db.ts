import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * lib/db/comisiones-plataforma.db.ts — lo que la plataforma cobró en comisiones, mirado
 * desde el superadmin (04-11 noche). SOLO LECTURA y entre negocios a propósito: el libro
 * `CommissionLedger` lo escriben `CommissionsDB.recordCommission` / el cron de liquidación
 * (zona de peligro, `lib/db/commissions.db.ts`); acá no se toca nada de eso.
 *
 * Por qué: el hub del marketplace decía «Comisiones — Próximamente» con 62 movimientos
 * (S/ 142,22 de 5 negocios) que nadie podía ver.
 */

export type EstadoComision = "pending" | "settled" | "refunded";

export interface FilaEstadoComision {
  estado: string;
  movimientos: number;
  total: number;
}

export interface FilaNegocioComision {
  tenantId: string;
  negocio: string;
  slug: string | null;
  movimientos: number;
  porLiquidar: number;
  liquidado: number;
  devuelto: number;
  /** Lo que queda para la plataforma: la suma de todo (la fila devuelta y su reversa se anulan). */
  neto: number;
  ultimo: string | null;
}

export interface MovimientoComision {
  id: string;
  creado: string;
  negocio: string;
  tienda: string | null;
  pedido: string;
  tipo: string;
  estado: string;
  /** Tasa en porcentaje, como la guarda el libro (5 = 5 %: `CommissionsDB`, VENDOR_TIERS). */
  tasa: number;
  monto: number;
  liquidado: string | null;
}

export interface ResumenComisiones {
  porEstado: FilaEstadoComision[];
  porNegocio: FilaNegocioComision[];
  ultimos: MovimientoComision[];
  reglas: number;
}

const VACIO: ResumenComisiones = { porEstado: [], porNegocio: [], ultimos: [], reglas: 0 };

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};
const fecha = (v: unknown): string | null =>
  v instanceof Date ? v.toISOString() : v ? String(v) : null;

export const ComisionesPlataformaDB = {
  /** Resumen de toda la plataforma: por estado, por negocio y los últimos movimientos. */
  async resumen(limiteUltimos = 30): Promise<ResumenComisiones> {
    const limite = Math.min(100, Math.max(1, Math.trunc(limiteUltimos)));
    try {
      const [porEstado, porNegocio, ultimos, reglas] = await Promise.all([
        prisma.$queryRawUnsafe<Array<{ estado: string; movimientos: number; total: unknown }>>(
          `SELECT status AS estado, count(*)::int AS movimientos, coalesce(sum(amount), 0) AS total
             FROM "CommissionLedger"
            WHERE type <> 'refund_reversal'
            GROUP BY status
            ORDER BY 2 DESC`,
        ),
        prisma.$queryRawUnsafe<
          Array<{
            tenant_id: string;
            negocio: string | null;
            slug: string | null;
            movimientos: number;
            por_liquidar: unknown;
            liquidado: unknown;
            devuelto: unknown;
            neto: unknown;
            ultimo: Date | null;
          }>
        >(
          `SELECT l."tenantId" AS tenant_id, t.name AS negocio, t.slug,
                  count(*) FILTER (WHERE l.type <> 'refund_reversal')::int AS movimientos,
                  coalesce(sum(l.amount) FILTER (WHERE l.status = 'pending' AND l.type <> 'refund_reversal'), 0) AS por_liquidar,
                  coalesce(sum(l.amount) FILTER (WHERE l.status = 'settled' AND l.type <> 'refund_reversal'), 0) AS liquidado,
                  coalesce(sum(l.amount) FILTER (WHERE l.status = 'refunded'), 0) AS devuelto,
                  coalesce(sum(l.amount), 0) AS neto,
                  max(l."createdAt") AS ultimo
             FROM "CommissionLedger" l
             LEFT JOIN "Tenant" t ON t.id = l."tenantId"
            GROUP BY 1, 2, 3
            ORDER BY neto DESC`,
        ),
        prisma.$queryRawUnsafe<
          Array<{
            id: string;
            creado: Date;
            negocio: string | null;
            tienda: string | null;
            pedido: string;
            tipo: string;
            estado: string;
            tasa: unknown;
            monto: unknown;
            liquidado: Date | null;
          }>
        >(
          `SELECT l.id, l."createdAt" AS creado, t.name AS negocio, s.name AS tienda,
                  l."orderId" AS pedido, l.type AS tipo, l.status AS estado,
                  l.rate AS tasa, l.amount AS monto, l."settledAt" AS liquidado
             FROM "CommissionLedger" l
             LEFT JOIN "Tenant" t ON t.id = l."tenantId"
             LEFT JOIN "Store" s ON s.id = l."storeId"
            ORDER BY l."createdAt" DESC
            LIMIT $1`,
          limite,
        ),
        prisma.commissionRule.count(),
      ]);
      return {
        porEstado: porEstado.map((f) => ({
          estado: f.estado,
          movimientos: f.movimientos,
          total: num(f.total),
        })),
        porNegocio: porNegocio.map((f) => ({
          tenantId: f.tenant_id,
          negocio: f.negocio ?? f.tenant_id,
          slug: f.slug,
          movimientos: f.movimientos,
          porLiquidar: num(f.por_liquidar),
          liquidado: num(f.liquidado),
          devuelto: num(f.devuelto),
          neto: num(f.neto),
          ultimo: fecha(f.ultimo),
        })),
        ultimos: ultimos.map((f) => ({
          id: f.id,
          creado: fecha(f.creado) ?? "",
          negocio: f.negocio ?? "—",
          tienda: f.tienda,
          pedido: f.pedido,
          tipo: f.tipo,
          estado: f.estado,
          tasa: Number(f.tasa ?? 0),
          monto: num(f.monto),
          liquidado: fecha(f.liquidado),
        })),
        reglas,
      };
    } catch (err) {
      logger.error("[comisiones-plataforma.db] resumen falló", { error: String(err) });
      return VACIO;
    }
  },
};
