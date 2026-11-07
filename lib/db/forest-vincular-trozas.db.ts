import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { limaDateKey } from "@/lib/utils";
import { esEsperaDeLockVencida } from "@/lib/errores/codigo-pg";
import { esChoqueDeLocks } from "@/lib/forestal/ctp-api-errors";
import { auditCtpEsperando, m3 } from "@/lib/forestal/ctp-audit";
import { guiaRecibida } from "@/lib/forestal/consumo-trozas";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { closedPeriodOf, type CtpCierrePeriodo } from "@/lib/forestal/ctp-cierre-types";
import { diaDelLibro } from "@/lib/forestal/recepcion-antes-de-la-sierra";
import { MAX_PARTES_POR_CORRIDA } from "@/lib/forestal/vincular-desde-mixto";
import { pasaElTope } from "@/lib/forestal/vincular-produccion";
import {
  conLlegadasCorregidas,
  proponerTandaDeOrigen,
  simularArreglos,
  type PropuestaDeTandaOrigen,
  type SimulacionDeArreglos,
} from "@/lib/forestal/origen-en-tanda";
import {
  MAX_CORRIDAS_POR_TANDA,
  clavePermiso,
  corridaParaDiagnostico,
  diagnosticarCorrida,
  diagnosticarSinOrigen,
  m3DeProducto,
  permisoRef,
  problemaAlVincular,
  proponerTrozas,
  trozaParaDiagnostico,
  type ContextoDelPatio,
  type CorridaLeida,
  type CorridaParaDiagnostico,
  type DiagnosticoCorrida,
  type DiagnosticoSinOrigen,
  type GuiaDelLibro,
  type PermisoRef,
  type PropuestaDeTrozas,
  type ResultadoCorridaEnTanda,
  type ResultadoTandaVincular,
  type TrozaLeida,
  type TrozaParaDiagnostico,
  type TrozaTomada,
  type VincularTrozasPedido,
} from "@/lib/forestal/vincular-trozas";
import {
  piezasQueTomaLaTanda,
  queDestraba,
  sugerenciaQueCabe,
  vistaPreviaDeSoltar,
  type SimulacionDeSoltar,
  type VistaDeSoltar,
} from "@/lib/forestal/soltar-trozas";
import { baseGuardada, guardarBase } from "@/lib/forestal/soltar-trozas-memo";
import { CTP_TX_OPTS, CtpInvariantError } from "./forest-ctp-consumo.db";
import { ForestCtpCierreDB } from "./forest-ctp-cierre.db";
import { ForestLoteAserrioDB } from "./forest-lote-aserrio.db";
import { ForestVincularCorridaDB, type VinculoEscrito } from "./forest-vincular-corrida.db";
import { WoodEntriesDB, vivaLinea } from "./wood-entries.db";

/**
 * «Saber de qué trozas salió» (Libro CTP): el diagnóstico de las corridas sin
 * origen y la vinculación con TROZAS SUELTAS.
 *
 * `ForestVincularCorridaDB.vincularCorrida` (ADR-441) sólo mueve piezas que ya
 * están en un lote. En el patio real casi nada lo está (Blas, 27-09: 84 trozas,
 * ninguna en un lote), así que acá se arma el lote en el mismo acto: las trozas
 * sueltas van a un lote nuevo de la especie y el permiso de la corrida, y todo
 * pasa por `vincularCorridaEnTx` —la regla vive una sola vez—.
 *
 * ## Todo en UNA transacción
 *
 * Orden de locks, el mismo que `vincularCorrida` (corrida → lotes → trozas) para
 * no abrazarse con él:
 *
 *   corrida → lotes donde están hoy las trozas (`ORDER BY id`) → trozas
 *   (`ORDER BY id`) → [correlativo del lote nuevo] → guías (I2, adentro)
 *
 * Los lotes se leen ANTES de bloquear las trozas (hay que saber cuáles son) y se
 * vuelven a comparar después: si otra operación movió una troza de lote en el
 * medio, el pedido entero vuelve con 409.
 *
 * ## Lo que agrega a las reglas del vinculador
 *
 *  · **El permiso** (regla nueva): la guía de cada troza es del permiso de la
 *    corrida. `vincularCorridaEnTx` no lo mira.
 *  · La fila de la guía: una troza anotada en la fila de otra especie haría caer
 *    su consumo en esa fila (Cachimbo anotado como Copal).
 *  · El mixto abierto (LM4) y el lote cerrado.
 *  · Los reprocesos: una corrida que ya recibe producto de otra tiene origen.
 *
 * NUNCA vincula sola: el POST de la persona es la confirmación.
 */

/** La troza como la lee este flujo: lo que decide si entra y a qué lote. */
const SELECT_TROZA = {
  id: true,
  woodEntryId: true,
  codificacion: true,
  codigoPlanta: true,
  especieComun: true,
  volumenM3: true,
  fechaRecepcion: true,
  noRecepcionada: true,
  descarte: true,
  loteAserrioId: true,
  loteMixtoId: true,
  _count: { select: { retrozos: true } },
  /* El ESTADO de la corrida y del despacho, no el id pelado: una corrida
     anulada devolvió la madera al patio (regla forestal-serfor). */
  consumidaEn: { select: { status: true, deletedAt: true } },
  despachadaEn: { select: { status: true, deletedAt: true } },
  loteMixto: { select: { code: true, status: true, deletedAt: true } },
  loteAserrio: {
    select: {
      id: true,
      code: true,
      status: true,
      speciesCommon: true,
      permiso: true,
      deletedAt: true,
      produccionEntryId: true,
    },
  },
  entry: {
    select: {
      status: true,
      deletedAt: true,
      fechaRecepcion: true,
      entryDate: true,
      gtfNumber: true,
      gtfDate: true,
      speciesCommonName: true,
      volumeM3: true,
      contratoId: true,
      originCode: true,
      contrato: { select: { codigo: true, deletedAt: true } },
    },
  },
} satisfies Prisma.WoodEntryTrozaSelect;

type FilaTroza = Prisma.WoodEntryTrozaGetPayload<{ select: typeof SELECT_TROZA }>;

/** Cuántas trozas se nombran en un rechazo; el resto va como «y N más». */
const NOMBRADAS = 5;
const MAX_TROZAS_PATIO = 5000;
const r4 = (n: number) => Math.round(n * 10_000) / 10_000 || 0;
const nroDe = (lineNo: number | null) => (lineNo != null ? `N° ${lineNo}` : "sin número");

/** El permiso de una punta: contrato vivo si lo hay; si no, el código escrito (`permisoRef`, la misma regla que el vinculador de lotes). */
const permisoDe = (
  contratoId: string | null,
  contrato: { codigo: string; deletedAt: Date | null } | null,
  originCode: string | null,
): PermisoRef => permisoRef(contratoId, contrato, originCode);

/** La fila de Prisma, en la forma plana que entiende el módulo puro. */
function leida(t: FilaTroza, consumido: Map<string, number>, corridaViva: Map<string, boolean>): TrozaLeida {
  const lote = t.loteAserrio && !t.loteAserrio.deletedAt ? t.loteAserrio : null;
  const permiso = permisoDe(t.entry.contratoId, t.entry.contrato, t.entry.originCode);
  return {
    id: t.id,
    woodEntryId: t.woodEntryId,
    codificacion: t.codificacion,
    codigoPlanta: t.codigoPlanta,
    especieComun: t.especieComun,
    volumenM3: t.volumenM3 == null ? null : Number(t.volumenM3),
    fechaRecepcion: t.fechaRecepcion,
    noRecepcionada: t.noRecepcionada,
    descarte: t.descarte,
    retrozos: t._count.retrozos,
    consumidaViva: Boolean(t.consumidaEn) && vivaLinea(t.consumidaEn),
    despachadaViva: vivaLinea(t.despachadaEn),
    mixtoAbierto:
      t.loteMixto && t.loteMixto.status === "abierto" && !t.loteMixto.deletedAt ? { code: t.loteMixto.code } : null,
    lote: lote
      ? {
          id: lote.id,
          code: lote.code,
          status: lote.status,
          especie: lote.speciesCommon,
          permiso: lote.permiso,
          corridaViva: lote.produccionEntryId ? (corridaViva.get(lote.produccionEntryId) ?? false) : false,
        }
      : null,
    guia: {
      status: t.entry.status,
      anulada: Boolean(t.entry.deletedAt) || ["anulado", "rechazado"].includes(t.entry.status),
      fechaRecepcion: t.entry.fechaRecepcion,
      entryDate: t.entry.entryDate,
      gtfNumber: t.entry.gtfNumber,
      especie: t.entry.speciesCommonName,
      m3: Number(t.entry.volumeM3),
      consumidoM3: consumido.get(t.woodEntryId) ?? 0,
      contratoId: permiso.contratoId,
      permisoCodigo: permiso.codigo,
      gtfDate: t.entry.gtfDate,
    },
  };
}

type Db = typeof prisma | Prisma.TransactionClient;

/** ¿Siguen vivas las corridas que cerraron estos lotes? (un lote consumido por una anulada libera sus trozas) */
async function corridasVivasDeLotes(db: Db, tenantId: string, filas: readonly FilaTroza[]): Promise<Map<string, boolean>> {
  const ids = [
    ...new Set(
      filas
        .map((t) => t.loteAserrio)
        .filter((l) => l && !l.deletedAt && l.status !== "abierto" && l.produccionEntryId)
        .map((l) => l!.produccionEntryId!),
    ),
  ];
  const mapa = new Map<string, boolean>();
  if (ids.length === 0) return mapa;
  const corridas = await db.forestCtpEntry.findMany({
    where: { tenantId, id: { in: ids } },
    select: { id: true, status: true, deletedAt: true },
  });
  for (const c of corridas) mapa.set(c.id, vivaLinea(c));
  return mapa;
}

/**
 * El patio candidato: trozas de guías vivas que ninguna corrida VIVA tomó ni
 * ningún despacho vivo se llevó, sin descartes. Lo demás no puede ir a ninguna
 * corrida y no hace falta traerlo.
 */
async function trozasCandidatas(tenantId: string): Promise<TrozaParaDiagnostico[]> {
  /* «Tomada por una corrida (o un despacho) que ya no vale» es libre: el
     estado, no el id pelado. */
  const muerta = { OR: [{ status: { not: "registrado" } }, { deletedAt: { not: null } }] };
  const filas = await prisma.woodEntryTroza.findMany({
    where: {
      tenantId,
      descarte: false,
      entry: { deletedAt: null, status: { notIn: ["anulado", "rechazado"] } },
      AND: [
        { OR: [{ consumidaEnId: null }, { consumidaEn: { is: muerta } }] },
        { OR: [{ despachadaEnId: null }, { despachadaEn: { is: muerta } }] },
      ],
    },
    select: SELECT_TROZA,
    orderBy: [{ createdAt: "asc" }, { orden: "asc" }],
    take: MAX_TROZAS_PATIO,
  });
  const consumido = await WoodEntriesDB.consumidoPorIngreso(
    tenantId,
    filas.map((t) => t.woodEntryId),
  );
  const vivas = await corridasVivasDeLotes(prisma, tenantId, filas);
  return filas.map((t) => trozaParaDiagnostico(leida(t, consumido, vivas)));
}

/**
 * Las trozas que YA entraron a una corrida viva (ADR-447): no están en el
 * patio, pero dicen adónde fue la madera que a otra corrida le falta. Sin esto
 * la bandeja decía «No hay trozas de Cachimbo en el patio» con las 12 dentro de
 * la N° 61.
 */
async function trozasTomadas(tenantId: string): Promise<TrozaTomada[]> {
  const filas = await prisma.woodEntryTroza.findMany({
    where: { tenantId, consumidaEn: { is: { status: "registrado", deletedAt: null } } },
    select: {
      id: true,
      especieComun: true,
      volumenM3: true,
      consumidaEn: { select: { id: true, lineNo: true, entryDate: true, quantity: true, unit: true } },
      entry: { select: { contratoId: true, originCode: true, contrato: { select: { codigo: true, deletedAt: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: MAX_TROZAS_PATIO,
  });
  return filas.flatMap((t) => {
    const c = t.consumidaEn;
    if (!c) return [];
    const producido = m3DeProducto(c.quantity == null ? null : Number(c.quantity), c.unit);
    return [
      {
        id: t.id,
        especie: t.especieComun,
        m3: Number(t.volumenM3 ?? 0) || 0,
        permiso: permisoDe(t.entry.contratoId, t.entry.contrato, t.entry.originCode),
        corrida: {
          id: c.id,
          lineNo: c.lineNo,
          fecha: diaDelLibro(c.entryDate) ?? "",
          m3Producido: producido > 0 ? producido : null,
        },
      },
    ];
  });
}

/**
 * Las filas de guía vivas del libro, tengan o no trozas: para decir «el permiso
 * no tiene ninguna guía» o «la guía no tiene su lista de trozas» (ADR-447).
 */
async function guiasDelLibro(tenantId: string): Promise<GuiaDelLibro[]> {
  const filas = await prisma.woodEntry.findMany({
    where: { tenantId, deletedAt: null, status: { notIn: ["anulado", "rechazado"] } },
    select: {
      id: true,
      gtfNumber: true,
      speciesCommonName: true,
      volumeM3: true,
      status: true,
      fechaRecepcion: true,
      contratoId: true,
      originCode: true,
      contrato: { select: { codigo: true, deletedAt: true } },
      _count: { select: { trozas: true } },
    },
    orderBy: { entryDate: "desc" },
    take: MAX_TROZAS_PATIO,
  });
  return filas.map((w) => ({
    id: w.id,
    gtfNumber: w.gtfNumber,
    especie: w.speciesCommonName,
    m3: Number(w.volumeM3) || 0,
    recibida: guiaRecibida({ estado: w.status, fechaRecepcionGuia: w.fechaRecepcion, fechaRecepcionTroza: null }),
    trozas: w._count.trozas,
    permiso: permisoDe(w.contratoId, w.contrato, w.originCode),
  }));
}

/** Lo que el diagnóstico mira además del patio. En serie: son dos lecturas cortas. */
async function contextoDelPatio(tenantId: string): Promise<ContextoDelPatio> {
  const tomadas = await trozasTomadas(tenantId);
  const guias = await guiasDelLibro(tenantId);
  return { tomadas, guias, hoy: limaDateKey() };
}

/**
 * Otra tanda de este negocio tiene tomado el bloqueo de la tanda. Si pasa en la
 * PRIMERA corrida (`pg_try_advisory_xact_lock`), la ruta responde 409 y no se
 * escribió nada. En las siguientes (esperan el bloqueo hasta 15 s) esa corrida
 * vuelve como `error` `TANDA_EN_CURSO` y las anteriores quedan escritas.
 */
export class TandaEnCursoError extends Error {
  constructor() {
    super("Otra tanda de vinculación está en curso en este negocio: espera unos segundos y vuelve a intentar.");
    this.name = "TandaEnCursoError";
  }
}

/** Una corrida de la tanda: el lock de fila que no llega en 15 s es «reintenta», no una tx colgada. */
const ESPERA_LOCKS_MS = 15_000;
/**
 * Una corrida de la tanda son ~30 consultas con sus locks; contra la base desde
 * el panel local cada una va y vuelve por el pooler (~0,1 s). Los 20 s de
 * `CTP_TX_OPTS` no alcanzan si además espera un lock (15 s como mucho).
 */
const TX_TANDA = { timeout: 45_000, maxWait: 15_000 } as const;
/**
 * Pasado esto no se EMPIEZA otra corrida: lo que falta vuelve `pendiente`. Con
 * la última corrida en curso (≤ 45 s de tx + sus renglones) el pedido termina
 * antes de los 300 s de `maxDuration` de la ruta en `vercel.json`.
 */
const PLAZO_TANDA_MS = 240_000;
const claveTanda = (tenantId: string) => `ctp-vincular-tanda:${tenantId}`;

/** Lo que se lee de una corrida para diagnosticarla. */
const SELECT_CORRIDA = {
  id: true,
  lineNo: true,
  entryDate: true,
  speciesCommon: true,
  quantity: true,
  unit: true,
  volumeInputM3: true,
  contratoId: true,
  originCode: true,
  aperturaDeclaradaAt: true,
  contrato: { select: { codigo: true, deletedAt: true } },
  _count: { select: { trozasConsumidas: true, consumos: true, reprocesosEntrada: true } },
} satisfies Prisma.ForestCtpEntrySelect;

type FilaCorrida = Prisma.ForestCtpEntryGetPayload<{ select: typeof SELECT_CORRIDA }>;

function corridaLeida(c: FilaCorrida, lotes: number): CorridaLeida {
  const permiso = permisoDe(c.contratoId, c.contrato, c.originCode);
  return {
    id: c.id,
    lineNo: c.lineNo,
    entryDate: c.entryDate,
    speciesCommon: c.speciesCommon,
    quantity: c.quantity == null ? null : Number(c.quantity),
    unit: c.unit,
    volumeInputM3: c.volumeInputM3 == null ? null : Number(c.volumeInputM3),
    contratoId: permiso.contratoId,
    permisoCodigo: permiso.codigo,
    aperturaDeclarada: Boolean(c.aperturaDeclaradaAt),
    lotes,
    piezas: c._count.trozasConsumidas,
  };
}

/** La corrida con el período cerrado donde cae (ADR-139), la misma regla que el vinculador. */
function conCierre(c: CorridaParaDiagnostico, fecha: Date, cierres: CtpCierrePeriodo[]): CorridaParaDiagnostico {
  return { ...c, mesCerrado: closedPeriodOf(cierres, fecha)?.label ?? null };
}

async function lotesPorCorrida(tenantId: string, ids: string[]): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  if (ids.length === 0) return mapa;
  const filas = await prisma.forestLoteAserrio.groupBy({
    by: ["produccionEntryId"],
    where: { tenantId, deletedAt: null, produccionEntryId: { in: ids } },
    _count: { _all: true },
  });
  for (const f of filas) if (f.produccionEntryId) mapa.set(f.produccionEntryId, f._count._all);
  return mapa;
}

export type DiagnosticoDeUna =
  | { ok: true; diagnostico: DiagnosticoCorrida }
  | { ok: false; error: "no_existe" | "no_vigente" | "ya_tiene_origen"; message: string };

export type PropuestaPedida =
  | ({ ok: true } & PropuestaDeTrozas)
  | { ok: false; error: "contrato_no_existe"; message: string };

/** Lo que se escribió en la transacción, para narrarlo después del commit. */
interface Escrito {
  vinculo: VinculoEscrito;
  lineNo: number;
  especie: string;
  loteNuevo: { id: string; code: string; trozas: number; m3: number; liberadas: number } | null;
}

export interface EntradasDelDiagnostico {
  corridas: CorridaParaDiagnostico[];
  trozas: TrozaParaDiagnostico[];
  contexto: ContextoDelPatio;
}

/** Lo leído para simular «Soltar trozas» de una corrida (ver `leerBaseDeSoltar`). */
interface BaseDeSoltar {
  vista: VistaDeSoltar;
  entradas: EntradasDelDiagnostico;
  filas: FilaTroza[];
  consumido: Map<string, number>;
  propia: FilaCorrida | null;
  lotesPropios: number;
  /** Se calcula una vez por base: no depende de la selección. */
  sugerencia?: Pick<SimulacionDeSoltar, "sugeridas" | "sugeridasConLlegada" | "guiasALlegar">;
}

export class ForestVincularTrozasDB {
  /**
   * Lo que el diagnóstico LEE, tal cual: las corridas sin origen, las trozas
   * candidatas y el contexto (tomadas, guías, hoy). Separado para que las
   * mediciones y el fixture de Blas (`__tests__/fixtures/blas-sin-origen-…`)
   * usen exactamente lo mismo que el servidor.
   */
  static async entradasDelDiagnostico(tenantId: string): Promise<EntradasDelDiagnostico> {
    if (!tenantId) throw new Error("tenantId is required");
    const filas = await prisma.forestCtpEntry.findMany({
      where: {
        tenantId,
        section: "produccion",
        status: "registrado",
        deletedAt: null,
        consumos: { none: {} },
        reprocesosEntrada: { none: {} },
      },
      select: SELECT_CORRIDA,
      orderBy: [{ entryDate: "asc" }, { lineNo: "asc" }],
      take: 2000,
    });
    const lotes = await lotesPorCorrida(
      tenantId,
      filas.map((c) => c.id),
    );
    const trozas = await trozasCandidatas(tenantId);
    const cierres = await ForestCtpCierreDB.list(tenantId);
    const contexto = await contextoDelPatio(tenantId);
    return {
      corridas: filas.map((c) => conCierre(corridaParaDiagnostico(corridaLeida(c, lotes.get(c.id) ?? 0)), c.entryDate, cierres)),
      trozas,
      contexto,
    };
  }

  /**
   * Todas las corridas sin origen del negocio, con su motivo, su propuesta y su
   * arreglo. «Sin origen» es la regla de `corridaSinOrigen`: sin consumos ni
   * reprocesos.
   */
  static async diagnostico(tenantId: string): Promise<DiagnosticoSinOrigen> {
    const { corridas, trozas, contexto } = await ForestVincularTrozasDB.entradasDelDiagnostico(tenantId);
    return diagnosticarSinOrigen(corridas, trozas, undefined, { contexto });
  }

  /**
   * La tanda que se propone (ADR-447): por especie + permiso, ninguna troza en
   * dos corridas, y qué pasaría con cada arreglo. Sólo lee.
   */
  static async tanda(tenantId: string): Promise<{ propuesta: PropuestaDeTandaOrigen; simulacion: SimulacionDeArreglos }> {
    const { corridas, trozas, contexto } = await ForestVincularTrozasDB.entradasDelDiagnostico(tenantId);
    return {
      propuesta: proponerTandaDeOrigen(corridas, trozas, undefined, { contexto }),
      simulacion: simularArreglos(corridas, trozas, contexto),
    };
  }

  /**
   * Qué pasaría si `corridaId` soltara esas trozas (ADR-447 §6). SÓLO LEE.
   *
   * Arma el patio del «después» con las MISMAS reglas que la escritura
   * (`vistaPreviaDeSoltar` + `destinoDelLote`): la pieza suelta sale de su
   * corrida, del lote que la corrida sigue usando sale suelta, el lote que se
   * reabre la conserva; su guía libera los m³ que la corrida deja de atribuirle,
   * y si no le queda nada la corrida entra a «sin origen». Después corre el
   * diagnóstico y la tanda de la bandeja sobre los dos patios.
   *
   * `sugeridas`: con TODA la madera de la corrida en el patio, las piezas que la
   * tanda les daría a las corridas que esperan (la más vieja primero). Es una
   * sugerencia para marcar casillas: nunca se aplica sola.
   *
   * `null` = la corrida no existe en este negocio o no es de producción.
   */
  static async simularSoltar(
    tenantId: string,
    corridaId: string,
    trozaIds: readonly string[] | null,
  ): Promise<SimulacionDeSoltar | null> {
    if (!tenantId) throw new Error("tenantId is required");
    /* La del abrir (sin selección) lee fresco; las de cada selección, sobre lo
       leído (`soltar-trozas-memo.ts`: las lecturas son el 99 % del tiempo). */
    const conSeleccion = (trozaIds ?? []).length > 0;
    let base = conSeleccion ? baseGuardada<BaseDeSoltar>(tenantId, corridaId) : null;
    if (!base) {
      base = await ForestVincularTrozasDB.leerBaseDeSoltar(tenantId, corridaId);
      if (!base) return null;
      guardarBase(tenantId, corridaId, base);
    }
    const { vista, entradas, filas, consumido, propia, lotesPropios } = base;
    const suyas = new Set(vista.piezas.map((p) => p.id));

    const escenario = (sueltas: ReadonlySet<string>): EntradasDelDiagnostico => {
      if (sueltas.size === 0) return entradas;
      const pv = vistaPreviaDeSoltar(vista.corrida, vista.piezas, vista.consumos, sueltas);
      const libera = new Map(pv.porGuia.map((g) => [g.woodEntryId, r4(g.antes - g.despues)]));
      const destino = new Map(pv.lotes.map((l) => [l.loteId, l.destino]));
      const menos = (woodEntryId: string, m: number) => Math.max(0, r4(m - (libera.get(woodEntryId) ?? 0)));
      const consumidoDespues = new Map([...consumido].map(([id, m]) => [id, menos(id, m)]));
      const nuevas = filas
        .filter((f) => sueltas.has(f.id))
        .map((f) => {
          const d = f.loteAserrio ? destino.get(f.loteAserrio.id) : undefined;
          const lote =
            !f.loteAserrio || d === "suelta"
              ? null
              : d === "reabrir"
                ? { ...f.loteAserrio, status: "abierto", produccionEntryId: null }
                : f.loteAserrio;
          /* Sin corrida y con su lote como queda: ningún lote cerrado la retiene. */
          return trozaParaDiagnostico(leida({ ...f, consumidaEn: null, loteAserrio: lote }, consumidoDespues, new Map()));
        });
      const trozas = entradas.trozas.map((t) =>
        libera.has(t.fila.id) ? { ...t, fila: { ...t.fila, consumidoM3: menos(t.fila.id, t.fila.consumidoM3) } } : t,
      );
      const corridas =
        pv.quedaSinOrigen && propia
          ? [
              ...entradas.corridas,
              {
                ...corridaParaDiagnostico(
                  corridaLeida(
                    { ...propia, volumeInputM3: null, _count: { trozasConsumidas: 0, consumos: 0, reprocesosEntrada: propia._count.reprocesosEntrada } },
                    Math.max(0, lotesPropios - pv.lotes.filter((l) => l.destino === "reabrir").length),
                  ),
                ),
                /* El mes cerrado ya lo leyó la vista con la misma regla (`conCierre`). */
                mesCerrado: vista.corrida.mesCerrado,
              },
            ].sort((a, b) => (diaDelLibro(a.fecha) ?? "").localeCompare(diaDelLibro(b.fecha) ?? "") || (a.lineNo ?? 0) - (b.lineNo ?? 0))
          : entradas.corridas;
      return {
        corridas,
        trozas: [...trozas, ...nuevas],
        contexto: { ...entradas.contexto, tomadas: entradas.contexto.tomadas.filter((t) => !sueltas.has(t.id)) },
      };
    };
    const medir = (e: EntradasDelDiagnostico) => ({
      diag: diagnosticarSinOrigen(e.corridas, e.trozas, undefined, { contexto: e.contexto }),
      tanda: proponerTandaDeOrigen(e.corridas, e.trozas, undefined, { contexto: e.contexto }),
    });

    /* «Si además corriges la llegada»: el escenario de `simularArreglos`, sobre
       el patio del después y SÓLO con las guías de esta madera (corregir otras
       destraba corridas que no tienen que ver con esta suelta). */
    const guiasPropias = new Set(vista.piezas.map((p) => p.gtfNumber));
    const conLlegada = (e: EntradasDelDiagnostico, diag: DiagnosticoSinOrigen) => {
      const c = conLlegadasCorregidas(e.trozas, diag, guiasPropias);
      return { guias: c.guias, tanda: proponerTandaDeOrigen(e.corridas, c.trozas, undefined, { contexto: e.contexto }) };
    };
    /* Lo que la tanda les daría, recortado a lo que deja a esta corrida con su producción cubierta. */
    const quecabe = (t: PropuestaDeTandaOrigen) =>
      sugerenciaQueCabe(vista.corrida, vista.piezas, vista.consumos, piezasQueTomaLaTanda(t, corridaId, suyas));

    /* La sugerencia no depende de la selección: una vez por base. */
    if (!base.sugerencia) {
      const eTodas = escenario(suyas);
      const todas = medir(eTodas);
      const todasLlegada = conLlegada(eTodas, todas.diag);
      const sugeridas = quecabe(todas.tanda);
      const conLaLlegada = quecabe(todasLlegada.tanda);
      const masConLlegada = conLaLlegada.some((id) => !sugeridas.includes(id));
      base.sugerencia = {
        sugeridas,
        sugeridasConLlegada: masConLlegada ? conLaLlegada : [],
        guiasALlegar: masConLlegada ? todasLlegada.guias : [],
      };
    }

    const pedidas = new Set((trozaIds ?? []).filter((id) => suyas.has(id)));
    let destraba: SimulacionDeSoltar["destraba"] = null;
    if (pedidas.size > 0) {
      const e = escenario(pedidas);
      const despues = medir(e);
      destraba = queDestraba(corridaId, medir(entradas), despues, conLlegada(e, despues.diag));
    }
    return { ...base.sugerencia, destraba };
  }

  /**
   * Lo que la simulación de «Soltar trozas» lee: la corrida con sus piezas, el
   * patio del diagnóstico, las piezas como las lee el vinculador, lo consumido
   * de sus guías y la corrida misma (por si al soltarlo todo entra a «sin
   * origen»). En serie: lecturas cortas del mismo pool.
   */
  private static async leerBaseDeSoltar(tenantId: string, corridaId: string): Promise<BaseDeSoltar | null> {
    const vista = await ForestVincularCorridaDB.vistaDeSoltar(tenantId, corridaId);
    if (!vista) return null;
    const entradas = await ForestVincularTrozasDB.entradasDelDiagnostico(tenantId);
    const filas = await prisma.woodEntryTroza.findMany({
      where: { tenantId, consumidaEnId: corridaId },
      select: SELECT_TROZA,
    });
    const consumido = await WoodEntriesDB.consumidoPorIngreso(tenantId, [...new Set(filas.map((f) => f.woodEntryId))]);
    const propia = await prisma.forestCtpEntry.findFirst({ where: { id: corridaId, tenantId }, select: SELECT_CORRIDA });
    const lotes = await lotesPorCorrida(tenantId, [corridaId]);
    return { vista, entradas, filas, consumido, propia, lotesPropios: lotes.get(corridaId) ?? 0 };
  }

  /** El diagnóstico de UNA corrida, o por qué no se diagnostica. */
  static async diagnosticoDeCorrida(tenantId: string, corridaId: string): Promise<DiagnosticoDeUna> {
    if (!tenantId) throw new Error("tenantId is required");
    const c = await prisma.forestCtpEntry.findFirst({
      where: { id: corridaId, tenantId, deletedAt: null, section: "produccion" },
      select: { ...SELECT_CORRIDA, status: true },
    });
    if (!c) return { ok: false, error: "no_existe", message: "Esa corrida no existe en este negocio." };
    if (c.status !== "registrado") {
      return { ok: false, error: "no_vigente", message: `La corrida N° ${c.lineNo} está anulada: no se le vincula madera.` };
    }
    if (c._count.consumos > 0 || c._count.reprocesosEntrada > 0) {
      return {
        ok: false,
        error: "ya_tiene_origen",
        message: `La corrida N° ${c.lineNo} ya dice de qué madera salió.`,
      };
    }
    const lotes = await lotesPorCorrida(tenantId, [c.id]);
    const trozas = await trozasCandidatas(tenantId);
    const cierres = await ForestCtpCierreDB.list(tenantId);
    const contexto = await contextoDelPatio(tenantId);
    return {
      ok: true,
      diagnostico: diagnosticarCorrida(
        conCierre(corridaParaDiagnostico(corridaLeida(c, lotes.get(c.id) ?? 0)), c.entryDate, cierres),
        trozas,
        undefined,
        { contexto },
      ),
    };
  }

  /**
   * Qué trozas le tocarían a una corrida que TODAVÍA no existe (el modal de
   * declarar, antes de guardar). Mismas reglas que el diagnóstico.
   */
  static async propuesta(
    tenantId: string,
    input: { especie: string; fecha: string; m3: number; contratoId?: string | null; permiso?: string | null },
  ): Promise<PropuestaPedida> {
    if (!tenantId) throw new Error("tenantId is required");
    let permiso: PermisoRef = { contratoId: null, codigo: input.permiso?.trim() || null };
    if (input.contratoId) {
      /* `tenantId` en el WHERE: un contrato de otro negocio no existe acá. */
      const k = await prisma.forestContrato.findFirst({
        where: { id: input.contratoId, tenantId, deletedAt: null },
        select: { id: true, codigo: true },
      });
      if (!k) return { ok: false, error: "contrato_no_existe", message: "Ese permiso no está cargado en este negocio." };
      permiso = { contratoId: k.id, codigo: k.codigo };
    }
    const trozas = await trozasCandidatas(tenantId);
    const contexto = await contextoDelPatio(tenantId);
    return {
      ok: true,
      ...proponerTrozas({ especie: input.especie, permiso, fecha: input.fecha, m3Producido: input.m3 }, trozas, undefined, {
        contexto,
      }),
    };
  }

  /**
   * Vincula la corrida con las trozas que la persona confirmó, todo o nada.
   *
   * Las sueltas (o liberadas de un lote cuya corrida se anuló) van a UN lote
   * nuevo de la especie y el permiso de la corrida; las que ya están en un lote
   * abierto van con su lote. Después, `vincularCorridaEnTx` escribe volumen,
   * consumo por guía (I1/I2), piezas y cierra los lotes vaciados.
   */
  static async vincularTrozas(
    tenantId: string,
    input: VincularTrozasPedido,
    usuario: string,
  ): Promise<{
    corridaId: string;
    trozas: number;
    m3: number;
    lotesArmados: string[];
    rendimientoPct: number | null;
    sobreElTope: boolean;
  }> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!usuario?.trim()) throw new Error("usuario is required");
    const corridaId = input.corridaId.trim();
    const pedidas = input.trozaIds.map((id) => id.trim());
    if (new Set(pedidas).size !== pedidas.length) {
      throw new CtpInvariantError("Una misma troza aparece dos veces en el pedido: cada pieza entra una sola vez.", "VALIDACION");
    }

    /* Los cierres, ANTES de abrir la transacción: son un KV que se lee con el
       cliente global, y adentro pedirían otra conexión con la de la tx tomada. */
    const cierres = await ForestCtpCierreDB.list(tenantId);
    const escrito = await prisma.$transaction(
      (tx) => ForestVincularTrozasDB.vincularEnTx(tx, tenantId, corridaId, pedidas, usuario, cierres),
      CTP_TX_OPTS,
    );
    return { corridaId, ...(await ForestVincularTrozasDB.despuesDelCommit(tenantId, escrito, usuario)) };
  }

  /**
   * Después del commit: la caché del lote nuevo, su renglón y, en orden, los de
   * la vinculación (`despuesDeVincular` invalida el libro, los lotes y el patio,
   * y espera sus renglones).
   */
  private static async despuesDelCommit(
    tenantId: string,
    escrito: Escrito,
    usuario: string,
  ): Promise<{ trozas: number; m3: number; lotesArmados: string[]; rendimientoPct: number | null; sobreElTope: boolean }> {
    const { loteNuevo } = escrito;
    if (loteNuevo) {
      try {
        invalidateByPrefix(`forestal:lote-aserrio:${tenantId}`);
      } catch {
        /* cache best-effort */
      }
      await auditCtpEsperando({
        tenantId,
        action: "ctp_lote_aserrio_create",
        entity: "ForestLoteAserrio",
        entityId: loteNuevo.id,
        detail:
          `Abrió el lote de aserrío ${loteNuevo.code} · ${escrito.especie} con ${loteNuevo.trozas} troza${loteNuevo.trozas === 1 ? "" : "s"} ` +
          `(${m3(loteNuevo.m3)}) para vincular la corrida N° ${escrito.lineNo}` +
          (loteNuevo.liberadas > 0
            ? ` · ${loteNuevo.liberadas} volvieron de lotes cuya corrida se anuló`
            : ""),
        user: usuario,
      });
    }
    const r = await ForestVincularCorridaDB.despuesDeVincular(tenantId, escrito.vinculo, usuario);
    return {
      trozas: r.piezas,
      m3: r.volumenM3,
      lotesArmados: loteNuevo ? [loteNuevo.code] : [],
      rendimientoPct: r.rendimientoPct,
      sobreElTope: r.sobreElTope,
    };
  }

  /**
   * Vincula VARIAS corridas, cada una con las trozas que la persona confirmó en
   * la propuesta de la tanda (ADR-447 §4).
   *
   *  · UNA transacción por corrida, la más vieja primero: una rechazada no
   *    deshace las anteriores, y cada una se decide bajo lock sobre lo que dejó
   *    la anterior (una troza que ya tomó otra corrida la frena por T1).
   *  · El bloqueo de la tanda vive en cada transacción (`xact`): se suelta
   *    ENTRE corridas. La primera lo pide con `pg_try_advisory_xact_lock`: si
   *    otra tanda lo tiene, `TandaEnCursoError` (409) y no se escribió nada.
   *    Las siguientes lo ESPERAN hasta 15 s (`lock_timeout` LOCAL de la tx,
   *    nunca de sesión en el pooler), así que dos tandas que empezaron casi
   *    juntas se TURNAN corrida por corrida: el 409 sólo protege el arranque.
   *    Los datos quedan bien igual: cada troza se decide bajo su FOR UPDATE (T1).
   *  · Idempotente: la corrida que ya tiene su madera vuelve «ya_vinculada» (y
   *    dice si son las mismas trozas: un reintento), sin escribir. Si son las
   *    mismas y el renglón `ctp_corrida_vincular` no está (el corte cayó entre
   *    el commit y la auditoría), se repone.
   *  · Los cierres de período se leen antes de CADA corrida: si alguien cierra
   *    el mes en medio de la tanda, las que siguen lo ven.
   *  · Plazo: pasados 240 s no se empieza otra corrida; las que faltan vuelven
   *    `pendiente` para el pedido siguiente.
   *  · Cada corrida pasa por `vincularEnTx` → `vincularCorridaEnTx`: las reglas
   *    (permiso, T1, T3, volumen, I1/I2, mes cerrado) viven una sola vez.
   */
  static async vincularTanda(
    tenantId: string,
    pedidos: readonly VincularTrozasPedido[],
    usuario: string,
    /** `plazoMs`: sólo para probar el corte; la ruta usa el de siempre (240 s). */
    { plazoMs = PLAZO_TANDA_MS }: { plazoMs?: number } = {},
  ): Promise<ResultadoTandaVincular> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!usuario?.trim()) throw new Error("usuario is required");
    if (pedidos.length === 0 || pedidos.length > MAX_CORRIDAS_POR_TANDA) {
      throw new CtpInvariantError(`Una tanda lleva de 1 a ${MAX_CORRIDAS_POR_TANDA} corridas.`, "VALIDACION");
    }
    const limpios = pedidos.map((p) => ({ corridaId: p.corridaId.trim(), trozaIds: p.trozaIds.map((id) => id.trim()) }));
    const ids = limpios.map((p) => p.corridaId);
    if (new Set(ids).size !== ids.length) {
      throw new CtpInvariantError("Una corrida aparece dos veces en la tanda.", "VALIDACION");
    }
    const todas = limpios.flatMap((p) => p.trozaIds);
    if (new Set(todas).size !== todas.length) {
      throw new CtpInvariantError("Una troza aparece dos veces en la tanda: cada pieza entra a una sola corrida.", "VALIDACION");
    }

    /* Una corrida de otro negocio hace que la tanda entera sea un pedido
       ajeno: 404 antes de escribir nada. */
    const corridas = await prisma.forestCtpEntry.findMany({
      where: { tenantId, id: { in: ids }, deletedAt: null },
      select: { id: true, lineNo: true, entryDate: true },
    });
    const porId = new Map(corridas.map((c) => [c.id, c]));
    const faltan = ids.filter((id) => !porId.has(id));
    if (faltan.length > 0) {
      throw new CtpInvariantError(
        `${faltan.length === 1 ? "Una corrida de la tanda no existe" : `${faltan.length} corridas de la tanda no existen`} en este negocio.`,
        "TENANT_MISMATCH",
        { corridas: faltan },
      );
    }
    const enOrden = [...limpios].sort((a, b) => {
      const ca = porId.get(a.corridaId)!;
      const cb = porId.get(b.corridaId)!;
      return ca.entryDate.getTime() - cb.entryDate.getTime() || ca.lineNo - cb.lineNo;
    });

    const inicio = Date.now();
    const resultados: ResultadoCorridaEnTanda[] = [];
    for (const [i, p] of enOrden.entries()) {
      const lineNo = porId.get(p.corridaId)?.lineNo ?? null;
      const base = { corridaId: p.corridaId, lineNo };
      if (i > 0 && Date.now() - inicio >= plazoMs) {
        resultados.push({
          ...base,
          estado: "pendiente",
          mensaje: `La corrida ${nroDe(lineNo)} no se alcanzó a vincular en este pedido: vuelve a mandarla.`,
        });
        continue;
      }
      try {
        /* Los cierres, antes de CADA transacción (KV con el cliente global: adentro
           pediría otra conexión): un mes cerrado en medio de la tanda frena a las
           que siguen. */
        const cierres = await ForestCtpCierreDB.list(tenantId);
        const hecho = await prisma.$transaction(async (tx) => {
          /* LOCAL: vale sólo en esta transacción. */
          await tx.$queryRaw`SELECT set_config('lock_timeout', ${`${ESPERA_LOCKS_MS}ms`}, true)`;
          if (i === 0) {
            const [fila] = await tx.$queryRaw<{ ok: boolean }[]>`
              SELECT pg_try_advisory_xact_lock(hashtext(${claveTanda(tenantId)})) AS ok
            `;
            if (!fila?.ok) throw new TandaEnCursoError();
          } else {
            try {
              await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${claveTanda(tenantId)}))`;
            } catch (e) {
              if (esEsperaDeLockVencida(e)) throw new TandaEnCursoError();
              throw e;
            }
          }
          /* ¿Ya tiene su madera? La corrida se bloquea ANTES de mirar (el mismo
             lock que toma `vincularEnTx` después: en la misma tx no espera). */
          await tx.$queryRaw`
            SELECT "id" FROM "ForestCtpEntry"
            WHERE "id" = ${p.corridaId} AND "tenantId" = ${tenantId} AND "deletedAt" IS NULL
            FOR UPDATE
          `;
          const yaTiene = await tx.forestCtpEntry.findFirst({
            where: { id: p.corridaId, tenantId },
            select: { _count: { select: { consumos: true, trozasConsumidas: true } } },
          });
          if (yaTiene && (yaTiene._count.consumos > 0 || yaTiene._count.trozasConsumidas > 0)) {
            const suyas = await tx.woodEntryTroza.findMany({
              where: { tenantId, consumidaEnId: p.corridaId },
              select: { id: true },
            });
            const pedidas = new Set(p.trozaIds);
            const mismas = suyas.length === pedidas.size && suyas.every((t) => pedidas.has(t.id));
            /* Sólo si son LAS MISMAS trozas: otra madera vino por otro camino,
               con su propio renglón. Adentro se arma; se escribe después del
               commit (con la tx tomada pediría otra conexión del pool). */
            const renglon = mismas ? await ForestVincularTrozasDB.renglonFaltante(tx, tenantId, p.corridaId) : null;
            return { ya: true as const, trozas: suyas.length, mismas, renglon };
          }
          return {
            ya: false as const,
            escrito: await ForestVincularTrozasDB.vincularEnTx(tx, tenantId, p.corridaId, p.trozaIds, usuario, cierres),
          };
        }, TX_TANDA);

        if (hecho.ya) {
          /* Reponer el renglón no cambia el estado: la corrida ya está vinculada. */
          const repuesto = hecho.renglon
            ? await ForestVincularTrozasDB.reponerRenglon(tenantId, p.corridaId, hecho.renglon, usuario).catch((err: unknown) => {
                logger.error("[forest-vincular-trozas.vincularTanda] no se pudo reponer el renglón", {
                  error: String(err),
                  tenantId,
                  corridaId: p.corridaId,
                });
                return false;
              })
            : false;
          resultados.push({
            ...base,
            estado: "ya_vinculada",
            trozas: hecho.trozas,
            mismas: hecho.mismas,
            mensaje: hecho.mismas
              ? `La corrida ${nroDe(lineNo)} ya estaba vinculada con estas trozas.` +
                (repuesto ? " Faltaba su renglón en el historial y se repuso." : "")
              : `La corrida ${nroDe(lineNo)} ya tenía su madera (${hecho.trozas} troza${hecho.trozas === 1 ? "" : "s"}): no se le sumó nada.`,
          });
          continue;
        }
        /* Ya está escrita: si la narración (caché, renglones) fallara, la
           corrida sigue siendo «vinculada» — decir «error» invitaría a
           reintentar lo que ya se hizo. */
        const r = await ForestVincularTrozasDB.despuesDelCommit(tenantId, hecho.escrito, usuario).catch((err: unknown) => {
          logger.error("[forest-vincular-trozas.vincularTanda] vinculada, pero falló lo de después del commit", {
            error: String(err),
            tenantId,
            corridaId: p.corridaId,
          });
          const v = hecho.escrito.vinculo;
          return {
            trozas: v.porParte.reduce((a, x) => a + x.piezas, 0),
            m3: v.volumenTotal,
            lotesArmados: hecho.escrito.loteNuevo ? [hecho.escrito.loteNuevo.code] : [],
            rendimientoPct: v.rendimientoPct,
            sobreElTope: pasaElTope(v.rendimientoPct),
          };
        });
        resultados.push({ ...base, estado: "vinculada", ...r });
      } catch (e) {
        if (e instanceof TandaEnCursoError) {
          /* La primera: nada escrito, la ruta dice 409. Después: ésta no se
             intentó y las demás siguen (la otra tanda terminará lo suyo). */
          if (i === 0) throw e;
          resultados.push({ ...base, estado: "error", codigo: "TANDA_EN_CURSO", mensaje: e.message });
          continue;
        }
        if (e instanceof CtpInvariantError) {
          resultados.push({ ...base, estado: "bloqueada", codigo: e.code, mensaje: e.message });
          continue;
        }
        if (esEsperaDeLockVencida(e) || esChoqueDeLocks(e)) {
          resultados.push({
            ...base,
            estado: "error",
            codigo: "LIBRO_OCUPADO",
            mensaje: "Otra operación del libro tenía tomadas estas trozas: no se vinculó; vuelve a intentar en unos segundos.",
          });
          continue;
        }
        logger.error("[forest-vincular-trozas.vincularTanda] corrida falló", { error: String(e), tenantId, corridaId: p.corridaId });
        resultados.push({
          ...base,
          estado: "error",
          codigo: "INTERNO",
          mensaje: "No se pudo vincular esta corrida por un error del servidor; las demás siguen.",
        });
      }
    }

    const cuenta = (e: ResultadoCorridaEnTanda["estado"]) => resultados.filter((r) => r.estado === e).length;
    const vinculadas = resultados.filter((r): r is Extract<ResultadoCorridaEnTanda, { estado: "vinculada" }> => r.estado === "vinculada");
    return {
      corridas: resultados,
      resumen: {
        vinculadas: vinculadas.length,
        yaVinculadas: cuenta("ya_vinculada"),
        bloqueadas: cuenta("bloqueada"),
        errores: cuenta("error"),
        pendientes: cuenta("pendiente"),
        trozas: vinculadas.reduce((a, r) => a + r.trozas, 0),
        m3: r4(vinculadas.reduce((a, r) => a + r.m3, 0)),
      },
    };
  }

  /**
   * La corrida ya está vinculada con sus trozas pero su renglón
   * `ctp_corrida_vincular` no está (el corte cayó entre el commit y la
   * auditoría): el detalle, armado desde lo que quedó en el libro, para
   * reponerlo. `null` = el renglón está (o la corrida no).
   *
   * Lee por `tx`, dentro de la transacción de la tanda; escribe `reponerRenglon`
   * después del commit.
   */
  private static async renglonFaltante(
    tx: Prisma.TransactionClient,
    tenantId: string,
    corridaId: string,
  ): Promise<string | null> {
    const hay = await tx.activityLog.count({ where: { tenantId, action: "ctp_corrida_vincular", entityId: corridaId } });
    if (hay > 0) return null;
    const c = await tx.forestCtpEntry.findFirst({
      where: { id: corridaId, tenantId },
      select: { lineNo: true, speciesCommon: true, volumeInputM3: true, rendimientoPct: true },
    });
    if (!c) return null;
    const piezas = await tx.woodEntryTroza.findMany({
      where: { tenantId, consumidaEnId: corridaId },
      select: { volumenM3: true, loteAserrioId: true },
    });
    const lotes = await tx.forestLoteAserrio.findMany({
      where: { tenantId, id: { in: [...new Set(piezas.map((t) => t.loteAserrioId).filter((id): id is string => Boolean(id)))] } },
      select: { id: true, code: true },
    });
    const codigo = new Map(lotes.map((l) => [l.id, l.code]));
    const porLote = new Map<string, { piezas: number; m3: number }>();
    for (const t of piezas) {
      const k = (t.loteAserrioId && codigo.get(t.loteAserrioId)) || "sin lote";
      const x = porLote.get(k) ?? { piezas: 0, m3: 0 };
      x.piezas += 1;
      x.m3 = r4(x.m3 + (Number(t.volumenM3 ?? 0) || 0));
      porLote.set(k, x);
    }
    const rendimiento = c.rendimientoPct == null ? null : Number(c.rendimientoPct);
    return (
      `Vinculó la corrida N° ${c.lineNo} (${c.speciesCommon ?? "sin especie"}) con ${piezas.length} troza${piezas.length === 1 ? "" : "s"}: ` +
      [...porLote.entries()].map(([code, x]) => `${code} ${x.piezas} pz · ${m3(x.m3)}`).join(" + ") +
      ` = ${m3(c.volumeInputM3 == null ? null : Number(c.volumeInputM3))}` +
      (rendimiento != null ? ` · rendimiento ${rendimiento} %` : "") +
      " · renglón repuesto al reintentar: la vinculación había quedado escrita sin él"
    );
  }

  /**
   * Escribe el renglón repuesto, después del commit y esperándolo. Se vuelve a
   * contar justo antes: otro reintento que pasó por acá en el medio ya lo
   * escribió (la ventana es la de un renglón, no la de la tanda).
   */
  private static async reponerRenglon(tenantId: string, corridaId: string, detail: string, usuario: string): Promise<boolean> {
    const hay = await prisma.activityLog.count({ where: { tenantId, action: "ctp_corrida_vincular", entityId: corridaId } });
    if (hay > 0) return false;
    await auditCtpEsperando({
      tenantId,
      action: "ctp_corrida_vincular",
      entity: "ForestCtpEntry",
      entityId: corridaId,
      detail,
      user: usuario,
    });
    return true;
  }

  /** El núcleo de `vincularTrozas`, dentro de su transacción. */
  private static async vincularEnTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    corridaId: string,
    pedidas: string[],
    usuario: string,
    cierres: CtpCierrePeriodo[],
  ): Promise<Escrito> {
    // ── 1. La corrida, bloqueada antes de leerla ─────────────────────────
    const bloqueada = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "ForestCtpEntry"
      WHERE "id" = ${corridaId} AND "tenantId" = ${tenantId} AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    if (bloqueada.length === 0) {
      throw new CtpInvariantError("Esa corrida no existe en este negocio.", "TENANT_MISMATCH", { corridaId });
    }
    const corrida = await tx.forestCtpEntry.findFirst({
      where: { id: corridaId, tenantId },
      select: {
        id: true,
        lineNo: true,
        section: true,
        status: true,
        speciesCommon: true,
        contratoId: true,
        originCode: true,
        volumeInputM3: true,
        aperturaDeclaradaAt: true,
        contrato: { select: { codigo: true, deletedAt: true } },
        _count: { select: { reprocesosEntrada: true, consumos: true, trozasConsumidas: true } },
      },
    });
    if (!corrida) {
      throw new CtpInvariantError("Esa corrida no existe en este negocio.", "TENANT_MISMATCH", { corridaId });
    }
    const nro = `N° ${corrida.lineNo}`;
    if (corrida.section !== "produccion" || corrida.status !== "registrado") {
      throw new CtpInvariantError(
        `La línea ${nro} no es una corrida vigente: no se le vincula madera.`,
        "LINEA_NO_EDITABLE",
        { corridaId },
      );
    }
    /* La corrida ANTES que sus trozas: con un doble clic, «estas trozas ya
       entraron a una corrida» es cierto pero confunde —entraron a ÉSTA—, y a una
       de inventario hay que decirle «apertura», no el problema de una pieza.
       `vincularCorridaEnTx` vuelve a mirar volumen, consumos, lotes y piezas
       bajo el mismo lock; el reproceso (la otra arista de `corridaSinOrigen`)
       sólo se mira acá. */
    const lotesPrevios = await tx.forestLoteAserrio.count({
      where: { tenantId, produccionEntryId: corridaId, deletedAt: null },
    });
    const yaTiene =
      corrida.aperturaDeclaradaAt != null
        ? "está declarada como madera de antes del libro (apertura)"
        : corrida._count.reprocesosEntrada > 0
          ? "ya sale de otra corrida (reproceso)"
          : corrida._count.consumos > 0 || corrida._count.trozasConsumidas > 0
            ? "ya quedó vinculada con su madera"
            : lotesPrevios > 0 || Number(corrida.volumeInputM3 ?? 0) > 0
              ? "ya declara materia prima sin trozas (lote de inventario): decláralo como apertura"
              : null;
    if (yaTiene) {
      throw new CtpInvariantError(`La corrida ${nro} ${yaTiene}: no se le vinculan trozas.`, "LINEA_NO_EDITABLE", {
        corridaId,
      });
    }
    const especie = corrida.speciesCommon?.trim() || "";
    if (!claveEspecie(especie)) {
      throw new CtpInvariantError(
        `La corrida ${nro} no dice su especie: complétala antes de vincularle trozas.`,
        "VALIDACION",
        { corridaId },
      );
    }
    const permisoCorrida = permisoDe(corrida.contratoId, corrida.contrato, corrida.originCode);

    // ── 2. Los lotes donde están hoy las trozas, bloqueados en orden ──────
    const antes = await tx.woodEntryTroza.findMany({
      where: { tenantId, id: { in: pedidas } },
      select: { id: true, loteAserrioId: true },
    });
    const halladas = new Set(antes.map((t) => t.id));
    const faltan = pedidas.filter((id) => !halladas.has(id));
    if (faltan.length > 0) {
      throw new CtpInvariantError(
        `${faltan.length === 1 ? "Una troza elegida no existe" : `${faltan.length} trozas elegidas no existen`} en este negocio.`,
        "TENANT_MISMATCH",
        { trozas: faltan },
      );
    }
    const loteAntes = new Map(antes.map((t) => [t.id, t.loteAserrioId]));
    const lotesAntes = [...new Set(antes.map((t) => t.loteAserrioId).filter((id): id is string => Boolean(id)))];
    if (lotesAntes.length > 0) {
      await tx.$queryRaw`
        SELECT "id" FROM "ForestLoteAserrio"
        WHERE "id" = ANY(${lotesAntes}::text[]) AND "tenantId" = ${tenantId}
        ORDER BY "id"
        FOR UPDATE
      `;
    }

    // ── 3. Las trozas, bloqueadas en orden ANTES de leerlas (T1) ─────────
    await tx.$queryRaw`
      SELECT "id" FROM "WoodEntryTroza"
      WHERE "id" = ANY(${pedidas}::text[]) AND "tenantId" = ${tenantId}
      ORDER BY "id"
      FOR UPDATE
    `;
    const filas = await tx.woodEntryTroza.findMany({ where: { tenantId, id: { in: pedidas } }, select: SELECT_TROZA });
    const movidas = filas.filter((t) => t.loteAserrioId !== loteAntes.get(t.id));
    if (movidas.length > 0) {
      throw new CtpInvariantError(
        "Otra persona movió estas trozas de lote mientras vinculabas: vuelve a intentar.",
        "T1_TROZA_NO_CONSUMIBLE",
        { trozas: movidas.map((t) => t.id) },
      );
    }
    /* I2 lo decide `setConsumosEnTx` bajo lock de la guía: acá no hace falta
       el consumo previo de cada fila. */
    const vivas = await corridasVivasDeLotes(tx, tenantId, filas);
    const trozas = filas.map((f) => ({ f, t: trozaParaDiagnostico(leida(f, new Map(), vivas)) }));

    // ── 4. Las reglas que el vinculador de lotes no ve ────────────────────
    const corridaParaReglas = { especie, permiso: permisoCorrida };
    const problemas = trozas
      .map(({ t }) => ({ id: t.id, codigo: t.codigo ?? t.id, motivo: problemaAlVincular(corridaParaReglas, t) }))
      .filter((p): p is { id: string; codigo: string; motivo: string } => p.motivo != null);
    if (problemas.length > 0) {
      const nombradas = problemas
        .slice(0, NOMBRADAS)
        .map((p) => `${p.codigo} (${p.motivo})`)
        .join("; ");
      const resto = problemas.length > NOMBRADAS ? ` y ${problemas.length - NOMBRADAS} más` : "";
      throw new CtpInvariantError(
        `${problemas.length === 1 ? "Esta troza no puede entrar" : `${problemas.length} trozas no pueden entrar`} ` +
          `a la corrida ${nro}: ${nombradas}${resto}. Quítalas de la selección y vuelve a confirmar.`,
        "T1_TROZA_NO_CONSUMIBLE",
        { trozas: problemas },
      );
    }
    /* Una corrida sale de UN permiso. Si la corrida no dice el suyo, las trozas
       no pueden traer dos: el lote que se arma sería de dos títulos. */
    const permisos = [...new Set(trozas.map(({ t }) => clavePermiso(t.permiso)).filter((p): p is string => Boolean(p)))];
    if (permisos.length > 1) {
      throw new CtpInvariantError(
        `Las trozas elegidas son de ${permisos.length} permisos (${permisos.slice(0, 3).join(", ")}): ` +
          "una corrida sale de un solo permiso. Elige las de uno.",
        "VALIDACION",
        { permisos },
      );
    }

    // ── 5. Agrupar: las de un lote abierto van con él, las sueltas a uno nuevo ──
    const partes = new Map<string, string[]>();
    const sueltas: typeof trozas = [];
    for (const x of trozas) {
      if (x.t.lote) partes.set(x.t.lote.id, [...(partes.get(x.t.lote.id) ?? []), x.t.id]);
      else sueltas.push(x);
    }
    const nPartes = partes.size + (sueltas.length > 0 ? 1 : 0);
    if (nPartes > MAX_PARTES_POR_CORRIDA) {
      throw new CtpInvariantError(
        `Las trozas elegidas están repartidas en ${nPartes} lotes: una corrida se vincula con hasta ${MAX_PARTES_POR_CORRIDA}.`,
        "VALIDACION",
        { partes: nPartes },
      );
    }

    let loteNuevo: Escrito["loteNuevo"] = null;
    if (sueltas.length > 0) {
      /* El permiso ÚNICO del grupo (ya se verificó que hay a lo sumo uno), no
         el de la primera troza: si su guía no traía código, el lote quedaba
         sin permiso aunque las otras lo tuvieran. */
      const delGrupo = trozas.map(({ t }) => t.permiso).find((p) => clavePermiso(p));
      const m3Sueltas = r4(sueltas.reduce((a, x) => a + x.t.m3, 0));
      /* Liberadas = en un lote CONSUMIDO por una corrida que se anuló
         (`liberadaDeSuLote`): su madera volvió al patio y se mueve de ahí. */
      const muertos = [
        ...new Set(
          sueltas
            .map((x) => x.f.loteAserrio)
            .filter((l) => l && !l.deletedAt && l.status !== "abierto")
            .map((l) => l!.id),
        ),
      ];
      const liberadas = sueltas.filter((x) => x.f.loteAserrioId && muertos.includes(x.f.loteAserrioId)).length;
      const lote = await ForestLoteAserrioDB.crearEnTx(tx, tenantId, {
        speciesCommon: especie,
        /* El permiso de la corrida, o el que traen todas sus trozas: el lote es
           de un título (ADR-393). `contratoId` explícito —aunque sea `null`—
           para que el alta no lo busque con el cliente de afuera. */
        permiso: permisoCorrida.codigo ?? delGrupo?.codigo ?? null,
        contratoId: permisoCorrida.contratoId ?? delGrupo?.contratoId ?? null,
        notes: `Armado al vincular la corrida ${nro} con sus trozas (${sueltas.length} · ${m3(m3Sueltas)}).`,
        createdBy: usuario,
      });
      /* La condición va en el WHERE: si otra vía la metió en un mixto o en otro
         lote entre el lock y acá, el conteo no cierra y todo vuelve atrás. */
      const { count } = await tx.woodEntryTroza.updateMany({
        where: {
          tenantId,
          id: { in: sueltas.map((x) => x.t.id) },
          loteMixtoId: null,
          OR: [{ loteAserrioId: null }, ...(muertos.length > 0 ? [{ loteAserrioId: { in: muertos } }] : [])],
        },
        data: { loteAserrioId: lote.id },
      });
      if (count !== sueltas.length) {
        throw new CtpInvariantError(
          "Otra persona movió estas trozas mientras vinculabas: vuelve a intentar.",
          "T1_TROZA_NO_CONSUMIBLE",
          { esperadas: sueltas.length, movidas: count },
        );
      }
      partes.set(
        lote.id,
        sueltas.map((x) => x.t.id),
      );
      loteNuevo = { id: lote.id, code: lote.code, trozas: sueltas.length, m3: m3Sueltas, liberadas };
    }

    // ── 6. La vinculación de siempre: T1, T3, volumen, I1/I2, mes cerrado ──
    const vinculo = await ForestVincularCorridaDB.vincularCorridaEnTx(
      tx,
      tenantId,
      { corridaId, partes: [...partes.entries()].map(([loteId, trozaIds]) => ({ loteId, trozaIds })) },
      usuario,
      { cierres },
    );
    return { vinculo, lineNo: corrida.lineNo, especie, loteNuevo };
  }
}
