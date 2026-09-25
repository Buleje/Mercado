/**
 * Anular lo declarado en UN día de producción (Brandon, 2026-09-23).
 *
 * Pedido: *«al pasar el mouse sobre el día tenga opción para eliminar esa
 * cubicación de ese día»*. Lo que cuelga de un casillero de la tira son
 * CORRIDAS del Libro CTP, y el Libro no las borra: las **anula** con un motivo
 * (`ForestCtpDB.annul`, el mismo camino del botón «Anular» de cada fila). La
 * línea anulada sigue en el libro con su N.º y su motivo —SERFOR pide la traza—
 * y deja de contar en la tira, los saldos y el cuadro resumen.
 *
 * ## Lo que NO se anula en bloque, y por qué
 *
 * Anular una corrida suelta sus trozas, y eso está bien cuando se hace a
 * propósito, de a una, mirándola. En bloque, lo que cuelga de una corrida es
 * justo lo que no se puede deshacer sin mirar: si UNA sola del día tiene algo
 * de esto, no se toca ninguna y se dice cuál y por qué.
 *
 *  · **materia prima** atribuida (consumos por guía, con o sin costo congelado)
 *    o **trozas** vinculadas — la trazabilidad de «¿de qué guía salió?»;
 *  · un **reproceso** que la produce o que salió de ella;
 *  · un **despacho** vivo que la cita como origen — ese camión ya salió;
 *  · un **lote** comercial o de aserrío que la tiene;
 *  · un **apartado** vivo — alguien la tiene reservada;
 *  · el **aserrío cobrado** a un tercero — es plata en la cuenta de otro.
 *    Anular una sola corrida da de baja el cargo solo; en bloque, borrar deuda
 *    ajena sin verla no.
 *
 * El mes cerrado (ADR-139) bloquea el día entero, como a cualquier escritura.
 *
 * PURO y client-safe: la base junta los hechos, acá se decide y se redacta.
 */
import { z } from "zod";
import { formatCurrency } from "@/lib/format";
import { fmtM3, fmtPiezas, fmtPt } from "./cubicacion-formato";
import { diaDelCalendario } from "./precio-cliente";


/** Lo que se propone como motivo: se puede cambiar, no se puede dejar vacío. */
export const MOTIVO_POR_DEFECTO = "Cubicación del día cargada por error: se vuelve a registrar";

/* Día REAL del calendario (security 23-09): con sólo el regex, «2026-13-45»
   llegaba a la base y respondía 500, y «2026-02-30» se corría al 02/03 —
   se habría anulado otro día con la etiqueta del que se pidió. */
export const previaAnularDiaSchema = z.object({
  dia: diaDelCalendario,
});

export const anularDiaSchema = z.object({
  dia: diaDelCalendario,
  /**
   * Las corridas que la pantalla mostró al confirmar. Si el día cambió en el
   * medio (otra pestaña agregó una), no se anula lo que nadie vio.
   */
  ids: z.array(z.string().trim().min(1).max(64)).min(1).max(200),
  motivo: z.string().trim().min(3, "Escribe el motivo (3 letras como mínimo)").max(500),
});

export type AnularDiaInput = z.infer<typeof anularDiaSchema>;

/** Lo que cuelga de UNA corrida, como lo junta la base. */
export interface HechosDeCorrida {
  id: string;
  lineNo: number;
  especie: string | null;
  /** m³ de materia prima atribuida por guía (`ForestCtpConsumo`). */
  consumoM3: number;
  /** Alguno de esos consumos ya tiene el costo congelado al cierre. */
  consumoCongelado: boolean;
  trozas: number;
  /** Reprocesos que PRODUCEN esta corrida. */
  reprocesosEntrada: number;
  /** N.º de las corridas vivas que salieron de reprocesar ésta. */
  reprocesadaEn: number[];
  /** Despachos vivos que la citan como origen. */
  despachos: { lineNo: number; gtf: string | null }[];
  lotesComerciales: number;
  /** Código de los lotes de aserrío vivos que cerró. */
  lotesAserrio: string[];
  /** Para quién está apartada (apartados sin liberar). */
  apartados: string[];
  /** El cargo de aserrío vivo en la cuenta de un tercero. */
  cargoAserrio: { monto: number; parte: string } | null;
}

const lista = (xs: readonly (string | number)[]) =>
  xs.length <= 1 ? String(xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;

/** Por qué ESTA corrida no se anula en bloque. Vacío = se puede. */
export function bloqueosDe(h: HechosDeCorrida): string[] {
  const motivos: string[] = [];
  if (h.consumoM3 > 0) {
    motivos.push(
      `tiene ${fmtM3(h.consumoM3)} m³ de materia prima atribuida${h.consumoCongelado ? ", con el costo ya congelado" : ""}`,
    );
  }
  if (h.trozas > 0)
    motivos.push(
      `tiene ${fmtPiezas(h.trozas)} ${h.trozas === 1 ? "troza vinculada" : "trozas vinculadas"}`,
    );
  if (h.reprocesosEntrada > 0) motivos.push("sale de un reproceso");
  if (h.reprocesadaEn.length > 0) {
    motivos.push(
      `se reprocesó en ${h.reprocesadaEn.length === 1 ? "la corrida" : "las corridas"} N.º ${lista(h.reprocesadaEn)}`,
    );
  }
  if (h.despachos.length > 0) {
    const d = h.despachos.map((x) =>
      x.gtf ? `N.º ${x.lineNo} (GTF ${x.gtf})` : `N.º ${x.lineNo}`,
    );
    motivos.push(
      `salió en ${h.despachos.length === 1 ? "el despacho" : "los despachos"} ${lista(d)}`,
    );
  }
  if (h.lotesComerciales > 0) motivos.push("está en un lote comercial");
  if (h.lotesAserrio.length > 0) {
    motivos.push(
      `cerró ${h.lotesAserrio.length === 1 ? "el lote de aserrío" : "los lotes de aserrío"} ${lista(h.lotesAserrio)}`,
    );
  }
  if (h.apartados.length > 0) motivos.push(`está apartada para ${lista(h.apartados)}`);
  if (h.cargoAserrio) {
    motivos.push(
      `tiene cobrado el aserrío (${formatCurrency(h.cargoAserrio.monto)} a ${h.cargoAserrio.parte}): quita primero ese cargo de su cuenta`,
    );
  }
  return motivos;
}

/** Una corrida del día, con lo que le impide anularse. */
export interface CorridaDelDia {
  id: string;
  lineNo: number;
  especie: string | null;
  bloqueos: string[];
}

/** Lo que se va a anular, antes de preguntar. */
export interface PreviaAnularDia {
  dia: string;
  /** `"setiembre 2026"` si el mes está cerrado; `null` si se puede escribir. */
  periodoCerrado: string | null;
  corridas: CorridaDelDia[];
  /** Los mismos números que el casillero de la tira (salen de la misma cuenta). */
  total: { corridas: number; pt: number; m3: number; piezas: number };
  /** Los dueños del día, como los dice el detalle («De tercero · WASACO»). */
  duenos: string[];
}

export interface RespuestaAnularDia {
  dia: string;
  anuladas: { id: string; lineNo: number; especie: string | null }[];
  total: PreviaAnularDia["total"];
}

/** Códigos de error que la pantalla sabe explicar. */
export type CodigoAnularDia =
  | "PERIODO_CERRADO" // 422 — el mes del día está cerrado
  | "CON_MOVIMIENTOS" // 409 — alguna corrida tiene algo colgando (detail.corridas)
  | "DIA_CAMBIO" // 409 — lo que hay hoy en el día no es lo que se confirmó
  | "SIN_CORRIDAS"; // 404 — el día ya no tiene nada que anular

export const ESTADO_HTTP_ANULAR_DIA: Record<CodigoAnularDia, number> = {
  PERIODO_CERRADO: 422,
  CON_MOVIMIENTOS: 409,
  DIA_CAMBIO: 409,
  SIN_CORRIDAS: 404,
};

export class AnularDiaError extends Error {
  constructor(
    readonly code: CodigoAnularDia,
    message: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AnularDiaError";
  }
}

/** Las corridas que impiden anular el día. */
export function corridasBloqueadas(p: Pick<PreviaAnularDia, "corridas">): CorridaDelDia[] {
  return p.corridas.filter((c) => c.bloqueos.length > 0);
}

/** `"N.º 30 · Panguana: tiene 12 trozas vinculadas"` — un renglón por corrida. */
export function renglonesDeBloqueo(corridas: readonly CorridaDelDia[]): string[] {
  return corridas.map(
    (c) => `N.º ${c.lineNo} · ${c.especie?.trim() || "sin especie"}: ${c.bloqueos.join("; ")}`,
  );
}

/** Sin el «De tercero · » delante: en el resumen alcanza con el nombre. */
const nombreDelDueno = (etiqueta: string) => etiqueta.replace(/^De tercero · /, "");

/**
 * `"6 corridas · 3,239 PT · 7.639 m³ · 111 pza · WASACO"` — lo que se anula,
 * con las cifras del casillero y en el orden del aserradero (PT primero).
 */
export function resumenParaConfirmar(p: Pick<PreviaAnularDia, "total" | "duenos">): string {
  const t = p.total;
  const partes = [
    `${t.corridas} ${t.corridas === 1 ? "corrida" : "corridas"}`,
    t.pt >= 1 ? `${fmtPt(t.pt)} PT` : null,
    `${fmtM3(t.m3)} m³`,
    t.piezas > 0 ? `${fmtPiezas(t.piezas)} pza` : null,
    p.duenos.length > 0 ? p.duenos.map(nombreDelDueno).join(", ") : null,
  ];
  return partes.filter(Boolean).join(" · ");
}

/** El motivo que queda en cada línea: el escrito, y de qué día salió. */
export function motivoDeLaLinea(motivo: string, etiquetaDelDia: string, corridas: number): string {
  return `${motivo.trim()} · anulada con el resto del ${etiquetaDelDia} (${corridas} ${corridas === 1 ? "corrida" : "corridas"})`;
}
