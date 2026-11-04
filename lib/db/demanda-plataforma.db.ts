import "server-only";
import { prismaReadonly } from "@/lib/prisma-readonly";
import { getOrSet } from "@/lib/cache";
import { buildDemandReport, type DemandInput, type DemandReport } from "@/lib/intelligence/demand-signals";
import {
  armarMadera,
  categoriasDeFilas,
  elegirVentana,
  zonasDeFilas,
  type FilaDemandaTienda,
  type FilaMadera,
  type MaderaReporte,
} from "@/lib/intelligence/demanda-plataforma";

/**
 * «Inteligencia de demanda» del superadmin. Mira TODOS los negocios activos,
 * por eso no recibe `tenantId`. Dos fuentes:
 *  - tienda: unidades por categoría de los pedidos (sin cancelados);
 *  - madera: m³ por especie del libro CTP (producción y despacho) y de las
 *    trozas que ingresaron por GTF — el aserradero no vende por pedidos.
 * Cache 10 min.
 */

const CACHE_DEMANDA = "superadmin:demand:v2";
const DIA_MS = 86_400_000;
const DIAS_MADERA = 90;

export type ReporteDemandaPlataforma = DemandReport & { madera: MaderaReporte };

type FilaTiendaCruda = {
  tenantId: string;
  category: string;
  u30: number;
  p30: number;
  u90: number;
  p90: number;
};

// $1 = hace 30 d · $2 = hace 60 d · $3 = hace 90 d · $4 = hace 180 d. Pedidos sin
// cancelados ni borrados, de negocios activos. Una sola pasada por las 4 ventanas.
const SQL_TIENDA = `
  SELECT o."tenantId", p."category",
    COALESCE(sum(oi."quantity") FILTER (WHERE o."createdAt" >= $1), 0)::float8 AS u30,
    COALESCE(sum(oi."quantity") FILTER (WHERE o."createdAt" >= $2 AND o."createdAt" < $1), 0)::float8 AS p30,
    COALESCE(sum(oi."quantity") FILTER (WHERE o."createdAt" >= $3), 0)::float8 AS u90,
    COALESCE(sum(oi."quantity") FILTER (WHERE o."createdAt" >= $4 AND o."createdAt" < $3), 0)::float8 AS p90
  FROM "OrderItem" oi
  JOIN "Order" o ON o."id" = oi."orderId"
  JOIN "Product" p ON p."id" = oi."productId"
  JOIN "Tenant" t ON t."id" = o."tenantId" AND t."active"
  WHERE o."deletedAt" IS NULL AND o."status" <> 'cancelado' AND o."createdAt" >= $4
  GROUP BY 1, 2`;

// $1 = hace 90 d · $2 = hace 180 d. Libro CTP por fecha del asiento (producción
// y despacho) y trozas de las GTF de ingreso emitidas (items JSON con `species` y
// `volumeM3`). Se ignora lo anulado y lo borrado.
const SQL_MADERA = `
  SELECT e."tenantId", e."section" AS flujo, e."speciesCommon" AS especie, e."unit" AS unidad,
    COALESCE(sum(e."quantity") FILTER (WHERE e."entryDate" >= $1), 0)::float8 AS actual,
    COALESCE(sum(e."quantity") FILTER (WHERE e."entryDate" < $1), 0)::float8 AS previo
  FROM "ForestCtpEntry" e
  JOIN "Tenant" t ON t."id" = e."tenantId" AND t."active"
  WHERE e."deletedAt" IS NULL AND e."status" <> 'anulado'
    AND e."section" IN ('produccion', 'despacho') AND e."entryDate" >= $2
  GROUP BY 1, 2, 3, 4
  UNION ALL
  SELECT g."tenantId", 'ingreso' AS flujo, it->>'species' AS especie, 'm3' AS unidad,
    COALESCE(sum(v.m3) FILTER (WHERE g."createdAt" >= $1), 0)::float8 AS actual,
    COALESCE(sum(v.m3) FILTER (WHERE g."createdAt" < $1), 0)::float8 AS previo
  FROM "ForestGtf" g
  JOIN "Tenant" t ON t."id" = g."tenantId" AND t."active"
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(g."items"::jsonb) = 'array' THEN g."items"::jsonb ELSE '[]'::jsonb END
  ) AS it
  CROSS JOIN LATERAL (
    SELECT CASE WHEN (it->>'volumeM3') ~ '^[0-9]+([.][0-9]+)?$' THEN (it->>'volumeM3')::float8 ELSE 0 END AS m3
  ) AS v
  WHERE g."deletedAt" IS NULL AND g."status" = 'emitida' AND g."tipo" = 'trozas' AND g."createdAt" >= $2
  GROUP BY 1, 3`;

export class DemandaPlataformaDB {
  /** Reporte de demanda de toda la plataforma (tienda + madera); cache 10 min. */
  static async reporte(ahora: Date = new Date()): Promise<ReporteDemandaPlataforma> {
    return getOrSet(CACHE_DEMANDA, 600, async () => {
      const nowMs = ahora.getTime();
      const hace = (dias: number) => new Date(nowMs - dias * DIA_MS);

      const [tienda, madera, tiendasConZona, quiebres] = await Promise.all([
        prismaReadonly.$queryRawUnsafe<FilaTiendaCruda[]>(SQL_TIENDA, hace(30), hace(60), hace(90), hace(180)),
        prismaReadonly.$queryRawUnsafe<FilaMadera[]>(SQL_MADERA, hace(DIAS_MADERA), hace(2 * DIAS_MADERA)),
        // Solo tiendas publicadas con zona; si un negocio tiene varias, vale la más antigua.
        prismaReadonly.store.findMany({
          where: { zone: { not: null }, isPublished: true, tenant: { active: true } },
          select: { tenantId: true, zone: true },
          orderBy: [{ tenantId: "asc" }, { createdAt: "asc" }],
        }),
        // Quiebres predichos vigentes, por producto (nombre y categoría).
        prismaReadonly.stockoutPrediction.findMany({
          where: { expiresAt: { gt: ahora } },
          select: { tenantId: true, product: { select: { name: true, category: true } } },
        }),
      ]);

      const filasTienda: FilaDemandaTienda[] = tienda.map((f) => ({
        tenantId: f.tenantId,
        category: f.category,
        u30: Number(f.u30),
        p30: Number(f.p30),
        u90: Number(f.u90),
        p90: Number(f.p90),
      }));
      const ventana = elegirVentana(filasTienda);

      const zonaDeNegocio = new Map<string, string>();
      for (const s of tiendasConZona) {
        if (s.zone && !zonaDeNegocio.has(s.tenantId)) zonaDeNegocio.set(s.tenantId, s.zone);
      }

      // Quiebres agrupados por nombre de producto, contando negocios distintos.
      const porProducto = new Map<string, { name: string; category: string | null; negocios: Set<string> }>();
      const quiebresPorNegocio = new Map<string, number>();
      for (const q of quiebres) {
        quiebresPorNegocio.set(q.tenantId, (quiebresPorNegocio.get(q.tenantId) ?? 0) + 1);
        const acc = porProducto.get(q.product.name);
        if (acc) acc.negocios.add(q.tenantId);
        else porProducto.set(q.product.name, { name: q.product.name, category: q.product.category ?? null, negocios: new Set([q.tenantId]) });
      }

      const input: DemandInput = {
        categories: categoriasDeFilas(filasTienda, ventana),
        stockouts: Array.from(porProducto.values()).map((s) => ({
          name: s.name,
          category: s.category,
          tenantCount: s.negocios.size,
        })),
        zones: zonasDeFilas(filasTienda, ventana, zonaDeNegocio, quiebresPorNegocio),
      };

      const filasMadera: FilaMadera[] = madera.map((f) => ({
        tenantId: f.tenantId,
        flujo: f.flujo,
        especie: f.especie,
        unidad: f.unidad,
        actual: Number(f.actual),
        previo: Number(f.previo),
      }));

      return {
        ...buildDemandReport(input, nowMs, ventana.days, ventana.label),
        madera: armarMadera(filasMadera, DIAS_MADERA, `Últimos ${DIAS_MADERA} días`),
      };
    });
  }
}
