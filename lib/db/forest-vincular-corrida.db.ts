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
    select: { status: true, deletedAt: true, fechaRecepcion: true, gtfNumber: true, entryDate: true },
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
             "speciesCommon", "unit", "entryDate", "aperturaDeclaradaAt"
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
      select: { id: true, code: true, status: true, speciesCommon: true },
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
    for (const prefijo of ["forest-ctp", "forestal:lote-aserrio", "wood-entries"]) {
      try {
        invalidateByPrefix(`${prefijo}:${tenantId}`);
      } catch {
        /* cache best-effort */
      }
    }
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
}
