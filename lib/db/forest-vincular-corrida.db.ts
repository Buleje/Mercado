/**
 * VINCULAR una corrida sin origen con las trozas de UNO O MÁS lotes (ADR-441).
 *
 * El caso: lo que salió de la sierra se cubicó en «Producir sin lote» y se
 * declaró (ADR-429) — una corrida por especie, **sin materia prima**. La madera
 * vino de un lote mixto que se repartió en lotes de una especie y un permiso,
 * así que la Mashonaste de dos permisos sale de DOS lotes. `sumarACorrida`
 * admite un lote y una pasada: esto admite hasta seis, en un solo acto.
 *
 * ## Todo en UNA transacción (lo que `sumarACorrida` no hace)
 *
 * El consumo vive en dos lugares —m³ por guía y piezas— y son dos caras del
 * mismo hecho. `sumarACorrida` bloquea la corrida pero NO las trozas, escribe el
 * volumen en una transacción, los consumos en otra y las piezas en una tercera:
 * dos vinculaciones simultáneas de la misma troza no se ven, y si la tercera
 * falla quedan m³ atribuidos sin piezas. Acá va todo junto, con este orden de
 * locks (el mismo que usa la recepción: troza antes que guía):
 *
 *   corrida → lotes (`ORDER BY id`) → trozas (`ORDER BY id`) → guías (I2, dentro
 *   de `setConsumosEnTx`)
 *
 * ## Las reglas
 *
 *  · La corrida no tiene origen (ADR-364/408): ni volumen de entrada, ni
 *    consumos, ni lote, ni piezas, ni declarada como existencia de apertura.
 *  · Cada lote está abierto y es de la especie de la corrida (L-A1).
 *  · Cada troza está en el lote que se cita y sigue libre (T1, ADR-325): ni
 *    consumida por una corrida viva, ni despachada, ni de guía anulada o sin
 *    recibir, ni descarte, ni madre retrozada, ni sin volumen.
 *  · T3: ninguna troza entró al patio después de la fecha de la corrida.
 *  · El permiso (ADR-447): cada lote, y la guía de cada troza, es del título
 *    habilitante de la corrida (`mismoPermiso`; sin dato en una punta no se
 *    afirma que difieren). Antes sólo lo miraba `vincularTrozas`, y la acción
 *    `vincular-corrida` de Lotes llegaba acá sin ese control.
 *  · Mes cerrado y costo congelado bloquean.
 *  · Producido ≤ trozas (10 litros de tolerancia): de la sierra no sale más de
 *    lo que entró. El 56 % avisa (`sobreElTope`) y se guarda el rendimiento REAL.
 *  · I1/I2 por guía los valida `setConsumosEnTx`: la regla vive una sola vez.
 *
 * Todo o nada: una sola troza que no puede entrar rechaza el pedido entero y lo
 * dice por su código. La pantalla propone (`planDelMixto`); el servidor decide.
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { formatNumber } from "@/lib/format";
import { auditCtpEsperando, m3 } from "@/lib/forestal/ctp-audit";
import { closedPeriodOf, type CtpCierrePeriodo } from "@/lib/forestal/ctp-cierre-types";
import { agruparPorGuia, guiaRecibida } from "@/lib/forestal/consumo-trozas";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { problemaDePartes } from "@/lib/forestal/vincular-desde-mixto";
import {
  pasaElTope,
  rendimientoDeCorrida,
  TOPE_RENDIMIENTO_PCT,
} from "@/lib/forestal/vincular-produccion";
import { diaDelLibro } from "@/lib/forestal/recepcion-antes-de-la-sierra";
import { mismoPermiso, permisoRef, type PermisoRef } from "@/lib/forestal/vincular-trozas";
import {
  CTP_TX_OPTS,
  CtpInvariantError,
  ForestCtpConsumoDB,
  exigirIngresoAntesDeLaCorrida,
  type ConsumosEscritos,
} from "./forest-ctp-consumo.db";
import { ForestCtpCierreDB } from "./forest-ctp-cierre.db";
import { vivaLinea } from "./wood-entries.db";
import { aperturaAlConsumir } from "@/lib/forestal/lote-aserrio-coherencia";
import {
  type ConsumoDeLaCorrida,
  type CorridaParaSoltar,
  type PiezaDeLaCorrida,
  type ResultadoSoltarTrozas,
  type VistaDeSoltar,
  type VistaPreviaDeSoltar,
  MENSAJE_MOTIVO_SOLTAR,
  MOTIVO_MIN_SOLTAR,
  vistaPreviaDeSoltar,
} from "@/lib/forestal/soltar-trozas";
import { limpiarMotivo, motivoLegible } from "@/lib/forestal/motivo";
import { olvidarSimulaciones } from "@/lib/forestal/soltar-trozas-memo";

/** Redondeo a 4 decimales — precisión forestal (m³). */
const r4 = (n: number) => Math.round(n * 10_000) / 10_000 || 0;
/** Diez litros: la tolerancia del patio, no la del float. */
const TOL_M3 = 0.01;
/** Cuántas trozas se nombran en un rechazo; el resto va como «y N más». */
const NOMBRADAS = 5;

export interface ParteAVincular {
  loteId: string;
  trozaIds: string[];
}

export interface VincularCorridaInput {
  corridaId: string;
  /** 1 a 6 lotes, cada uno con las trozas de él que entraron a la sierra. */
  partes: ParteAVincular[];
  /** Día de consumo de las piezas. Sin fecha, el de la corrida (ahí se aserró). */
  fecha?: Date;
}

export interface ResultadoVincularCorrida {
  corridaId: string;
  lineNo: number;
  piezas: number;
  /** m³ de troza que entraron con esta vinculación. */
  volumenM3: number;
  /** `volumeInputM3` de la corrida después (sin origen previo, es el mismo número). */
  volumenTotalM3: number;
  /** `producido ÷ troza × 100`, o `null` si no se puede calcular (sin producción o en PT). */
  rendimientoPct: number | null;
  /** Pasa el 56 % de la plaza: se avisa, no se corrige (ADR-358). */
  sobreElTope: boolean;
  partes: { loteId: string; code: string; piezas: number; volumenM3: number; loteConsumido: boolean }[];
  /** Los lotes que quedaron sin madera libre y se cerraron como consumidos. */
  lotesConsumidos: { id: string; code: string }[];
  /** El consumo por guía que quedó escrito (I2). */
  consumos: { woodEntryId: string; gtfNumber: string; volumenM3: number }[];
}

/** La corrida bajo lock: lo que decide si se puede vincular. */
interface CorridaBloqueada {
  id: string;
  lineNo: number;
  section: string;
  status: string;
  quantity: Prisma.Decimal | null;
  volumeInputM3: Prisma.Decimal | null;
  speciesCommon: string | null;
  /* El denominador sólo vale si las dos puntas están en m³. */
  unit: string | null;
  entryDate: Date;
  aperturaDeclaradaAt: Date | null;
  /** El título habilitante de la corrida (ADR-421/447): contrato o código escrito. */
  contratoId: string | null;
  originCode: string | null;
}

/** Lo que `vincularCorridaEnTx` escribió: lo que `despuesDeVincular` narra y devuelve. */
export interface VinculoEscrito {
  corridaId: string;
  corrida: Pick<CorridaBloqueada, "lineNo" | "speciesCommon">;
  porParte: { loteId: string; code: string; trozaIds: string[]; piezas: number; volumenM3: number }[];
  volumenTotal: number;
  rendimientoPct: number | null;
  lotesConsumidos: { id: string; code: string }[];
  escritos: ConsumosEscritos;
}

/** La troza como la lee el vinculador: lo que decide si puede entrar. */
const SELECT_TROZA = {
  id: true,
  woodEntryId: true,
  loteAserrioId: true,
  especieComun: true,
  volumenM3: true,
  consumidaEnId: true,
  /* El ESTADO de la corrida que la tomó, no el id pelado: una corrida anulada
     devolvió la madera al patio (regla forestal-serfor). */
  consumidaEn: { select: { status: true, deletedAt: true } },
  despachadaEn: { select: { status: true, deletedAt: true } },
  noRecepcionada: true,
  descarte: true,
  fechaRecepcion: true,
  codigoPlanta: true,
  codificacion: true,
  _count: { select: { retrozos: true } },
  entry: {
    select: {
      status: true,
      deletedAt: true,
      fechaRecepcion: true,
      gtfNumber: true,
      entryDate: true,
      /* El permiso de la guía (ADR-447): la verdad de qué título ampara la pieza. */
      contratoId: true,
      originCode: true,
      contrato: { select: { codigo: true, deletedAt: true } },
    },
  },
} satisfies Prisma.WoodEntryTrozaSelect;

type TrozaLeida = Prisma.WoodEntryTrozaGetPayload<{ select: typeof SELECT_TROZA }>;

const codigoDe = (t: Pick<TrozaLeida, "id" | "codigoPlanta" | "codificacion">) =>
  t.codigoPlanta?.trim() || t.codificacion?.trim() || t.id;

/**
 * Por qué una troza no puede entrar a la sierra. `null` = puede.
 *
 * Es la regla de `motivoNoElegible` (lote de aserrío, L-A2) con una diferencia
 * a propósito: la troza tomada por una corrida ANULADA está libre. El motivo
 * dice el camino, no un «no se puede» pelado.
 */
function motivoNoVinculable(t: TrozaLeida): string | null {
  if (t.consumidaEnId && vivaLinea(t.consumidaEn)) return "ya entró a una corrida";
  if (vivaLinea(t.despachadaEn)) return "ya se despachó sin aserrar";
  if (t.entry.deletedAt || ["anulado", "rechazado"].includes(t.entry.status)) {
    return "la guía de ingreso está anulada o rechazada";
  }
  if (t.noRecepcionada) return "no llegó al patio";
  if (
    !guiaRecibida({
      estado: t.entry.status,
      fechaRecepcionGuia: t.entry.fechaRecepcion,
      fechaRecepcionTroza: t.fechaRecepcion,
    })
  ) {
    return `la guía ${t.entry.gtfNumber} todavía no se recibió en el patio: recepciónala en Ingresos`;
  }
  if (t.descarte) return "es descarte del retrozado";
  if (t._count.retrozos > 0) return "se cortó en pedazos: vincula los pedazos";
  if (!(Number(t.volumenM3 ?? 0) > 0)) return "no tiene volumen registrado";
  return null;
}

/**
 * El permiso de la corrida bloqueada: su contrato VIVO si lo tiene, si no el
 * código escrito (`permisoRef`, la misma regla que `vincularTrozas`). El
 * contrato sólo se lee si la corrida lo cita.
 */
async function permisoDeLaCorrida(
  tx: Prisma.TransactionClient,
  tenantId: string,
  corrida: Pick<CorridaBloqueada, "contratoId" | "originCode">,
): Promise<PermisoRef> {
  const contrato = corrida.contratoId
    ? await tx.forestContrato.findFirst({
        where: { id: corrida.contratoId, tenantId },
        select: { codigo: true, deletedAt: true },
      })
    : null;
  return permisoRef(corrida.contratoId ?? null, contrato, corrida.originCode ?? null);
}

/**
 * Las tres vistas que cambian cuando una corrida gana o pierde su madera: el
 * libro, los lotes y el patio. Una sola lista para vincular y para soltar.
 */
function invalidarVistasDelVinculo(tenantId: string): void {
  /* Y las simulaciones de «Soltar trozas» guardadas: leyeron el patio de antes. */
  olvidarSimulaciones(tenantId);
  for (const prefijo of ["forest-ctp", "forestal:lote-aserrio", "wood-entries"]) {
    try {
      invalidateByPrefix(`${prefijo}:${tenantId}`);
    } catch {
      /* cache best-effort */
    }
  }
}

type Db = typeof prisma | Prisma.TransactionClient;

/** Una pieza de la corrida como la lee «Soltar trozas». */
const SELECT_PIEZA_SOLTAR = {
  id: true,
  woodEntryId: true,
  codigoPlanta: true,
  codificacion: true,
  especieComun: true,
  volumenM3: true,
  fechaConsumo: true,
  loteAserrioId: true,
  entry: { select: { gtfNumber: true } },
  loteAserrio: { select: { id: true, code: true, status: true, produccionEntryId: true, deletedAt: true } },
} satisfies Prisma.WoodEntryTrozaSelect;

type PiezaLeida = Prisma.WoodEntryTrozaGetPayload<{ select: typeof SELECT_PIEZA_SOLTAR }>;

const piezaDe = (t: PiezaLeida, corridaId: string): PiezaDeLaCorrida => ({
  id: t.id,
  woodEntryId: t.woodEntryId,
  gtfNumber: t.entry.gtfNumber,
  codigo: t.codigoPlanta?.trim() || t.codificacion?.trim() || null,
  especie: t.especieComun,
  m3: Number(t.volumenM3 ?? 0) || 0,
  fechaConsumo: t.fechaConsumo ? diaDelLibro(t.fechaConsumo) : null,
  lote: t.loteAserrio
    ? {
        id: t.loteAserrio.id,
        code: t.loteAserrio.code,
        status: t.loteAserrio.status,
        deEstaCorrida: t.loteAserrio.produccionEntryId === corridaId,
        borrado: t.loteAserrio.deletedAt != null,
      }
    : null,
});

/**
 * La corrida con sus piezas y sus m³ por guía: la MISMA lectura para la vista
 * previa (cliente global) y para la decisión (dentro de la tx, bajo lock).
 * `null` = no existe en este negocio (o está borrada).
 */
async function leerParaSoltar(
  db: Db,
  tenantId: string,
  corridaId: string,
  cierres: CtpCierrePeriodo[],
): Promise<(VistaDeSoltar & { section: string; status: string; entryDate: Date; piezasLeidas: PiezaLeida[] }) | null> {
  const c = await db.forestCtpEntry.findFirst({
    where: { id: corridaId, tenantId, deletedAt: null },
    select: {
      id: true,
      lineNo: true,
      section: true,
      status: true,
      entryDate: true,
      speciesCommon: true,
      quantity: true,
      unit: true,
      volumeInputM3: true,
      rendimientoPct: true,
    },
  });
  if (!c) return null;
  /* En serie: dentro de una tx es UNA conexión. */
  const filas = await db.woodEntryTroza.findMany({
    where: { tenantId, consumidaEnId: corridaId },
    select: SELECT_PIEZA_SOLTAR,
    orderBy: [{ woodEntryId: "asc" }, { orden: "asc" }],
  });
  const consumos = await db.forestCtpConsumo.findMany({
    where: { tenantId, ctpEntryId: corridaId },
    select: { woodEntryId: true, volumeM3: true, congeladoAt: true, woodEntry: { select: { gtfNumber: true } } },
  });
  const corrida: CorridaParaSoltar = {
    id: c.id,
    lineNo: c.lineNo,
    fecha: diaDelLibro(c.entryDate) ?? "",
    especie: c.speciesCommon,
    producido: c.quantity == null ? null : Number(c.quantity),
    unit: c.unit,
    volumenEntradaM3: c.volumeInputM3 == null ? null : Number(c.volumeInputM3),
    rendimientoPct: c.rendimientoPct == null ? null : Number(c.rendimientoPct),
    congelado: consumos.some((x) => x.congeladoAt != null),
    mesCerrado: closedPeriodOf(cierres, c.entryDate)?.label ?? null,
  };
  const deConsumo: ConsumoDeLaCorrida[] = consumos.map((x) => ({
    woodEntryId: x.woodEntryId,
    gtfNumber: x.woodEntry.gtfNumber,
    m3: Number(x.volumeM3),
  }));
  return {
    corrida,
    piezas: filas.map((t) => piezaDe(t, corridaId)),
    consumos: deConsumo,
    section: c.section,
    status: c.status,
    entryDate: c.entryDate,
    piezasLeidas: filas,
  };
}

export interface SoltarTrozasInput {
  corridaId: string;
  trozaIds: string[];
  motivo: string;
}

/** Lo que `soltarTrozasEnTx` escribió: lo que `despuesDeSoltar` narra y devuelve. */
export interface SoltadoEscrito {
  corridaId: string;
  corrida: { lineNo: number; speciesCommon: string | null };
  vista: VistaPreviaDeSoltar;
  /** Código de cada pieza suelta, para el renglón del libro. */
  codigos: string[];
  motivo: string;
  escritos: ConsumosEscritos;
}

export class ForestVincularCorridaDB {
  /**
   * Vincula la corrida con las trozas de sus lotes, todo o nada.
   *
   * Escribe, en una transacción: el volumen de entrada y el rendimiento de la
   * corrida, el consumo por guía (`setConsumosEnTx`, I1/I2), las piezas
   * (`consumidaEnId`) y el cierre de cada lote que se quedó sin madera libre.
   * La auditoría y la caché van después del commit, y la auditoría se espera
   * antes de responder.
   */
  static async vincularCorrida(
    tenantId: string,
    input: VincularCorridaInput,
    usuario: string,
  ): Promise<ResultadoVincularCorrida> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!usuario?.trim()) throw new Error("usuario is required");
    /* Los cierres, ANTES de abrir la transacción: son un KV que se lee con el
       cliente global, y adentro pedirían otra conexión con la de la tx tomada. */
    const cierres = await ForestCtpCierreDB.list(tenantId);
    const escrito = await prisma.$transaction(
      (tx) => ForestVincularCorridaDB.vincularCorridaEnTx(tx, tenantId, input, usuario, { cierres }),
      CTP_TX_OPTS,
    );
    return ForestVincularCorridaDB.despuesDeVincular(tenantId, escrito, usuario);
  }

  /**
   * El núcleo de `vincularCorrida` DENTRO de una transacción ajena.
   *
   * Existe para que otra escritura pueda COMPONERSE con la vinculación en un
   * solo acto (la decisión 3 de ADR-441: repartir el mixto y vincular juntos).
   * Hoy ninguna función del servidor la compone: la pantalla hace dos pedidos,
   * primero `repartir` (su propio acto atómico, `ForestLoteMixtoDB.repartir`) y
   * después `vincularCorrida`. Si la vinculación se rechaza, el mixto queda
   * repartido en lotes válidos y la madera sigue en ellos: no se pierde nada,
   * sólo falta volver a vincular.
   *
   * Quien la componga lee los `cierres` antes de abrir la transacción y llama
   * después a `despuesDeVincular` con lo que devuelve, ya fuera de ella.
   */
  static async vincularCorridaEnTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    input: VincularCorridaInput,
    usuario: string,
    { cierres }: { cierres: CtpCierrePeriodo[] },
  ): Promise<VinculoEscrito> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!usuario?.trim()) throw new Error("usuario is required");
    const { corridaId, fecha } = input;
    if (!corridaId?.trim()) {
      throw new CtpInvariantError("Falta la corrida a vincular.", "VALIDACION");
    }
    const partes = input.partes.map((p) => ({ loteId: p.loteId, trozaIds: [...p.trozaIds] }));
    /* Un pedido mal armado (lote repetido, troza en dos partes) se dice antes
       de tocar la base: no es un problema del patio. */
    const problema = problemaDePartes(partes);
    if (problema) throw new CtpInvariantError(problema, "VALIDACION");

    const trozaIds = partes.flatMap((p) => p.trozaIds);
    const loteIds = partes.map((p) => p.loteId);
    const loteDeTroza = new Map(partes.flatMap((p) => p.trozaIds.map((id) => [id, p.loteId] as const)));

    // ── 1. La corrida, bloqueada antes de leerla ─────────────────────────
    const bloqueada = await tx.$queryRaw<CorridaBloqueada[]>`
      SELECT "id", "lineNo", "section", "status", "quantity", "volumeInputM3",
             "speciesCommon", "unit", "entryDate", "aperturaDeclaradaAt",
             "contratoId", "originCode"
      FROM "ForestCtpEntry"
      WHERE "id" = ${corridaId} AND "tenantId" = ${tenantId} AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    const corrida = bloqueada[0];
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
    /* La existencia de apertura (ADR-394) ES un origen declarado: madera
       anterior al libro. Atarle trozas diría dos orígenes del mismo producto. */
    if (corrida.aperturaDeclaradaAt) {
      throw new CtpInvariantError(
        `La corrida ${nro} está declarada como existencia de apertura (madera anterior al libro). ` +
          "Si esta madera sí salió del patio, deshaz esa declaración en su ficha y vuelve a vincular.",
        "LINEA_NO_EDITABLE",
        { corridaId },
      );
    }

    /* La puerta del ADR-364 con la excepción del ADR-408: sólo se completa
       una corrida que no tiene NINGÚN origen. Cuatro señales, porque una sola
       deja pasar a la que tiene consumos con el volumen sin escribir, o piezas
       marcadas sin consumos. */
    /* En serie, no con `Promise.all`: una transacción es UNA conexión, y pg
       ya avisa que encolar consultas en paralelo sobre ella se deja de admitir. */
    const consumosPrevios = await tx.forestCtpConsumo.count({ where: { tenantId, ctpEntryId: corridaId } });
    const lotesPrevios = await tx.forestLoteAserrio.count({
      where: { tenantId, produccionEntryId: corridaId, deletedAt: null },
    });
    const piezasPrevias = await tx.woodEntryTroza.count({ where: { tenantId, consumidaEnId: corridaId } });
    const volumenPrevio = corrida.volumeInputM3 == null ? 0 : Number(corrida.volumeInputM3);
    if (volumenPrevio > 0 || consumosPrevios > 0 || lotesPrevios > 0 || piezasPrevias > 0) {
      throw new CtpInvariantError(
        `La corrida ${nro} ya tiene materia prima: vincularle más le cambiaría el rendimiento. ` +
          "Registra la madera nueva en una corrida aparte, o anula esta y rehazla.",
        "LINEA_NO_EDITABLE",
        { corridaId, volumenPrevio, consumosPrevios, lotesPrevios, piezasPrevias },
      );
    }

    // ── 2. Cierre de período (ADR-139): el consumo ES la corrida ─────────
    const cerrado = closedPeriodOf(cierres, corrida.entryDate);
    if (cerrado) {
      throw new CtpInvariantError(
        `El período ${cerrado.label} está cerrado: no se puede vincular madera a una corrida de un mes cerrado. ` +
          "Reabre el período para corregir.",
        "PERIODO_CERRADO",
        { periodKey: cerrado.periodKey },
      );
    }
    /* El día de consumo de las piezas: sin fecha, el de la corrida (ahí se
       aserró). Con fecha, nunca DESPUÉS de la corrida — la producción no sale
       antes de que entre la madera (regla 4 de ADR-408) — y T3 se mide contra
       él, que es el día que el libro va a decir que la troza entró a la sierra. */
    const fechaConsumo = fecha ?? corrida.entryDate;
    const diaConsumo = diaDelLibro(fechaConsumo) ?? "";
    const diaCorrida = diaDelLibro(corrida.entryDate) ?? "";
    if (fecha && diaCorrida && diaConsumo > diaCorrida) {
      throw new CtpInvariantError(
        `El día de consumo (${diaConsumo}) es posterior a la corrida ${nro} (${diaCorrida}): ` +
          "la madera entra a la sierra antes de que salga la producción. Usa el día de la corrida o uno anterior.",
        "VALIDACION",
        { fecha: diaConsumo, fechaCorrida: diaCorrida },
      );
    }
    if (fecha) {
      const cerradoFecha = closedPeriodOf(cierres, fecha);
      if (cerradoFecha) {
        throw new CtpInvariantError(
          `El día de consumo cae en ${cerradoFecha.label}, que está cerrado. Usa un día de un mes abierto o deja el de la corrida.`,
          "PERIODO_CERRADO",
          { periodKey: cerradoFecha.periodKey },
        );
      }
    }

    // ── 3. Los lotes, bloqueados en orden: su estado decide al final ─────
    await tx.$queryRaw`
      SELECT "id" FROM "ForestLoteAserrio"
      WHERE "id" = ANY(${loteIds}::text[]) AND "tenantId" = ${tenantId} AND "deletedAt" IS NULL
      ORDER BY "id"
      FOR UPDATE
    `;
    const lotes = await tx.forestLoteAserrio.findMany({
      where: { id: { in: loteIds }, tenantId, deletedAt: null },
      select: {
        id: true,
        code: true,
        status: true,
        speciesCommon: true,
        permiso: true,
        contratoId: true,
        contrato: { select: { codigo: true, deletedAt: true } },
      },
    });
    const lotePorId = new Map(lotes.map((l) => [l.id, l]));
    const faltanLotes = loteIds.filter((id) => !lotePorId.has(id));
    if (faltanLotes.length > 0) {
      throw new CtpInvariantError(
        faltanLotes.length === 1
          ? "Uno de los lotes elegidos no existe o ya se deshizo."
          : `${faltanLotes.length} de los lotes elegidos no existen o ya se deshicieron.`,
        "LOTE_NO_ENCONTRADO",
        { lotes: faltanLotes },
      );
    }
    const especieCorrida = claveEspecie(corrida.speciesCommon);
    const especieBase = especieCorrida || claveEspecie(lotes[0]?.speciesCommon);
    for (const l of lotes) {
      if (l.status !== "abierto") {
        throw new CtpInvariantError(
          `El lote ${l.code} ya está ${l.status}: sólo un lote abierto se vincula.`,
          "LOTE_NO_EDITABLE",
          { loteId: l.id, status: l.status },
        );
      }
      /* L-A1 llevada a la corrida: un asiento es de UNA especie, o el Cuadro
         Resumen por especie deja de poder armarse. */
      if (claveEspecie(l.speciesCommon) !== especieBase) {
        throw new CtpInvariantError(
          especieCorrida
            ? `El lote ${l.code} es de ${l.speciesCommon} y la corrida ${nro} es de ${corrida.speciesCommon}: de una madera no sale la otra.`
            : `Los lotes elegidos son de especies distintas (${lotes.map((x) => `${x.code}: ${x.speciesCommon}`).join(", ")}): una corrida es de una sola especie.`,
          "LOTE_NO_EDITABLE",
          { loteId: l.id },
        );
      }
    }

    /* El permiso (ADR-447), bajo el lock de los lotes: una corrida sale de la
       madera de SU título habilitante. Sin dato en una punta no se afirma que
       difieren (el lote «de todos» de ADR-393, la corrida vieja sin permiso):
       para eso está la guía de cada troza, que se mira más abajo. */
    const permisoCorrida = await permisoDeLaCorrida(tx, tenantId, corrida);
    const nombrePermiso = (p: PermisoRef) => p.codigo ?? "sin código";
    for (const l of lotes) {
      const permisoLote = permisoRef(l.contratoId, l.contrato, l.permiso);
      if (!mismoPermiso(permisoLote, permisoCorrida)) {
        throw new CtpInvariantError(
          `El lote ${l.code} es del permiso ${nombrePermiso(permisoLote)} y la corrida ${nro} es del ${nombrePermiso(permisoCorrida)}: ` +
            "una corrida sale de la madera de su permiso. Elige un lote de su permiso o corrige el permiso de la corrida.",
          "PERMISO_DISTINTO",
          { loteId: l.id, permisoLote: permisoLote.codigo, permisoCorrida: permisoCorrida.codigo },
        );
      }
    }

    // ── 4. Las trozas, bloqueadas en orden ANTES de leerlas (T1) ─────────
    await tx.$queryRaw`
      SELECT "id" FROM "WoodEntryTroza"
      WHERE "id" = ANY(${trozaIds}::text[]) AND "tenantId" = ${tenantId}
      ORDER BY "id"
      FOR UPDATE
    `;
    const trozas = await tx.woodEntryTroza.findMany({
      where: { tenantId, id: { in: trozaIds } },
      select: SELECT_TROZA,
    });
    /* Lo que queda en los lotes: decide si cada uno se cierra al final. */
    const restoDeLotes = await tx.woodEntryTroza.findMany({
      where: { tenantId, loteAserrioId: { in: loteIds }, id: { notIn: trozaIds } },
      select: SELECT_TROZA,
    });
    const halladas = new Set(trozas.map((t) => t.id));
    const faltan = trozaIds.filter((id) => !halladas.has(id));
    if (faltan.length > 0) {
      throw new CtpInvariantError(
        `${faltan.length === 1 ? "Una troza elegida no existe" : `${faltan.length} trozas elegidas no existen`} en este negocio.`,
        "TENANT_MISMATCH",
        { trozas: faltan },
      );
    }

    const problemas: { id: string; codigo: string; motivo: string }[] = [];
    for (const t of trozas) {
      const loteId = loteDeTroza.get(t.id)!;
      const lote = lotePorId.get(loteId)!;
      let motivo: string | null = null;
      if (t.loteAserrioId !== loteId) {
        const otro = t.loteAserrioId ? lotePorId.get(t.loteAserrioId) : null;
        motivo = otro
          ? `está en el lote ${otro.code}, no en ${lote.code}`
          : t.loteAserrioId
            ? `está en otro lote, no en ${lote.code}`
            : `no está en el lote ${lote.code}`;
      } else if (
        claveEspecie(t.especieComun) &&
        claveEspecie(t.especieComun) !== claveEspecie(lote.speciesCommon)
      ) {
        motivo = `es ${t.especieComun} y el lote ${lote.code} es de ${lote.speciesCommon}`;
      } else {
        motivo = motivoNoVinculable(t);
      }
      if (motivo) problemas.push({ id: t.id, codigo: codigoDe(t), motivo });
    }
    if (problemas.length > 0) {
      const nombradas = problemas
        .slice(0, NOMBRADAS)
        .map((p) => `${p.codigo} (${p.motivo})`)
        .join("; ");
      const resto = problemas.length > NOMBRADAS ? ` y ${problemas.length - NOMBRADAS} más` : "";
      throw new CtpInvariantError(
        `${problemas.length === 1 ? "Esta troza no puede entrar" : `${problemas.length} trozas no pueden entrar`} ` +
          `a la corrida ${nro}: ${nombradas}${resto}. Quítalas de la selección y vuelve a firmar.`,
        "T1_TROZA_NO_CONSUMIBLE",
        { trozas: problemas },
      );
    }

    /* El permiso de la GUÍA de cada troza (ADR-447): un lote «de todos los
       permisos» (ADR-393) puede traer piezas de otro título. La verdad de qué
       permiso ampara la pieza vive en su ingreso. */
    const deOtroPermiso = trozas
      .map((t) => ({ t, p: permisoRef(t.entry.contratoId, t.entry.contrato, t.entry.originCode) }))
      .filter(({ p }) => !mismoPermiso(p, permisoCorrida));
    if (deOtroPermiso.length > 0) {
      const nombradas = deOtroPermiso
        .slice(0, NOMBRADAS)
        .map(({ t, p }) => `${codigoDe(t)} (guía ${t.entry.gtfNumber}: ${nombrePermiso(p)})`)
        .join("; ");
      const resto = deOtroPermiso.length > NOMBRADAS ? ` y ${deOtroPermiso.length - NOMBRADAS} más` : "";
      throw new CtpInvariantError(
        `${deOtroPermiso.length === 1 ? "Esta troza es" : `${deOtroPermiso.length} trozas son`} de otro permiso que la corrida ${nro} ` +
          `(${nombrePermiso(permisoCorrida)}): ${nombradas}${resto}. Quítalas de la selección o corrige el permiso de la corrida.`,
        "PERMISO_DISTINTO",
        { trozas: deOtroPermiso.map(({ t }) => t.id), permisoCorrida: permisoCorrida.codigo },
      );
    }

    /* T3 (ADR-433) bajo el lock y antes de escribir nada. */
    exigirIngresoAntesDeLaCorrida(trozas, { id: corrida.id, lineNo: corrida.lineNo, fecha: fechaConsumo });

    // ── 5. Volumen: de la sierra no sale más de lo que entró ─────────────
    const porParte = partes.map((p) => {
      const suyas = trozas.filter((t) => loteDeTroza.get(t.id) === p.loteId);
      return {
        loteId: p.loteId,
        code: lotePorId.get(p.loteId)!.code,
        trozaIds: suyas.map((t) => t.id),
        piezas: suyas.length,
        volumenM3: r4(suyas.reduce((a, t) => a + Number(t.volumenM3 ?? 0), 0)),
      };
    });
    const volumenTotal = r4(porParte.reduce((a, p) => a + p.volumenM3, 0));
    const declarado = corrida.quantity == null ? null : Number(corrida.quantity);
    const enM3 = (corrida.unit ?? "m3") === "m3";
    if (declarado != null && enM3 && declarado > volumenTotal + TOL_M3) {
      throw new CtpInvariantError(
        `La corrida ${nro} declara ${declarado} m³ de producto y las trozas elegidas suman ${volumenTotal} m³: ` +
          "de la sierra nunca sale más madera de la que entró. Elige más trozas o revisa lo declarado.",
        "VOLUMEN_INSUFICIENTE",
        { declarado, propuesto: volumenTotal },
      );
    }
    /* El número REAL, aunque pase el 56 %: se avisa, no se recorta (ADR-358). */
    const rendimientoPct = rendimientoDeCorrida(declarado, volumenTotal, corrida.unit);

    // ── 6. Escrituras: volumen → consumos por guía → piezas → lotes ──────
    /* El volumen primero: I1 (`Σ atribuido ≤ declarado`) se evalúa contra la
       fila bloqueada dentro de `setConsumosEnTx`. */
    await tx.forestCtpEntry.update({
      where: { id: corridaId, tenantId },
      data: {
        volumeInputM3: new Prisma.Decimal(volumenTotal),
        /* Sin rendimiento calculable no se toca la columna. */
        ...(rendimientoPct != null ? { rendimientoPct: new Prisma.Decimal(rendimientoPct) } : {}),
      },
    });

    const porGuia = agruparPorGuia(
      trozas.map((t) => ({
        id: t.id,
        woodEntryId: t.woodEntryId,
        codificacion: null,
        especieComun: corrida.speciesCommon,
        volumenM3: t.volumenM3 == null ? null : Number(t.volumenM3),
      })),
    );
    const escritos = await ForestCtpConsumoDB.setConsumosEnTx(
      tx,
      tenantId,
      corridaId,
      porGuia.map((g) => ({ woodEntryId: g.woodEntryId, volumeM3: g.volumenM3 })),
      usuario,
      { cierres },
    );

    for (const p of porParte) {
      /* La condición va en el WHERE: si otra vía movió una troza de lote entre
         el lock y acá, el conteo no cierra y todo vuelve atrás. */
      const { count } = await tx.woodEntryTroza.updateMany({
        where: { tenantId, id: { in: p.trozaIds }, loteAserrioId: p.loteId },
        data: { consumidaEnId: corridaId, fechaConsumo },
      });
      if (count !== p.trozaIds.length) {
        throw new CtpInvariantError(
          `Otra operación movió trozas del lote ${p.code} mientras se vinculaba: vuelve a abrir la vinculación.`,
          "T1_TROZA_NO_CONSUMIBLE",
          { loteId: p.loteId, esperadas: p.trozaIds.length, marcadas: count },
        );
      }
    }

    /* El lote se cierra sólo si NO le quedó madera libre: con un consumo
       parcial sigue abierto para la corrida siguiente (como `consumir`). */
    const lotesConsumidos: { id: string; code: string }[] = [];
    for (const p of porParte) {
      const quedan = restoDeLotes.filter((t) => t.loteAserrioId === p.loteId && motivoNoVinculable(t) === null);
      if (quedan.length > 0) continue;
      /* La apertura nunca después del consumo (ADR-443): con «Producir sin
         lote» la corrida es ANTERIOR al lote que se arma al vincular, y sin
         esto el lote volvía a quedar abierto el 28 y aserrado el 26. */
      const abierto = await tx.forestLoteAserrio.findFirst({
        where: { id: p.loteId, tenantId },
        select: { fechaApertura: true },
      });
      await tx.forestLoteAserrio.update({
        where: { id: p.loteId, tenantId },
        data: {
          status: "consumido",
          fechaConsumo,
          produccionEntryId: corridaId,
          ...aperturaAlConsumir(abierto?.fechaApertura, fechaConsumo),
        },
        /* Sin `select`, el RETURNING pide todas las columnas: una columna
           nueva del schema todavía sin migrar tumbaría la vinculación. */
        select: { id: true },
      });
      lotesConsumidos.push({ id: p.loteId, code: p.code });
    }

    return { corridaId, corrida, porParte, volumenTotal, rendimientoPct, lotesConsumidos, escritos };
  }

  /**
   * Lo que va DESPUÉS del commit de `vincularCorridaEnTx`: la caché de las tres
   * vistas que cambian, los dos renglones del libro (consumos y vinculación) y
   * la respuesta.
   *
   * Los renglones se ESPERAN (`auditCtpEsperando`), en serie para que el libro
   * los lea en orden: en Vercel lo que sigue corriendo después de responder
   * puede no terminar, y una vinculación sin su renglón es madera atribuida sin
   * nombre. Nunca tiran: la vinculación ya está escrita.
   */
  static async despuesDeVincular(
    tenantId: string,
    escrito: VinculoEscrito,
    usuario: string,
  ): Promise<ResultadoVincularCorrida> {
    const { corridaId, corrida, porParte, volumenTotal, rendimientoPct, lotesConsumidos, escritos } = escrito;
    /* La caché primero: mientras se escriben los renglones, otra pantalla ya
       tiene que ver la corrida vinculada. */
    invalidarVistasDelVinculo(tenantId);
    await ForestCtpConsumoDB.despuesDeConsumos(tenantId, corridaId, escritos, usuario);
    const piezas = porParte.reduce((a, p) => a + p.piezas, 0);
    const sobreElTope = pasaElTope(rendimientoPct);
    await auditCtpEsperando({
      tenantId,
      action: "ctp_corrida_vincular",
      entity: "ForestCtpEntry",
      entityId: corridaId,
      detail:
        `Vinculó la corrida N° ${corrida.lineNo} (${corrida.speciesCommon ?? "sin especie"}) con ${piezas} troza${piezas === 1 ? "" : "s"}: ` +
        porParte.map((p) => `${p.code} ${p.piezas} pz · ${m3(p.volumenM3)}`).join(" + ") +
        ` = ${m3(volumenTotal)}` +
        (rendimientoPct != null
          ? ` · rendimiento ${rendimientoPct} %${sobreElTope ? ` (sobre el ${TOPE_RENDIMIENTO_PCT} % de la plaza)` : ""}`
          : "") +
        (lotesConsumidos.length > 0 ? ` · quedaron consumidos: ${lotesConsumidos.map((l) => l.code).join(", ")}` : ""),
      user: usuario,
    });

    const consumidos = new Set(lotesConsumidos.map((l) => l.id));
    return {
      corridaId,
      lineNo: corrida.lineNo,
      piezas,
      volumenM3: volumenTotal,
      volumenTotalM3: volumenTotal,
      rendimientoPct,
      sobreElTope,
      partes: porParte.map((p) => ({
        loteId: p.loteId,
        code: p.code,
        piezas: p.piezas,
        volumenM3: p.volumenM3,
        loteConsumido: consumidos.has(p.loteId),
      })),
      lotesConsumidos,
      consumos: escritos.consumos.map((c) => ({
        woodEntryId: c.woodEntryId,
        gtfNumber: c.woodEntry.gtfNumber,
        volumenM3: Number(c.volumeM3),
      })),
    };
  }

  // ── Soltar trozas (ADR-447 §6): el reverso, sin anular la corrida ────────

  /**
   * La corrida con sus piezas y sus m³ por guía, para la vista previa de
   * «Soltar trozas». `null` = no existe en este negocio. Sólo lee.
   */
  static async vistaDeSoltar(tenantId: string, corridaId: string): Promise<VistaDeSoltar | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const cierres = await ForestCtpCierreDB.list(tenantId);
    const leida = await leerParaSoltar(prisma, tenantId, corridaId, cierres);
    if (!leida || leida.section !== "produccion") return null;
    return { corrida: leida.corrida, piezas: leida.piezas, consumos: leida.consumos };
  }

  /**
   * SUELTA piezas de una corrida: vuelven al patio y la corrida conserva lo
   * que produjo. Todo o nada, en UNA transacción; la auditoría (esperada) y la
   * caché, después del commit.
   */
  static async soltarTrozas(
    tenantId: string,
    input: SoltarTrozasInput,
    usuario: string,
  ): Promise<Extract<ResultadoSoltarTrozas, { ok: true }>> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!usuario?.trim()) throw new Error("usuario is required");
    /* Los cierres ANTES de abrir la tx (un KV del cliente global: adentro
       pediría otra conexión con la de la tx tomada). */
    const cierres = await ForestCtpCierreDB.list(tenantId);
    const escrito = await prisma.$transaction(
      (tx) => ForestVincularCorridaDB.soltarTrozasEnTx(tx, tenantId, input, usuario, { cierres }),
      CTP_TX_OPTS,
    );
    return ForestVincularCorridaDB.despuesDeSoltar(tenantId, escrito, usuario);
  }

  /**
   * El núcleo de `soltarTrozas` dentro de una transacción ajena.
   *
   * Orden de locks, el del libro (memoria `orden-de-locks-del-libro`):
   * corrida → lotes de las piezas (`ORDER BY id`) → piezas (`ORDER BY id`) →
   * guías (I2, dentro de `setConsumosEnTx`). Dos pestañas que sueltan la misma
   * pieza se turnan en el lock de la corrida: la segunda ve que ya no está y se
   * rechaza, nunca se resta dos veces.
   *
   * Qué rechaza, y por qué:
   *  · La corrida no vigente, un mes cerrado (el de la corrida o el día en que
   *    la pieza entró a la sierra) y el costo congelado: el acta no se toca.
   *  · Una pieza que no está en ESTA corrida (otra pestaña ya la soltó): el
   *    libro cambió entre la lista y el pedido.
   *  · Lo que queda no alcanza para lo producido: de la sierra no sale más de
   *    lo que entró. El 56 % sólo avisa (ver `lib/forestal/soltar-trozas.ts`).
   *  · Las guías quedarían con más m³ que la materia prima (una atribución
   *    puesta a mano): se corrige primero la atribución.
   *
   * Qué escribe: la materia prima y el rendimiento de la corrida, el m³ por
   * guía (`setConsumosEnTx`, I1/I2 y congelado otra vez), las piezas
   * (`consumidaEnId` y `fechaConsumo` en null) y sus lotes (`destinoDelLote`):
   * el lote abierto las conserva, el que cerró esta corrida y se queda sin
   * piezas de ella se reabre, y del que la corrida sigue usando salen sueltas.
   * La producción —cantidad, paquetes, despachos— no se toca.
   */
  static async soltarTrozasEnTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    input: SoltarTrozasInput,
    usuario: string,
    { cierres }: { cierres: CtpCierrePeriodo[] },
  ): Promise<SoltadoEscrito> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!usuario?.trim()) throw new Error("usuario is required");
    const { corridaId } = input;
    /* La misma regla que el esquema de la ruta (`motivo.ts`): sin invisibles y
       con letras. Otra puerta que llegue acá sin pasar por la ruta no la saltea. */
    const motivo = limpiarMotivo(input.motivo ?? "");
    if (!corridaId?.trim()) throw new CtpInvariantError("Falta la corrida.", "VALIDACION");
    if (!motivoLegible(motivo, MOTIVO_MIN_SOLTAR)) {
      throw new CtpInvariantError(MENSAJE_MOTIVO_SOLTAR, "MOTIVO_REQUERIDO");
    }
    const pedidas = [...new Set(input.trozaIds)];
    if (pedidas.length === 0) throw new CtpInvariantError("Elige al menos una troza para soltar.", "VALIDACION");

    // ── 1. La corrida, bloqueada antes de leerla ─────────────────────────
    const bloqueada = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "ForestCtpEntry"
      WHERE "id" = ${corridaId} AND "tenantId" = ${tenantId} AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    if (bloqueada.length === 0) {
      throw new CtpInvariantError("Esa corrida no existe en este negocio.", "TENANT_MISMATCH", { corridaId });
    }

    // ── 2. Lotes y piezas pedidas, bloqueados en orden ───────────────────
    /* La lectura sin lock sólo dice QUÉ lotes bloquear; bajo lock se relee y
       se compara (si una pieza cambió de lote en el medio, se rechaza). */
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
    const lotesIds = [...new Set(antes.map((t) => t.loteAserrioId).filter((id): id is string => Boolean(id)))];
    if (lotesIds.length > 0) {
      await tx.$queryRaw`
        SELECT "id" FROM "ForestLoteAserrio"
        WHERE "id" = ANY(${lotesIds}::text[]) AND "tenantId" = ${tenantId}
        ORDER BY "id"
        FOR UPDATE
      `;
    }
    await tx.$queryRaw`
      SELECT "id" FROM "WoodEntryTroza"
      WHERE "id" = ANY(${pedidas}::text[]) AND "tenantId" = ${tenantId}
      ORDER BY "id"
      FOR UPDATE
    `;

    // ── 3. Lo que decide, leído bajo lock ────────────────────────────────
    const leida = await leerParaSoltar(tx, tenantId, corridaId, cierres);
    if (!leida) {
      throw new CtpInvariantError("Esa corrida no existe en este negocio.", "TENANT_MISMATCH", { corridaId });
    }
    const { corrida, piezas, consumos } = leida;
    const nro = `N° ${corrida.lineNo}`;
    if (leida.section !== "produccion" || leida.status !== "registrado") {
      throw new CtpInvariantError(
        `La línea ${nro} no es una corrida vigente: no tiene madera que soltar.`,
        "LINEA_NO_EDITABLE",
        { corridaId },
      );
    }
    const cerrado = closedPeriodOf(cierres, leida.entryDate);
    if (cerrado) {
      throw new CtpInvariantError(
        `El período ${cerrado.label} está cerrado: la madera de la corrida ${nro} no se toca. Reabre el período para corregir.`,
        "PERIODO_CERRADO",
        { periodKey: cerrado.periodKey },
      );
    }
    if (corrida.congelado) {
      throw new CtpInvariantError(
        `La corrida ${nro} tiene el costo congelado: su materia prima ya no se cambia.`,
        "CONGELADO",
        { corridaId },
      );
    }

    const suyas = new Map(leida.piezasLeidas.map((t) => [t.id, t]));
    const ajenas = pedidas.filter((id) => !suyas.has(id));
    if (ajenas.length > 0) {
      throw new CtpInvariantError(
        `${ajenas.length === 1 ? "Una de las trozas ya no está" : `${ajenas.length} de las trozas ya no están`} en la corrida ${nro}: ` +
          "otra pantalla la soltó o nunca entró. Vuelve a abrir la lista.",
        "PROPUESTA_DESACTUALIZADA",
        { trozas: ajenas },
      );
    }
    const movidas = pedidas.filter((id) => suyas.get(id)!.loteAserrioId !== loteAntes.get(id));
    if (movidas.length > 0) {
      throw new CtpInvariantError(
        "Otra operación movió estas trozas de lote mientras las soltabas: vuelve a abrir la lista.",
        "PROPUESTA_DESACTUALIZADA",
        { trozas: movidas },
      );
    }
    /* El día en que cada pieza entró a la sierra también cuenta: si cae en un
       mes cerrado, ese mes declaró la pieza aserrada. */
    for (const id of pedidas) {
      const f = suyas.get(id)!.fechaConsumo;
      const cerradoPieza = f ? closedPeriodOf(cierres, f) : null;
      if (cerradoPieza) {
        throw new CtpInvariantError(
          `Una de las trozas entró a la sierra en ${cerradoPieza.label}, que está cerrado: no se suelta. Reabre el período para corregir.`,
          "PERIODO_CERRADO",
          { periodKey: cerradoPieza.periodKey, trozaId: id },
        );
      }
    }

    // ── 4. La decisión: la misma cuenta que la vista previa ──────────────
    const vista = vistaPreviaDeSoltar(corrida, piezas, consumos, pedidas);
    const fm3 = (n: number | null) => (n == null ? "0" : formatNumber(n, 3));
    if (vista.imposible) {
      /* Con TODAS marcadas, «suéltalas todas» no es salida: lo que queda es
         materia prima escrita que no son trozas (volumen del acta). */
      throw new CtpInvariantError(
        vista.despues.piezas === 0
          ? `Ya marcaste todas las trozas de la corrida ${nro} y aun así declara ${fm3(vista.despues.m3)} m³ de materia prima que no son trozas, ` +
              `menos que los ${fm3(corrida.producido)} m³ producidos. Corrige la materia prima en la ficha de la corrida.`
          : `La corrida ${nro} declara ${fm3(corrida.producido)} m³ de producto y le quedarían ${fm3(vista.despues.m3)} m³ de trozas: ` +
              "de la sierra no sale más madera de la que entró. Deja más trozas, o suéltalas todas y la corrida queda sin origen.",
        "VOLUMEN_INSUFICIENTE",
        { producido: corrida.producido, queda: vista.despues.m3, piezasQuedan: vista.despues.piezas },
      );
    }
    if (vista.sobreAtribuido) {
      throw new CtpInvariantError(
        `La corrida ${nro} quedaría con ${fm3(vista.despues.m3)} m³ y más m³ atribuidos a sus guías. ` +
          "Corrige la atribución en la ficha de la corrida antes de soltar estas trozas.",
        "I1_SOBRE_ATRIBUCION",
        { queda: vista.despues.m3 },
      );
    }

    // ── 5. Escrituras: materia prima → m³ por guía → piezas → lotes ──────
    /* La materia prima primero: I1 se evalúa contra la fila bloqueada dentro
       de `setConsumosEnTx`. Sin rendimiento calculable en m³ se limpia (el
       viejo ya no describe esta madera); en otra unidad no se toca. */
    const enM3 = (corrida.unit ?? "m3") === "m3";
    const rendimiento = vista.despues.rendimientoPct;
    await tx.forestCtpEntry.update({
      where: { id: corridaId, tenantId },
      data: {
        volumeInputM3: vista.despues.m3 == null ? null : new Prisma.Decimal(vista.despues.m3),
        ...(rendimiento != null
          ? { rendimientoPct: new Prisma.Decimal(rendimiento) }
          : enM3 || vista.despues.m3 == null
            ? { rendimientoPct: null }
            : {}),
      },
      select: { id: true },
    });
    const escritos = await ForestCtpConsumoDB.setConsumosEnTx(tx, tenantId, corridaId, vista.consumosNuevos, usuario, {
      cierres,
    });

    /* La condición va en el WHERE: si otra vía tocó una pieza entre el lock y
       acá, el conteo no cierra y todo vuelve atrás. */
    const { count } = await tx.woodEntryTroza.updateMany({
      where: { tenantId, id: { in: pedidas }, consumidaEnId: corridaId },
      data: { consumidaEnId: null, fechaConsumo: null },
    });
    if (count !== pedidas.length) {
      throw new CtpInvariantError(
        `Otra operación cambió trozas de la corrida ${nro} mientras las soltabas: vuelve a abrir la lista.`,
        "PROPUESTA_DESACTUALIZADA",
        { esperadas: pedidas.length, soltadas: count },
      );
    }
    for (const l of vista.lotes) {
      const deEste = pedidas.filter((id) => suyas.get(id)!.loteAserrioId === l.loteId);
      if (l.destino === "suelta") {
        const r = await tx.woodEntryTroza.updateMany({
          where: { tenantId, id: { in: deEste }, loteAserrioId: l.loteId },
          data: { loteAserrioId: null },
        });
        if (r.count !== deEste.length) {
          throw new CtpInvariantError(
            `Otra operación movió trozas del lote ${l.code} mientras las soltabas: vuelve a abrir la lista.`,
            "PROPUESTA_DESACTUALIZADA",
            { loteId: l.loteId },
          );
        }
      } else if (l.destino === "reabrir") {
        /* Con la foto en el WHERE: sólo si sigue consumido por ESTA corrida. */
        const r = await tx.forestLoteAserrio.updateMany({
          where: { id: l.loteId, tenantId, deletedAt: null, status: "consumido", produccionEntryId: corridaId },
          data: { status: "abierto", fechaConsumo: null, produccionEntryId: null },
        });
        if (r.count !== 1) {
          throw new CtpInvariantError(
            `El lote ${l.code} cambió mientras soltabas sus trozas: vuelve a abrir la lista.`,
            "PROPUESTA_DESACTUALIZADA",
            { loteId: l.loteId },
          );
        }
        /* El lote reabierto deja de ser el de esta corrida: si su referencia de
           materia prima lo nombraba (`consumir` la escribe con el código), se
           limpia. Sólo si dice EXACTAMENTE ese código: una escrita a mano queda. */
        await tx.forestCtpEntry.updateMany({
          where: { id: corridaId, tenantId, materiaPrimaRef: l.code },
          data: { materiaPrimaRef: null },
        });
      }
    }

    const codigos = pedidas.map((id) => {
      const t = suyas.get(id)!;
      return t.codigoPlanta?.trim() || t.codificacion?.trim() || id;
    });
    return {
      corridaId,
      corrida: { lineNo: corrida.lineNo, speciesCommon: corrida.especie },
      vista,
      codigos,
      motivo,
      escritos,
    };
  }

  /**
   * Lo que va DESPUÉS del commit de `soltarTrozasEnTx`: la caché, los
   * renglones del libro (consumos, la suelta y cada lote reabierto) esperados
   * en serie, y la respuesta. Nunca tira: la suelta ya está escrita.
   */
  static async despuesDeSoltar(
    tenantId: string,
    escrito: SoltadoEscrito,
    usuario: string,
    /** `quitarDeCorrida` (corrida abierta) conserva su acción y su verbo en el libro. */
    { accion = "ctp_corrida_soltar_trozas" }: { accion?: "ctp_corrida_soltar_trozas" | "ctp_corrida_quitar_piezas" } = {},
  ): Promise<Extract<ResultadoSoltarTrozas, { ok: true }>> {
    const { corridaId, corrida, vista, codigos, motivo, escritos } = escrito;
    invalidarVistasDelVinculo(tenantId);
    await ForestCtpConsumoDB.despuesDeConsumos(tenantId, corridaId, escritos, usuario);
    const n = vista.sueltas.piezas;
    const pct = (p: number | null) => (p == null ? "—" : `${formatNumber(p, 2)} %`);
    /* TODOS los códigos: el renglón es lo que un fiscalizador lee para saber
       qué piezas salieron, y «y 4 más» no se puede reconstruir. */
    const nombradas = codigos.join(", ");
    const verbo = accion === "ctp_corrida_quitar_piezas" ? "Sacó" : "Soltó";
    const lotes = vista.lotes
      .map((l) =>
        l.destino === "reabrir"
          ? `${l.code} volvió a quedar abierto`
          : l.destino === "suelta"
            ? `${l.code} sigue con ${l.quedan}; salieron sueltas ${l.piezas}`
            : `${l.code} (abierto) las conserva`,
      )
      .join(" · ");
    await auditCtpEsperando({
      tenantId,
      action: accion,
      entity: "ForestCtpEntry",
      entityId: corridaId,
      detail:
        `${verbo} ${n} troza${n === 1 ? "" : "s"} de la corrida N° ${corrida.lineNo} (${corrida.speciesCommon ?? "sin especie"}) al patio: ` +
        `${nombradas} (${m3(vista.sueltas.m3)}) · materia prima ${m3(vista.antes.m3 ?? 0)} → ` +
        (vista.quedaSinOrigen ? "sin origen" : m3(vista.despues.m3 ?? 0)) +
        ` · rendimiento ${pct(vista.antes.rendimientoPct)} → ${pct(vista.despues.rendimientoPct)}` +
        (vista.sobreElTope ? ` (sobre el ${TOPE_RENDIMIENTO_PCT} % de la plaza)` : "") +
        (lotes ? ` · ${lotes}` : "") +
        ` · producción intacta · motivo: ${motivo}`,
      user: usuario,
    });
    for (const l of vista.lotes.filter((x) => x.destino === "reabrir")) {
      await auditCtpEsperando({
        tenantId,
        action: "ctp_lote_aserrio_reabrir",
        entity: "ForestLoteAserrio",
        entityId: l.loteId,
        detail: `Volvió a quedar abierto al ${verbo === "Sacó" ? "sacar" : "soltar"} sus ${l.piezas} troza${l.piezas === 1 ? "" : "s"} de la corrida N° ${corrida.lineNo} · motivo: ${motivo}`,
        user: usuario,
      });
    }
    return {
      ok: true,
      corridaId,
      lineNo: corrida.lineNo,
      piezas: n,
      m3: vista.sueltas.m3,
      antes: vista.antes,
      despues: vista.despues,
      sobreElTope: vista.sobreElTope,
      quedaSinOrigen: vista.quedaSinOrigen,
      lotes: vista.lotes,
      consumos: escritos.consumos.map((c) => ({
        woodEntryId: c.woodEntryId,
        gtfNumber: c.woodEntry.gtfNumber,
        volumenM3: Number(c.volumeM3),
      })),
    };
  }
}
