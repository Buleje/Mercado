/**
 * loth-cierre-resumen — qué se está por cerrar, antes de cerrarlo.
 *
 * Cerrar un mes vuelve sus líneas inmutables: no se puede registrar ni anular
 * hasta reabrirlo (y reabrir queda auditado). Hasta acá el botón «Cerrar
 * período» no decía **nada** de lo que estaba por congelar: ni cuántas líneas,
 * ni qué volumen, ni si quedaban asientos fuera de plazo. Cerrar a ciegas un
 * libro que se presenta ante OSINFOR es la clase de acción que no se deshace
 * sin dejar rastro.
 *
 * PURO y client-safe.
 */

import { LOTH_SECTIONS, type LothEntryDTO, type LothSection } from "./loth-constants";
import { periodoDe, periodoLabel } from "./loth-seccion";

const n = (v: string | null | undefined): number => (v == null ? 0 : Number(v) || 0);

export interface ResumenSeccion {
  section: LothSection;
  lineas: number;
  volumenM3: number;
  cantidad: number;
}

export interface ResumenPeriodo {
  periodo: string;
  label: string;
  /** Líneas vivas (las anuladas se cuentan aparte: se cierran igual, pero no suman). */
  lineas: number;
  anuladas: number;
  porSeccion: ResumenSeccion[];
  taladoM3: number;
  trozadoM3: number;
  movilizadoM3: number;
  especies: string[];
  primeraFecha: string | null;
  ultimaFecha: string | null;
  /** Lo que conviene mirar ANTES de congelar el mes. */
  pendientes: { clave: string; detalle: string; nivel: "error" | "warn" }[];
  /** Hay algo que amerita frenar y revisar (no bloquea: avisa). */
  hayPendientes: boolean;
}

type PredicadoPlazo = (entryDate: string, createdAt: string | null | undefined) => boolean;

/**
 * Arma la foto del período. `fueraDePlazo` entra por parámetro para no
 * re-implementar el predicado del plazo (vive una sola vez en `loth-constants`).
 */
export function resumirPeriodo(entries: LothEntryDTO[], periodo: string, fueraDePlazo: PredicadoPlazo): ResumenPeriodo {
  const delMes = entries.filter((e) => periodoDe(e.entryDate) === periodo);
  const vivas = delMes.filter((e) => e.status !== "anulado");

  const porSeccion: ResumenSeccion[] = LOTH_SECTIONS.map((section) => {
    const rows = vivas.filter((e) => e.section === section);
    return {
      section,
      lineas: rows.length,
      volumenM3: Math.round(rows.reduce((a, e) => a + n(e.volumeM3), 0) * 10000) / 10000,
      cantidad: Math.round(rows.reduce((a, e) => a + n(e.quantity), 0) * 10000) / 10000,
    };
  });

  const de = (s: LothSection) => porSeccion.find((p) => p.section === s);
  const taladoM3 = de("tala")?.volumenM3 ?? 0;
  const trozadoM3 = de("trozado")?.volumenM3 ?? 0;
  // Movilizado del mes: trozas que salieron (su volumen vive en el trozado) más
  // el producto terminado despachado en m³.
  const volPorTroza = new Map<string, number>();
  for (const e of vivas) if (e.section === "trozado" && e.trozaCode) volPorTroza.set(e.trozaCode, n(e.volumeM3));
  let movilizadoM3 = 0;
  for (const e of vivas) {
    if (e.section === "despacho_troza" && e.trozaCode) movilizadoM3 += volPorTroza.get(e.trozaCode) ?? 0;
    if (e.section === "despacho_producto" && e.unit === "m3") movilizadoM3 += n(e.quantity);
  }

  const fechas = vivas.map((e) => e.entryDate).filter(Boolean).sort();

  // ── lo que conviene resolver antes de congelar ──
  const pendientes: ResumenPeriodo["pendientes"] = [];
  const tardias = vivas.filter((e) => fueraDePlazo(e.entryDate, e.createdAt)).length;
  if (tardias > 0) {
    pendientes.push({
      clave: "fuera_de_plazo",
      nivel: "warn",
      detalle: `${tardias} línea(s) se asentaron fuera del plazo de registro. Cerrar el mes las congela con esa marca.`,
    });
  }
  const sinVolumen = vivas.filter((e) => (e.section === "tala" || e.section === "trozado") && n(e.volumeM3) <= 0).length;
  if (sinVolumen > 0) {
    pendientes.push({
      clave: "sin_volumen",
      nivel: "error",
      detalle: `${sinVolumen} línea(s) de tala o trozado quedaron sin volumen: el libro cerraría con un vacío que no se puede completar después.`,
    });
  }
  const despachoSinGtf = vivas.filter((e) => (e.section === "despacho_troza" || e.section === "despacho_producto") && !e.gtfNumber).length;
  if (despachoSinGtf > 0) {
    pendientes.push({
      clave: "despacho_sin_gtf",
      nivel: "error",
      detalle: `${despachoSinGtf} despacho(s) sin N° de guía. El origen legal de una salida es su GTF.`,
    });
  }
  if (trozadoM3 > taladoM3 * 1.005 && taladoM3 > 0) {
    pendientes.push({
      clave: "trozado_mayor",
      nivel: "error",
      detalle: `El trozado del mes (${trozadoM3.toFixed(3)} m³) supera lo talado (${taladoM3.toFixed(3)} m³).`,
    });
  }

  return {
    periodo,
    label: periodoLabel(periodo),
    lineas: vivas.length,
    anuladas: delMes.length - vivas.length,
    porSeccion,
    taladoM3,
    trozadoM3,
    movilizadoM3: Math.round(movilizadoM3 * 10000) / 10000,
    especies: Array.from(new Set(vivas.map((e) => e.speciesCommon).filter((s): s is string => !!s))).sort(),
    primeraFecha: fechas[0] ?? null,
    ultimaFecha: fechas[fechas.length - 1] ?? null,
    pendientes,
    hayPendientes: pendientes.length > 0,
  };
}
