/**
 * El adelanto que se paga con madera (Brandon 25-10: «adelanto de madera que
 * baja solo»). Funciones puras que comparten la ficha de la persona, el aviso
 * de la guía y la cubicación. Nada de acá escribe: el monto que se descuenta lo
 * vuelve a calcular el servidor con candado (`LiquidacionCuentaDB.crear` para
 * la guía, `ForestCubicacionTrozasDB.aplicar` para la cubicación).
 *
 * Regla de oro: el precio nunca se inventa. Sin precio anotado no hay pt × precio
 * ni equivalente en pt: se pide el precio.
 */
import { sugerirVinculo, type VinculoSugerido } from "@/lib/adelantos/vinculo-sugerido";

const EPS = 0.005;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ── La madera de una guía ────────────────────────────────────────────────────

/** Lo que una línea de la guía ya tiene anotado (`LineaPlataDTO`, sólo lo que hace falta). */
export interface LineaGuiaConCosto {
  speciesCommonName: string;
  costoTotal: number | null;
  costoDetalle: {
    unidad: "m3" | "pt";
    precio: number | null;
    cantidadFactura: number | null;
    ptUsado?: number | null;
  } | null;
  volumeM3?: number;
}

export interface EspecieValorizada {
  especie: string;
  unidad: "pt" | "m³" | null;
  /** pt o m³ que se multiplicaron; null = la guía no lo dice. */
  cantidad: number | null;
  /** S/ por unidad; null = la guía no lo dice. */
  precio: number | null;
  monto: number;
}

export interface MaderaDeLaGuia {
  /** Σ costo de las líneas con costo. */
  monto: number;
  /** Σ pt, sólo si TODAS las líneas con costo se pagaron por pt con su cantidad. */
  pt: number | null;
  /** S/ por pt: el de todas si es uno solo; si no, monto ÷ pt (promedio). */
  precioPt: number | null;
  /** `false` = `precioPt` es un promedio de precios distintos (se rotula así). */
  precioUnico: boolean;
  porEspecie: EspecieValorizada[];
  /** Líneas sin costo: la guía todavía no está completa. */
  sinCosto: number;
}

function cantidadDe(l: LineaGuiaConCosto): number | null {
  const d = l.costoDetalle;
  if (!d) return null;
  if (d.unidad === "pt") return d.ptUsado ?? d.cantidadFactura ?? null;
  return d.cantidadFactura ?? (l.volumeM3 != null && l.volumeM3 > 0 ? l.volumeM3 : null);
}

/**
 * pt × precio de una guía con lo que ya tiene anotado. `null` si ninguna línea
 * tiene costo: no hay madera valorizada y lo que toca es pedir el precio.
 */
export function maderaDeLaGuia(lineas: readonly LineaGuiaConCosto[]): MaderaDeLaGuia | null {
  const conCosto = lineas.filter((l) => l.costoTotal != null && l.costoTotal > 0);
  if (conCosto.length === 0) return null;
  const porEspecie: EspecieValorizada[] = conCosto.map((l) => {
    const d = l.costoDetalle;
    const cantidad = cantidadDe(l);
    const monto = r2(l.costoTotal ?? 0);
    const precio = d?.precio ?? (cantidad && cantidad > 0 ? r2(monto / cantidad) : null);
    return { especie: l.speciesCommonName, unidad: d ? (d.unidad === "pt" ? "pt" : "m³") : null, cantidad, precio, monto };
  });
  const monto = r2(porEspecie.reduce((t, e) => t + e.monto, 0));
  const todoEnPt = porEspecie.every((e) => e.unidad === "pt" && e.cantidad != null && e.cantidad > 0);
  const pt = todoEnPt ? r2(porEspecie.reduce((t, e) => t + (e.cantidad ?? 0), 0)) : null;
  const precios = new Set(porEspecie.map((e) => e.precio));
  const precioUnico = todoEnPt && precios.size === 1 && porEspecie[0].precio != null;
  const precioPt = pt && pt > 0 ? (precioUnico ? porEspecie[0].precio : r2(monto / pt)) : null;
  return { monto, pt, precioPt, precioUnico, porEspecie, sinCosto: lineas.length - conCosto.length };
}

// ── Cuánto baja ──────────────────────────────────────────────────────────────

export interface CuantoBaja {
  /** Lo que se descuenta del adelanto: lo que falta pagar de la guía, hasta lo que te debe. */
  baja: number;
  /** Lo que le queda de adelanto después. */
  quedaAdelanto: number;
  /** Lo que todavía le debes por la guía después (va a su cuenta). */
  quedaPorPagar: number;
}

/** La MISMA cuenta que «Descontar de lo adelantado» del pago (min de los dos). */
export function cuantoBaja(pendiente: number, adelantoTeDebe: number): CuantoBaja {
  const p = Math.max(0, r2(pendiente));
  const a = Math.max(0, r2(adelantoTeDebe));
  const baja = r2(Math.min(p, a));
  return { baja, quedaAdelanto: r2(a - baja), quedaPorPagar: r2(p - baja) };
}

/** Qué decirle al dueño en la guía. */
export type EstadoDescuentoGuia =
  /** La guía no tiene precio: pedirlo («¿cuánto pagaste?»), nunca inventarlo. */
  | { tipo: "sin_costo" }
  /** El proveedor no está unido a su persona de Adelantos: no se puede cruzar. */
  | { tipo: "sin_unir" }
  /** La madera de esta guía ya bajó del adelanto (lo que se podía). */
  | { tipo: "ya_descontado"; monto: number }
  | ({ tipo: "ofrecer"; yaBajo: number } & CuantoBaja)
  /** Nada que decir: pagada, sin cuenta o sin adelanto abierto. */
  | { tipo: "nada" };

export function estadoDescuentoGuia(e: {
  /** Σ costo de la guía; null = sin costo. */
  totalMadera: number | null;
  /** Lo que falta cubrir de la guía en su cuenta; null = el costo no está anotado en una cuenta. */
  pendiente: number | null;
  /** Lo que ya se cruzó con adelantos en esta guía (`desglose.cruzado`). */
  cruzado: number;
  /** El proveedor está unido a su persona de Adelantos (y el negocio es forestal). */
  cruzable: boolean;
  /** Lo que te debe de adelantos DADOS abiertos. */
  adelantoTeDebe: number;
}): EstadoDescuentoGuia {
  if (e.totalMadera == null || !(e.totalMadera > 0)) return { tipo: "sin_costo" };
  if (e.pendiente == null) return { tipo: "nada" };
  if (!e.cruzable) return { tipo: "sin_unir" };
  const cruzado = Math.max(0, r2(e.cruzado));
  const sinPendiente = e.pendiente <= EPS;
  const sinAdelanto = e.adelantoTeDebe <= EPS;
  if (cruzado > EPS && (sinPendiente || sinAdelanto)) return { tipo: "ya_descontado", monto: cruzado };
  if (sinPendiente || sinAdelanto) return { tipo: "nada" };
  return { tipo: "ofrecer", yaBajo: cruzado, ...cuantoBaja(e.pendiente, e.adelantoTeDebe) };
}

// ── Equivalente en pt ────────────────────────────────────────────────────────

/** S/ → pt al precio dado. null si no hay precio (nunca un precio inventado). */
export function ptEquivalente(soles: number, precioPorPt: number | null | undefined): number | null {
  if (precioPorPt == null || !(precioPorPt > 0) || !(soles > 0)) return null;
  return r2(soles / precioPorPt);
}

/** S/ por unidad de un lote valorizado (monto ÷ volumen). */
export function precioPromedio(monto: number | null | undefined, volumen: number | null | undefined): number | null {
  if (monto == null || volumen == null || !(monto > 0) || !(volumen > 0)) return null;
  return r2(monto / volumen);
}

/**
 * El saldo de UN adelanto en pt cuando el adelanto dice cuántos pt valía
 * (`piesTablares` de lo COMPRADO): saldo × pt ÷ monto. Sin pt declarado, null.
 */
export function ptDelSaldoDelAdelanto(a: {
  montoAdelantado: number;
  saldoPendiente: number;
  piesTablares?: number | null;
  piesTablaresTipo?: string | null;
}): number | null {
  if (a.piesTablaresTipo !== "COMPRADO" || a.piesTablares == null || !(a.piesTablares > 0)) return null;
  if (!(a.montoAdelantado > 0) || !(a.saldoPendiente > 0)) return null;
  return r2((a.saldoPendiente * a.piesTablares) / a.montoAdelantado);
}

/** Una cubicación aplicada (`CubicacionTrozasResumen`, sólo lo que hace falta). */
export interface CubicacionParaPrecio {
  codigo: string;
  fecha: string;
  unidad: "PT" | "m³";
  sentido: string;
  estado: string;
  monto: number | null;
  volumen: number;
}

export interface UltimoPrecioPt {
  precioPt: number;
  codigo: string;
  fecha: string;
}

/**
 * El S/ por pt de la última madera que te trajo (cubicación APLICADA, en pt, de
 * compra). La lista viene de la más nueva a la más vieja (`list` ordena así).
 */
export function ultimoPrecioPt(cubicaciones: readonly CubicacionParaPrecio[]): UltimoPrecioPt | null {
  const c = [...cubicaciones]
    .filter((x) => x.estado === "aplicada" && x.unidad === "PT" && x.sentido === "compra")
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .find((x) => precioPromedio(x.monto, x.volumen) != null);
  if (!c) return null;
  return { precioPt: precioPromedio(c.monto, c.volumen) as number, codigo: c.codigo, fecha: c.fecha };
}

// ── ¿Es la misma persona? ────────────────────────────────────────────────────

/** Una fila de «¿De quién es la madera?» (`PersonaCuenta`, sin documento: Ley 29733). */
export interface FilaPersona {
  clave: string;
  nombre: string;
  beneficiarioId: string | null;
  parteId: string | null;
  adelantos?: { abiertos: number; teDebe: number } | null;
}

/**
 * La persona de Adelantos que parece ser esta ficha del directorio, para
 * preguntar «¿es la misma? únelas». Sólo las que NO tienen ficha y tienen algo
 * abierto; una sola que calce por nombre, o ninguna (misma regla estricta que
 * `sugerirVinculo`). Nunca une: alimenta una pregunta con confirmación.
 */
export function sugerirPersonaDeAdelantos<T extends FilaPersona>(
  parte: { nombre: string; documento?: string | null },
  filas: readonly T[],
): VinculoSugerido<{ parteId: string; nombre: string; documento: null; fila: T }> | null {
  const candidatas = filas
    .filter((f) => f.beneficiarioId && !f.parteId && (f.adelantos?.abiertos ?? 0) > 0)
    .map((f) => ({ parteId: f.beneficiarioId as string, nombre: f.nombre, documento: null, fila: f }));
  return sugerirVinculo({ nombre: parte.nombre, documento: parte.documento ?? null }, candidatas);
}

/** «977 pt»: entero y con separador de miles, como se dice en el aserradero. */
export function fmtPt(pt: number): string {
  return `${Math.round(pt).toLocaleString("es-PE")} pt`;
}
