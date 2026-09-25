import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { auditCtpEsperando, m3 } from "@/lib/forestal/ctp-audit";
import { closedPeriodOf, type CtpCierrePeriodo } from "@/lib/forestal/ctp-cierre-types";
import {
  ESTADOS_VALORIZABLES,
  TEXTO_MOTIVO,
  agruparParaPrecio,
  avisosDePrecio,
  planDePrecio,
  rangoDePrecio,
  referenciasDesde,
  type FilaParaPrecio,
  type FilaVista,
  type GrupoProveedor,
  type PlanDePrecio,
  type PrecioPedido,
  type ReferenciasDePrecio,
} from "@/lib/forestal/precio-en-tanda";
import { formatNumber } from "@/lib/format";
import { ForestCtpCierreDB } from "./forest-ctp-cierre.db";
import { ingresosConCostoCongelado } from "./costo-congelado.db";

/**
 * WoodEntriesPrecioDB — poner precio a la madera en tanda (proveedor × especie).
 *
 * Por qué vive aparte de `WoodEntriesDB`: es una escritura de PLATA sobre
 * muchas guías a la vez, con su propia transacción, su propio lock y su propio
 * renglón de auditoría por tanda. `setCosto` sigue siendo la puerta de UNA
 * fila; ésta es la de un precio acordado para todo un grupo. La regla de qué
 * se toca y cuánto queda vive en `lib/forestal/precio-en-tanda.ts` (pura,
 * testeada) y se corre acá sobre las filas ya bloqueadas.
 */

/** Hasta cuántas guías se traen para agrupar. Un patio real tiene decenas. */
const TOPE_FILAS = 5_000;
/** Los mismos prefijos que invalida `setCosto`, más el del permiso: su «Plata» suma estos costos. */
const PREFIJOS_CACHE = ["wood-entries", "forest-contrato"] as const;

const SELECT_FILA = {
  id: true,
  gtfNumber: true,
  entryDate: true,
  providerName: true,
  speciesCommonName: true,
  volumeM3: true,
  costoTotal: true,
  moneda: true,
  status: true,
  contrato: { select: { codigo: true } },
} satisfies Prisma.WoodEntrySelect;

type FilaDb = Prisma.WoodEntryGetPayload<{ select: typeof SELECT_FILA }>;

/** Lo mismo que cuenta `ForestContratoDB.balance()`: vivas, ni rechazadas ni anuladas. */
const whereValorizable = (tenantId: string) =>
  ({
    tenantId,
    deletedAt: null,
    status: { in: [...ESTADOS_VALORIZABLES] },
  }) satisfies Prisma.WoodEntryWhereInput;

function aFila(r: FilaDb, cierres: CtpCierrePeriodo[], congelados: ReadonlySet<string>): FilaParaPrecio {
  const cerrado = closedPeriodOf(cierres, r.entryDate);
  return {
    id: r.id,
    gtfNumber: r.gtfNumber,
    entryDate: r.entryDate.toISOString(),
    providerName: r.providerName,
    speciesCommonName: r.speciesCommonName,
    volumeM3: Number(r.volumeM3),
    costoTotal: r.costoTotal == null ? null : Number(r.costoTotal),
    moneda: r.moneda,
    status: r.status,
    permiso: r.contrato?.codigo ?? null,
    bloqueo: cerrado
      ? { tipo: "periodo-cerrado", periodo: cerrado.label }
      : congelados.has(r.id)
        ? { tipo: "congelado" }
        : null,
  };
}

export interface PrecioEnTandaVista {
  filas: FilaParaPrecio[];
  grupos: GrupoProveedor[];
  referencias: ReferenciasDePrecio;
  /** true = el patio tiene más guías que las que se trajeron. */
  truncada: boolean;
}

export interface AvisoDeGrupo {
  proveedor: string;
  especie: string;
  precioM3: number;
  avisos: string[];
}

export type ResultadoPonerPrecio =
  | { estado: "avisos"; avisos: AvisoDeGrupo[] }
  | { estado: "hecho"; cambios: PlanDePrecio["cambios"]; saltadas: PlanDePrecio["saltadas"]; totales: PlanDePrecio["totales"] };

export interface PonerPrecioInput {
  precios: PrecioPedido[];
  tambienConPrecio: boolean;
  vistos: FilaVista[];
  /** El usuario ya vio los avisos de dedazo y dijo «el precio está bien». */
  confirmarAvisos: boolean;
}

const soles = (n: number) => `S/ ${formatNumber(n, 2)}`;

/** Cuántos renglones por guía se escriben a la vez: veinte juntos se pelean el pool
 *  y se perdían renglones bajo carga (memoria `auditoria-se-perdia-bajo-carga`). */
const AUDITORIA_EN_PARALELO = 3;

/**
 * El rastro de una tanda, ESPERADO antes de responder: en Vercel lo que corre
 * después de la respuesta puede no terminar, y el «antes → después» de cada
 * guía es justo lo que un fiscalizador de la plata pregunta. Un renglón por la
 * tanda entera (cuántas, cuánto, qué se saltó) y uno por guía. `auditCtpEsperando`
 * nunca tira: un fallo del log no deshace precios que ya se escribieron.
 */
async function auditarTanda(tenantId: string, plan: PlanDePrecio, user: string): Promise<void> {
  const porGrupo = new Map<string, { n: number; m3: number; precio: number }>();
  for (const c of plan.cambios) {
    const k = `${c.proveedor} × ${c.especie}`;
    const g = porGrupo.get(k) ?? { n: 0, m3: 0, precio: c.precioM3 };
    g.n++;
    g.m3 += c.volumeM3;
    porGrupo.set(k, g);
  }
  const grupos = [...porGrupo].map(([k, g]) => `${k} a ${soles(g.precio)}/m³ (${g.n}, ${m3(g.m3)})`);
  const saltos = new Map<string, number>();
  for (const s of plan.saltadas) saltos.set(s.motivo, (saltos.get(s.motivo) ?? 0) + 1);
  await auditCtpEsperando({
    tenantId,
    action: "ctp_ingreso_costo_tanda",
    entity: "ForestCtpLibro",
    entityId: tenantId,
    detail:
      `Puso precio en tanda a ${plan.totales.filas} ${plan.totales.filas === 1 ? "ingreso" : "ingresos"} · ${m3(plan.totales.m3)} · ${soles(plan.totales.soles)}` +
      (plan.totales.pisadas ? ` · ${plan.totales.pisadas} ya tenían precio y se reemplazó` : "") +
      (grupos.length ? ` · ${grupos.slice(0, 12).join("; ")}${grupos.length > 12 ? "…" : ""}` : "") +
      (saltos.size
        ? ` · saltadas: ${[...saltos].map(([m, n]) => `${n} (${TEXTO_MOTIVO[m as keyof typeof TEXTO_MOTIVO]})`).join(", ")}`
        : ""),
    user,
  });

  const pendientes = [...plan.cambios];
  const trabajador = async () => {
    for (let c = pendientes.shift(); c; c = pendientes.shift()) {
      await auditCtpEsperando({
        tenantId,
        action: "ctp_ingreso_costo",
        entity: "WoodEntry",
        entityId: c.id,
        detail: `Valorizó el ingreso ${c.gtfNumber} en tanda · ${c.antes == null ? "sin costo" : `${c.monedaAntes === "USD" ? "USD" : "S/"} ${c.antes.toFixed(2)}`} → S/ ${c.despues.toFixed(2)} (${soles(c.precioM3)}/m³ × ${m3(c.volumeM3)})`,
        user,
      });
    }
  };
  await Promise.all(Array.from({ length: Math.min(AUDITORIA_EN_PARALELO, pendientes.length) }, trabajador));
}

export const WoodEntriesPrecioDB = {
  /**
   * Las referencias de precio del tenant: lo que ya pagó (de las guías vivas),
   * y lo que su plan de manejo y sus ventas dicen por especie. Sale de la base
   * de este tenant y de nada más — un precio de otro aserradero no es referencia.
   */
  async referencias(tenantId: string, filas?: readonly FilaParaPrecio[]): Promise<ReferenciasDePrecio> {
    if (!tenantId) throw new Error("tenantId is required");
    const [propias, plan, ventas] = await Promise.all([
      filas
        ? Promise.resolve(filas)
        : prisma.woodEntry
            .findMany({
              where: { ...whereValorizable(tenantId), costoTotal: { not: null } },
              select: SELECT_FILA,
              take: TOPE_FILAS,
            })
            .then((rs) => rs.map((r) => aFila(r, [], new Set()))),
      prisma.forestPlanSpecies.findMany({
        where: { tenantId, OR: [{ precioVentaSoles: { not: null } }, { valorEstadoNaturalSoles: { not: null } }] },
        select: { speciesCommon: true, precioVentaSoles: true, valorEstadoNaturalSoles: true },
        take: 2_000,
      }),
      prisma.forestCtpPaquete.findMany({
        where: {
          tenantId,
          deletedAt: null,
          precioVentaPt: { not: null },
          entry: { tenantId, deletedAt: null, status: { not: "anulado" } },
        },
        select: { precioVentaPt: true, entry: { select: { speciesCommon: true } } },
        take: TOPE_FILAS,
      }),
    ]);
    return referenciasDesde({
      filas: propias,
      plan: plan.map((p) => ({
        especie: p.speciesCommon,
        precioVentaM3: p.precioVentaSoles == null ? null : Number(p.precioVentaSoles),
        venM3: p.valorEstadoNaturalSoles == null ? null : Number(p.valorEstadoNaturalSoles),
      })),
      ventasPt: ventas.flatMap((v) =>
        v.precioVentaPt != null && v.entry?.speciesCommon
          ? [{ especie: v.entry.speciesCommon, precioPt: Number(v.precioVentaPt) }]
          : [],
      ),
    });
  },

  /** Lo que el modal necesita: las guías vivas, sus grupos y las referencias del dedazo. */
  async vista(tenantId: string): Promise<PrecioEnTandaVista> {
    if (!tenantId) throw new Error("tenantId is required");
    const [rows, cierres] = await Promise.all([
      prisma.woodEntry.findMany({
        where: whereValorizable(tenantId),
        select: SELECT_FILA,
        orderBy: [{ entryDate: "desc" }, { id: "asc" }],
        take: TOPE_FILAS + 1,
      }),
      ForestCtpCierreDB.list(tenantId),
    ]);
    const truncada = rows.length > TOPE_FILAS;
    const vivas = truncada ? rows.slice(0, TOPE_FILAS) : rows;
    const congelados = await ingresosConCostoCongelado(
      prisma,
      tenantId,
      vivas.filter((r) => r.costoTotal != null).map((r) => r.id),
    );
    const filas = vivas.map((r) => aFila(r, cierres, congelados));
    const referencias = await WoodEntriesPrecioDB.referencias(tenantId, filas);
    return { filas, grupos: agruparParaPrecio(filas), referencias, truncada };
  },

  /**
   * Aplica los precios en UNA transacción.
   *
   * 1. Si algún precio huele a dedazo y no vino confirmado, no escribe nada y
   *    devuelve los avisos (la ruta responde 409): avisar no impide, pero el
   *    «sí, está bien» lo tiene que decir alguien.
   * 2. Lock `FOR UPDATE` de las guías que la pantalla mostró, en orden de id
   *    (dos tandas sobre el mismo proveedor no se abrazan).
   * 3. Relee esas guías YA bloqueadas y corre la regla pura: lo que cambió
   *    desde la vista previa se salta, igual que el mes cerrado y el congelado.
   * 4. Escribe cada costo con `tenantId` en el WHERE; si alguna no se escribió,
   *    tira y no queda nada a medias.
   */
  async ponerPrecio(tenantId: string, input: PonerPrecioInput, user: string): Promise<ResultadoPonerPrecio> {
    if (!tenantId) throw new Error("tenantId is required");
    const ids = [...new Set(input.vistos.map((v) => v.id))].sort();
    if (ids.length === 0 || input.precios.length === 0) {
      return { estado: "hecho", cambios: [], saltadas: [], totales: { filas: 0, m3: 0, soles: 0, pisadas: 0 } };
    }

    if (!input.confirmarAvisos) {
      const refs = await WoodEntriesPrecioDB.referencias(tenantId);
      const avisos = input.precios.flatMap((p) => {
        const a = avisosDePrecio(p.precioM3, rangoDePrecio(p.especie, refs));
        return a.length ? [{ proveedor: p.proveedor, especie: p.especie, precioM3: p.precioM3, avisos: a }] : [];
      });
      if (avisos.length > 0) return { estado: "avisos", avisos };
    }

    const cierres = await ForestCtpCierreDB.list(tenantId);
    const plan = await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT "id" FROM "WoodEntry"
          WHERE "id" IN (${Prisma.join(ids)}) AND "tenantId" = ${tenantId}
          ORDER BY "id"
          FOR UPDATE
        `;
        const rows = await tx.woodEntry.findMany({
          where: { ...whereValorizable(tenantId), id: { in: ids } },
          select: SELECT_FILA,
        });
        const congelados = await ingresosConCostoCongelado(tx, tenantId, rows.map((r) => r.id));
        const filas = rows.map((r) => aFila(r, cierres, congelados));
        const p = planDePrecio(filas, input.precios, {
          tambienConPrecio: input.tambienConPrecio,
          vistos: input.vistos,
        });
        for (const c of p.cambios) {
          const r = await tx.woodEntry.updateMany({
            where: { id: c.id, tenantId, deletedAt: null, status: { in: [...ESTADOS_VALORIZABLES] } },
            data: { costoTotal: new Prisma.Decimal(c.despues.toFixed(2)), moneda: "PEN" },
          });
          if (r.count !== 1) throw new Error(`No se pudo escribir el costo de la guía ${c.gtfNumber}`);
        }
        return p;
      },
      { timeout: 30_000, maxWait: 10_000 },
    );

    if (plan.cambios.length > 0) {
      for (const pref of PREFIJOS_CACHE) {
        try {
          invalidateByPrefix(`${pref}:${tenantId}`);
        } catch (err) {
          logger.warn("[wood-entries-precio] no se pudo invalidar la caché", { error: String(err), pref });
        }
      }
    }

    /* Una tanda que no cambió nada no deja rastro: no hubo escritura. */
    if (plan.cambios.length > 0) await auditarTanda(tenantId, plan, user);

    return { estado: "hecho", cambios: plan.cambios, saltadas: plan.saltadas, totales: plan.totales };
  },
};
