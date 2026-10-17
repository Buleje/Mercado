/**
 * Formato y color de los tableros de Inicio (`?tab=vendor-dashboard`): una
 * sola forma de escribir plata, porcentajes y fechas, y un color fijo por
 * concepto para que «ventas» se vea igual en Resumen, Ventas y Caja.
 *
 * Plata: el canon del repo es `formatCurrency` (`lib/format`): «S/ 1,234.50»
 * (es-PE usa punto decimal y coma de miles). Los ejes usan la forma compacta
 * con el MISMO separador («S/ 1.5 mil») para que no se lea «1,5» como mil
 * quinientos en una vista y como uno coma cinco en otra.
 *
 * Fechas: meses escritos a mano («01 oct», sin el punto ni el guion que mete
 * ICU) y siempre en hora de Lima.
 */
import { formatCurrency, formatNumber, SIN_DATO } from "@/lib/format";
import { STORE_TIMEZONE } from "@/lib/utils";
import { numeroDe } from "./hay-datos";

export { SIN_DATO };

/** «S/ 1,234.50» · sin dato → «—». */
export function soles(v: unknown): string {
  const n = numeroDe(v);
  return n === null ? SIN_DATO : formatCurrency(n);
}

function compacto(n: number): string {
  const abs = Math.abs(n);
  const signo = n < 0 ? "-" : "";
  // Umbrales un pelo por debajo: 999,960 redondeado a mil daría «1,000 mil».
  if (abs >= 999_950) return `${signo}${formatNumber(abs / 1_000_000, { max: 1 })} M`;
  if (abs >= 999.5) return `${signo}${formatNumber(abs / 1_000, { max: 1 })} mil`;
  return `${signo}${formatNumber(abs, { max: abs < 10 ? 1 : 0 })}`;
}

/**
 * Plata para ejes y etiquetas chicas: «S/ 850» · «S/ 1.5 mil» · «S/ 2.3 M» ·
 * «-S/ 120». Sin dato → «—».
 */
export function solesEje(v: unknown): string {
  const n = numeroDe(v);
  if (n === null) return SIN_DATO;
  const txt = compacto(n);
  return txt.startsWith("-") ? `-S/ ${txt.slice(1)}` : `S/ ${txt}`;
}

/** Cantidades para ejes: «850» · «1.5 mil» · «2.3 M». */
export function numeroEje(v: unknown): string {
  const n = numeroDe(v);
  return n === null ? SIN_DATO : compacto(n);
}

/** Cantidad entera con miles: «1,234» (piezas, pedidos, clientes). */
export function cantidad(v: unknown, decimales = 0): string {
  const n = numeroDe(v);
  return n === null ? SIN_DATO : formatNumber(n, decimales);
}

/** El número ya viene en por ciento: `porcentaje(12.34)` → «12%», `(12.34, 1)` → «12.3%». */
export function porcentaje(v: unknown, decimales = 0): string {
  const n = numeroDe(v);
  return n === null ? SIN_DATO : `${formatNumber(n, decimales)}%`;
}

export const MESES_CORTOS = [
  "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic",
] as const;

export const DIAS_SEMANA = [
  "domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado",
] as const;

const partesLima = new Intl.DateTimeFormat("en-CA", {
  timeZone: STORE_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Año, mes (1-12) y día de la fecha EN LIMA. Un «2026-10-01» suelto (clave de
 * día) se toma tal cual, sin pasar por UTC: así no retrocede un día.
 */
export function partesDeFecha(
  v: string | number | Date | null | undefined,
): { anio: number; mes: number; dia: number } | null {
  if (v == null || v === "") return null;
  if (typeof v === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
    if (m) return { anio: Number(m[1]), mes: Number(m[2]), dia: Number(m[3]) };
  }
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  const [anio, mes, dia] = partesLima.format(d).split("-").map(Number);
  return { anio, mes, dia };
}

/** «01 oct» (ejes y tooltips de series por día). Sin dato → «—». */
export function fechaCorta(v: string | number | Date | null | undefined): string {
  const p = partesDeFecha(v);
  if (!p) return SIN_DATO;
  return `${String(p.dia).padStart(2, "0")} ${MESES_CORTOS[p.mes - 1]}`;
}

/** «jueves 10/09» (la forma en que Brandon nombra un día). Sin dato → «—». */
export function fechaConDia(v: string | number | Date | null | undefined): string {
  const p = partesDeFecha(v);
  if (!p) return SIN_DATO;
  const diaSemana = new Date(Date.UTC(p.anio, p.mes - 1, p.dia)).getUTCDay();
  const dd = String(p.dia).padStart(2, "0");
  const mm = String(p.mes).padStart(2, "0");
  return `${DIAS_SEMANA[diaSemana]} ${dd}/${mm}`;
}

/**
 * Un color por concepto, el mismo en todas las pestañas. Son tokens `--data-*`
 * (cambian solos en oscuro y no los pisa el preset del negocio, a diferencia de
 * `--data-success/-info`, que dentro de /admin salen del color del tenant).
 * Recharts acepta `var(--…)` en `fill`/`stroke`/`stopColor`.
 *
 * Ojo: no leer `CHART_PALETTE.primary/accent` para estos conceptos — esas
 * leen `--section-*`, que `DraggableSections` ROTA por posición en la grilla.
 */
export const COLOR_CONCEPTO = {
  /** Ventas, ingresos por venta, ventas del marketplace — teal de marca. */
  ventas: "var(--data-5)",
  /** Utilidad, margen, ganancia — tinta (casi negro en claro, casi blanco en oscuro). */
  utilidad: "var(--data-1)",
  /** Gastos, egresos, costos, mermas — coral. */
  gastos: "var(--data-7)",
  /** Caja: lo que entra (mismo teal que ventas). */
  cajaEntra: "var(--data-5)",
  /** Caja: lo que sale (mismo coral que gastos). */
  cajaSale: "var(--data-7)",
  /** Caja: saldo acumulado — tinta. */
  cajaSaldo: "var(--data-1)",
  /** Compras a proveedores — morado. */
  compras: "var(--data-8)",
  /** Clientes y pedidos — azul. */
  clientes: "var(--data-6)",
  pedidos: "var(--data-6)",
  /** Stock / unidades en inventario — gris tinta. */
  stock: "var(--data-2)",
  /** Lo que pide atención: stock crítico, atrasos, vencimientos. */
  alerta: "var(--data-warning-500)",
  /** Período anterior o comparación — gris claro (línea punteada). */
  anterior: "var(--data-3)",
  /** Promedio, meta o línea de referencia — gris (punteada). */
  referencia: "var(--data-2)",
} as const;

export type ConceptoTablero = keyof typeof COLOR_CONCEPTO;
