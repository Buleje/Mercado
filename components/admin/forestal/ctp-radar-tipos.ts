/**
 * ctp-radar-tipos — los tipos y las tablas de opciones del Radar.
 *
 * Viven fuera del componente para que el resumen, los controles y el lienzo los
 * compartan sin importarse entre sí (y sin ciclos). Son datos, no UI.
 */

import { Clock, Gauge, Share2 } from "@buleje/design-system/icons";
import type { RadarOrden } from "@/lib/forestal/ctp-radar";

/** Qué subconjunto de la cadena se ilumina. */
export type Foco = "todos" | "huecos" | "parciales" | "cites";

/** Las tres lecturas del mismo período: qué salió de dónde, cuándo, y con qué rinde. */
export type Vista = "cadena" | "cronologia" | "rendimiento";

export const VISTAS: { key: Vista; label: string; icon: typeof Share2; hint: string }[] = [
  { key: "cadena", label: "Cadena", icon: Share2, hint: "El grafo GTF → corrida → despacho" },
  { key: "cronologia", label: "Cronología", icon: Clock, hint: "La cadena en el tiempo y las fechas imposibles" },
  { key: "rendimiento", label: "Rendimiento", icon: Gauge, hint: "Producto por m³ de troza y mermas anómalas" },
];

export const ORDENES: { key: RadarOrden; label: string; hint: string }[] = [
  { key: "linea", label: "Por línea", hint: "Orden del libro (como se registró)" },
  { key: "estado", label: "Por estado", hint: "Primero los huecos y las atribuciones incompletas" },
  { key: "volumen", label: "Por volumen", hint: "De mayor a menor cantidad" },
];

/**
 * Rango de zoom. Antes iba de 0.5 a 1.5 y con veinte líneas no alcanzaba para
 * ver la cadena entera de un vistazo (ni para leerla de lejos al proyectarla).
 */
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 3;

/** El paso es multiplicativo: a 25% un −15% absoluto no se nota, y a 300% salta. */
export function pasoZoom(z: number, dir: 1 | -1): number {
  const v = dir === 1 ? z * 1.2 : z / 1.2;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(v.toFixed(3))));
}
