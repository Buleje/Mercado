/**
 * Migración al código único (ADR-477): las trozas que ya entraron al Libro TH
 * desde una guía importada con el código CRUDO («1») pasan a «1-0001».
 *
 * PURO (sin base): la DB class `ForestLothCodigoUnicoDB` lee, este módulo arma
 * el plan, y la misma función decide el ensayo y la escritura (dentro de la
 * tx, con las líneas bloqueadas). La huella es el sha256 del plan: si algo
 * cambió entre el ensayo y `--aplicar`, la escritura aborta.
 *
 * Lo que NO se toca: las observaciones (Deshacer las compara exactas), el
 * `trozadoId` de los items, las trozas registradas a mano (P1: pueden tener
 * etiqueta), las sin código (`SC-…`) y las que ya tienen su código único.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { mismoNumeroGtf } from "./gtf-talonario";
import { candidatosCodigoUnico, partirCodigoUnico } from "./codigo-unico-troza";
import { closedPeriodOf, type LothCierrePeriodo } from "./loth-cierre-types";
import { observacionTala } from "./loth-importar-guia";

const txt = (v: unknown) => (typeof v === "string" ? v : "").replace(/\s+/g, " ").trim();

export interface LineaLeida {
  id: string;
  section: string;
  lineNo: number;
  trozaCode: string | null;
  planId: string | null;
  gtfNumber: string | null;
  observations: string | null;
  /** ISO. */
  entryDate: string;
  /** ISO. */
  updatedAt: string;
}

export interface TalaLeida {
  id: string;
  lineNo: number;
  observations: string | null;
  referencial: { gtfs: string[]; registros: string[]; trozas: string[] } | null;
}

export interface DatosDeMigracion {
  gtf: { id: string; gtfNumber: string; planId: string | null; status: string; items: unknown };
  /** Trozados vivos del tenant con un código o un `trozadoId` de los items. */
  trozados: LineaLeida[];
  /** Salidas vivas (despacho/consumo) del tenant con un código de los items. */
  salidas: LineaLeida[];
  /** Candidatos ya usados: cualquier línea no borrada del tenant (cualquier estado) o un item de OTRA guía. */
  ocupados: readonly string[];
  cierres: LothCierrePeriodo[];
  /** Trozas del CTP atadas a un Trozado del plan (`WoodEntryTroza.lothTrozadoId`). */
  ctpAtadas: { lothTrozadoId: string; codificacion: string | null }[];
  /** Talas vivas del plan de los árboles de la guía. */
  talas: TalaLeida[];
}

export interface CambioDeCodigo {
  lineaId: string;
  section: "trozado" | "despacho_troza";
  lineNo: number;
  de: string;
  a: string;
}

export interface ItemMigrado {
  trozadoId: string | null;
  de: string;
  a: string;
  /** El código impreso en la guía (va a `items[].codigoGuia`). */
  codigoGuia: string;
}

export interface TalaMigrada {
  id: string;
  lineNo: number;
  trozasDe: string[];
  trozasA: string[];
  /** La observación nueva si la vieja era la del importador; `null` = se deja. */
  observacionA: string | null;
}

export interface PlanCodigoUnico {
  gtfId: string;
  gtfNumber: string;
  planId: string | null;
  cambios: CambioDeCodigo[];
  items: ItemMigrado[];
  talas: TalaMigrada[];
  /** Lo que frena la escritura (choque de código, mes cerrado, CTP atado con el código viejo…). */
  bloqueos: string[];
  /** Lo que no se migra y por qué (a mano, sin código, ya único). Informativo. */
  saltadas: string[];
  huella: string;
}

/** Las trozas que entraron con la importación de ESTA guía: la observación del importador. */
export function esDeLaImportacion(observations: string | null | undefined, gtfNumber: string): boolean {
  const esc = txt(gtfNumber).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^Importada de la GTF ${esc}(?: \\(registro SERFOR [^)]*\\))?\\.`).test(txt(observations));
}

export interface ItemDeGuia {
  code: string;
  codigoGuia: string | null;
  trozadoId: string | null;
  treeCode: string | null;
}

/** Los items de la guía, leídos sin confiar en el JSON. */
export function itemsDeLaGuia(items: unknown): ItemDeGuia[] {
  if (!Array.isArray(items)) return [];
  return items.flatMap((it) => {
    if (!it || typeof it !== "object") return [];
    const o = it as Record<string, unknown>;
    const code = txt(o.code);
    if (!code) return [];
    return [{ code, codigoGuia: txt(o.codigoGuia) || null, trozadoId: txt(o.trozadoId) || null, treeCode: txt(o.treeCode) || null }];
  });
}

/** El código de la guía de un item (el renombre viejo de ADR-474 lo guarda en `codigoGuia`). */
const codigoGuiaDe = (it: ItemDeGuia): string => it.codigoGuia || it.code;

/** Los códigos que el plan necesita mirar: los de los items y sus candidatos. */
export function codigosDeLaMigracion(gtf: DatosDeMigracion["gtf"]): { codigos: string[]; candidatos: string[]; trozadoIds: string[]; arboles: string[] } {
  const its = itemsDeLaGuia(gtf.items);
  return {
    codigos: [...new Set(its.map((i) => i.code))],
    candidatos: [...new Set(its.flatMap((i) => candidatosCodigoUnico(codigoGuiaDe(i), gtf.gtfNumber)))],
    trozadoIds: [...new Set(its.map((i) => i.trozadoId).filter((x): x is string => !!x))],
    arboles: [...new Set(its.map((i) => i.treeCode).filter((x): x is string => !!x))],
  };
}

type PlanSinHuella = Omit<PlanCodigoUnico, "huella">;

/** JSON estable del plan (lo que la huella firma). */
function estable(p: Pick<PlanSinHuella, "gtfId" | "gtfNumber" | "cambios" | "items" | "talas" | "bloqueos">): string {
  const cambios = [...p.cambios].sort((a, b) => (a.lineaId < b.lineaId ? -1 : a.lineaId > b.lineaId ? 1 : 0));
  return JSON.stringify({
    gtfId: p.gtfId,
    gtfNumber: p.gtfNumber,
    cambios: cambios.map((c) => [c.lineaId, c.section, c.lineNo, c.de, c.a]),
    items: p.items.map((i) => [i.trozadoId, i.de, i.a, i.codigoGuia]),
    /* Sólo QUÉ talas: su lista de trozas la puede haber cambiado la migración de
       otra guía de la misma tanda (una tala referencial cita varias guías). */
    talas: p.talas.map((t) => t.id).sort(),
    bloqueos: p.bloqueos,
  });
}

export const huellaDelPlan = (p: Parameters<typeof estable>[0]): string => createHash("sha256").update(estable(p)).digest("hex");

/** El plan de UNA guía. La misma función para el ensayo y para la escritura. */
export function planCodigoUnico(d: DatosDeMigracion): PlanCodigoUnico {
  const num = txt(d.gtf.gtfNumber);
  const bloqueos: string[] = [];
  const saltadas: string[] = [];
  const cambios: CambioDeCodigo[] = [];
  const items: ItemMigrado[] = [];
  if (d.gtf.status !== "emitida") bloqueos.push(`La guía ${num} está ${d.gtf.status}: sólo se migran guías emitidas.`);

  const ocupados = new Set(d.ocupados.map(txt));
  const asignados = new Set<string>();
  const usadas = new Set<string>();
  for (const it of itemsDeLaGuia(d.gtf.items)) {
    if (partirCodigoUnico(it.code, num)) {
      saltadas.push(`${it.code}: ya tiene su código único.`);
      continue;
    }
    if (/^SC-/.test(it.code)) {
      saltadas.push(`${it.code}: sin código en la guía (ya es único).`);
      continue;
    }
    const tz = it.trozadoId
      ? d.trozados.find((l) => l.id === it.trozadoId)
      : d.trozados.find((l) => l.trozaCode === it.code && l.planId === d.gtf.planId);
    if (!tz) {
      bloqueos.push(`La troza «${it.code}» de la guía no tiene su línea de Trozado viva.`);
      continue;
    }
    if (tz.trozaCode !== it.code) {
      bloqueos.push(`La troza «${it.code}» de la guía es «${tz.trozaCode ?? "—"}» en el Trozado (línea #${tz.lineNo}): la guía y el libro no dicen lo mismo.`);
      continue;
    }
    if (!esDeLaImportacion(tz.observations, num)) {
      saltadas.push(`${it.code}: registrada a mano en el libro (no se renombra: puede tener etiqueta).`);
      continue;
    }
    if (usadas.has(tz.id)) {
      bloqueos.push(`La guía trae dos veces la troza «${it.code}».`);
      continue;
    }
    usadas.add(tz.id);
    const conElCodigo = d.salidas.filter((s) => s.trozaCode === it.code);
    const propias = conElCodigo.filter((s) => s.section === "despacho_troza" && mismoNumeroGtf(s.gtfNumber, num));
    const ajenas = conElCodigo.filter((s) => !propias.includes(s));
    const otrosTrozados = d.trozados.filter((l) => l.trozaCode === it.code && l.id !== tz.id);
    if (propias.length !== 1) {
      bloqueos.push(`La troza «${it.code}» tiene ${propias.length} despacho(s) con la GTF ${num} (se espera 1).`);
      continue;
    }
    if (ajenas.length || otrosTrozados.length) {
      const donde = [...ajenas.map((s) => `${s.section === "consumo_troza" ? "consumo" : "despacho"} #${s.lineNo}${s.gtfNumber ? ` GTF ${s.gtfNumber}` : ""}`), ...otrosTrozados.map((l) => `trozado #${l.lineNo}`)];
      bloqueos.push(`La troza «${it.code}» también está en ${donde.join(", ")}: renombrarla la separaría de esas líneas.`);
      continue;
    }
    const despacho = propias[0];
    const a = candidatosCodigoUnico(codigoGuiaDe(it), num).find((c) => !ocupados.has(c) && !asignados.has(c));
    if (!a) {
      bloqueos.push(`La troza «${it.code}» no tiene código único libre (${candidatosCodigoUnico(codigoGuiaDe(it), num).join(", ") || "el N° de la guía no da correlativo"}).`);
      continue;
    }
    for (const l of [tz, despacho]) {
      const cerrado = closedPeriodOf(d.cierres, new Date(l.entryDate));
      if (cerrado) bloqueos.push(`La línea #${l.lineNo} de «${it.code}» está en ${cerrado.label}, que está cerrado.`);
    }
    if (d.ctpAtadas.some((x) => x.lothTrozadoId === tz.id && txt(x.codificacion) === it.code)) {
      bloqueos.push(`La troza «${it.code}» ya está en el Libro CTP con ese código: renombrarla la separaría de su ingreso.`);
    }
    asignados.add(a);
    cambios.push({ lineaId: tz.id, section: "trozado", lineNo: tz.lineNo, de: it.code, a });
    cambios.push({ lineaId: despacho.id, section: "despacho_troza", lineNo: despacho.lineNo, de: it.code, a });
    items.push({ trozadoId: it.trozadoId, de: it.code, a, codigoGuia: codigoGuiaDe(it) });
  }

  const nuevoDe = new Map(items.map((i) => [i.de, i.a]));
  const talas: TalaMigrada[] = d.talas.flatMap((t) => {
    if (!t.referencial?.gtfs.some((g) => mismoNumeroGtf(g, num))) return [];
    const m = talaRenombrada(t, nuevoDe);
    return m ? [m] : [];
  });

  const base = { gtfId: d.gtf.id, gtfNumber: num, planId: d.gtf.planId, cambios, items, talas, bloqueos, saltadas };
  return { ...base, huella: huellaDelPlan(base) };
}

/**
 * La tala referencial con sus trozas renombradas (`mapa` de → a). La
 * observación se reescribe sólo si era la del importador. `null` = no cita
 * ninguna. La usan migrar (viejo → único) y revertir (único → viejo).
 */
export function talaRenombrada(t: TalaLeida, mapa: ReadonlyMap<string, string>): TalaMigrada | null {
  const ref = t.referencial;
  if (!ref || !ref.trozas.some((c) => mapa.has(c))) return null;
  const trozasA = ref.trozas.map((c) => mapa.get(c) ?? c);
  const vieja = observacionTala(ref.gtfs, ref.trozas);
  return { id: t.id, lineNo: t.lineNo, trozasDe: ref.trozas, trozasA, observacionA: txt(t.observations) === vieja ? observacionTala(ref.gtfs, trozasA) : null };
}

/**
 * Los items de la guía después de migrar: `code` = el único, `codigoGuia` = el
 * de la guía; todo lo demás (incluido `trozadoId`) igual.
 */
export function itemsMigrados(itemsOriginales: unknown, plan: Pick<PlanCodigoUnico, "items">): unknown[] {
  if (!Array.isArray(itemsOriginales)) return [];
  const por = new Map(plan.items.map((i) => [i.de, i]));
  return itemsOriginales.map((it) => {
    if (!it || typeof it !== "object") return it;
    const o = it as Record<string, unknown>;
    const m = por.get(txt(o.code));
    return m ? { ...o, code: m.a, codigoGuia: m.codigoGuia } : o;
  });
}

// ── Respaldo ────────────────────────────────────────────────────────────────

const cambioSchema = z.object({
  lineaId: z.string().min(1).max(40),
  section: z.enum(["trozado", "despacho_troza"]),
  lineNo: z.number().int(),
  de: z.string().min(1).max(120),
  a: z.string().min(1).max(120),
});

/** El respaldo de UNA guía: lo que había antes y el plan que se aplicó. */
export const RespaldoCodigoUnicoSchema = z.object({
  tenantId: z.string().min(1).max(40),
  fecha: z.string().min(1).max(40),
  gtf: z.object({ id: z.string().min(1).max(40), gtfNumber: z.string().min(1).max(60), items: z.array(z.unknown()) }),
  lineas: z.array(z.object({ id: z.string().min(1).max(40), section: z.string(), lineNo: z.number().int(), trozaCode: z.string().nullable(), updatedAt: z.string() })).max(5000),
  talas: z.array(z.object({ id: z.string().min(1).max(40), medicionCruda: z.unknown(), observations: z.string().nullable() })).max(5000),
  plan: z.object({
    cambios: z.array(cambioSchema).max(5000),
    items: z.array(z.object({ trozadoId: z.string().nullable(), de: z.string(), a: z.string(), codigoGuia: z.string() })).max(5000),
  }),
  huella: z.string().regex(/^[0-9a-f]{64}$/),
});
export type RespaldoCodigoUnico = z.infer<typeof RespaldoCodigoUnicoSchema>;
