/**
 * Lo que QUEDA del árbol en el LO-TH (Brandon 28-09: «los m³ del censo − lo
 * talado y quedará un restante; también en trozas»), con su referencia en pie
 * tablar aserrable.
 *
 *  · **Tala**: lo que el censo estimó para el árbol − lo medido al tumbarlo; y
 *    la especie entera en el plan: lo censado − lo ya talado (con este).
 *  · **Trozado**: lo talado − Σ trozas (con la que se está midiendo). Pasarse
 *    es lo que T4 rechaza al guardar (`ForestLothDB`, «trozar más que lo
 *    tumbado»): el aviso usa la MISMA comparación a 4 decimales.
 *
 * El pt de madera ROLLIZA es un derivado al 56 % (`pieTablarAserrableDe`,
 * única fórmula; nunca m³ × 424, que es para madera YA aserrada). No lo
 * declara el libro: es la referencia de cuánto saldría de la sierra.
 *
 * Puro a propósito: la ficha lo pinta y los tests lo prueban sin montar nada.
 */

import { pieTablarAserrableDe } from "./cubicacion";
import { RENDIMIENTO_META } from "./loctp-catalogos";
import { arbolDeTroza, type ArbolParaElegir } from "./loth-censo-uso";
import { claveEspecie } from "./loth-constants";

/** ≈ pt aserrables de un volumen de madera rolliza (referencia al 56 %). */
export function ptAserrableDeRolliza(m3: number): number {
  return pieTablarAserrableDe(m3, RENDIMIENTO_META);
}

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

// ─── Tala ─────────────────────────────────────────────────────────────────────

export interface RestanteArbol {
  /** Volumen estimado del censo. */
  censoM3: number | null;
  /** Lo medido al tumbarlo (la línea que se está cargando). */
  taladoM3: number | null;
  /** censo − talado; negativo = se midió más que lo estimado. `null` si falta uno. */
  restanteM3: number | null;
}

export function restanteDelArbol(censoM3: number | null, taladoM3: number | null): RestanteArbol {
  const ok = censoM3 != null && censoM3 > 0 && taladoM3 != null && taladoM3 > 0;
  return { censoM3, taladoM3, restanteM3: ok ? r4(censoM3 - taladoM3) : null };
}

export interface RestanteEspecie {
  especie: string;
  /** Árboles de la especie en el censo del plan. */
  arboles: number;
  /** Cuántos tienen tala (en el libro, más éste si ya se midió). */
  talados: number;
  censadoM3: number;
  taladoM3: number;
  restanteM3: number;
  /** Talas del libro sin volumen: no suman al talado. */
  talasSinVolumen: number;
}

/**
 * La especie del árbol en el censo del plan: lo censado − lo que el libro ya
 * taló − lo que se está midiendo ahora. Si el árbol en curso ya tiene tala en
 * el libro (corrección), cuenta una sola vez: la medida nueva reemplaza a la
 * asentada.
 */
export function restanteDeEspecie(
  arboles: readonly ArbolParaElegir[],
  especie: string,
  arbolEnCurso: string,
  medidoM3: number | null,
): RestanteEspecie | null {
  const clave = claveEspecie(especie);
  if (!clave) return null;
  const deLaEspecie = arboles.filter((a) => claveEspecie(a.speciesCommon) === clave);
  if (deLaEspecie.length === 0) return null;
  const enCurso = arbolEnCurso.trim();
  const medido = medidoM3 != null && medidoM3 > 0 ? medidoM3 : null;
  let censado = 0;
  let talado = 0;
  let talados = 0;
  let sinVolumen = 0;
  for (const a of deLaEspecie) {
    censado += a.volM3 ?? 0;
    if (a.treeCode === enCurso && medido != null) {
      talado += medido;
      talados += 1;
      continue;
    }
    const tala = a.uso?.tala;
    if (!tala) continue;
    talados += 1;
    if (tala.volumeM3 == null) sinVolumen += 1;
    else talado += tala.volumeM3;
  }
  return {
    especie: deLaEspecie[0].speciesCommon,
    arboles: deLaEspecie.length,
    talados,
    censadoM3: r4(censado),
    taladoM3: r4(talado),
    restanteM3: r4(censado - talado),
    talasSinVolumen: sinVolumen,
  };
}

// ─── Trozado ──────────────────────────────────────────────────────────────────

/** Una línea del libro tal como la devuelve el GET (Decimals → texto). */
export interface LineaDelLibro {
  id?: string;
  section: string;
  lineNo: number;
  entryDate: string;
  treeCode: string | null;
  trozaCode: string | null;
  diamMayorM?: string | number | null;
  diamMenorM?: string | number | null;
  lengthM?: string | number | null;
  volumeM3?: string | number | null;
  motosierrista?: string | null;
  horaTala?: string | null;
  gpsOrigen?: string | null;
  status?: string;
}

export interface TalaDelArbol {
  lineNo: number;
  /** `AAAA-MM-DD`. */
  fecha: string;
  diamMayorM: number | null;
  diamMenorM: number | null;
  lengthM: number | null;
  volumeM3: number | null;
  motosierrista: string | null;
  horaTala: string | null;
  gpsOrigen: string | null;
}

export interface TrozaDelArbol {
  /** Clave de la fila: el N° de línea se repite entre carátulas (medido 28-09 en QA). */
  id: string;
  lineNo: number;
  trozaCode: string;
  volumeM3: number | null;
}

export interface ArbolEnElLibro {
  treeCode: string;
  tala: TalaDelArbol | null;
  trozas: TrozaDelArbol[];
}

const numero = (v: string | number | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * La tala y las trozas de UN árbol, de un lote de líneas que puede traer de
 * más (la búsqueda del GET es por «contiene»: «85-TOR» también trae
 * «185-TOR»). La troza es del árbol por su `treeCode` o, si no lo tiene, por
 * su código («85-TOR-A» → «85-TOR»), el mismo criterio del resumen del censo.
 */
export function lineasDelArbol(lineas: readonly LineaDelLibro[], treeCode: string): ArbolEnElLibro {
  const code = treeCode.trim();
  const vivas = lineas.filter((l) => (l.status ?? "registrado") === "registrado").sort((a, b) => a.lineNo - b.lineNo);
  const t = vivas.find((l) => l.section === "tala" && l.treeCode?.trim() === code);
  const tala: TalaDelArbol | null = t
    ? {
        lineNo: t.lineNo,
        fecha: String(t.entryDate).slice(0, 10),
        diamMayorM: numero(t.diamMayorM),
        diamMenorM: numero(t.diamMenorM),
        lengthM: numero(t.lengthM),
        volumeM3: numero(t.volumeM3),
        motosierrista: t.motosierrista?.trim() || null,
        horaTala: t.horaTala?.trim() || null,
        gpsOrigen: t.gpsOrigen ?? null,
      }
    : null;
  const trozas = vivas
    .filter((l) => {
      if (l.section !== "trozado") return false;
      const troza = l.trozaCode?.trim() ?? "";
      const arbol = l.treeCode?.trim() || (troza ? arbolDeTroza(troza) : "");
      return arbol === code;
    })
    .map((l) => ({
      id: l.id ?? `${l.lineNo}-${l.trozaCode ?? ""}`,
      lineNo: l.lineNo,
      trozaCode: l.trozaCode?.trim() || "—",
      volumeM3: numero(l.volumeM3),
    }));
  return { treeCode: code, tala, trozas };
}

export interface RestanteTrozado {
  taladoM3: number | null;
  /** Σ de las trozas asentadas + la que se está midiendo. */
  trozadoM3: number;
  /** Cuántas trozas suman (con la que se está midiendo). */
  trozas: number;
  /** talado − trozado; `null` si la tala no registró volumen. */
  restanteM3: number | null;
  /** Se trozó más que lo tumbado: T4 lo rechaza al guardar. */
  excede: boolean;
  /** La troza en curso ya está asentada con ese código (T3 la rechaza). */
  repetida: TrozaDelArbol | null;
}

export function restanteTrozado(
  arbol: ArbolEnElLibro,
  enCurso: { trozaCode: string; volumeM3: number | null } | null,
): RestanteTrozado {
  const codigo = enCurso?.trozaCode.trim() ?? "";
  const repetida = codigo ? (arbol.trozas.find((t) => t.trozaCode === codigo) ?? null) : null;
  const vol = enCurso?.volumeM3 != null && enCurso.volumeM3 > 0 ? enCurso.volumeM3 : null;
  const asentado = arbol.trozas.reduce((s, t) => s + (t.volumeM3 ?? 0), 0);
  const trozado = r4(asentado + (vol ?? 0));
  const talado = arbol.tala?.volumeM3 ?? null;
  const restante = talado != null ? r4(talado - trozado) : null;
  return {
    taladoM3: talado,
    trozadoM3: trozado,
    trozas: arbol.trozas.length + (vol != null ? 1 : 0),
    restanteM3: restante,
    excede: talado != null && trozado > r4(talado),
    repetida,
  };
}

/**
 * El código que sigue para la troza de un árbol: la primera letra libre
 * («85-TOR-A»…«85-TOR-D» asentadas → «85-TOR-E»). Si el árbol se troza con
 * números («111-1», «111-2»), el número que sigue. Sin trozas, «-A».
 */
export function siguienteCodigoDeTroza(treeCode: string, trozas: readonly TrozaDelArbol[]): string {
  const code = treeCode.trim();
  const usados = new Set(trozas.map((t) => t.trozaCode.toUpperCase()));
  const sufijos = trozas.map((t) => t.trozaCode.slice(code.length + 1)).filter((x) => x !== "");
  if (sufijos.length > 0 && sufijos.every((x) => /^\d+$/.test(x))) {
    return `${code}-${Math.max(...sufijos.map(Number)) + 1}`;
  }
  for (let i = 0; i < 26; i++) {
    const c = `${code}-${String.fromCharCode(65 + i)}`;
    if (!usados.has(c.toUpperCase())) return c;
  }
  return `${code}-${trozas.length + 1}`;
}
