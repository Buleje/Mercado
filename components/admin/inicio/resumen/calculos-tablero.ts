/**
 * Cuentas del tablero denso del Resumen (2026-10-29, Brandon: «gráficos de alto
 * nivel y detallados, compactos, que se vea completo»): cómo te pagan, cuándo te
 * compran (día × hora), el stock en riesgo y la ganancia de TODO lo vendido (no
 * sólo del top 7). Mismo origen que `calculos-resumen` (`useDashboardData()`):
 * son la vista previa del período, como los otros bloques del Resumen.
 */
import { stockMinimoDe, enStockBajo } from "@/lib/inventario/stock-minimo";
import { estaAgotado } from "@/lib/pos/stock-vendible";
import { PAY_LABELS, colorDeMetodo } from "../caja-presentacion";
import type { Order, Product, Sale } from "./calculos-resumen";

type ConPago = { paymentMethod?: string | null; payment?: string | null };

const enRango = (iso: string, desde: number, hasta: number) => {
  const t = new Date(iso).getTime();
  return t >= desde && t <= hasta;
};

/** Pedidos no cancelados + ventas del mostrador, dentro del rango. */
function movimientos(orders: Order[], sales: Sale[], desde: number, hasta: number) {
  const pedidos = orders.filter((o) => o.status !== "cancelado" && enRango(o.createdAt, desde, hasta));
  const ventas = sales.filter((s) => enRango(s.createdAt, desde, hasta));
  return { pedidos, ventas };
}

// ── Cómo te pagan ───────────────────────────────────────────────────────────
export type FilaMetodo = {
  clave: string;
  metodo: string;
  total: number;
  veces: number;
  pct: number;
  color: string;
};

/** Lo cobrado por medio de pago. Sin medio anotado cuenta como efectivo (regla de Ventas). */
export function metodosDePago(orders: Order[], sales: Sale[], desde: number, hasta: number): FilaMetodo[] {
  const { pedidos, ventas } = movimientos(orders, sales, desde, hasta);
  const m = new Map<string, { total: number; veces: number }>();
  const sumar = (clave: string, total: number) => {
    const cur = m.get(clave) ?? { total: 0, veces: 0 };
    cur.total += total;
    cur.veces += 1;
    m.set(clave, cur);
  };
  pedidos.forEach((o) => sumar(((o as ConPago).paymentMethod ?? "efectivo").toLowerCase(), o.total));
  ventas.forEach((s) => sumar(((s as ConPago).payment ?? "efectivo").toLowerCase(), s.total));
  const total = [...m.values()].reduce((s, v) => s + v.total, 0);
  return [...m.entries()]
    .filter(([, v]) => v.total > 0)
    .map(([clave, v]) => ({
      clave,
      metodo: PAY_LABELS[clave] ?? clave.charAt(0).toUpperCase() + clave.slice(1),
      total: v.total,
      veces: v.veces,
      pct: total > 0 ? (v.total / total) * 100 : 0,
      color: colorDeMetodo(clave),
    }))
    .sort((a, b) => b.total - a.total);
}

// ── Cuándo te compran (día de la semana × hora) ─────────────────────────────
export interface MapaDeHoras {
  /** monto[dia][hora], día 0 = lunes. */
  monto: number[][];
  veces: number[][];
  /** Primera y última hora con algún movimiento (para no dibujar la madrugada vacía). */
  horaDesde: number;
  horaHasta: number;
  porDia: number[];
  porHora: number[];
  max: number;
  total: number;
  registros: number;
}

/**
 * Plata cobrada por día de la semana y hora (hora del navegador, como «Hora
 * pico»). Las 00:00 se descartan: es una fecha sin hora, no una venta a
 * medianoche (misma regla que `horaPico`).
 */
export function mapaDiaHora(orders: Order[], sales: Sale[], desde: number, hasta: number): MapaDeHoras {
  const { pedidos, ventas } = movimientos(orders, sales, desde, hasta);
  const monto = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  const veces = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  let registros = 0;
  const sumar = (iso: string, total: number) => {
    const d = new Date(iso);
    const hora = d.getHours();
    if (hora === 0 && d.getMinutes() === 0) return;
    const dia = (d.getDay() + 6) % 7;
    monto[dia][hora] += total;
    veces[dia][hora] += 1;
    registros += 1;
  };
  pedidos.forEach((o) => sumar(o.createdAt, o.total));
  ventas.forEach((s) => sumar(s.createdAt, s.total));
  const porHora = Array.from({ length: 24 }, (_, h) => monto.reduce((s, fila) => s + fila[h], 0));
  const porDia = monto.map((fila) => fila.reduce((s, v) => s + v, 0));
  const conHora = porHora.map((v, h) => (v > 0 ? h : -1)).filter((h) => h >= 0);
  const horaDesde = conHora.length ? Math.max(0, conHora[0] - 1) : 8;
  const horaHasta = conHora.length ? Math.min(23, conHora[conHora.length - 1] + 1) : 20;
  return {
    monto,
    veces,
    horaDesde,
    horaHasta,
    porDia,
    porHora,
    max: Math.max(0, ...monto.flat()),
    total: porDia.reduce((s, v) => s + v, 0),
    registros,
  };
}

// ── Stock en riesgo ─────────────────────────────────────────────────────────
export type FilaRiesgo = { producto: string; stock: number; minimo: number; agotado: boolean };

/** Agotados primero; después los que están en su mínimo, del más corto al más holgado. */
export function stockEnRiesgo(
  products: Product[],
  minimoGlobal: number,
  max = 6,
): { filas: FilaRiesgo[]; total: number } {
  const enRiesgo = products
    // Misma regla que `kpisInventario`: en su mínimo CON stock, o agotado según el POS
    // (un servicio con stock 0 no se repone: 16 de main lo eran, 11-10).
    .filter(
      (p) =>
        !!p.active &&
        (estaAgotado(p) || ((p.stock ?? 0) > 0 && enStockBajo(p, minimoGlobal))),
    )
    .map((p) => ({
      producto: p.name,
      stock: Math.max(0, p.stock ?? 0),
      minimo: stockMinimoDe(p, minimoGlobal),
      agotado: estaAgotado(p),
    }))
    .sort((a, b) => {
      if (a.agotado !== b.agotado) return a.agotado ? -1 : 1;
      const ra = a.minimo > 0 ? a.stock / a.minimo : 1;
      const rb = b.minimo > 0 ? b.stock / b.minimo : 1;
      return ra - rb;
    });
  return { filas: enRiesgo.slice(0, max), total: enRiesgo.length };
}

// ── Ganancia de todo lo vendido ─────────────────────────────────────────────
export interface GananciaDelPeriodo {
  vendido: number;
  /** Lo vendido de productos CON costo cargado: la base honesta del margen. */
  vendidoConCosto: number;
  ganancia: number;
  /** Productos distintos que se vendieron sin costo (no suman a la ganancia). */
  sinCosto: number;
  /** Margen sobre lo que tiene costo; null si nada lo tiene. */
  margenPct: number | null;
}

export function gananciaDelPeriodo(
  products: Product[],
  orders: Order[],
  sales: Sale[],
  desde: number,
  hasta: number,
): GananciaDelPeriodo {
  const { pedidos, ventas } = movimientos(orders, sales, desde, hasta);
  const porId = new Map(products.map((p) => [String(p.id), p]));
  const sinCosto = new Set<string>();
  let vendido = 0;
  let vendidoConCosto = 0;
  let ganancia = 0;
  const sumar = (id: string | number, cantidad: number, precio: number | undefined) => {
    const p = porId.get(String(id));
    const unit = precio ?? p?.price ?? 0;
    vendido += cantidad * unit;
    if (p?.costPrice != null) {
      vendidoConCosto += cantidad * unit;
      ganancia += cantidad * (unit - p.costPrice);
    } else {
      sinCosto.add(String(id));
    }
  };
  pedidos.forEach((o) => o.items.forEach((it) => sumar(it.id, it.quantity, it.price)));
  ventas.forEach((s) => s.items.forEach((it) => sumar(it.productId, it.quantity, it.price)));
  return {
    vendido,
    vendidoConCosto,
    ganancia,
    sinCosto: sinCosto.size,
    margenPct: vendidoConCosto > 0 ? (ganancia / vendidoConCosto) * 100 : null,
  };
}

// ── Cuántos pedidos y ventas por tramo (la mini-serie de «Pedidos») ──────────
export function conteoPorTramo(
  orders: Order[],
  sales: Sale[],
  buckets: Array<{ start: number; end: number }>,
): number[] {
  const out = buckets.map(() => 0);
  const sumar = (iso: string) => {
    const t = new Date(iso).getTime();
    const i = buckets.findIndex((b) => t >= b.start && t <= b.end);
    if (i >= 0) out[i] += 1;
  };
  orders.filter((o) => o.status !== "cancelado").forEach((o) => sumar(o.createdAt));
  sales.forEach((s) => sumar(s.createdAt));
  return out;
}
