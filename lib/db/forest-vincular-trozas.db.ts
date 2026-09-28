import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { auditCtpEsperando, m3 } from "@/lib/forestal/ctp-audit";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { closedPeriodOf, type CtpCierrePeriodo } from "@/lib/forestal/ctp-cierre-types";
import { MAX_PARTES_POR_CORRIDA } from "@/lib/forestal/vincular-desde-mixto";
import {
  clavePermiso,
  corridaParaDiagnostico,
  diagnosticarCorrida,
  diagnosticarSinOrigen,
  problemaAlVincular,
  proponerTrozas,
  trozaParaDiagnostico,
  type CorridaLeida,
  type CorridaParaDiagnostico,
  type DiagnosticoCorrida,
  type DiagnosticoSinOrigen,
  type PermisoRef,
  type PropuestaDeTrozas,
  type TrozaLeida,
  type TrozaParaDiagnostico,
  type VincularTrozasPedido,
} from "@/lib/forestal/vincular-trozas";
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

/** El permiso de una punta: contrato vivo si lo hay; si no, el código escrito. */
function permisoDe(contratoId: string | null, contrato: { codigo: string; deletedAt: Date | null } | null, originCode: string | null): PermisoRef {
  const vivo = contrato && !contrato.deletedAt ? contrato : null;
  return {
    contratoId: vivo ? contratoId : null,
    codigo: vivo?.codigo?.trim() || originCode?.trim() || null,
  };
}

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

export class ForestVincularTrozasDB {
  /**
   * Todas las corridas sin origen del negocio, con su motivo y su propuesta.
   * «Sin origen» es la regla de `corridaSinOrigen`: sin consumos ni reprocesos.
   */
  static async diagnostico(tenantId: string): Promise<DiagnosticoSinOrigen> {
    if (!tenantId) throw new Error("tenantId is required");
    const corridas = await prisma.forestCtpEntry.findMany({
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
      corridas.map((c) => c.id),
    );
    const trozas = await trozasCandidatas(tenantId);
    const cierres = await ForestCtpCierreDB.list(tenantId);
    return diagnosticarSinOrigen(
      corridas.map((c) => conCierre(corridaParaDiagnostico(corridaLeida(c, lotes.get(c.id) ?? 0)), c.entryDate, cierres)),
      trozas,
    );
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
    return {
      ok: true,
      diagnostico: diagnosticarCorrida(
        conCierre(corridaParaDiagnostico(corridaLeida(c, lotes.get(c.id) ?? 0)), c.entryDate, cierres),
        trozas,
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
    return {
      ok: true,
      ...proponerTrozas({ especie: input.especie, permiso, fecha: input.fecha, m3Producido: input.m3 }, trozas),
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

    /* Después del commit: la caché del lote nuevo, su renglón y, en orden, los
       de la vinculación (`despuesDeVincular` invalida el libro, los lotes y el
       patio, y espera sus renglones). */
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
      corridaId,
      trozas: r.piezas,
      m3: r.volumenM3,
      lotesArmados: loteNuevo ? [loteNuevo.code] : [],
      rendimientoPct: r.rendimientoPct,
      sobreElTope: r.sobreElTope,
    };
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
