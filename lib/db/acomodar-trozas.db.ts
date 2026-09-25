import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { auditCtpEsperando, m3 } from "@/lib/forestal/ctp-audit";
import { closedPeriodOf } from "@/lib/forestal/ctp-cierre-types";
import {
  claveDeLaGuia,
  filaDesdeRegistro,
  nTrozas,
  planearAcomodo,
  trozaDesdeRegistro,
  type MovimientoDeTroza,
  type PlanAcomodo,
} from "@/lib/forestal/acomodar-trozas";
import { ForestCtpCierreDB } from "./forest-ctp-cierre.db";
import { CTP_TX_OPTS, CtpInvariantError } from "./forest-ctp-consumo.db";
import { vivaLinea } from "./wood-entries.db";

/**
 * AcomodarTrozasDB — lleva cada troza de una guía de varias especies a la fila
 * de SU especie (ADR-435). El criterio vive en `lib/forestal/acomodar-trozas.ts`;
 * acá se lee, se bloquea y se escribe.
 *
 *  · `planear` = la vista previa: qué troza pasa de qué fila a cuál, qué no se
 *    mueve y por qué, y el cuadre de cada fila antes y después.
 *  · `aplicar` = repite TODO dentro de la transacción, con las trozas de esas
 *    guías bloqueadas (`FOR UPDATE`): si entre la vista previa y el clic alguien
 *    consumió o despachó una pieza, acá ya no se mueve. Sólo cambia
 *    `WoodEntryTroza.woodEntryId`; no toca `ForestCtpConsumo` ni lo declarado.
 *
 * Aislamiento: `tenantId` en TODOS los `where`, y el `updateMany` lleva además
 * el conjunto de filas de la MISMA guía — una troza nunca cruza de documento,
 * ni aunque le llegue un id armado a mano.
 */

/** Qué guías mirar. */
export type AlcanceAcomodo = { woodEntryId: string } | { contratoId: string } | { todas: true };

/** Lo que la DB class necesita del cliente (la tx o `prisma`). */
type Cliente = Pick<Prisma.TransactionClient, "woodEntry" | "woodEntryTroza" | "forestCtpConsumo">;

const CACHE_INGRESOS = "wood-entries";
const CACHE_LIBRO = "forest-ctp";
const CACHE_CONTRATOS = "forest-contrato";

export class AlcanceNoEncontrado extends Error {
  constructor() {
    super("No se encontró esa guía en tu libro.");
    this.name = "AlcanceNoEncontrado";
  }
}

/** Las filas vivas (sin baja) de las guías del alcance, con ≥2 filas o no. */
async function filasDelAlcance(db: Cliente, tenantId: string, alcance: AlcanceAcomodo) {
  const select = {
    id: true,
    gtfNumber: true,
    gtfSeries: true,
    libroNro: true,
    speciesCommonName: true,
    speciesScientificName: true,
    volumeM3: true,
    pieces: true,
    status: true,
    entryDate: true,
  } as const;

  if ("todas" in alcance) {
    return db.woodEntry.findMany({ where: { tenantId, deletedAt: null }, select });
  }

  /* La guía (o las del permiso) → TODAS sus filas, aunque una hermana no tenga
     el permiso puesto: las especies de un mismo documento van juntas. */
  const semilla =
    "woodEntryId" in alcance
      ? await db.woodEntry.findMany({
          where: { tenantId, id: alcance.woodEntryId, deletedAt: null },
          select: { gtfNumber: true, gtfSeries: true },
        })
      : await db.woodEntry.findMany({
          where: { tenantId, contratoId: alcance.contratoId, deletedAt: null },
          select: { gtfNumber: true, gtfSeries: true },
        });
  if ("woodEntryId" in alcance && semilla.length === 0) throw new AlcanceNoEncontrado();
  if (semilla.length === 0) return [];

  const claves = new Set(semilla.map((s) => claveDeLaGuia(s.gtfSeries, s.gtfNumber)));
  const numeros = [...new Set(semilla.map((s) => s.gtfNumber))];
  const filas = await db.woodEntry.findMany({
    where: { tenantId, deletedAt: null, gtfNumber: { in: numeros } },
    select,
  });
  return filas.filter((f) => claves.has(claveDeLaGuia(f.gtfSeries, f.gtfNumber)));
}

/**
 * Sólo las filas de guías con 2+ filas: con una sola especie no hay a dónde
 * mover. Va ANTES de leer trozas y de bloquearlas — con `todas`, sin esto el
 * `FOR UPDATE` tomaba todas las trozas del negocio (auditoría 25-09).
 */
function deGuiasDeVariasFilas<F extends { gtfSeries: string | null; gtfNumber: string }>(filas: readonly F[]): F[] {
  const porGuia = new Map<string, number>();
  for (const f of filas) {
    const k = claveDeLaGuia(f.gtfSeries, f.gtfNumber);
    porGuia.set(k, (porGuia.get(k) ?? 0) + 1);
  }
  return filas.filter((f) => (porGuia.get(claveDeLaGuia(f.gtfSeries, f.gtfNumber)) ?? 0) >= 2);
}

/** «La guía cambió desde la vista previa»: se tira DENTRO de la tx y se deshace todo. */
const guiaCambio = (detalle: Record<string, unknown>) =>
  new CtpInvariantError(
    "La guía cambió desde la vista previa: vuelve a abrir «Acomodar trozas» para ver cómo está ahora. No se movió nada.",
    "VALIDACION",
    { motivo: "GUIA_CAMBIO", ...detalle },
  );

/** Lee todo lo que el plan necesita y lo arma. */
async function leerYPlanear(db: Cliente, tenantId: string, alcance: AlcanceAcomodo) {
  const filas = deGuiasDeVariasFilas(await filasDelAlcance(db, tenantId, alcance));
  const ids = filas.map((f) => f.id);
  if (ids.length === 0) return { plan: planearAcomodo([], []), ids };

  const cierres = await ForestCtpCierreDB.list(tenantId);
  const mesCerrado = (d: Date) => closedPeriodOf(cierres, d) != null;

  const [congelados, trozas] = await Promise.all([
    /* Costo congelado al cierre de una corrida VIVA: esa fila ya no se toca. */
    db.forestCtpConsumo.findMany({
      where: { tenantId, woodEntryId: { in: ids }, congeladoAt: { not: null } },
      select: { woodEntryId: true, ctpEntry: { select: { status: true, deletedAt: true } } },
    }),
    db.woodEntryTroza.findMany({
      where: { tenantId, woodEntryId: { in: ids } },
      select: {
        id: true,
        woodEntryId: true,
        codificacion: true,
        codigoPlanta: true,
        especieComun: true,
        especieCientifica: true,
        volumenM3: true,
        trozaOrigenId: true,
        fechaRetrozo: true,
        consumidaEn: { select: { status: true, deletedAt: true } },
        despachadaEn: { select: { status: true, deletedAt: true } },
        loteAserrio: { select: { code: true, status: true } },
      },
    }),
  ]);
  const congeladas = new Set(congelados.filter((c) => vivaLinea(c.ctpEntry)).map((c) => c.woodEntryId));

  const plan = planearAcomodo(
    filas.map((f) => filaDesdeRegistro(f, { mesCerrado, congeladas })),
    trozas.map((t) =>
      trozaDesdeRegistro(
        {
          ...t,
          consumidaViva: vivaLinea(t.consumidaEn),
          despachadaViva: vivaLinea(t.despachadaEn),
          loteAbierto: t.loteAserrio?.status === "abierto" ? t.loteAserrio.code : null,
        },
        mesCerrado,
      ),
    ),
  );
  return { plan, ids };
}

/**
 * Una línea de auditoría por guía: qué especie recibió cuántas y de dónde, y
 * los ids para deshacerlo pieza por pieza (troza[+pedazos] fila origen → fila
 * destino).
 */
function detalleDeGuia(gtf: string, movidas: readonly MovimientoDeTroza[]): string {
  const porRuta = new Map<string, { n: number; m3: number }>();
  for (const m of movidas) {
    const k = `${m.desde.especie} → ${m.hacia.especie}`;
    const acc = porRuta.get(k) ?? { n: 0, m3: 0 };
    acc.n += 1;
    acc.m3 += m.m3 ?? 0;
    porRuta.set(k, acc);
  }
  const rutas = [...porRuta].map(([k, v]) => `${v.n} de ${k}`).join(", ");
  const total = movidas.reduce((s, m) => s + (m.m3 ?? 0), 0);
  const ids = movidas
    .map((m) => `${m.trozaId}${m.pedazos.length > 0 ? `+${m.pedazos.join("+")}` : ""} ${m.desde.id}→${m.hacia.id}`)
    .join("; ");
  return `Acomodó ${nTrozas(movidas.length)} de la guía ${gtf} en la fila de su especie (${rutas}) · ${m3(total)}. Lo declarado no cambió. Para deshacer: ${ids}`;
}

export const AcomodarTrozasDB = {
  /** La vista previa. No escribe nada. */
  async planear(tenantId: string, alcance: AlcanceAcomodo): Promise<PlanAcomodo> {
    if (!tenantId) throw new Error("tenantId is required");
    return (await leerYPlanear(prisma, tenantId, alcance)).plan;
  },

  /**
   * Mueve las trozas. `movimientos` = lo que el operador vio en la vista
   * previa, troza → fila de destino: si viene, sólo se mueven ésas, y si el
   * destino de una ya no es el que vio, no se mueve NADA (la guía cambió).
   * Una familia de retrozado que no se puede mover entera también lo deshace
   * todo. Devuelve lo que se movió, lo que ya no estaba para mover y el plan
   * DESPUÉS (releído).
   */
  async aplicar(
    tenantId: string,
    alcance: AlcanceAcomodo,
    user: string,
    opts: { movimientos?: readonly { trozaId: string; haciaId: string }[] } = {},
  ): Promise<{ movidas: number; m3Movidos: number; yaNoSePudieron: number; guias: number; despues: PlanAcomodo }> {
    if (!tenantId) throw new Error("tenantId is required");
    const pedidas = opts.movimientos ? new Map(opts.movimientos.map((m) => [m.trozaId, m.haciaId])) : null;

    const hecho = await prisma.$transaction(async (tx) => {
      /* 1 · Las filas del alcance (sólo guías de 2+ filas) y, con ellas, las
         trozas bloqueadas en orden de id: un consumo o un despacho que llegue
         a la vez espera su turno. */
      const filas = deGuiasDeVariasFilas(await filasDelAlcance(tx, tenantId, alcance));
      const ids = filas.map((f) => f.id);
      if (ids.length > 0) {
        await tx.$queryRaw`
          SELECT "id" FROM "WoodEntryTroza"
          WHERE "tenantId" = ${tenantId} AND "woodEntryId" = ANY(${ids}::text[])
          ORDER BY "id"
          FOR UPDATE
        `;
      }

      /* 2 · El plan, releído con las piezas ya bloqueadas. */
      const { plan } = await leerYPlanear(tx, tenantId, alcance);

      let movidas = 0;
      let yaNoSePudieron = 0;
      const porGuia: { gtf: string; movidas: MovimientoDeTroza[] }[] = [];
      for (const g of plan.guias) {
        const idsGuia = g.filas.map((f) => f.id);
        const hechas: MovimientoDeTroza[] = [];
        for (const m of g.mover) {
          if (pedidas && !pedidas.has(m.trozaId)) continue;
          /* El destino que el operador vio tiene que ser el de ahora. */
          if (pedidas && pedidas.get(m.trozaId) !== m.hacia.id) {
            throw guiaCambio({ trozaId: m.trozaId, visto: pedidas.get(m.trozaId), ahora: m.hacia.id });
          }
          const familia = [m.trozaId, ...m.pedazos];
          const r = await tx.woodEntryTroza.updateMany({
            where: { tenantId, id: { in: familia }, woodEntryId: { in: idsGuia } },
            data: { woodEntryId: m.hacia.id },
          });
          /* La familia va entera o no va: una parte movida y otra no partiría
             el retrozado en dos filas. Tirar acá deshace toda la tanda. */
          if (r.count !== familia.length) {
            throw guiaCambio({ trozaId: m.trozaId, familia: familia.length, movidas: r.count });
          }
          movidas += 1;
          hechas.push(m);
        }
        if (hechas.length > 0) porGuia.push({ gtf: g.gtf, movidas: hechas });
      }
      /* Lo que se vio en la vista previa y ya no está para mover (se consumió,
         se despachó, cambió de fila): se cuenta, no se esconde. */
      if (pedidas) {
        const enPlan = new Set(plan.guias.flatMap((g) => g.mover.map((m) => m.trozaId)));
        for (const id of pedidas.keys()) if (!enPlan.has(id)) yaNoSePudieron += 1;
      }
      return { movidas, yaNoSePudieron, porGuia };
    }, CTP_TX_OPTS);

    /* Se ESPERA antes de responder: es el renglón con el que se deshace. */
    for (const g of hecho.porGuia) {
      await auditCtpEsperando({
        tenantId,
        action: "ctp_ingreso_trozas_acomodar",
        entity: "WoodEntry",
        entityId: g.movidas[0]?.hacia.id ?? "",
        detail: detalleDeGuia(g.gtf, g.movidas),
        user: user || "unknown",
      });
    }
    if (hecho.movidas > 0) {
      for (const p of [CACHE_INGRESOS, CACHE_LIBRO, CACHE_CONTRATOS]) {
        try {
          invalidateByPrefix(`${p}:${tenantId}`);
        } catch (err) {
          logger.warn("[acomodar-trozas] no se pudo invalidar el caché", { prefijo: p, error: String(err) });
        }
      }
    }

    const despues = (await leerYPlanear(prisma, tenantId, alcance)).plan;
    const m3Movidos =
      Math.round(hecho.porGuia.reduce((s, g) => s + g.movidas.reduce((a, m) => a + (m.m3 ?? 0), 0), 0) * 10_000) / 10_000;
    return {
      movidas: hecho.movidas,
      m3Movidos,
      yaNoSePudieron: hecho.yaNoSePudieron,
      guias: hecho.porGuia.length,
      despues,
    };
  },
};
