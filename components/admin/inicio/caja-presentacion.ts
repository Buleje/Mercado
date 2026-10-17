import type { CSSProperties } from "react";
import { numeroEje } from "@/lib/admin/inicio/formato-tablero";

/**
 * Pestaña Caja del Inicio: la forma de los datos y los helpers de color y
 * formato que comparten `CajaDashboard`, `CajaResumen`, `CajaCharts` y
 * `CajaAdvancedCharts`. Vive aparte para que los gráficos (cargados con
 * `dynamic` desde `CajaDashboard`) no importen de vuelta al tablero entero.
 */

export interface CajaData {
  // KPIs
  ingresos: number;
  egresos: number;
  balance: number;
  utilidadNeta: number;
  margenNeto: number;
  ticketsTotal: number;
  // Deltas
  dIngresos: number | null;
  dEgresos: number | null;
  dBalance: number | null;
  // Charts
  /** `dia` = «09 oct» (eje) · `fecha` = clave «2026-10-09» (para «jueves 09/10»). */
  flujoDiario: { dia: string; fecha: string; ingresos: number; egresos: number; balance: number }[];
  metodosPago: { metodo: string; monto: number; porcentaje: number; color: string }[];
  flujoMensual: { mes: string; ingresos: number; egresos: number }[];
  waterfall: { concepto: string; monto: number; tipo: "ingreso" | "egreso" | "balance"; color: string }[];
  forecast7: { dia: string; ingreso: number; egreso: number }[];
  ingresosPorHora: { hora: string; monto: number }[];
}

/**
 * Un color por método de pago, el mismo en el donut, la lista y las barras
 * apiladas (antes eran hex que no cambiaban en oscuro). Yape morado y Plin azul
 * como sus marcas; efectivo con el teal de «caja entra».
 */
export const COLOR_METODO: Record<string, string> = {
  efectivo: "var(--data-5)", yape: "var(--data-8)", plin: "var(--data-6)",
  tarjeta: "var(--data-2)", transferencia: "var(--data-3)",
};
export const COLOR_METODO_OTRO = "var(--data-4)";
export const PAY_LABELS: Record<string, string> = { efectivo: "Efectivo", yape: "Yape", plin: "Plin", tarjeta: "Tarjeta", transferencia: "Transferencia" };
/** Color de un método ya rotulado («Yape») o crudo («yape»). */
export function colorDeMetodo(metodo: string): string {
  const clave = metodo.trim().toLowerCase();
  return COLOR_METODO[clave] ?? COLOR_METODO_OTRO;
}

/** Ranuras de color de los gráficos del DS que se pueden fijar envolviendo el gráfico. */
type Ranura = "primary" | "secondary" | "tertiary" | "accent" | "info" | "amber" | "purple";
/**
 * Fija el color de cada ranura (`color: "primary"` de los gráficos del DS) a un
 * concepto: `DraggableSections` ROTA `--section-*` por posición, así que sin
 * esto «ingresos» salía de otro color según dónde estuviera la tarjeta.
 * Mismo mecanismo que `.charts-forestal` en globals.css.
 *
 * @example <div style={coloresFijos({ primary: COLOR_CONCEPTO.cajaEntra })}>…</div>
 */
export function coloresFijos(mapa: Partial<Record<Ranura, string>>): CSSProperties {
  const estilo: Record<string, string> = {};
  for (const [ranura, color] of Object.entries(mapa)) {
    if (color) estilo[`--section-${ranura}`] = color;
  }
  return estilo as CSSProperties;
}

/**
 * Eje Y de plata: «600» · «16 mil» · «-4.5 mil», sin «S/». El eje de los
 * gráficos del DS mide 60 px: «S/ 16 mil» se partía en dos líneas y con
 * espacios duros se cortaba la «S/» por la izquierda (medido 09-10). La «S/»
 * ya está en la etiqueta de cada barra, el tooltip y los KPIs.
 */
export const ejeSoles = (v: number) => numeroEje(v).replace(/ /g, " ");

/**
 * El margen en % sólo se lee cuando lo que entró pesa: con S/ 0.10 de ventas y
 * S/ 5,400 de compras salía «-5418190.0%». Más allá de ±999 % se muestra «—».
 */
export function margenLegible(margen: number, ingresos: number): boolean {
  return ingresos > 0 && Number.isFinite(margen) && Math.abs(margen) <= 999;
}
