/**
 * plata-de-guia — cuánto costó una guía, a quién se le paga y cuánto falta (ADR-437).
 *
 * ## Qué resuelve
 *
 * El modal «¿Cuánto pagaste por esta guía?» repartía un total por volumen con N
 * PATCH sueltos: el margen por especie salía falso (≈2,3 especies por guía), el
 * flete y los gastos no se juntaban con el costo, y la madera nunca entraba a la
 * cuenta del proveedor (0 movimientos `madera` en toda la base). Acá viven las
 * reglas; la DB class (`guia-plata.db.ts`) sólo las ejecuta en UNA transacción.
 *
 * ## Invariantes (con test)
 *
 *  · Σ costo de los asientos = total de la factura ± S/ 0,005 (el resto de un
 *    reparto va al ÚLTIMO asiento, nunca se pierde un céntimo).
 *  · El proveedor NUNCA sale del `providerDocument` (es el RUC de la ATFFS).
 *  · Estado de pago derivado, nunca guardado: Σ pendiente de una parte =
 *    mín(lo que falta de sus guías, max(0, −saldo)); lo que se le debe por
 *    otra cosa (aserrío recibido…) se cubre antes que las guías.
 *  · Costo puesto en patio = madera + fletes del CTP + gastos; un flete sin
 *    monto lo deja «incompleto», nunca suma 0.
 *
 * PURO y client-safe: sin React, sin fetch, sin Prisma.
 */

import { z } from "zod";
import { limaDateKey } from "@/lib/utils";
import { PT_POR_M3, pieTablarAserrableDe } from "./cubicacion";
import { RENDIMIENTO_META } from "./loctp-catalogos";
import { mismaEntidadPorNombre, normalizarNombre } from "./directorio-desde-guias";
import type { MovimientoCuenta } from "./cuenta-corriente";
import type { DuenoSugerido } from "./madera-de-servicio";

// ── Vocabulario ─────────────────────────────────────────────────────────────

/** Mismos métodos que una liquidación (`MetodoPago` de `lib/adelantos/movimiento-caja.ts`). */
export const METODOS_PAGO = ["efectivo", "yape", "plin", "tarjeta", "transferencia"] as const;
export type MetodoPagoGuia = (typeof METODOS_PAGO)[number];

export const METODO_PAGO_LABEL: Record<MetodoPagoGuia, string> = {
  efectivo: "Efectivo",
  yape: "Yape",
  plin: "Plin",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
};

/** Lo que se gasta en una guía además de la madera y el flete (ADR-437 §8). */
export const CATEGORIAS_GASTO_GUIA = ["estiba", "descarga", "carguio", "cubicacion", "vigilancia", "otro"] as const;
export type CategoriaGastoGuia = (typeof CATEGORIAS_GASTO_GUIA)[number];

export const CATEGORIA_GASTO_GUIA_LABEL: Record<CategoriaGastoGuia, string> = {
  estiba: "Estiba",
  descarga: "Descarga",
  carguio: "Carguío",
  cubicacion: "Cubicación",
  vigilancia: "Vigilancia",
  otro: "Otro",
};

/** Un céntimo de medio: lo que se tolera entre la suma de asientos y la factura. */
export const TOLERANCIA_SOLES = 0.005;

/** Texto con el que empieza el issue de «no cierra» — la ruta lo traduce a 422 `no_cierra`. */
export const MENSAJE_NO_CIERRA = "No cierra con la factura";

const aCentimos = (n: number): number => Math.round(n * 100);
const deCentimos = (c: number): number => c / 100;
const r2 = (n: number): number => Math.round(n * 100) / 100;

// ── Zod ─────────────────────────────────────────────────────────────────────

/** Soles con dos decimales como mucho: un tercer decimal no existe en una factura. */
const soles = z
  .number()
  .finite()
  .min(0)
  .max(99_999_999.99)
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "Como mucho dos decimales (céntimos)");
const solesPositivos = soles.refine((v) => v > 0, "Tiene que ser mayor a cero");

const idCorto = z.string().trim().min(1).max(40);
const gtfNumber = z.string().trim().min(1, "Falta el número de guía").max(80);

/** Lo que el usuario VIO antes de guardar: si otro lo cambió en el medio, 409. */
const vistos = z
  .array(z.object({ id: idCorto, antes: z.number().finite().nullable() }))
  .max(50);

/** El acta de cómo se llegó al costo de UN asiento (`WoodEntry.costoDetalle`). */
export const costoDetalleSchema = z.object({
  v: z.literal(1),
  modo: z.enum(["total", "especie"]),
  unidad: z.enum(["m3", "pt"]),
  precio: z.number().positive().max(100_000).nullable(),
  cantidadFactura: z.number().positive().max(10_000_000).nullable(),
  ptDerivado: z.number().nonnegative().nullable(),
  totalFactura: soles,
});
export type CostoDetalle = z.infer<typeof costoDetalleSchema>;

const lineaCompraSchema = z.object({
  woodEntryId: idCorto,
  costoTotal: soles,
  detalle: costoDetalleSchema,
});

const servicioSchema = z.object({
  tipo: z.literal("servicio"),
  gtfNumber,
  duenoParteId: idCorto,
  vistos,
});

/** Quitar la marca de servicio: la guía era, en realidad, una compra (queda sin costo). */
const quitarServicioSchema = z.object({
  tipo: z.literal("quitar_servicio"),
  gtfNumber,
  vistos,
});

const compraSchema = z.object({
  tipo: z.literal("compra"),
  gtfNumber,
  proveedorParteId: idCorto.nullable(),
  totalFactura: solesPositivos,
  lineas: z.array(lineaCompraSchema).min(1).max(50),
  /* Sin `.default()`: en Zod 4 un `.partial()` aplicaría el default y un PATCH
     parcial pisaría el valor (memoria `zod4-partial-aplica-defaults`). */
  anotarEnCuenta: z.boolean(),
  vistos,
});

export const guardarPlataGuiaSchema = z
  .discriminatedUnion("tipo", [servicioSchema, compraSchema, quitarServicioSchema])
  .superRefine((d, ctx) => {
    if (d.tipo !== "compra") return;
    const ids = new Set<string>();
    d.lineas.forEach((l, i) => {
      if (ids.has(l.woodEntryId)) {
        ctx.addIssue({ code: "custom", path: ["lineas", i, "woodEntryId"], message: "Ese asiento está dos veces" });
      }
      ids.add(l.woodEntryId);
    });
    const suma = d.lineas.reduce((t, l) => t + aCentimos(l.costoTotal), 0);
    const dif = aCentimos(d.totalFactura) - suma;
    if (Math.abs(dif) > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["totalFactura"],
        message:
          dif > 0
            ? `${MENSAJE_NO_CIERRA}: faltan S/ ${deCentimos(dif).toFixed(2)} para llegar al total.`
            : `${MENSAJE_NO_CIERRA}: sobran S/ ${deCentimos(-dif).toFixed(2)} sobre el total.`,
      });
    }
    if (d.anotarEnCuenta && !d.proveedorParteId) {
      ctx.addIssue({
        code: "custom",
        path: ["proveedorParteId"],
        message: "Para anotarla en la cuenta hay que elegir a quién le pagas.",
      });
    }
  });
export type GuardarPlataGuiaInput = z.infer<typeof guardarPlataGuiaSchema>;
export type GuardarServicioInput = Extract<GuardarPlataGuiaInput, { tipo: "servicio" }>;
export type GuardarCompraInput = Extract<GuardarPlataGuiaInput, { tipo: "compra" }>;
export type QuitarServicioInput = Extract<GuardarPlataGuiaInput, { tipo: "quitar_servicio" }>;

/** ¿El fallo de `guardarPlataGuiaSchema` es «la suma no cierra»? (→ 422 `no_cierra`). */
export function esNoCierra(issues: ReadonlyArray<{ message: string }>): boolean {
  return issues.some((i) => i.message.startsWith(MENSAJE_NO_CIERRA));
}

/**
 * ¿`AAAA-MM-DD` es un día que existe? El regex deja pasar `2025-13-01` y
 * `2026-02-31`, y `new Date` los «corrige» en silencio a otro día. Se exige
 * que el día armado en UTC se vuelva a escribir igual.
 */
export function esDiaDelCalendario(f: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return false;
  const d = new Date(`${f}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f;
}

const fechaDia = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato AAAA-MM-DD")
  .refine(esDiaDelCalendario, "Esa fecha no existe en el calendario")
  .refine((f) => f <= limaDateKey(new Date()), "La fecha no puede ser futura");

export const gastoGuiaSchema = z.object({
  id: idCorto.optional(),
  gtfNumber,
  categoria: z.enum(CATEGORIAS_GASTO_GUIA),
  monto: solesPositivos,
  fecha: fechaDia,
  metodo: z.enum(METODOS_PAGO).nullable(),
  pagado: z.boolean(),
  pagadoA: z.string().trim().max(200).optional(),
  notas: z.string().trim().max(500).optional(),
});
export type GastoGuiaInput = z.infer<typeof gastoGuiaSchema>;

// ── Tipos de salida ─────────────────────────────────────────────────────────

/** Un asiento (= una especie de la guía, ADR-312) con su plata. */
export interface LineaPlataDTO {
  id: string;
  speciesCommonName: string;
  productType: string;
  volumeM3: number;
  pieces: number;
  status: string;
  /** `AAAA-MM-DD` (date-only, UTC). */
  entryDate: string;
  costoTotal: number | null;
  costoDetalle: CostoDetalle | null;
  /** ≈ pt NUESTRO (rolliza: aserrable 56 %; aserrada: m³ × 424). Se muestra con «≈». */
  ptDerivado: number;
  /** Alguna corrida ya congeló el costo de este asiento al cierre. */
  congelado: boolean;
  /** El mes del asiento está cerrado. */
  periodoCerrado: boolean;
}

export interface GastoGuia {
  id: string;
  gtfNumber: string;
  categoria: CategoriaGastoGuia;
  monto: number;
  /** `AAAA-MM-DD`. */
  fecha: string;
  metodo: MetodoPagoGuia | null;
  pagado: boolean;
  pagadoA: string | null;
  notas: string | null;
}

export interface FleteDeGuia {
  id: string;
  /** `AAAA-MM-DD`. */
  fecha: string;
  tipo: string;
  monto: number | null;
  pagaQuien: string;
  estadoPago: string;
  transportistaNombre: string | null;
  placa: string | null;
}

/** El abono `madera` de la guía en la cuenta del proveedor (ADR-437 §4). */
export interface CuentaDeLaGuia {
  movimientoId: string;
  parteId: string;
  parteNombre: string;
  monto: number;
  /** ISO. */
  fecha: string;
}

/**
 * «¿Cuánto le debo?» con UNA respuesta (ADR-437 §5): la misma cuenta por
 * persona que `unificarCuentas`, contada en palabras del modal.
 */
export interface ResumenPersona {
  parteId: string;
  nombre: string;
  /** Lo que le debes por su cuenta forestal (guías, aserrío…). Positivo = le debes. */
  porGuias: number;
  /** Lo que te debe de adelantos (Adelantos). Positivo = te debe. `null` = no tiene ficha en Adelantos. */
  deAdelantos: number | null;
  /** Convención de `unificarCuentas`: positivo = TE debe; negativo = le debes. */
  neto: number;
}

export interface PlataDeGuiaDTO {
  gtfNumber: string;
  /** Una guía de servicio no lleva costo ni estado de pago. */
  tipo: "servicio" | "compra";
  lineas: LineaPlataDTO[];
  /** Algún asiento marcado de servicio y otro no — no debería pasar nunca (test). */
  mezclada: boolean;
  /** Dueño de la madera cuando es de servicio. */
  dueno: { parteId: string | null; nombre: string } | null;
  duenoSugerido: DuenoSugerido | null;
  contrato: { id: string; codigo: string; titularNombre: string; titularId: string | null } | null;
  /** A quién se le paga (enlace guardado o derivado). `seguro: false` = sólo se propone. */
  proveedor: ProveedorDeGuia | null;
  /** Σ costo de los asientos vivos; `null` si ninguno tiene costo o es de servicio. */
  totalMadera: number | null;
  /** Asientos vivos que requieren costo y no lo tienen. */
  sinCosto: number;
  cuenta: CuentaDeLaGuia | null;
  pago: EstadoPagoGuia | null;
  persona: ResumenPersona | null;
  fletes: FleteDeGuia[];
  gastos: GastoGuia[];
  costoPuesto: CostoPuesto;
  /** Por qué no se puede guardar el costo, si no se puede. */
  bloqueo: { codigo: "GUIA_ANULADA" | "PERIODO_CERRADO" | "COSTO_CONGELADO"; mensaje: string } | null;
}

// ── pt de una línea ─────────────────────────────────────────────────────────

/**
 * El ≈ pt NUESTRO de un asiento. Rolliza: lo que rendiría aserrada al 56 %
 * (memoria `pt-de-rolliza-es-aserrable-no-424`); cualquier otra presentación
 * ya viene aserrada: m³ × 424. Es un derivado: la cantidad de la factura se
 * tipea y esto sólo se propone rotulado «≈».
 */
export function ptDeLinea(l: { volumeM3: number; productType: string | null | undefined }): number {
  const m3 = Number(l.volumeM3);
  if (!(m3 > 0)) return 0;
  return (l.productType ?? "rolliza") === "rolliza" ? pieTablarAserrableDe(m3, RENDIMIENTO_META) : Math.round(m3 * PT_POR_M3);
}

// ── Reparto y precio por especie ────────────────────────────────────────────

export interface LineaParaRepartir {
  id: string;
  volumeM3: number;
}

/**
 * Reparte un total entre los asientos, proporcional al volumen, en céntimos.
 * Al ÚLTIMO le toca el RESTO, no su proporción: así la suma es el total exacto
 * y el céntimo del redondeo no desaparece. Si el redondeo de los anteriores
 * dejara al último negativo (volúmenes minúsculos), se reparte truncando.
 * Sin volumen en ninguno, se reparte en partes iguales.
 */
export function repartirPorVolumen(total: number, lineas: readonly LineaParaRepartir[]): Array<{ id: string; costoTotal: number }> {
  if (lineas.length === 0) return [];
  const totalC = aCentimos(total);
  const vols = lineas.map((l) => Math.max(0, Number(l.volumeM3) || 0));
  const sumaVol = vols.reduce((t, v) => t + v, 0);
  const peso = (i: number) => (sumaVol > 0 ? vols[i] / sumaVol : 1 / lineas.length);

  const repartir = (redondeo: (n: number) => number) => {
    const partes: number[] = [];
    let usado = 0;
    for (let i = 0; i < lineas.length - 1; i++) {
      const c = redondeo(totalC * peso(i));
      partes.push(c);
      usado += c;
    }
    partes.push(totalC - usado);
    return partes;
  };
  let partes = repartir(Math.round);
  if (partes[partes.length - 1] < 0) partes = repartir(Math.floor);
  return lineas.map((l, i) => ({ id: l.id, costoTotal: deCentimos(partes[i]) }));
}

export interface LineaParaPrecio {
  id: string;
  volumeM3: number;
  productType: string | null | undefined;
}

export interface PrecioDeEspecie {
  /** S/ por unidad. */
  precio: number;
  unidad: "m3" | "pt";
  /** Lo que dice la factura (m³ o pt). `null` → se usa lo nuestro (m³ del libro o ≈pt). */
  cantidadFactura: number | null;
}

export interface CostoDeEspecie {
  id: string;
  costoTotal: number;
  cantidad: number;
  /** `true` si la cantidad salió de nuestro cálculo (≈pt o m³ del libro) y no de la factura. */
  cantidadDerivada: boolean;
  ptDerivado: number;
}

/**
 * Precio por especie: cada asiento vale precio × cantidad, redondeado al
 * céntimo. La cantidad es la de la FACTURA si se tipeó; si no, el m³ del libro
 * o el ≈pt nuestro — y se marca `cantidadDerivada` para rotularlo.
 */
export function costoPorEspecie(
  lineas: readonly LineaParaPrecio[],
  precios: Readonly<Record<string, PrecioDeEspecie | undefined>>,
): CostoDeEspecie[] {
  const out: CostoDeEspecie[] = [];
  for (const l of lineas) {
    const p = precios[l.id];
    if (!p || !(p.precio > 0)) continue;
    const pt = ptDeLinea(l);
    const derivada = p.cantidadFactura == null;
    const cantidad = derivada ? (p.unidad === "m3" ? Number(l.volumeM3) || 0 : pt) : p.cantidadFactura!;
    out.push({ id: l.id, costoTotal: r2(p.precio * cantidad), cantidad, cantidadDerivada: derivada, ptDerivado: pt });
  }
  return out;
}

export interface LineaParaCuadrar {
  id: string;
  costoTotal: number;
  volumeM3: number;
  speciesCommonName?: string | null;
}

export interface Cuadre {
  cierra: boolean;
  suma: number;
  /** total − suma. Positivo = falta asignar; negativo = sobra. */
  diferencia: number;
  /** El único ajuste que se ofrece: «Ajustar S/ X en <especie mayor>». `null` si cierra o no se puede. */
  ajuste: { id: string; especie: string | null; monto: number; nuevoCosto: number } | null;
}

/**
 * ¿La suma de los asientos cierra con la factura? Si no, propone mover la
 * diferencia a la especie de MAYOR volumen — nunca la aplica sola: el ajuste lo
 * elige la persona («Ajustar S/ X en Tornillo»). No se ofrece si dejaría a esa
 * especie en negativo.
 */
export function cuadrarConFactura(lineas: readonly LineaParaCuadrar[], totalFactura: number): Cuadre {
  const sumaC = lineas.reduce((t, l) => t + aCentimos(l.costoTotal), 0);
  const difC = aCentimos(totalFactura) - sumaC;
  const suma = deCentimos(sumaC);
  const diferencia = deCentimos(difC);
  if (Math.abs(diferencia) <= TOLERANCIA_SOLES) return { cierra: true, suma, diferencia: 0, ajuste: null };
  const mayor = [...lineas].sort((a, b) => Number(b.volumeM3) - Number(a.volumeM3) || a.id.localeCompare(b.id))[0];
  if (!mayor) return { cierra: false, suma, diferencia, ajuste: null };
  const nuevoC = aCentimos(mayor.costoTotal) + difC;
  return {
    cierra: false,
    suma,
    diferencia,
    ajuste: nuevoC >= 0 ? { id: mayor.id, especie: mayor.speciesCommonName ?? null, monto: diferencia, nuevoCosto: deCentimos(nuevoC) } : null,
  };
}

/** Aplica el ajuste que la persona eligió (sin mutar la entrada). */
export function aplicarAjuste<T extends { id: string; costoTotal: number }>(lineas: readonly T[], ajuste: Cuadre["ajuste"]): T[] {
  if (!ajuste) return [...lineas];
  return lineas.map((l) => (l.id === ajuste.id ? { ...l, costoTotal: ajuste.nuevoCosto } : l));
}

// ── A quién se le paga ──────────────────────────────────────────────────────

export type ViaProveedor = "enlace" | "titular" | "nombre" | "parecido";

export interface ProveedorDeGuia {
  parteId: string;
  nombre: string;
  via: ViaProveedor;
  /** `false` = sólo se PROPONE (nombre parecido): no se anota solo en ninguna cuenta. */
  seguro: boolean;
}

export interface ParteCandidata {
  id: string;
  nombre: string;
  activo?: boolean | null;
}

/**
 * A quién le pagas esta guía (ADR-437 §2). Orden:
 *  1. enlace explícito (`WoodEntry.proveedorParteId`),
 *  2. titular del permiso (`ForestContrato.titularId`),
 *  3. nombre exacto normalizado (`providerName` = una sola ficha),
 *  4. nombre parecido — SÓLO propone, y sólo si hay UN candidato.
 *
 * **Nunca por `providerDocument`**: en Blas es el RUC de la ATFFS, el mismo
 * para Nelly y para Santa Rosa. Por eso la entrada ni siquiera lo recibe.
 */
export function proveedorDeLaGuia(
  guia: { enlaceParteId: string | null; titularId: string | null; providerName: string | null },
  partes: readonly ParteCandidata[],
): ProveedorDeGuia | null {
  const porId = new Map(partes.map((p) => [p.id, p]));
  const enlace = guia.enlaceParteId ? porId.get(guia.enlaceParteId) : undefined;
  if (enlace) return { parteId: enlace.id, nombre: enlace.nombre, via: "enlace", seguro: true };
  const titular = guia.titularId ? porId.get(guia.titularId) : undefined;
  if (titular) return { parteId: titular.id, nombre: titular.nombre, via: "titular", seguro: true };

  const nombre = normalizarNombre(guia.providerName);
  if (!nombre) return null;
  const vivas = partes.filter((p) => p.activo !== false);
  const exactas = vivas.filter((p) => normalizarNombre(p.nombre) === nombre);
  if (exactas.length === 1) return { parteId: exactas[0].id, nombre: exactas[0].nombre, via: "nombre", seguro: true };
  if (exactas.length > 1) return null; // dos tocayos: no se elige a ciegas
  const parecidas = vivas.filter((p) => mismaEntidadPorNombre(p.nombre, guia.providerName ?? ""));
  if (parecidas.length === 1) return { parteId: parecidas[0].id, nombre: parecidas[0].nombre, via: "parecido", seguro: false };
  return null;
}

// ── Costo puesto en patio ───────────────────────────────────────────────────

export interface CostoPuesto {
  /** Σ costo de la madera; `null` en servicio o si falta el costo. */
  madera: number | null;
  /** Fletes de ingreso que paga el CTP, con monto. */
  fletes: number;
  /** Fletes del CTP sin monto cargado: dejan el total incompleto. */
  fletesSinMonto: number;
  /** Fletes que paga el proveedor: se muestran, NO suman. */
  fletesDelProveedor: number;
  gastos: number;
  /** Σ de lo conocido. Si `incompleto`, es un piso, no el costo. */
  total: number;
  incompleto: boolean;
  /** Qué falta, en palabras. */
  faltantes: string[];
  /** S/ por m³; `null` si incompleto o sin volumen. */
  porM3: number | null;
}

/**
 * Costo puesto en patio (ADR-437 §8): madera + fletes de ingreso que paga el
 * CTP (vivos) + gastos de la guía. DERIVADO: nunca se escribe en `costoTotal`
 * ni en `costoUnitarioSnap` (el P&L ya cuenta los `Expense`).
 */
export function costoPuestoEnPatio(input: {
  esServicio: boolean;
  /** Σ costo de la madera (`null` = falta). */
  madera: number | null;
  volumenM3: number;
  fletes: ReadonlyArray<{ tipo: string; pagaQuien: string; monto: number | null; deletedAt?: string | Date | null }>;
  gastos: ReadonlyArray<{ monto: number }>;
}): CostoPuesto {
  let fletesC = 0;
  let sinMonto = 0;
  let delProveedorC = 0;
  for (const f of input.fletes) {
    if (f.deletedAt || f.tipo !== "ingreso") continue;
    if (f.pagaQuien === "proveedor") {
      if (f.monto != null) delProveedorC += aCentimos(f.monto);
      continue;
    }
    if (f.pagaQuien !== "ctp") continue;
    if (f.monto == null || !(f.monto > 0)) sinMonto += 1;
    else fletesC += aCentimos(f.monto);
  }
  const gastosC = input.gastos.reduce((t, g) => t + aCentimos(g.monto), 0);
  const madera = input.esServicio ? null : input.madera;
  const faltantes: string[] = [];
  if (!input.esServicio && madera == null) faltantes.push("el costo de la madera");
  if (sinMonto > 0) faltantes.push(sinMonto === 1 ? "el monto de un flete" : `el monto de ${sinMonto} fletes`);
  const totalC = (madera != null ? aCentimos(madera) : 0) + fletesC + gastosC;
  const incompleto = faltantes.length > 0;
  const vol = Number(input.volumenM3) || 0;
  return {
    madera,
    fletes: deCentimos(fletesC),
    fletesSinMonto: sinMonto,
    fletesDelProveedor: deCentimos(delProveedorC),
    gastos: deCentimos(gastosC),
    total: deCentimos(totalC),
    incompleto,
    faltantes,
    porM3: !incompleto && vol > 0 ? r2(deCentimos(totalC) / vol) : null,
  };
}

// ── Estado de pago (derivado, ADR-437 §7) ───────────────────────────────────

export type EstadoPago = "pagada" | "parcial" | "pendiente";

export interface GuiaParaPago {
  gtfNumber: string;
  parteId: string;
  /** `AAAA-MM-DD` o ISO: define el orden «por antigüedad». */
  fecha: string;
  /** Lo que vale la madera de la guía (el abono `madera`). */
  monto: number;
}

export interface EstadoPagoGuia {
  gtfNumber: string;
  parteId: string;
  fecha: string;
  monto: number;
  /** Cubierto por cargos que nombran esta guía (`gtfNumber`). */
  cubiertoDirecto: number;
  /** Cubierto por cargos sin guía, repartidos por antigüedad (FIFO). */
  cubiertoPorAntiguedad: number;
  pagado: number;
  pendiente: number;
  /** Lo que los cargos de ESTA guía pasaron de su monto (se aplicó a las demás por antigüedad). */
  excedente: number;
  estado: EstadoPago;
  /**
   * De qué está hecho `pagado` —que es «cubierto»—, al céntimo (revisión
   * 2026-09-26): plata entregada (`pago_hecho`), cruce con adelantos
   * (`compensacion`) y cualquier otro cargo (aserrío prestado, flete, venta…).
   * La sección Cuenta llama «pagado» sólo a los dos primeros; sin esto el
   * modal mostraba dos «Pagado» distintos. Σ = `pagado`.
   */
  desglose: DesgloseCubierto;
}

export interface DesgloseCubierto {
  pagado: number;
  cruzado: number;
  otros: number;
}

type Parte = keyof DesgloseCubierto;
type Bolsa = Record<Parte, number>;
const bolsaVacia = (): Bolsa => ({ pagado: 0, cruzado: 0, otros: 0 });
const parteDe = (concepto: string): Parte =>
  concepto === "pago_hecho" ? "pagado" : concepto === "compensacion" ? "cruzado" : "otros";
/** La plata cubre primero; lo que se le debe por OTRA cosa se come primero los otros cargos. */
const ORDEN_GUIA: readonly Parte[] = ["pagado", "cruzado", "otros"];
const ORDEN_OTRA_DEUDA: readonly Parte[] = ["otros", "cruzado", "pagado"];
const totalBolsa = (b: Bolsa) => b.pagado + b.cruzado + b.otros;
/** Saca `c` céntimos de la bolsa en ese orden; devuelve qué salió de cada parte. */
function sacar(b: Bolsa, c: number, orden: readonly Parte[]): Bolsa {
  const out = bolsaVacia();
  let resta = c;
  for (const k of orden) {
    const t = Math.min(resta, b[k]);
    b[k] -= t;
    out[k] += t;
    resta -= t;
  }
  return out;
}

/**
 * Cuánto de cada guía está pagado, por parte.
 *
 *  1. Los cargos con `gtfNumber` cubren SU guía; lo que sobra pasa al pozo común.
 *  2. Los cargos sin guía (y los de guías ajenas a la lista) forman el pozo.
 *  3. Del pozo se descuenta PRIMERO lo que se le debe por otra cosa: los abonos
 *     que no son la madera de una guía de la lista (aserrío recibido, «otro», la
 *     madera de una guía que no está en la lista…). Un pago suelto no dice qué
 *     pagó; mientras la cuenta diga que se le debe, la guía no se da por pagada
 *     (revisión 2026-09-26: saldo −1000 con la guía «pagada»).
 *  4. Lo que queda del pozo (nunca negativo) cubre las guías de la más vieja a
 *     la más nueva (rotulado «por antigüedad»).
 *
 * Todos los cargos de la parte (pago entregado, flete a su cargo, aserrío
 * prestado, venta, cruce…) bajan lo que se le debe. Invariante (con test):
 * Σ pendiente = mín(lo que falta de las guías tras sus cargos directos,
 * max(0, −saldo de la parte)). Con sólo abonos de madera, eso es
 * max(0, Σ madera − Σ cargos).
 *
 * `guiasPendientesDe` (liquidación) llama a ESTA función: el modal, el aviso,
 * Mi Plata y la liquidación dicen lo mismo.
 *
 * El desglose (`desglose`) no cambia ningún total: sólo dice de qué parte salió
 * cada céntimo. Orden: a la guía, primero la plata, después el cruce, después
 * los otros cargos; a lo que se debe por otra cosa, al revés (un aserrío
 * prestado se cancela primero contra un aserrío recibido).
 *
 * Nunca se guarda: se recalcula en cada lectura.
 */
export function estadoDePagoDeGuias(
  guias: readonly GuiaParaPago[],
  movimientos: ReadonlyArray<Pick<MovimientoCuenta, "parteId" | "tipo" | "monto" | "gtfNumber"> & { concepto: string }>,
): EstadoPagoGuia[] {
  const porParte = new Map<string, GuiaParaPago[]>();
  for (const g of guias) {
    const l = porParte.get(g.parteId) ?? [];
    l.push(g);
    porParte.set(g.parteId, l);
  }
  const salida: EstadoPagoGuia[] = [];
  for (const [parteId, lista] of porParte) {
    const ordenadas = [...lista].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.gtfNumber.localeCompare(b.gtfNumber));
    const gtfs = new Set(ordenadas.map((g) => g.gtfNumber));
    const directoC = new Map<string, Bolsa>();
    const pozo = bolsaVacia();
    /* Lo que se le debe por algo que NO es la madera de estas guías. */
    let otraDeudaC = 0;
    for (const m of movimientos) {
      if (m.parteId !== parteId) continue;
      const c = aCentimos(m.monto);
      if (m.tipo === "abono") {
        const esMaderaDeLaLista = m.concepto === "madera" && Boolean(m.gtfNumber) && gtfs.has(m.gtfNumber ?? "");
        if (!esMaderaDeLaLista) otraDeudaC += c;
        continue;
      }
      if (m.tipo !== "cargo") continue;
      const k = parteDe(m.concepto);
      if (m.gtfNumber && gtfs.has(m.gtfNumber)) {
        const b = directoC.get(m.gtfNumber) ?? bolsaVacia();
        b[k] += c;
        directoC.set(m.gtfNumber, b);
      } else pozo[k] += c;
    }
    const filas = ordenadas.map((g) => {
      const montoC = aCentimos(g.monto);
      const dir = directoC.get(g.gtfNumber) ?? bolsaVacia();
      const cubre = Math.min(totalBolsa(dir), montoC);
      const cubreB = sacar(dir, cubre, ORDEN_GUIA);
      // Lo que sobra de SUS cargos (ya sin lo que cubrió) pasa al pozo común.
      const excedenteC = totalBolsa(dir);
      for (const k of ORDEN_GUIA) pozo[k] += dir[k];
      return { g, montoC, cubre, cubreB, excedenteC };
    });
    sacar(pozo, Math.min(otraDeudaC, totalBolsa(pozo)), ORDEN_OTRA_DEUDA);
    for (const f of filas) {
      const falta = f.montoC - f.cubre;
      const fifo = Math.min(falta, totalBolsa(pozo));
      const fifoB = sacar(pozo, fifo, ORDEN_GUIA);
      const pagadoC = f.cubre + fifo;
      const pendienteC = f.montoC - pagadoC;
      salida.push({
        gtfNumber: f.g.gtfNumber,
        parteId,
        fecha: f.g.fecha,
        monto: deCentimos(f.montoC),
        cubiertoDirecto: deCentimos(f.cubre),
        cubiertoPorAntiguedad: deCentimos(fifo),
        pagado: deCentimos(pagadoC),
        pendiente: deCentimos(pendienteC),
        excedente: deCentimos(f.excedenteC),
        estado: deCentimos(pendienteC) <= TOLERANCIA_SOLES ? "pagada" : pagadoC > 0 ? "parcial" : "pendiente",
        desglose: {
          pagado: deCentimos(f.cubreB.pagado + fifoB.pagado),
          cruzado: deCentimos(f.cubreB.cruzado + fifoB.cruzado),
          otros: deCentimos(f.cubreB.otros + fifoB.otros),
        },
      });
    }
  }
  return salida;
}

// ── Aviso «guías sin pagar» (ADR-437 §10) ───────────────────────────────────

export interface GuiasSinPagarDeParte {
  parteId: string;
  parteNombre: string;
  guias: number;
  pendiente: number;
  gtfNumbers: string[];
  /** `AAAA-MM-DD` de la guía sin pagar más vieja. */
  desde: string;
  /** `atrasado` sólo si la ficha dice crédito y se pasó la fecha + días de crédito. Nunca `bloquea`. */
  nivel: "atrasado" | "pendiente";
}

const sumarDias = (dia: string, n: number): string => {
  const d = new Date(`${dia.slice(0, 10)}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * «3 guías sin pagar a Nelly · S/ 12 400». Una fila por parte con algo
 * pendiente, lo más grande primero.
 */
export function guiasSinPagarPorParte(
  estados: readonly EstadoPagoGuia[],
  partes: ReadonlyArray<{ id: string; nombre: string; condicionPago?: string | null; diasCredito?: number | null }>,
  hoy: string,
): GuiasSinPagarDeParte[] {
  const info = new Map(partes.map((p) => [p.id, p]));
  const grupos = new Map<string, EstadoPagoGuia[]>();
  for (const e of estados) {
    if (e.estado === "pagada") continue;
    const l = grupos.get(e.parteId) ?? [];
    l.push(e);
    grupos.set(e.parteId, l);
  }
  const hoyDia = hoy.slice(0, 10);
  const out: GuiasSinPagarDeParte[] = [];
  for (const [parteId, lista] of grupos) {
    const p = info.get(parteId);
    const ordenadas = [...lista].sort((a, b) => a.fecha.localeCompare(b.fecha));
    const desde = ordenadas[0].fecha.slice(0, 10);
    const credito = p?.condicionPago === "credito" && p.diasCredito != null && p.diasCredito >= 0;
    const atrasado = credito && ordenadas.some((e) => sumarDias(e.fecha, p!.diasCredito!) < hoyDia);
    out.push({
      parteId,
      parteNombre: p?.nombre ?? "—",
      guias: ordenadas.length,
      pendiente: deCentimos(ordenadas.reduce((t, e) => t + aCentimos(e.pendiente), 0)),
      gtfNumbers: ordenadas.map((e) => e.gtfNumber),
      desde,
      nivel: atrasado ? "atrasado" : "pendiente",
    });
  }
  return out.sort((a, b) => b.pendiente - a.pendiente || a.parteNombre.localeCompare(b.parteNombre, "es"));
}
