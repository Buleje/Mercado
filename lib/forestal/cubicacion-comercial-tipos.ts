/**
 * cubicacion-comercial-tipos — contrato K7 (ADR-483): la cubicación COMERCIAL
 * (con descuentos) de trozas (Oxapampina/Smalian) o de madera aserrada (PT
 * tablar), ligada a la cuenta de una persona. Extiende ADR-478 sin romperlo.
 *
 * PURO y client-safe: sólo Zod y tipos. Las cuentas viven en
 * `cubicacion-comercial.ts`; la plata la calcula el SERVIDOR.
 */
import { z } from "zod";
import { limaDateKey } from "@/lib/utils";
import type { FormulaTrozas } from "./cubicacion-trozas-formula";

export type MaterialCubicacion = "troza" | "aserrada";
/** "tablar" = madera aserrada: PT = espesor″ × ancho″ × largo′ ÷ 12 × cantidad. */
export type FormulaComercial = FormulaTrozas | "tablar";
export const esFormulaComercial = (v: unknown): v is FormulaComercial =>
  v === "smalian" || v === "oxapampina" || v === "tablar";
/** null = filas de ADR-478 (libre o guía del CTP por `gtfNumber`). */
export type OrigenCubicacion = "libre" | "ctp" | "loth" | "despacho";
export type ModoCubicacion = "pieza" | "total";
export type EstadoCubicacionComercial = "borrador" | "aplicada" | "anulada";

/** Tope de un castigo %: más que esto no es un descuento, es otra madera. */
export const PCT_DESCUENTO_MAX = 90;

const pct = z
  .number()
  .min(0)
  .max(PCT_DESCUENTO_MAX, `Un descuento no pasa del ${PCT_DESCUENTO_MAX} %.`);
const idOpcional = z.string().trim().max(60).nullish().transform((v) => v || undefined).optional();
const textoOpcional = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || undefined).optional();

export const fechaCubicacionSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha va como AAAA-MM-DD.")
  .refine(
    (f) => !Number.isNaN(Date.parse(`${f}T00:00:00.000Z`)) && new Date(`${f}T00:00:00.000Z`).toISOString().slice(0, 10) === f,
    "Esa fecha no existe.",
  )
  .refine((f) => f <= limaDateKey(), "La fecha no puede ser de mañana en adelante.");

// ── Descuentos ───────────────────────────────────────────────────────────────

/**
 * Descuento de UNA troza, en la unidad de su fórmula (pulgadas/pies en
 * Oxapampina, cm/m en Smalian). Orden: largo neto → menos el cilindro del
 * hueco con ese largo → castigo %. Hueco ≥ Ø menor o largo ≥ largo de la
 * troza = 422 `DESCUENTO_INVALIDO {troza}`.
 */
export const descuentoTrozaSchema = z.object({
  hueco: z.number().positive().max(400).nullish(),
  menosLargo: z.number().positive().max(100).nullish(),
  pct: pct.nullish(),
});
export type DescuentoTroza = z.infer<typeof descuentoTrozaSchema>;

/** Descuento de UNA medida de madera aserrada: piezas que no se cobran (≤ cantidad) y castigo %. */
export const descuentoPiezaSchema = z.object({
  descartadas: z.number().min(0).max(99_999).nullish(),
  pct: pct.nullish(),
});
export type DescuentoPieza = z.infer<typeof descuentoPiezaSchema>;

/**
 * Descuento del LOTE, después de los de cada troza/pieza: primero por especie
 * (`menos` en la unidad del lote, ≤ el neto de esa especie; luego su %), al
 * final el % general. Clave de especie = `claveEspecie` (sin tildes ni
 * mayúsculas); una clave que no está en el lote = 422 `DESCUENTO_INVALIDO {clave}`.
 */
export const descuentoLoteSchema = z.object({
  pct: pct.nullish(),
  porEspecie: z
    .array(
      z.object({
        clave: z.string().trim().min(1).max(80),
        pct: pct.nullish(),
        menos: z.number().positive().max(9_999_999).nullish(),
      }),
    )
    .max(60)
    .optional(),
});
export type DescuentoLote = z.infer<typeof descuentoLoteSchema>;

// ── Trozas: los campos nuevos que se MEZCLAN en `cuerpoCubicacion` (cubicacion-cuenta.ts) ──

/** `trozaEntradaSchema.extend(trozaDescuentoCampo)` */
export const trozaDescuentoCampo = { descuento: descuentoTrozaSchema.nullish() } as const;
/** `cuerpoCubicacion.extend(origenTrozaCampos)` + refine: origen "loth" ⇒ origenId. */
export const origenTrozaCampos = {
  origen: z.enum(["libre", "ctp", "loth"]).optional(),
  origenId: idOpcional,
  descuentos: descuentoLoteSchema.nullish(),
} as const;

// ── Aserrada ─────────────────────────────────────────────────────────────────

const UNIDAD = z.enum(["pulg", "cm", "pies", "m"]);

export const piezaComercialSchema = z.object({
  especie: z.string().trim().min(1, "Falta la especie de una pieza.").max(80),
  cantidad: z.number().positive().max(99_999),
  espesor: z.number().positive().max(999),
  ancho: z.number().positive().max(999),
  largo: z.number().positive().max(999),
  uEspesor: UNIDAD.default("pulg"),
  uAncho: UNIDAD.default("pulg"),
  uLargo: UNIDAD.default("pies"),
  descuento: descuentoPiezaSchema.nullish(),
});
export type PiezaComercialEntrada = z.infer<typeof piezaComercialSchema>;

/** Modo rápido: una línea por especie, o una sola «General». El PT es lo que se cobra. */
export const lineaTotalSchema = z.object({
  especie: z.string().trim().min(1, "Falta la especie (o «General»).").max(80),
  pt: z.number().positive("El pie tablar tiene que ser mayor que 0.").max(9_999_999),
  /** Informativo (lo que dice el libro o la guía). Nunca se convierte a PT en el servidor. */
  m3: z.number().positive().max(99_999).nullish(),
  piezas: z.number().int().positive().max(9_999_999).nullish(),
});
export type LineaTotalEntrada = z.infer<typeof lineaTotalSchema>;

const cuerpoAserrada = z.object({
  material: z.literal("aserrada"),
  modo: z.enum(["pieza", "total"]),
  fecha: fechaCubicacionSchema,
  beneficiarioId: idOpcional,
  parteId: idOpcional,
  /** venta = le vendo al cliente (devuelve su RECIBIDO) · compra = me venden (paga su DADO). */
  sentido: z.enum(["compra", "venta"]).default("venta"),
  origen: z.enum(["libre", "despacho"]).default("libre"),
  origenId: idOpcional,
  gtfNumber: textoOpcional(80),
  contratoId: idOpcional,
  /** Uno por uno desde el Cubicador de madera: el servidor copia SUS piezas (el cuerpo no manda `piezas`). */
  cubicacionRefId: idOpcional,
  piezas: z.array(piezaComercialSchema).max(5000).optional(),
  lineas: z.array(lineaTotalSchema).max(60).optional(),
  descuentos: descuentoLoteSchema.nullish(),
  notas: textoOpcional(500),
});
type CuerpoAserrada = z.infer<typeof cuerpoAserrada>;
const reglasAserrada = (d: CuerpoAserrada, ctx: z.RefinementCtx) => {
  if (!d.beneficiarioId && !d.parteId) ctx.addIssue({ code: "custom", path: ["beneficiarioId"], message: "Elige la cuenta de la persona." });
  if (d.origen === "despacho" && !d.origenId) ctx.addIssue({ code: "custom", path: ["origenId"], message: "Falta el despacho." });
  if (d.modo === "pieza" && !d.cubicacionRefId && !d.piezas?.length)
    ctx.addIssue({ code: "custom", path: ["piezas"], message: "Elige una cubicación guardada o carga las piezas." });
  if (d.modo === "pieza" && d.cubicacionRefId && d.piezas?.length)
    ctx.addIssue({ code: "custom", path: ["piezas"], message: "Con una cubicación guardada, las piezas salen de ella." });
  if (d.modo === "total" && !d.lineas?.length) ctx.addIssue({ code: "custom", path: ["lineas"], message: "Pon el pie tablar de al menos una especie." });
  if (d.modo === "total" && d.piezas?.length) ctx.addIssue({ code: "custom", path: ["piezas"], message: "El modo rápido no lleva piezas." });
};
export const guardarAserradaSchema = cuerpoAserrada.superRefine(reglasAserrada);
export const editarAserradaSchema = cuerpoAserrada.extend({ version: z.number().int().positive() }).superRefine(reglasAserrada);
export type GuardarAserradaInput = z.infer<typeof guardarAserradaSchema>;
export type EditarAserradaInput = z.infer<typeof editarAserradaSchema>;

/** Se MEZCLA en `aplicarCubicacionSchema`: `precios` pasa a `.max(60).default([])` + refine «precios o general». */
export const precioGeneralCampo = { precioGeneral: z.number().positive().max(100_000).nullish() } as const;

// ── Lo congelado por el servidor y lo que devuelve ───────────────────────────

/** Campos que se suman a `TrozaCongelada` (troza con descuento). */
export interface TrozaCongeladaComercial {
  descuento?: DescuentoTroza;
  /** Volumen sin descuentos; `volumen` es el neto. Sólo si hubo descuento. */
  bruto?: number;
  /** Origen loth: el m³ que la GTF declara para ESA troza (SERFOR). */
  m3Guia?: number;
}

export interface PiezaCongelada {
  n: number;
  especie: string;
  cantidad: number;
  espesor: number;
  ancho: number;
  largo: number;
  uEspesor: "pulg" | "cm" | "pies" | "m";
  uAncho: "pulg" | "cm" | "pies" | "m";
  uLargo: "pulg" | "cm" | "pies" | "m";
  /** PT de toda la medida sin descuento (como `cubicarPieza`). */
  bruto: number;
  descuento?: DescuentoPieza;
  /** PT neto. */
  volumen: number;
}

export interface LineaTotalCongelada {
  n: number;
  especie: string;
  pt: number;
  m3: number | null;
  piezas: number | null;
  /** = pt (los descuentos de una línea rápida van en `descuentos.porEspecie`). */
  volumen: number;
}

/** Lo que `CubicacionTrozasResumen` suma (C-BE lo extiende con esto). */
export interface CamposComerciales {
  material: MaterialCubicacion;
  origen: OrigenCubicacion | null;
  origenId: string | null;
  modo: ModoCubicacion;
  /** null = no hubo descuentos (bruto = volumen). */
  volumenBruto: number | null;
  descuentos: DescuentoLote | null;
  referenciaSmalianM3: number | null;
  cubicacionRefId: string | null;
}

export interface CubicacionExistente {
  id: string;
  codigo: string;
  estado: EstadoCubicacionComercial;
  monto: number | null;
  personaNombre: string | null;
}

/** GET …/cubicaciones-trozas/origen?tipo=loth&id= */
export interface PrefillTrozaGtf {
  codigo: string | null;
  especie: string;
  /** Pulgadas y pies a 1 decimal, convertidos de la guía (cm/m). La cinta manda. */
  d1: number;
  d2: number;
  largo: number;
  m3Guia: number | null;
}
export interface PrefillOrigenLoth {
  tipo: "loth";
  gtfId: string;
  gtfNumber: string;
  fecha: string | null;
  titular: string | null;
  tituloHabilitante: string | null;
  /** `ForestGtf.volumenTotalM3`: lo que declara la guía (Smalian, SERFOR). */
  smalianDeclaradoM3: number | null;
  trozas: PrefillTrozaGtf[];
  /** Trozas de la guía sin D1/D2/largo: no se prellenan, se cuentan. */
  sinMedidas: number;
  existentes: CubicacionExistente[];
}

/** GET …/cubicaciones-trozas/origen?tipo=despacho&id= */
export interface PrefillOrigenDespacho {
  tipo: "despacho";
  despachoId: string;
  gtfNumber: string | null;
  fecha: string;
  destinatario: string | null;
  /** Las líneas vivas del despacho con esa guía (o sólo ésta si no tiene guía): lo que dice el LIBRO. */
  lineas: Array<{ id: string; especie: string; m3: number | null; piezas: number | null; ptLibro: number | null }>;
  /** Del Cubicador de madera (KV), las ligadas a esa guía o a las corridas del despacho primero. */
  guardadas: Array<{ id: string; nombre: string; fecha: string; pt: number; piezas: number; ligada: boolean }>;
  /** `ForestCtpEntry.valorVenta` sumado de las líneas: null = alguna sin valor (nunca 0). */
  valorVentaLibro: number | null;
  existentes: CubicacionExistente[];
}
export type PrefillOrigen = PrefillOrigenLoth | PrefillOrigenDespacho;
