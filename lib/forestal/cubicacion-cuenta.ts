/**
 * cubicacion-cuenta — la cubicación de trozas que se guarda con dueño y se
 * paga (o se cobra) contra los adelantos de esa persona (ADR-478, contrato K2).
 *
 * PURO y client-safe: el servidor lo usa para re-cubicar, valorizar y repartir;
 * la pantalla, para la vista previa. Lo que vale es SIEMPRE lo del servidor: la
 * pantalla manda `montoVisto` y, si no coincide, 409 `MONTO_CAMBIO`.
 *
 *   - El volumen sale de las medidas crudas con `cubicarSegun` (la misma cuenta
 *     que `conVolumen` del cubicador): nunca se toma el m³/PT del cliente.
 *   - El precio va en la unidad del lote: S/ por PT en Oxapampina, S/ por m³ en
 *     Smalian. Nunca se convierte m³ → PT para pagar.
 *   - El reparto es FIFO por fecha del adelanto, en céntimos enteros: la suma de
 *     las partes es el monto, sin un céntimo de más ni de menos.
 */
import { z } from "zod";
import { cubicarSegun, RANGO_FORMULA, redondearVolumen, UNIDADES_FORMULA, type FormulaTrozas } from "./cubicacion-trozas-formula";
import { claveEspecie } from "./loth-constants";
import { limaDateKey } from "@/lib/utils";

export const PREFIJO_CUBICACION = "CUB";
export type EstadoCubicacion = "borrador" | "aplicada" | "anulada";
/** compra = el proveedor trae madera (paga un adelanto DADO) · venta = el negocio entrega madera (devuelve un RECIBIDO). */
export type SentidoCubicacion = "compra" | "venta";
export const direccionDelSentido = (s: SentidoCubicacion): "DADO" | "RECIBIDO" => (s === "venta" ? "RECIBIDO" : "DADO");

// ── Zod ──────────────────────────────────────────────────────────────────────

export const trozaEntradaSchema = z.object({
  codigo: z.string().trim().max(40).nullish(),
  especie: z.string().trim().min(1, "Falta la especie de una troza.").max(80),
  /** cm (Smalian) | pulgadas (Oxapampina); el tope fino por fórmula lo pone `cubicarEnServidor`. */
  d1: z.number().positive().max(400),
  /** Con 1 Ø se ignora (la troza queda pareja); `null` o ausente = igual a d1. */
  d2: z.number().positive().max(400).nullish(),
  /** m (Smalian) | pies (Oxapampina): 100 deja pasar los pies, el tope fino es `RANGO_FORMULA`. */
  largo: z.number().positive().max(100),
});
export type TrozaEntrada = z.infer<typeof trozaEntradaSchema>;

/** "" o null de un campo opcional = ausente (la pantalla manda el campo vacío). */
const idOpcional = z.string().trim().max(40).nullish().transform((v) => v || undefined).optional();
const textoOpcional = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || undefined).optional();

const cuerpoCubicacion = z.object({
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha va como AAAA-MM-DD.")
    /* El regex deja pasar el 31-02 (Date lo corre al 02-03) y el mes 13 (Invalid Date → 503). */
    .refine((f) => !Number.isNaN(Date.parse(`${f}T00:00:00.000Z`)) && new Date(`${f}T00:00:00.000Z`).toISOString().slice(0, 10) === f, "Esa fecha no existe.")
    .refine((f) => f <= limaDateKey(), "La fecha no puede ser de mañana en adelante."),
  formula: z.enum(["smalian", "oxapampina"]),
  diametros: z.union([z.literal(1), z.literal(2)]),
  beneficiarioId: idOpcional,
  parteId: idOpcional,
  sentido: z.enum(["compra", "venta"]).default("compra"),
  gtfNumber: textoOpcional(80),
  contratoId: idOpcional,
  trozas: z.array(trozaEntradaSchema).min(1, "La cubicación no tiene trozas.").max(2000),
  notas: textoOpcional(500),
});
const conPersona = (d: { beneficiarioId?: string; parteId?: string }) => Boolean(d.beneficiarioId || d.parteId);
const PERSONA = { message: "Elige la cuenta de la persona.", path: ["beneficiarioId"] };

export const guardarCubicacionSchema = cuerpoCubicacion.refine(conPersona, PERSONA);
/** PATCH: lo mismo + la versión que se leyó (409 `DESACTUALIZADA` si ya es otra). */
export const editarCubicacionSchema = cuerpoCubicacion.extend({ version: z.number().int().positive() }).refine(conPersona, PERSONA);
export type GuardarCubicacionInput = z.infer<typeof guardarCubicacionSchema>;
export type EditarCubicacionInput = z.infer<typeof editarCubicacionSchema>;

export const aplicarCubicacionSchema = z.object({
  precios: z
    .array(z.object({ clave: z.string().trim().min(1).max(80), precio: z.number().positive().max(100_000) }))
    .min(1)
    .max(60),
  montoVisto: z.number().positive().max(9_999_999),
  idempotencyKey: z.string().trim().min(8).max(80),
  version: z.number().int().positive(),
  /** (B2) Elegir a qué adelantos va; sin el campo, todos los abiertos de la persona, el más antiguo primero. */
  adelantoIds: z.array(z.string().trim().min(1).max(40)).min(1).max(50).optional(),
});
export type AplicarCubicacionInput = z.infer<typeof aplicarCubicacionSchema>;

export const anularCubicacionSchema = z.object({ motivo: z.string().trim().min(3, "Escribe el motivo (3 letras o más).").max(300) });

// ── Tipos ────────────────────────────────────────────────────────────────────

/** Una troza como la congela el SERVIDOR. `volumen` en la unidad del lote. */
export interface TrozaCongelada {
  n: number;
  codigo?: string;
  especie: string;
  d1: number;
  d2: number;
  largo: number;
  volumen: number;
  /** Ø por debajo del mínimo del cubicador: se guarda marcada, no se corrige. */
  sospechosa?: true;
}

export interface LineaEspecie {
  clave: string;
  nombre: string;
  n: number;
  volumen: number;
  precio: number | null;
  monto: number | null;
}

export interface Imputacion {
  adelantoId: string;
  codigoOperacion: string | null;
  monto: number;
  volumen: number;
  /** Se cargó más que su saldo: queda EXCEDIDO («le debes la diferencia»). */
  excedido: boolean;
}
export interface ImputacionGuardada extends Imputacion {
  entregaId: string;
}

export interface AdelantoAbierto {
  id: string;
  codigoOperacion: string | null;
  /** ISO de `fechaAdelanto`: el orden FIFO. */
  fecha: string;
  saldo: number;
  direccion: "DADO" | "RECIBIDO";
}

/** Fila de la lista (sin las medidas). */
export interface CubicacionTrozasResumen {
  id: string;
  codigo: string;
  fecha: string;
  formula: FormulaTrozas;
  diametros: 1 | 2;
  /** «PT» | «m³»: la unidad del volumen y del precio. */
  unidad: "PT" | "m³";
  beneficiarioId: string | null;
  parteId: string | null;
  personaNombre: string | null;
  sentido: SentidoCubicacion;
  gtfNumber: string | null;
  contratoId: string | null;
  nTrozas: number;
  volumen: number;
  porEspecie: LineaEspecie[] | null;
  /** NULL = sin valorizar (nunca 0). */
  monto: number | null;
  moneda: string;
  estado: EstadoCubicacion;
  version: number;
  aplicadaAt: string | null;
  aplicadaPor: string | null;
  imputacion: ImputacionGuardada[] | null;
  anuladaAt: string | null;
  anuladaPor: string | null;
  motivoAnulacion: string | null;
  notas: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
export interface CubicacionTrozasDTO extends CubicacionTrozasResumen {
  trozas: TrozaCongelada[];
}

// ── Errores de negocio (la DB class los traduce a códigos HTTP) ───────────────

export class MedidaFueraDeRangoError extends Error {
  constructor(readonly n: number, mensaje: string) {
    super(mensaje);
    this.name = "MedidaFueraDeRangoError";
  }
}
export class FaltaPrecioError extends Error {
  constructor(readonly especie: string) {
    super(`Falta el precio de ${especie}.`);
    this.name = "FaltaPrecioError";
  }
}
export class SinAdelantoAbiertoError extends Error {
  constructor(mensaje = "Esta persona no tiene adelantos abiertos: la cubicación queda guardada sin descontar.") {
    super(mensaje);
    this.name = "SinAdelantoAbiertoError";
  }
}
export class ExcedeLoRecibidoError extends Error {
  constructor(readonly debe: number) {
    super(`Le debes S/ ${debe.toFixed(2)} por lo que te adelantó: la madera no puede pasar de eso.`);
    this.name = "ExcedeLoRecibidoError";
  }
}

// ── Cuentas ──────────────────────────────────────────────────────────────────

/** Céntimos enteros, medio céntimo hacia arriba sobre el DECIMAL: 33,33 × 2,5 = 83,325 → 8 333 (el float da 83,32499…). */
const aCentimos = (n: number) => Math.round(Number((n * 100).toFixed(6)));
export const unidadDe = (f: FormulaTrozas): "PT" | "m³" => (UNIDADES_FORMULA[f].volumen === "PT" ? "PT" : "m³");
/** Decimales del volumen guardado: PT a 2, m³ a 4 (como `redondearVolumen`). */
export const decimalesDe = (f: FormulaTrozas): number => (f === "oxapampina" ? 2 : 4);
const redondear = (v: number, dec: number) => Math.round((v + Number.EPSILON) * 10 ** dec) / 10 ** dec;

/**
 * Re-cubica en el servidor. Ø o largo por ENCIMA del tope de la fórmula es un
 * dictado mal oído, no una troza: con plata de por medio se rechaza (422) con
 * el número de troza. Por debajo del mínimo se guarda marcada.
 * Con un Ø, la troza queda pareja (d2 = d1), aunque el cliente mande otro.
 */
export function cubicarEnServidor(
  formula: FormulaTrozas,
  trozas: readonly TrozaEntrada[],
  diametros: 1 | 2 = 2,
): { trozas: TrozaCongelada[]; volumen: number } {
  const rango = RANGO_FORMULA[formula];
  const u = UNIDADES_FORMULA[formula];
  const out: TrozaCongelada[] = [];
  let total = 0;
  trozas.forEach((t, i) => {
    const n = i + 1;
    const d1 = t.d1;
    const d2 = diametros === 1 ? t.d1 : (t.d2 ?? t.d1);
    if (d1 > rango.diametroMax || d2 > rango.diametroMax) {
      throw new MedidaFueraDeRangoError(n, `La troza ${n} tiene un Ø de ${Math.max(d1, d2)} ${u.diametro}: pasa del tope de ${rango.diametroMax} ${u.diametro}. Corrígela antes de guardar.`);
    }
    if (t.largo > rango.largoMax) {
      throw new MedidaFueraDeRangoError(n, `La troza ${n} mide ${t.largo} ${u.largo} de largo: pasa del tope de ${rango.largoMax} ${u.largo}. Corrígela antes de guardar.`);
    }
    const volumen = cubicarSegun(formula, d1, t.largo, d2);
    total += volumen;
    out.push({
      n,
      ...(t.codigo ? { codigo: t.codigo } : {}),
      especie: t.especie.trim(),
      d1,
      d2,
      largo: t.largo,
      volumen,
      ...(d1 < rango.diametroMin || d2 < rango.diametroMin ? { sospechosa: true as const } : {}),
    });
  });
  return { trozas: out, volumen: redondearVolumen(total, formula) };
}

/** Las trozas agrupadas por especie (clave sin tildes ni mayúsculas), la de más volumen primero. */
export function agruparPorEspecie(trozas: readonly TrozaCongelada[], formula: FormulaTrozas): LineaEspecie[] {
  const porClave = new Map<string, LineaEspecie>();
  for (const t of trozas) {
    const clave = claveEspecie(t.especie) || "sin especie";
    const l = porClave.get(clave) ?? { clave, nombre: t.especie.trim() || "Sin especie", n: 0, volumen: 0, precio: null, monto: null };
    l.n += 1;
    l.volumen += t.volumen;
    porClave.set(clave, l);
  }
  return [...porClave.values()]
    .map((l) => ({ ...l, volumen: redondearVolumen(l.volumen, formula) }))
    .sort((a, b) => b.volumen - a.volumen || a.clave.localeCompare(b.clave));
}

/**
 * Σ por especie al céntimo: monto de cada especie = volumen × precio al céntimo y
 * el total es la suma de esas líneas (la que se ve en la tabla). Una especie con
 * volumen y sin precio → `FaltaPrecioError` con su nombre.
 */
export function valorizar(
  lineas: readonly LineaEspecie[],
  precios: ReadonlyArray<{ clave: string; precio: number }>,
): { porEspecie: LineaEspecie[]; monto: number } {
  const precioDe = new Map(precios.map((p) => [claveEspecie(p.clave) || p.clave.trim().toLowerCase(), p.precio]));
  let centimos = 0;
  const porEspecie = lineas.map((l) => {
    if (!(l.volumen > 0)) return { ...l, precio: null, monto: null };
    const precio = precioDe.get(l.clave);
    if (precio == null || !(precio > 0)) throw new FaltaPrecioError(l.nombre);
    const c = aCentimos(l.volumen * precio);
    centimos += c;
    return { ...l, precio, monto: c / 100 };
  });
  return { porEspecie, monto: centimos / 100 };
}

/**
 * Reparte el monto entre los adelantos abiertos de la persona, el más antiguo
 * primero (B2). Cada uno toma hasta su saldo; el sobrante:
 *   - DADO: se carga al ÚLTIMO (por fecha), que queda EXCEDIDO (B1);
 *   - RECIBIDO: no se puede devolver más de lo que se debe → `ExcedeLoRecibidoError`.
 * El volumen se prorratea por el monto con redondeo acumulado: la suma cierra.
 */
export function repartirFifo(
  monto: number,
  volumen: number,
  abiertos: readonly AdelantoAbierto[],
  decimales = 4,
): Imputacion[] {
  if (abiertos.length === 0) throw new SinAdelantoAbiertoError();
  const orden = [...abiertos].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));
  const direccion = orden[0].direccion;
  const total = aCentimos(monto);
  let resto = total;
  const asignado = new Map<string, number>();
  for (const a of orden) {
    if (resto <= 0) break;
    const saldo = aCentimos(a.saldo);
    if (saldo <= 0) continue;
    const x = Math.min(resto, saldo);
    asignado.set(a.id, x);
    resto -= x;
  }
  if (resto > 0) {
    if (direccion === "RECIBIDO") {
      const debe = orden.reduce((t, a) => t + Math.max(0, aCentimos(a.saldo)), 0);
      throw new ExcedeLoRecibidoError(debe / 100);
    }
    const ultimo = orden[orden.length - 1];
    asignado.set(ultimo.id, (asignado.get(ultimo.id) ?? 0) + resto);
  }
  const out: Imputacion[] = [];
  let acumulado = 0;
  let volPrevio = 0;
  for (const a of orden) {
    const c = asignado.get(a.id);
    if (!c) continue;
    acumulado += c;
    const volHasta = redondear((volumen * acumulado) / total, decimales);
    out.push({
      adelantoId: a.id,
      codigoOperacion: a.codigoOperacion,
      monto: c / 100,
      volumen: redondear(volHasta - volPrevio, decimales),
      excedido: c > aCentimos(a.saldo),
    });
    volPrevio = volHasta;
  }
  return out;
}

/** La huella del cuerpo de «aplicar»: la misma clave con otro cuerpo → 422. */
export function huellaAplicar(input: AplicarCubicacionInput): string {
  const precios = input.precios
    .map((p) => `${claveEspecie(p.clave) || p.clave.trim().toLowerCase()}=${p.precio.toFixed(4)}`)
    .sort()
    .join(",");
  return ["aplicar", precios, input.montoVisto.toFixed(2), `v${input.version}`, (input.adelantoIds ?? []).join(",")].join("|");
}

/** «2 140,5 PT» · «12,346 m³»: miles con espacio y coma decimal, como se escribe en el papel. */
export function fmtVolumen(v: number, formula: FormulaTrozas): string {
  const dec = formula === "oxapampina" ? 2 : 3;
  const [ent, frac] = redondear(v, dec).toFixed(dec).split(".");
  const fracLimpia = (frac ?? "").replace(/0+$/, "");
  const miles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${miles}${fracLimpia ? `,${fracLimpia}` : ""} ${unidadDe(formula)}`;
}

/** La descripción de la entrega en el adelanto: «Madera · CUB-2026-0003 · 34 trozas · 2 140 PT». */
export function descripcionEntregaMadera(
  c: { codigo: string; nTrozas: number; volumen: number; formula: FormulaTrozas },
  parte?: { i: number; de: number },
): string {
  const base = `Madera · ${c.codigo} · ${c.nTrozas} troza${c.nTrozas === 1 ? "" : "s"} · ${fmtVolumen(c.volumen, c.formula)}`;
  return parte && parte.de > 1 ? `${base} · parte ${parte.i} de ${parte.de}` : base;
}
