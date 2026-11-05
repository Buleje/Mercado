/**
 * Aviso al celular cuando se borra MUCHO del Libro TH (04-11-2026, Brandon
 * eligió «Aviso al borrar mucho»; ADR-535). Medido en Blas: el 06-10 de noche
 * se borraron 52 líneas en dos tandas (20:17 y 23:35) y nadie se enteró en
 * 4 semanas. Es la alarma de la caja, pero del libro que mira OSINFOR.
 *
 * Parte pura: cuándo avisar y qué decir. El envío (Telegram de los chats
 * vinculados al negocio) está en `loth-aviso-borrado.server.ts`.
 */

import type { LothSection } from "@/lib/forestal/loth-constants";
import { ORDEN_DE_RECUPERO } from "@/lib/forestal/loth-papelera";

/** Desde cuántas líneas avisa: un borrado de 1-9 es corregir; 10+ es limpiar. */
export const UMBRAL_AVISO_BORRADO = 10;

/** Ventana para sumar borrados de a una («borró 10 sueltas en 10 minutos»). */
export const VENTANA_BORRADOS_SUELTOS_MS = 10 * 60_000;

const NOMBRE: Record<LothSection, string> = {
  tala: "Tala",
  trozado: "Trozado",
  despacho_troza: "Despacho de trozas",
  consumo_troza: "Consumo de trozas",
  producto_terminado: "Producto terminado",
  despacho_producto: "Despacho de producto",
};

export interface BorradoParaAviso {
  borradas: number;
  porSeccion: readonly { section: LothSection; borradas: number }[];
  m3: number;
  user: string;
  cuando: Date;
  negocio: string | null;
  /** «De a una»: se sumaron borrados sueltos de la ventana, no fue un bloque. */
  sueltas?: boolean;
}

/** ¿Este borrado merece aviso? En bloque: 10 o más. Sueltas: sólo al CRUZAR las 10 (una vez por racha). */
export function tocaAvisar(borradas: number, sueltas = false): boolean {
  return sueltas ? borradas === UMBRAL_AVISO_BORRADO : borradas >= UMBRAL_AVISO_BORRADO;
}

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** «06/10 23:35», hora de Lima (el aviso puede leerse con el celular en otra zona). */
export function horaLima(d: Date): string {
  const p = new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  // El cero a mano: «2-digit» da «6» en algunas versiones de ICU.
  const v = (t: Intl.DateTimeFormatPartTypes) => (p.find((x) => x.type === t)?.value ?? "").padStart(2, "0");
  return `${v("day")}/${v("month")} ${v("hour")}:${v("minute")}`;
}

const m3Texto = (n: number) =>
  n.toLocaleString("es-PE", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

/** El mensaje de Telegram (HTML de Telegram: sólo <b>, todo lo demás escapado). */
export function textoAvisoBorrado(b: BorradoParaAviso): string {
  const secciones = [...b.porSeccion]
    .filter((s) => s.borradas > 0)
    .sort((x, y) => ORDEN_DE_RECUPERO.indexOf(x.section) - ORDEN_DE_RECUPERO.indexOf(y.section))
    .map((s) => `${s.borradas} ${NOMBRE[s.section] ?? s.section}`)
    .join(" · ");
  const titulo = b.sueltas
    ? `Van ${b.borradas} líneas borradas del Libro TH en 10 minutos`
    : `Se borraron ${b.borradas} líneas del Libro TH`;
  return [
    `🗑️ <b>${escHtml(titulo)}</b>${b.negocio ? ` — ${escHtml(b.negocio)}` : ""}`,
    `Por: ${escHtml(b.user || "—")} · ${horaLima(b.cuando)}`,
    `${escHtml(secciones)}${b.m3 > 0 ? ` · ${m3Texto(b.m3)} m³` : ""}`,
    "Si no fue a propósito: Libro TH › ⋯ › Papelera del libro (se recupera con las reglas del libro).",
  ].join("\n");
}
