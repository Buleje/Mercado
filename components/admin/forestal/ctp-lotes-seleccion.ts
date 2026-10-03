/**
 * Lo que la vista Lotes necesita saber de varios lotes elegidos a la vez
 * (Brandon, 2026-10-02: «checks en cada lote» + despachar / salió sin guía).
 *
 * Puro y sin React: la tarjeta, la barra de selección y el filtro rápido leen
 * las MISMAS reglas — si la etiqueta dijera «con madera» y la barra «sin saldo»
 * para el mismo lote, el operador no sabría a cuál creerle.
 *
 * `lote.madera` lo arma el servidor (`maderaDelLote`, en
 * `lib/forestal/madera-del-lote.ts`). Mientras una lectura no lo traiga, todo se
 * degrada: sin dato no se dibuja etiqueta y el despacho decide con las corridas
 * del lote.
 */

import type { CorridaDelLote, EstadoMaderaLote, LoteAserrio, MaderaDelLote } from "@/lib/forestal/lotes-aserrio";

export type { EstadoMaderaLote, MaderaDelLote };

/** La madera del lote, o `null` si la lectura no la trae. */
export function maderaDe(lote: LoteAserrio): MaderaDelLote | null {
  return lote.madera ?? null;
}

/** Las corridas vivas del lote: las de `corridas` y, si no hay, la que lo cerró. */
export function corridasVivasDe(lote: LoteAserrio): CorridaDelLote[] {
  const todas = lote.corridas && lote.corridas.length > 0 ? lote.corridas : lote.produccion ? [lote.produccion] : [];
  return todas.filter((c) => c.viva);
}

/** Los ids de corrida de varios lotes, sin repetir (lo que espera `uidsDeCorridas`). */
export function corridaIdsDe(lotes: readonly LoteAserrio[]): string[] {
  return [...new Set(lotes.flatMap((l) => corridasVivasDe(l).map((c) => c.id)))];
}

/** Con madera / sin madera, para el filtro rápido. `null` = el dato no vino. */
export type ClaseMadera = "con" | "sin";
export function claseMadera(lote: LoteAserrio): ClaseMadera | null {
  const m = maderaDe(lote);
  if (!m) return null;
  return m.estado === "con_madera" || m.estado === "parcial" ? "con" : "sin";
}

/** Por qué un lote elegido NO va a la guía. */
export type BloqueoDespacho = "sin_produccion" | "sin_saldo" | "usada";

export const TEXTO_BLOQUEO: Record<BloqueoDespacho, string> = {
  sin_produccion: "todavía no pasó por la sierra",
  sin_saldo: "no le queda madera en patio",
  usada: "está marcado como usado: desmárcalo primero",
};

/**
 * ¿Este lote puede ir a una guía? `null` = sí.
 *
 * Con `madera` manda el servidor. Sin ella se mira lo único seguro: si tiene
 * corridas vivas y si todas están marcadas como usadas. El saldo fino lo
 * decide después `uidsDeCorridas` contra el libro.
 */
export function bloqueoParaDespachar(lote: LoteAserrio): BloqueoDespacho | null {
  const m = maderaDe(lote);
  const vivas = corridasVivasDe(lote);
  if (m) {
    if (m.estado === "sin_produccion") return "sin_produccion";
    if (m.estado === "usada") return "usada";
    if (m.estado === "despachada" || m.estado === "sin_saldo" || !(m.m3Disponible > 1e-4)) return "sin_saldo";
    return null;
  }
  if (vivas.length === 0) return "sin_produccion";
  if (vivas.every((c) => Boolean(c.usadoAt))) return "usada";
  return null;
}

/** ¿Algo de este lote está marcado como «salió sin guía»? (para «Volver a disponibles»). */
export function tieneMaderaMarcada(lote: LoteAserrio): boolean {
  return maderaDe(lote)?.estado === "usada" || corridasVivasDe(lote).some((c) => Boolean(c.usadoAt));
}

export interface ResumenSeleccion {
  lotes: number;
  /** m³ y pt de madera aserrada en patio. `null` si ningún lote trae el dato. */
  m3: number | null;
  pt: number | null;
  despachables: LoteAserrio[];
  bloqueados: { code: string; motivo: BloqueoDespacho }[];
  abiertos: LoteAserrio[];
  conMarcada: boolean;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** La cuenta de la barra: un preview de lo elegido (el total que vale es el del servidor). */
export function resumenSeleccion(lotes: readonly LoteAserrio[]): ResumenSeleccion {
  let m3 = 0;
  let pt = 0;
  let conDato = 0;
  const despachables: LoteAserrio[] = [];
  const bloqueados: ResumenSeleccion["bloqueados"] = [];
  for (const l of lotes) {
    const m = maderaDe(l);
    if (m) {
      conDato += 1;
      m3 += Number(m.m3Disponible) || 0;
      pt += Number(m.ptDisponible) || 0;
    }
    const b = bloqueoParaDespachar(l);
    if (b) bloqueados.push({ code: l.code, motivo: b });
    else despachables.push(l);
  }
  return {
    lotes: lotes.length,
    m3: conDato > 0 ? r3(m3) : null,
    pt: conDato > 0 ? Math.round(pt) : null,
    despachables,
    bloqueados,
    abiertos: lotes.filter((l) => l.status === "abierto"),
    conMarcada: lotes.some(tieneMaderaMarcada),
  };
}

/** «13-2026 (todavía no pasó por la sierra) · 15-2026 (…)», con tope para que la barra no crezca sin fin. */
export function avisoDeBloqueados(bloqueados: ResumenSeleccion["bloqueados"], tope = 3): string | null {
  if (bloqueados.length === 0) return null;
  const partes = bloqueados.slice(0, tope).map((b) => `${b.code} (${TEXTO_BLOQUEO[b.motivo]})`);
  const resto = bloqueados.length - tope;
  return `No van a la guía: ${partes.join(" · ")}${resto > 0 ? ` y ${resto} más` : ""}.`;
}

/** El servidor acepta hasta 200 lotes por pedido (`marcar_usado_lotes`). */
export const TOPE_LOTES_POR_VEZ = 200;

/**
 * Corridas de los elegidos que también comieron madera de un lote NO elegido.
 * A la guía van enteras (la guía va por corrida, no por lote): hay que decirlo.
 */
export function corridasCompartidas(
  elegidos: readonly LoteAserrio[],
  todos: readonly LoteAserrio[],
): { lineNo: number; otros: string[] }[] {
  const elegidosIds = new Set(elegidos.map((l) => l.id));
  const propias = new Map<string, number>();
  for (const l of elegidos) for (const c of corridasVivasDe(l)) propias.set(c.id, c.lineNo);
  const otros = new Map<string, Set<string>>();
  for (const l of todos) {
    if (elegidosIds.has(l.id)) continue;
    for (const c of corridasVivasDe(l)) {
      if (!propias.has(c.id)) continue;
      const set = otros.get(c.id) ?? new Set<string>();
      set.add(l.code);
      otros.set(c.id, set);
    }
  }
  return [...otros].map(([id, codes]) => ({ lineNo: propias.get(id) ?? 0, otros: [...codes] }));
}

/** «La corrida N° 12 también es de 15-2026 (no elegido): va entera.» */
export function avisoDeCompartidas(compartidas: ReturnType<typeof corridasCompartidas>): string | null {
  if (compartidas.length === 0) return null;
  const partes = compartidas
    .slice(0, 2)
    .map((c) => `la corrida N° ${c.lineNo} también es de ${c.otros.join(", ")} (no elegido)`);
  const resto = compartidas.length - 2;
  return `Ojo: ${partes.join(" · ")}${resto > 0 ? ` y ${resto} más` : ""}: va entera a la guía.`;
}

/* Meses a mano: `Intl` cambia la abreviatura según la versión de ICU. */
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];

/** Lima es UTC−5 todo el año (sin horario de verano). */
const LIMA_MS = 5 * 3600 * 1000;

/**
 * «14 set.» — una fecha del libro (date-only: «2026-09-14» o medianoche UTC)
 * se lee en UTC para no correrse un día; una marca con hora (la de «uso
 * interno») se lee en hora de Lima: a las 20:00 de Pucallpa el UTC ya es mañana.
 */
export function diaCorto(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const soloFecha = iso.length === 10 || /T00:00:00(\.0+)?Z$/.test(iso);
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return null;
  const local = soloFecha ? d : new Date(d.getTime() - LIMA_MS);
  return `${local.getUTCDate()} ${MESES[local.getUTCMonth()]}.`;
}
