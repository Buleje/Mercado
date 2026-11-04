import "server-only";
import { prisma } from "@/lib/prisma";
import { prismaReadonly } from "@/lib/prisma-readonly";
import { getOrSet } from "@/lib/cache";
import {
  PASOS_ASERRADERO,
  PASOS_TIENDA,
  armarMesesDeNegocio,
  calcularArranque,
  inicioDeMesUTC,
  mesesLima,
  perfilDeNegocio,
  variacionPct,
  type Arranque,
  type FilaMensual,
  type HechosDeNegocio,
  type MesDeCrecimiento,
  type Perfil,
} from "@/lib/superadmin/crecimiento-negocios";

/**
 * Vistas de plataforma (superadmin) «Crecimiento» y «Activación». Miran TODOS
 * los negocios, por eso no reciben `tenantId`. Cuentan lo mismo que
 * `SaludNegocioDB.senalesDeUso`: pedidos + ventas POS + libro CTP + trozas.
 */

const MESES_VENTANA = 6;
const CACHE_CRECIMIENTO = "superadmin:tenants-growth:v3";

export type CrecimientoDeNegocio = {
  slug: string;
  name: string;
  plan: string;
  createdAt: string;
  perfil: Perfil;
  months: MesDeCrecimiento[];
  totalRevenue: number;
  totalOrders: number;
  totalOperaciones: number;
  growthPct: number;
  operacionesPct: number;
};

export type FilaDeArranque = Arranque & {
  slug: string;
  name: string;
  plan: string;
  createdAt: string;
  trialEndsAt: string | null;
  trialDaysLeft: number | null;
  ageDays: number;
  contactStatus: "none" | "contacted" | "snoozed";
  snoozedUntil: string | null;
};

export type ResultadoArranque = {
  rows: FilaDeArranque[];
  summary: { total: number; complete: number; stuck: number; aserraderos: number };
  steps: readonly string[];
  stepsAserradero: readonly string[];
};

type FilaCruda = { tenantId: string; mes: string; fuente: FilaMensual["fuente"]; n: number; total: number };
type FilaHechos = HechosDeNegocio & { tenantId: string };

const MES_LIMA = `to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Lima', 'YYYY-MM')`;

// Un SELECT por fuente; `$1` = inicio de la ventana. Pedidos sin cancelados.
const SQL_MENSUAL = `
  SELECT "tenantId", ${MES_LIMA} AS mes, 'pedidos' AS fuente, count(*)::int AS n, COALESCE(sum("total"), 0)::float8 AS total
    FROM "Order" WHERE "createdAt" >= $1 AND "status" <> 'cancelado' GROUP BY 1, 2
  UNION ALL
  SELECT "tenantId", ${MES_LIMA}, 'ventas', count(*)::int, 0::float8
    FROM "Sale" WHERE "createdAt" >= $1 GROUP BY 1, 2
  UNION ALL
  SELECT "tenantId", ${MES_LIMA}, 'libroCtp', count(*)::int, 0::float8
    FROM "ForestCtpEntry" WHERE "createdAt" >= $1 GROUP BY 1, 2
  UNION ALL
  SELECT "tenantId", ${MES_LIMA}, 'trozas', count(*)::int, 0::float8
    FROM "WoodEntry" WHERE "createdAt" >= $1 GROUP BY 1, 2`;

// Hitos de arranque por negocio: EXISTS (corta al primer registro), sin parámetros.
const SQL_HECHOS = `
  SELECT t.id AS "tenantId",
    EXISTS (SELECT 1 FROM "Product" WHERE "tenantId" = t.id) AS productos,
    EXISTS (SELECT 1 FROM "Order" WHERE "tenantId" = t.id) AS pedidos,
    EXISTS (SELECT 1 FROM "Sale" WHERE "tenantId" = t.id) AS ventas,
    EXISTS (SELECT 1 FROM "ForestCtpEntry" WHERE "tenantId" = t.id AND "deletedAt" IS NULL AND status <> 'anulado') AS "libroCtp",
    EXISTS (SELECT 1 FROM "WoodEntry" WHERE "tenantId" = t.id AND "deletedAt" IS NULL) AS trozas,
    EXISTS (SELECT 1 FROM "ForestLoteAserrio" WHERE "tenantId" = t.id AND "deletedAt" IS NULL) AS lotes,
    EXISTS (SELECT 1 FROM "ForestGtf" WHERE "tenantId" = t.id AND "deletedAt" IS NULL AND tipo = 'trozas' AND status = 'emitida') AS "gtfIngreso",
    EXISTS (SELECT 1 FROM "ForestGtf" WHERE "tenantId" = t.id AND "deletedAt" IS NULL AND tipo = 'producto' AND status = 'emitida') AS "gtfSalida"
  FROM "Tenant" t`;

export class CrecimientoNegociosDB {
  /** Seis meses (Lima) de movimiento por negocio activo; cache 10 min. */
  static async crecimientoMensual(ahora: Date = new Date()): Promise<CrecimientoDeNegocio[]> {
    return getOrSet(CACHE_CRECIMIENTO, 600, async () => {
      const claves = mesesLima(MESES_VENTANA, ahora);
      const [tenants, crudas, hechos] = await Promise.all([
        prismaReadonly.tenant.findMany({
          where: { active: true },
          select: { id: true, slug: true, name: true, plan: true, createdAt: true },
          orderBy: { name: "asc" },
        }),
        prismaReadonly.$queryRawUnsafe<FilaCruda[]>(SQL_MENSUAL, inicioDeMesUTC(claves[0])),
        // El perfil sale de TODO el historial, no de la ventana de 6 meses.
        prismaReadonly.$queryRawUnsafe<FilaHechos[]>(SQL_HECHOS),
      ]);
      const hechosDe = new Map(hechos.map((h) => [h.tenantId, h]));

      const porNegocio = new Map<string, FilaMensual[]>();
      for (const f of crudas) {
        const fila: FilaMensual = { tenantId: f.tenantId, mes: f.mes, fuente: f.fuente, n: Number(f.n), total: Number(f.total) };
        const lista = porNegocio.get(f.tenantId);
        if (lista) lista.push(fila);
        else porNegocio.set(f.tenantId, [fila]);
      }

      const salida = tenants.map((t): CrecimientoDeNegocio => {
        const months = armarMesesDeNegocio(claves, porNegocio.get(t.id) ?? []);
        const ult = months[months.length - 1];
        const ant = months[months.length - 2];
        const suma = (k: "revenue" | "orders" | "operaciones") => months.reduce((s, m) => s + m[k], 0);
        return {
          slug: t.slug,
          name: t.name,
          plan: t.plan,
          createdAt: t.createdAt.toISOString(),
          perfil: perfilDeNegocio(hechosDe.get(t.id) ?? {}),
          months,
          totalRevenue: Math.round(suma("revenue") * 100) / 100,
          totalOrders: suma("orders"),
          totalOperaciones: suma("operaciones"),
          growthPct: variacionPct(ant?.revenue ?? 0, ult?.revenue ?? 0),
          operacionesPct: variacionPct(ant?.operaciones ?? 0, ult?.operaciones ?? 0),
        };
      });
      salida.sort((a, b) => b.totalRevenue - a.totalRevenue || b.totalOperaciones - a.totalOperaciones);
      return salida;
    });
  }

  /** Hitos de arranque de cada negocio, con los pasos que le tocan a su perfil. */
  static async pasosDeArranque(ahora: Date = new Date()): Promise<ResultadoArranque> {
    const nowMs = ahora.getTime();
    const [tenants, hechos, contactos] = await Promise.all([
      prisma.tenant.findMany({
        select: { id: true, slug: true, name: true, logoUrl: true, createdAt: true, plan: true, trialEndsAt: true },
      }),
      prisma.$queryRawUnsafe<FilaHechos[]>(SQL_HECHOS),
      prisma.onboardingContact.findMany({ select: { tenantSlug: true, status: true, snoozedUntil: true } }),
    ]);
    const hechosDe = new Map(hechos.map((h) => [h.tenantId, h]));
    const contactoDe = new Map(contactos.map((c) => [c.tenantSlug, c]));
    const sinNada: HechosDeNegocio = {
      productos: false, pedidos: false, ventas: false, libroCtp: false,
      trozas: false, lotes: false, gtfIngreso: false, gtfSalida: false,
    };

    const rows = tenants.map((t): FilaDeArranque => {
      const h = hechosDe.get(t.id) ?? sinNada;
      const arranque = calcularArranque(perfilDeNegocio(h), h, !!t.logoUrl);
      const c = contactoDe.get(t.slug);
      // El «posponer» vencido vuelve a «none».
      const contactStatus: FilaDeArranque["contactStatus"] =
        c && c.status === "snoozed" && c.snoozedUntil && c.snoozedUntil.getTime() > nowMs ? "snoozed"
          : c && c.status === "contacted" ? "contacted"
            : "none";
      return {
        ...arranque,
        slug: t.slug,
        name: t.name,
        plan: t.plan,
        createdAt: t.createdAt.toISOString(),
        trialEndsAt: t.trialEndsAt?.toISOString() ?? null,
        trialDaysLeft: t.trialEndsAt ? Math.ceil((t.trialEndsAt.getTime() - nowMs) / 86_400_000) : null,
        ageDays: Math.floor((nowMs - t.createdAt.getTime()) / 86_400_000),
        contactStatus,
        snoozedUntil: contactStatus === "snoozed" ? c?.snoozedUntil?.toISOString() ?? null : null,
      };
    });

    // Estancadas primero (menor avance), luego las más nuevas.
    rows.sort((a, b) => a.pct - b.pct || a.done - b.done || b.createdAt.localeCompare(a.createdAt));

    return {
      rows,
      summary: {
        total: rows.length,
        complete: rows.filter((r) => r.complete).length,
        stuck: rows.filter((r) => !r.complete).length,
        aserraderos: rows.filter((r) => r.perfil === "aserradero").length,
      },
      steps: PASOS_TIENDA,
      stepsAserradero: PASOS_ASERRADERO,
    };
  }
}
