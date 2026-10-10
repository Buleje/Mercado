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
import { construirKardex, lineasDelPermiso } from "./loth-kardex";
import { periodoDe, periodoLabel } from "./loth-seccion";

const n = (v: string | null | undefined): number => (v == null ? 0 : Number(v) || 0);

export interface ResumenSeccion {
  section: LothSection;
  lineas: number;
  volumenM3: number;
  cantidad: number;
}

/** Una especie de un permiso con saldo al cerrar el mes (sale de `cierreDelKardex`, no de otra fórmula). */
export interface SaldoEspecieAlCierre {
  /** `planId` del permiso (`null` = líneas sin plan). */
  planId: string | null;
  permiso: string;
  especie: string;
  taladoSinTrozarM3: number;
  enPatioM3: number;
}

/** Lo que el libro deja pendiente al último día del período (acumulado, no sólo el mes). */
export interface SaldoAlCierre {
  filas: SaldoEspecieAlCierre[];
  taladoSinTrozarM3: number;
  enPatioM3: number;
  /** Árboles talados (vivos, hasta el cierre) sin ningún trozado vivo con su código. */
  arbolesSinTrozar: number;
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
  pendientes: { clave: string; detalle: string; nivel: "error" | "warn" | "info" }[];
  /** Hay algo que amerita frenar y revisar (no bloquea: avisa). `info` no cuenta: es saldo, no falla. */
  hayPendientes: boolean;
  /** Talado sin trozar y trozas en patio al último día del período, por permiso y especie. */
  saldoAlCierre: SaldoAlCierre;
}

type PredicadoPlazo = (entryDate: string, createdAt: string | null | undefined) => boolean;

const r4 = (v: number): number => Math.round(v * 10000) / 10000;
const m3 = (v: number): string => v.toFixed(3);

/**
 * El saldo del libro al último día de `periodo`: MISMA cuenta que el kárdex
 * del permiso (`construirKardex` → `cierre`, sobre `cascadaDelPlan`), con las
 * líneas hasta ese mes inclusive. No hay fórmula propia: una troza despachada
 * después del cierre todavía estaba en el patio al cerrar. Las fechas del libro
 * son date-only; el corte compara el período UTC (`periodoDe`).
 */
export function saldoAlCierreDe(
  entries: readonly LothEntryDTO[],
  periodo: string,
  etiquetaPlan: ReadonlyMap<string, string> = new Map(),
): SaldoAlCierre {
  const hasta = entries.filter((e) => {
    const p = periodoDe(e.entryDate);
    return p != null && p <= periodo;
  });
  const planIds = Array.from(new Set(hasta.map((e) => e.planId).filter((id): id is string => !!id))).sort();
  // Sin ningún plan en el libro, todo es «sin plan» y es un solo grupo.
  const grupos: (string | null)[] = planIds.length > 0 ? planIds : [null];

  const filas: SaldoEspecieAlCierre[] = [];
  const arboles = new Set<string>();
  for (const planId of grupos) {
    const lineas = lineasDelPermiso(hasta, planId ?? "");
    const kardex = construirKardex(lineas, { planId: planId ?? "", especies: [] });
    for (const c of kardex.cierre.especies) {
      if (c.taladoSinTrozarM3 <= 0 && c.enPatioM3 <= 0) continue;
      filas.push({
        planId,
        permiso: planId ? (etiquetaPlan.get(planId) ?? "Permiso") : "Sin permiso",
        especie: c.especie,
        taladoSinTrozarM3: c.taladoSinTrozarM3,
        enPatioM3: c.enPatioM3,
      });
    }
    // Árboles sin trozar: tala viva cuyo código no tiene trozado vivo.
    const vivas = lineas.filter((e) => e.status !== "anulado");
    const conTrozado = new Set(vivas.filter((e) => e.section === "trozado" && e.treeCode).map((e) => e.treeCode));
    if (filas.some((f) => f.planId === planId && f.taladoSinTrozarM3 > 0)) {
      for (const e of vivas) {
        if (e.section !== "tala") continue;
        if (e.treeCode ? conTrozado.has(e.treeCode) : false) continue;
        arboles.add(e.treeCode ?? e.id); // sin el permiso en la clave: una tala sin permiso entra en cada uno
      }
    }
  }
  /* El total NO es la suma de las filas: como en el kárdex, las líneas sin
     permiso cuentan dentro de CADA permiso, y con dos permisos se sumarían dos
     veces. Un solo kárdex con todo el libro cuenta cada línea una vez. */
  /* `construirKardex` filtra por permiso: todo como «sin permiso» = todo el libro, una vez. */
  const todo =
    grupos.length > 1
      ? construirKardex(hasta.map((e) => ({ ...e, planId: null })), { planId: "", especies: [] }).cierre.especies
      : null;
  const total = (k: "taladoSinTrozarM3" | "enPatioM3"): number =>
    r4(todo ? todo.reduce((a, c) => a + Math.max(0, c[k]), 0) : filas.reduce((a, f) => a + f[k], 0));
  return {
    filas,
    taladoSinTrozarM3: total("taladoSinTrozarM3"),
    enPatioM3: total("enPatioM3"),
    arbolesSinTrozar: arboles.size,
  };
}

/**
 * Arma la foto del período. `fueraDePlazo` entra por parámetro para no
 * re-implementar el predicado del plazo (vive una sola vez en `loth-constants`).
 */
export function resumirPeriodo(
  entries: LothEntryDTO[],
  periodo: string,
  fueraDePlazo: PredicadoPlazo,
  /** `planId` → «PMFI 123»: para decir de qué permiso es el saldo. */
  etiquetaPlan?: ReadonlyMap<string, string>,
): ResumenPeriodo {
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

  const saldoAlCierre = saldoAlCierreDe(entries, periodo, etiquetaPlan);
  const detalleDe = (campo: "taladoSinTrozarM3" | "enPatioM3"): string => {
    const partes = saldoAlCierre.filas
      .filter((f) => f[campo] > 0)
      .map((f) => `${f.permiso} · ${f.especie} ${m3(f[campo])} m³`);
    return partes.join("; ");
  };
  if (saldoAlCierre.taladoSinTrozarM3 > 0) {
    const a = saldoAlCierre.arbolesSinTrozar;
    pendientes.push({
      clave: "talado_sin_trozar",
      nivel: "warn",
      detalle: `${
        a > 0 ? `${a} árbol${a === 1 ? "" : "es"} talado${a === 1 ? "" : "s"} sin trozar` : "Madera talada sin trozar"
      }, ${m3(saldoAlCierre.taladoSinTrozarM3)} m³ al cierre — ${detalleDe("taladoSinTrozarM3")}.`,
    });
  }
  if (saldoAlCierre.enPatioM3 > 0) {
    pendientes.push({
      clave: "en_patio",
      nivel: "info",
      detalle: `${m3(saldoAlCierre.enPatioM3)} m³ en el patio pasan al mes siguiente — ${detalleDe("enPatioM3")}.`,
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
    hayPendientes: pendientes.some((p) => p.nivel !== "info"),
    saldoAlCierre,
  };
}
