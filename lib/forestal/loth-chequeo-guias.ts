/**
 * loth-chequeo-guias — los chequeos de guías, fechas y plazos del Libro TH
 * (26-10). PURO: recibe lo ya leído y devuelve los casos, una frase por caso
 * («GTF 019-001-0000771 (lunes 05/10): falta la placa»). El texto de cada
 * chequeo (título, norma, qué hacer) está en `loth-chequeo-catalogo`.
 *
 * Fechas: claves AAAA-MM-DD (date-only), comparadas como texto y restadas en
 * UTC. Tolerancias en días enteros, nunca en milisegundos.
 */

import { claveNumeroGtf } from "./gtf-talonario";
import { PLAZO_REGISTRO_DIAS } from "./loth-constants";
import type { GuiaChequeo, LineaChequeo, PlanChequeo, PreliminarChequeo } from "./loth-chequeo-tipos";

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;
const DIA_MS = 86_400_000;

/** «jueves 10/09» — la fecha como la dice Brandon (días escritos a mano: Intl cambia por ICU). */
export function fechaDelCaso(key: string | null | undefined): string {
  if (!key || !/^\d{4}-\d{2}-\d{2}/.test(key)) return "sin fecha";
  const d = new Date(`${key.slice(0, 10)}T12:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) return key;
  return `${DIAS[d.getUTCDay()]} ${key.slice(8, 10)}/${key.slice(5, 7)}`;
}

/** Días entre dos claves AAAA-MM-DD (b − a); `null` si alguna no es fecha. */
export function diasEntre(a: string, b: string): number | null {
  const ta = Date.parse(`${a.slice(0, 10)}T00:00:00.000Z`);
  const tb = Date.parse(`${b.slice(0, 10)}T00:00:00.000Z`);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null;
  return Math.round((tb - ta) / DIA_MS);
}

/** Vacío o un relleno («-», «/», «---»): el dato no está. */
export function sinDato(v: string | null | undefined): boolean {
  const t = (v ?? "").trim();
  return !t || /^[-–—./\s]+$/.test(t);
}

/** «la placa», «la placa y el conductor», «la placa, el conductor y la licencia». */
function unir(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

const viva = (g: GuiaChequeo) => g.status !== "anulada";
const rotuloGuia = (g: GuiaChequeo) => `GTF ${g.gtfNumber.trim()}${g.fecha ? ` (${fechaDelCaso(g.fecha)})` : ""}`;

/**
 * Dos guías VIVAS con el mismo número (`claveNumeroGtf`: «19-1-771» y
 * «019-001-0000771» son la misma). Una anulada y su reemisión no cuentan: es
 * el camino correcto para corregir una guía.
 */
export function guiasRepetidas(guias: readonly GuiaChequeo[]): string[] {
  const porNumero = new Map<string, GuiaChequeo[]>();
  for (const g of guias) {
    if (!viva(g)) continue;
    const k = claveNumeroGtf(g.gtfNumber);
    if (!k) continue;
    porNumero.set(k, [...(porNumero.get(k) ?? []), g]);
  }
  return [...porNumero.values()]
    .filter((gs) => gs.length > 1)
    .map((gs) => `GTF ${gs[0].gtfNumber.trim()}: ${gs.length} guías emitidas con el mismo número`);
}

/** Guías vivas con fecha antes de que empiece o después de que venza el plan que llevan. */
export function guiasFueraDeVigencia(guias: readonly GuiaChequeo[], planes: readonly PlanChequeo[]): string[] {
  const porId = new Map(planes.map((p) => [p.id, p]));
  const out: string[] = [];
  for (const g of guias) {
    if (!viva(g) || !g.fecha || !g.planId) continue;
    const p = porId.get(g.planId);
    if (!p) continue;
    const f = g.fecha.slice(0, 10);
    if (p.vigenciaDesde && f < p.vigenciaDesde.slice(0, 10)) {
      out.push(`${rotuloGuia(g)}: antes de que empiece ${p.nombre} (${fechaDelCaso(p.vigenciaDesde)})`);
    } else if (p.vigenciaHasta && f > p.vigenciaHasta.slice(0, 10)) {
      out.push(`${rotuloGuia(g)}: después de que venció ${p.nombre} (${fechaDelCaso(p.vigenciaHasta)})`);
    }
  }
  return out;
}

/** Guías vivas sin placa, conductor o (si se pide) licencia: lo primero que mira un puesto de control. */
export function guiasSinTransporte(guias: readonly GuiaChequeo[], pedirLicencia: boolean): string[] {
  const out: string[] = [];
  for (const g of guias) {
    if (!viva(g)) continue;
    const faltan: string[] = [];
    if (sinDato(g.placa)) faltan.push("la placa");
    if (sinDato(g.conductor)) faltan.push("el conductor");
    if (pedirLicencia && sinDato(g.licencia)) faltan.push("la licencia");
    if (faltan.length > 0) out.push(`${rotuloGuia(g)}: falta ${unir(faltan)}`);
  }
  return out;
}

const DESPACHOS: Record<string, string> = { despacho_troza: "Despacho de trozas", despacho_producto: "Despacho de productos" };

/** Líneas de despacho sin N.º de GTF: madera que salió sin el documento que la ampara. */
export function despachosSinGuia(lineas: readonly LineaChequeo[]): string[] {
  return lineas
    .filter((l) => DESPACHOS[l.section] && sinDato(l.gtfNumber))
    .map((l) => `${DESPACHOS[l.section]} #${l.lineNo} (${fechaDelCaso(l.fecha)}): sin N.º de GTF`);
}

/** La fecha más temprana de cada código, por plan (`plan|CÓDIGO`) y suelta (`|CÓDIGO`). */
function primeraFecha(lineas: readonly LineaChequeo[], section: string, codigo: (l: LineaChequeo) => string | null) {
  const m = new Map<string, string>();
  const poner = (k: string, f: string) => {
    const antes = m.get(k);
    if (!antes || f < antes) m.set(k, f);
  };
  for (const l of lineas) {
    const c = codigo(l)?.trim().toUpperCase();
    if (l.section !== section || !c) continue;
    poner(`${l.planId ?? ""}|${c}`, l.fecha.slice(0, 10));
    poner(`*|${c}`, l.fecha.slice(0, 10));
  }
  /* Con plan: el del plan o una línea sin plan (las viejas no lo guardaban), nunca
     el mismo código de OTRO plan. Sin plan: el código en cualquiera. */
  return (planId: string | null, codigo: string) => {
    const c = codigo.trim().toUpperCase();
    return planId ? (m.get(`${planId}|${c}`) ?? m.get(`|${c}`)) : m.get(`*|${c}`);
  };
}

/**
 * La cadena va tala → trozado → despacho: un trozado fechado ANTES de la tala
 * de su árbol, o un despacho ANTES del trozado de su troza, es una fecha mal
 * escrita (o un árbol que no es ése). Mismo día = en orden.
 */
export function fechasFueraDeOrden(lineas: readonly LineaChequeo[]): string[] {
  const talaDe = primeraFecha(lineas, "tala", (l) => l.treeCode);
  const trozadoDe = primeraFecha(lineas, "trozado", (l) => l.trozaCode);
  const out: string[] = [];
  for (const l of lineas) {
    const f = l.fecha.slice(0, 10);
    if (l.section === "trozado" && l.treeCode) {
      const tala = talaDe(l.planId, l.treeCode);
      if (tala && f < tala) out.push(`Trozado #${l.lineNo} (${fechaDelCaso(f)}): antes de la tala del árbol ${l.treeCode.trim()} (${fechaDelCaso(tala)})`);
    }
    if (l.section === "despacho_troza" && l.trozaCode) {
      const trozado = trozadoDe(l.planId, l.trozaCode);
      if (trozado && f < trozado) {
        out.push(`Despacho de trozas #${l.lineNo} (${fechaDelCaso(f)}): antes del trozado de la troza ${l.trozaCode.trim()} (${fechaDelCaso(trozado)})`);
      }
    }
  }
  return out;
}

/**
 * GTF preliminares pendientes (hechas a mano, sin registrar) desde `diasAviso`
 * días: pasados los 15 del registro (`PLAZO_REGISTRO_DIAS`) ya están fuera de
 * plazo. Se cuenta desde la fecha de la guía; sin fecha, desde que se anotó
 * (la guía es de ese día o de antes: el plazo real puede ser menor, nunca mayor).
 */
export function preliminaresViejas(
  prelims: readonly PreliminarChequeo[],
  hoy: string,
  diasAviso: number,
): { vencidas: string[]; porVencer: string[] } {
  const vencidas: string[] = [];
  const porVencer: string[] = [];
  for (const p of prelims) {
    const desde = p.fecha ?? p.anotadaEl;
    const dias = diasEntre(desde, hoy);
    if (dias == null || dias < diasAviso) continue;
    const cuando = p.fecha ? `guía del ${fechaDelCaso(p.fecha)}` : `anotada el ${fechaDelCaso(p.anotadaEl)}`;
    const quedan = PLAZO_REGISTRO_DIAS - dias;
    const plazo = quedan < 0 ? `fuera de plazo por ${-quedan} ${-quedan === 1 ? "día" : "días"}` : quedan === 0 ? "hoy es el último día" : `te ${quedan === 1 ? "queda 1 día" : `quedan ${quedan} días`}`;
    (quedan < 0 ? vencidas : porVencer).push(`GTF ${p.numeroGtf.trim()} (${p.plan}): ${cuando}, ${plazo}`);
  }
  return { vencidas, porVencer };
}
