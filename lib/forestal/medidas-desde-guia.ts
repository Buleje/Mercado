/**
 * «Traer D1/D2 de la guía» (Brandon 05-10: «las columnas D1 y D2 se ponen
 * automáticas porque esos están en la guía»).
 *
 * La GTF que publica SERFOR trae la lista de trozas con su codificación y sus
 * dimensiones («64 X 64 X 6.22» = D1 × D2 cm × largo m). Las trozas que entraron
 * sin ese dato —en Blas, las 17 del inventario de apertura del 03-10— se pueden
 * completar cruzando su código con el de la ficha. Las reglas:
 *   · se cruza por la codificación, primero EXACTA (sin espacios al borde, en
 *     mayúsculas) y, si no aparece, FLEXIBLE (sin guiones, barras, puntos,
 *     espacios ni el paréntesis del precinto: `116-A` = `116A` = `116/A (0000008)`);
 *     si la forma flexible deja dos candidatas de un lado o del otro, NO se
 *     empareja: va a `ambiguas` y lo decide una persona;
 *   · sólo sobre VACÍO: una troza con alguna punta ya anotada (de la guía o
 *     medida en planta) no se toca;
 *   · si el largo del libro y el de la guía difieren más de 30 cm, tampoco: o el
 *     código es de otra pieza o la troza se cortó, y el D1/D2 del árbol entero
 *     ya no es el de esa pieza (`largoDistinto`);
 *   · las medidas se leen con el MISMO parser del alta desde SERFOR
 *     (`medidasDeTroza`) y sólo si el texto trae exactamente tres números
 *     (`partirDimensiones`, el del importador del LO-TH): con dos se adivinaría
 *     la segunda punta;
 *   · la ficha tiene que ser de ESTA guía (`relacionDeGuias`): un N° de
 *     registro mal tipeado traería las medidas de otra carga con códigos
 *     parecidos.
 *
 * PURO: lo usan la DB class (para decidir dentro de la transacción), la ruta y
 * la planilla. El test lo prueba con la ficha real `1-19-0313629`.
 */

import { medidasDeTroza } from "./serfor-gtf-a-ingresos";
import { partirDimensiones } from "./serfor-gtf-campos";
import { claveNumeroGtf } from "./gtf-talonario";
import { normalizarNumeroRegistro } from "./serfor-gtf";

/** Más que esto entre el largo del libro y el de la guía = no es la misma pieza (o se cortó). */
export const TOLERANCIA_LARGO_M = 0.3;

export interface TrozaDelLibro {
  id: string;
  codificacion: string | null;
  d1Cm: number | null;
  d2Cm: number | null;
  largoM: number | null;
  /** Etiqueta del mes cerrado que contiene el ingreso, o null. */
  periodoCerrado: string | null;
  /** El ingreso está anulado o rechazado: fuera del libro vivo. */
  anulada: boolean;
}

export interface TrozaDeLaFicha {
  codificacion: string | null;
  dimensiones: string | null;
}

export type Coincidencia = "exacta" | "flexible";

export interface FilaALlenar {
  id: string;
  codificacion: string;
  /** El código tal como lo publica la guía (puede diferir en guiones). */
  codigoGuia: string;
  coincidencia: Coincidencia;
  d1: number;
  d2: number;
  diametro: number;
  /** El texto de la guía: se guarda sólo si la troza no tenía uno. */
  dimensiones: string;
  largo: number | null;
}

export interface PlanMedidasGuia {
  llenar: FilaALlenar[];
  yaTenian: { id: string; codificacion: string }[];
  /** Códigos que no se encontraron del otro lado. */
  sinCoincidencia: { libro: string[]; guia: string[] };
  /** Códigos que en forma flexible chocan con más de uno: no se empareja. */
  ambiguas: { codigo: string; candidatos: string[] }[];
  /** La guía tiene el código pero no unas medidas legibles. */
  sinDato: { id: string; codificacion: string; dimensiones: string | null }[];
  largoDistinto: { id: string; codificacion: string; largoLibro: number; largoGuia: number }[];
  /** Mes cerrado o guía anulada: lo presentado no cambia. */
  bloqueadas: { id: string; codificacion: string; motivo: string }[];
}

const exacto = (s: string) => s.trim().toUpperCase();
/** Misma forma flexible que «Pegar desde Excel» (`pegar-medidas-trozas`), más
 *  el paréntesis del precinto que SERFOR agrega a veces: `13/A (0000008)`. */
const flojo = (s: string) => exacto(s).replace(/\([^)]*\)/g, "").replace(/[-/.\s]+/g, "");
const vacio = (s: string | null | undefined) => !(s ?? "").trim();

/** Medidas legibles de la guía, o null si el texto no trae D1 × D2 × largo. */
export function medidasDeLaGuia(dimensiones: string | null | undefined): {
  d1: number; d2: number; diametro: number; largo: number | null;
} | null {
  const estricto = partirDimensiones(dimensiones);
  const m = medidasDeTroza(dimensiones);
  if (estricto.d1Cm == null || estricto.d2Cm == null || m.d1Cm == null || m.d2Cm == null) return null;
  /* Los dos parsers del sistema tienen que leer lo mismo; si no, el texto es raro. */
  if (estricto.d1Cm !== m.d1Cm || estricto.d2Cm !== m.d2Cm) return null;
  if (m.d1Cm <= 0 || m.d2Cm <= 0) return null;
  /* Revisión 05-10: SERFOR publica D1 cm × D2 cm × largo m («105.0 x 101.0 x 6.16»). Un texto en
     metros o con el largo primero («5.00 X 0.85 X 0.80») se leería D1 = 5 cm: si las cifras no
     caben en una troza, no se llena (mejor el casillero vacío que una medida inventada). */
  const cabe = (v: number, min: number, max: number) => v >= min && v <= max;
  if (!cabe(m.d1Cm, 10, 300) || !cabe(m.d2Cm, 10, 300)) return null;
  if (m.largoM != null && !cabe(m.largoM, 0.5, 30)) return null;
  return { d1: m.d1Cm, d2: m.d2Cm, diametro: Number(((m.d1Cm + m.d2Cm) / 2).toFixed(2)), largo: m.largoM };
}

function agrupar<T>(items: readonly T[], clave: (t: T) => string | null): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const it of items) {
    const k = clave(it);
    if (!k) continue;
    const l = out.get(k);
    if (l) l.push(it);
    else out.set(k, [it]);
  }
  return out;
}

export function planearMedidasDesdeGuia(
  libro: readonly TrozaDelLibro[],
  guia: readonly TrozaDeLaFicha[],
): PlanMedidasGuia {
  const plan: PlanMedidasGuia = {
    llenar: [], yaTenian: [], sinCoincidencia: { libro: [], guia: [] },
    ambiguas: [], sinDato: [], largoDistinto: [], bloqueadas: [],
  };
  const fichaUsada = new Set<number>();
  const fichaAmbigua = new Set<number>();
  const guiaIdx = guia.map((g, i) => ({ ...g, i }));
  const codigoDe = (t: { codificacion: string | null }) => (vacio(t.codificacion) ? null : t.codificacion!.trim());

  const guiaExacta = agrupar(guiaIdx, (g) => (codigoDe(g) ? exacto(g.codificacion!) : null));
  const libroExacto = agrupar(libro, (t) => (codigoDe(t) ? exacto(t.codificacion!) : null));
  const pares = new Map<string, { g: (typeof guiaIdx)[number]; c: Coincidencia }>();
  const pendientes: TrozaDelLibro[] = [];

  /* 1) Exacta: un código de cada lado. Repetido en cualquiera de los dos = ambiguo. */
  for (const t of libro) {
    const cod = codigoDe(t);
    if (!cod) { plan.sinCoincidencia.libro.push("(sin código)"); continue; }
    const g = guiaExacta.get(exacto(cod)) ?? [];
    const l = libroExacto.get(exacto(cod)) ?? [];
    if (g.length === 1 && l.length === 1) { pares.set(t.id, { g: g[0], c: "exacta" }); fichaUsada.add(g[0].i); continue; }
    if (g.length > 1 || (g.length >= 1 && l.length > 1)) {
      if (!plan.ambiguas.some((a) => a.codigo === cod)) {
        plan.ambiguas.push({ codigo: cod, candidatos: [...new Set([...g.map((x) => x.codificacion!.trim()), ...l.map((x) => x.codificacion!.trim())])] });
      }
      g.forEach((x) => fichaAmbigua.add(x.i));
      continue;
    }
    pendientes.push(t);
  }

  /* 2) Flexible, sólo entre lo que quedó libre de los dos lados. */
  const guiaLibre = guiaIdx.filter((g) => !fichaUsada.has(g.i) && !fichaAmbigua.has(g.i));
  const guiaFloja = agrupar(guiaLibre, (g) => (codigoDe(g) ? flojo(g.codificacion!) || null : null));
  const libroFlojo = agrupar(pendientes, (t) => flojo(t.codificacion!) || null);
  for (const t of pendientes) {
    const cod = t.codificacion!.trim();
    const k = flojo(cod);
    const g = k ? guiaFloja.get(k) ?? [] : [];
    const l = k ? libroFlojo.get(k) ?? [] : [];
    if (g.length === 1 && l.length === 1) { pares.set(t.id, { g: g[0], c: "flexible" }); fichaUsada.add(g[0].i); continue; }
    if (g.length > 1 || (g.length >= 1 && l.length > 1)) {
      if (!plan.ambiguas.some((a) => flojo(a.codigo) === k)) {
        plan.ambiguas.push({ codigo: cod, candidatos: [...new Set([...g, ...l].map((x) => x.codificacion!.trim()))] });
      }
      g.forEach((x) => fichaAmbigua.add(x.i));
      continue;
    }
    plan.sinCoincidencia.libro.push(cod);
  }
  plan.sinCoincidencia.guia = guiaIdx
    .filter((g) => !fichaUsada.has(g.i) && !fichaAmbigua.has(g.i))
    .map((g) => codigoDe(g) ?? "(sin código)");

  /* 3) Lo emparejado: qué se llena y qué no, y por qué. */
  for (const t of libro) {
    const par = pares.get(t.id);
    if (!par) continue;
    const cod = t.codificacion!.trim();
    if (t.anulada) { plan.bloqueadas.push({ id: t.id, codificacion: cod, motivo: "el ingreso está anulado" }); continue; }
    if (t.d1Cm != null || t.d2Cm != null) { plan.yaTenian.push({ id: t.id, codificacion: cod }); continue; }
    if (t.periodoCerrado) { plan.bloqueadas.push({ id: t.id, codificacion: cod, motivo: `mes cerrado (${t.periodoCerrado})` }); continue; }
    const m = medidasDeLaGuia(par.g.dimensiones);
    if (!m) { plan.sinDato.push({ id: t.id, codificacion: cod, dimensiones: par.g.dimensiones }); continue; }
    if (t.largoM != null && m.largo != null && Math.abs(t.largoM - m.largo) > TOLERANCIA_LARGO_M) {
      plan.largoDistinto.push({ id: t.id, codificacion: cod, largoLibro: t.largoM, largoGuia: m.largo });
      continue;
    }
    plan.llenar.push({
      id: t.id, codificacion: cod, codigoGuia: par.g.codificacion!.trim(), coincidencia: par.c,
      d1: m.d1, d2: m.d2, diametro: m.diametro, dimensiones: par.g.dimensiones!.trim(), largo: m.largo,
    });
  }
  return plan;
}

/** Cuántas trozas del libro encontraron su código en la guía (se llenen o no). */
export function coincidenciasDe(p: PlanMedidasGuia): number {
  return p.llenar.length + p.yaTenian.length + p.sinDato.length + p.largoDistinto.length + p.bloqueadas.length;
}

/**
 * ¿La ficha es de esta guía? `misma` = mismo número tramo a tramo
 * (`claveNumeroGtf`, la regla única del libro). `sufijo` = la ficha publica el
 * número con menos tramos y coinciden todos los suyos al final
 * (`001-0000005` dentro de `010-001-0000005`): en el talonario eso no se iguala
 * porque no se sabe de qué serie es, pero acá el operador ELIGIÓ la ficha por su
 * N° de registro y además los códigos tienen que cruzar. `distinta` bloquea.
 */
export type RelacionGuia = "misma" | "sufijo" | "distinta" | "sin_numero";

export function relacionDeGuias(libro: string | null | undefined, ficha: string | null | undefined): RelacionGuia {
  const a = claveNumeroGtf(libro);
  const b = claveNumeroGtf(ficha);
  if (!a || !b) return "sin_numero";
  if (a === b) return "misma";
  const ta = a.split("-");
  const tb = b.split("-");
  const [corto, largo] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (corto.length < 2 || corto.length === largo.length) return "distinta";
  const cola = largo.slice(largo.length - corto.length);
  return cola.every((t, i) => t === corto[i]) ? "sufijo" : "distinta";
}

/** Se puede escribir con esta relación (`sin_numero` no: no hay cómo saber de qué guía es). */
export const relacionPermiteAplicar = (r: RelacionGuia) => r === "misma" || r === "sufijo";

/**
 * El N° de registro desde lo que pegó el operador: el número (`1-19-0313629`) o
 * el ENLACE del QR (`…consultarGtf.do?nuRegistroGuia=1-19-0313629&…`). `null` si
 * es un enlace sin ese parámetro: no se adivina.
 */
export function numeroRegistroDesdeTexto(texto: string | null | undefined): string | null {
  const t = (texto ?? "").trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t) || /nuRegistroGuia=/i.test(t)) {
    const m = t.match(/nuRegistroGuia=([^&#\s]+)/i);
    if (!m) return null;
    let v = m[1];
    try { v = decodeURIComponent(v.replace(/\+/g, " ")); } catch { /* queda crudo */ }
    return normalizarNumeroRegistro(v) || null;
  }
  return normalizarNumeroRegistro(t) || null;
}

/* ── Contrato de `POST /api/admin/forestal/trozas/medidas-guia` ─────────── */

export type EstadoMedidasGuia = "lista" | "falta_registro" | "no_encontrada" | "sin_respuesta";

export interface RespuestaMedidasGuia {
  estado: EstadoMedidasGuia;
  gtfNumber: string;
  /** De dónde salió la ficha: la guardada en el ingreso (sin red) o SERFOR recién. */
  fuente: "guardada" | "serfor" | null;
  numeroRegistro: string | null;
  /** El N° de GTF que publica la ficha y cómo se relaciona con el del libro. */
  guiaSerfor: string | null;
  relacionGuia: RelacionGuia | null;
  /** «Activa», «Anulada»… tal como lo dice SERFOR. */
  estadoSerfor: string | null;
  mensaje: string | null;
  trozasLibro: number;
  trozasGuia: number;
  plan: PlanMedidasGuia | null;
  /** Sólo con `aplicar: true`. */
  aplicado?: {
    escritas: { id: string; codificacion: string }[];
    omitidas: { id: string; codificacion: string; motivo: string }[];
    fichaGuardadaEn: number;
  };
}

export interface EstadoGuiaMedidas {
  gtfNumber: string;
  fichaGuardada: boolean;
  numeroRegistro: string | null;
}
