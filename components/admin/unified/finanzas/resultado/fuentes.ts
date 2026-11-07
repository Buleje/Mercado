/**
 * Cómo se NOMBRA y cómo se ESCRIBE cada cifra del resultado y de la caja
 * (ADR-451). Sólo presentación: los montos y los totales llegan hechos del
 * servidor; acá no se suma nada.
 */

import { formatCurrency, formatNumber, SIN_DATO } from "@/lib/format";
import type { Certeza, FuenteDetalle, TipoViene } from "@/lib/finance/resultado-del-negocio";

interface Nombre {
  /** El rótulo del renglón, en palabras del aserradero y de la bodega. */
  label: string;
  /** Qué se cuenta en `cuantos`: [una, varias]. */
  cosa: [string, string];
}

export const NOMBRE_FUENTE: Record<FuenteDetalle, Nombre> = {
  // Resultado · ingresos
  mostrador: { label: "Mostrador", cosa: ["venta", "ventas"] },
  pedidos: { label: "Pedidos", cosa: ["pedido", "pedidos"] },
  aserrio: { label: "Aserrío", cosa: ["corrida", "corridas"] },
  madera_vendida: { label: "Madera vendida", cosa: ["guía", "guías"] },
  fletes_cobrados: { label: "Fletes cobrados", cosa: ["flete", "fletes"] },
  // Resultado · costos
  mercaderia: { label: "Mercadería vendida", cosa: ["venta", "ventas"] },
  costo_madera: { label: "Costo de la madera vendida", cosa: ["guía", "guías"] },
  aserrio_recibido: { label: "Aserrío que te hicieron", cosa: ["corrida", "corridas"] },
  fletes_pagados: { label: "Fletes pagados", cosa: ["flete", "fletes"] },
  gastos: { label: "Gastos", cosa: ["gasto", "gastos"] },
  planilla: { label: "Planilla", cosa: ["persona", "personas"] },
  // Caja · entró
  mostrador_cobrado: { label: "Mostrador", cosa: ["cobro", "cobros"] },
  pedidos_cobrados: { label: "Pedidos", cosa: ["pedido", "pedidos"] },
  cobros_forestales: { label: "Cobros en cuentas forestales", cosa: ["pago", "pagos"] },
  liquidacion_recibida: { label: "Liquidaciones cobradas", cosa: ["liquidación", "liquidaciones"] },
  adelanto_recibido: { label: "Adelantos recibidos", cosa: ["adelanto", "adelantos"] },
  adelanto_devuelto: { label: "Adelantos que te devolvieron", cosa: ["devolución", "devoluciones"] },
  // Caja · salió
  adelanto_dado: { label: "Adelantos que diste", cosa: ["adelanto", "adelantos"] },
  pagos_forestales: { label: "Pagos en cuentas forestales", cosa: ["pago", "pagos"] },
  liquidacion_pagada: { label: "Liquidaciones pagadas", cosa: ["liquidación", "liquidaciones"] },
  gastos_pagados: { label: "Gastos pagados", cosa: ["gasto", "gastos"] },
  fletes_pagados_caja: { label: "Fletes pagados", cosa: ["flete", "fletes"] },
  recibido_devuelto: { label: "Adelantos que devolviste", cosa: ["devolución", "devoluciones"] },
  // Aparte: se muestran, no suman
  compras_madera: { label: "Compras de madera", cosa: ["guía", "guías"] },
  caja_sin_sumar: { label: "Movimientos a mano en la caja", cosa: ["movimiento", "movimientos"] },
};

export const NOMBRE_VIENE: Record<TipoViene, string> = {
  te_deben_cuenta: "Te deben en cuentas forestales",
  le_debes_cuenta: "Debes en cuentas forestales",
  recibido_para_cruzar: "Ya te adelantaron: para cruzar",
  adelantos_por_cobrar: "Adelantos por cobrar",
  fiados: "Fiado",
  por_pagar_proveedores: "Por pagar a proveedores",
  planilla_por_pagar: "Planilla por pagar",
};

/** «1 corrida» / «31 corridas». */
export function cuantosTexto(fuente: FuenteDetalle, n: number): string {
  const [una, varias] = (NOMBRE_FUENTE as Partial<Record<string, Nombre>>)[fuente]?.cosa ?? ["movimiento", "movimientos"];
  return `${formatNumber(n, 0)} ${n === 1 ? una : varias}`;
}

/**
 * Un id que la pantalla todavía no conoce, legible: «recibido_devuelto» →
 * «Recibido devuelto». El servidor suma fuentes sin avisar (29-09 llegaron dos):
 * un renglón nuevo tiene que leerse como palabras, nunca como su id crudo, y
 * nunca romper la pantalla por un `undefined.label`.
 */
function legible(id: string): string {
  const s = id.replace(/[_-]+/g, " ").trim();
  return s ? `${s.charAt(0).toUpperCase()}${s.slice(1)}` : "Otro";
}

/** El rótulo de una fuente del resultado o de la caja, con respaldo legible. */
export const etiquetaFuente = (fuente: string): string =>
  (NOMBRE_FUENTE as Partial<Record<string, Nombre>>)[fuente]?.label ?? legible(fuente);

/** El rótulo de un renglón de «Lo que viene», con respaldo legible. */
export const etiquetaViene = (tipo: string): string =>
  (NOMBRE_VIENE as Partial<Record<string, string>>)[tipo] ?? legible(tipo);

/** Lo que no es «medido» lleva «≈»: estimado, o le falta un dato. */
export const esAproximado = (c: Certeza): boolean => c !== "medido";

/**
 * «S/ 1,000.00» · «≈ S/ 780.00» · con signo «− S/ 900.00». `null` = «—», nunca
 * «S/ 0.00»: un monto que no se sabe no es cero.
 */
export function montoTexto(monto: number | null, o: { aproximado?: boolean; signo?: boolean } = {}): string {
  if (monto == null || !Number.isFinite(monto)) return SIN_DATO;
  const signo = monto < 0 ? "− " : o.signo && monto > 0 ? "+ " : "";
  return `${o.aproximado ? "≈ " : ""}${signo}${formatCurrency(Math.abs(monto))}`;
}

/** PT antes que m³: «1,234 pt · 5.20 m³». Sin PT medido, sólo m³ (no se inventa PT). */
export function medidaTexto(pt: number | null, m3: number | null): string | null {
  const partes: string[] = [];
  if (pt != null && pt > 0) partes.push(`${formatNumber(pt, 0)} pt`);
  if (m3 != null && m3 > 0) partes.push(`${formatNumber(m3, 2)} m³`);
  return partes.length ? partes.join(" · ") : null;
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre",
];

/** «setiembre» de `2026-09` (escrito a mano: Intl cambia según la versión de ICU). */
export const nombreMes = (mes: string): string => MESES[Number(mes.slice(5, 7)) - 1] ?? mes;

/** «Setiembre 2026». */
export const mesConAnio = (mes: string): string => {
  const n = nombreMes(mes);
  return `${n.charAt(0).toUpperCase()}${n.slice(1)} ${mes.slice(0, 4)}`;
};

/** «set.» para el eje de la tira. */
export const mesCorto = (mes: string): string => `${nombreMes(mes).slice(0, 3)}.`;

/** `YYYY-MM` de un año y un mes 0-11. */
export const claveMes = (anio: number, mes0: number): string => `${anio}-${String(mes0 + 1).padStart(2, "0")}`;
