/**
 * loth-mapa-arboles — el censo forestal leído como lo lee quien está en el
 * monte: de qué condición es cada árbol, cuáles pasan un filtro, cuál tengo más
 * cerca y hacia dónde queda.
 *
 * Puro (sin React, sin DOM, sin Leaflet): lo usan el mapa del Libro TH —pintar,
 * filtrar, «¿Qué árbol tengo cerca?», la ficha— y sus pruebas.
 *
 * La CONDICIÓN manda sobre la categoría del POA: la condición la declara el
 * regente en la hoja del censo («Aprovechable», «Semillero»), y es la que firma
 * ante el ARFFS. La categoría la calcula el sistema con el DMC y el % de
 * semilleros, y sólo pinta el árbol cuando el regente no dijo nada. Las dos se
 * guardan (ver `ForestCensusTree.condicion`), y la ficha muestra la otra cuando
 * no coinciden.
 */

import { bearingDeg, distanceM } from "./loth-utm";
import { claveEspecie } from "./loth-constants";
import type { LatLng } from "./loth-geo";
import type { PoaCategoria } from "./loth-poa";
import type { EtapaArbol, EtapaFiltro } from "./loth-etapa-arbol";

/** Cómo se pinta un árbol: la condición del regente o, si falta, la del POA. */
export type ClaseArbol = "aprovechable" | "semillero" | "bajo_dmc" | "otra" | "sin_dato";

export const CLASES_ARBOL: readonly ClaseArbol[] = ["aprovechable", "semillero", "bajo_dmc", "otra", "sin_dato"];

export const CLASE_ARBOL_LABEL: Record<ClaseArbol, string> = {
  aprovechable: "Aprovechable",
  semillero: "Semillero",
  bajo_dmc: "Bajo DMC",
  otra: "Otra condición",
  sin_dato: "Sin condición",
};

/**
 * Color de cada clase, como token del DS: el mismo en el símbolo del mapa y en
 * la leyenda, y cambia solo con el modo oscuro.
 */
export const CLASE_ARBOL_TOKEN: Record<ClaseArbol, string> = {
  aprovechable: "var(--data-success-500)",
  semillero: "var(--data-8)",
  bajo_dmc: "var(--data-warning-500)",
  otra: "var(--data-6)",
  sin_dato: "var(--data-3)",
};

export type FormaArbol = "circulo" | "rombo" | "triangulo" | "cuadrado";

/**
 * Forma de cada clase. El color no puede ser lo único que distingue: bajo el
 * sol del monte, en una pantalla gastada o para quien no distingue colores, un
 * rombo sigue siendo un rombo.
 */
export const CLASE_ARBOL_FORMA: Record<ClaseArbol, FormaArbol> = {
  aprovechable: "circulo",
  semillero: "rombo",
  bajo_dmc: "triangulo",
  otra: "cuadrado",
  sin_dato: "cuadrado",
};

export const ESTADO_ARBOL_LABEL: Record<string, string> = {
  en_pie: "En pie",
  talado: "Talado",
  descartado: "Descartado",
};

/** Lo mínimo que estas cuentas necesitan de un árbol del mapa. */
export interface ArbolBase {
  id: string;
  lat: number;
  lng: number;
  code: string;
  species: string;
  estado: string;
  /** Condición del regente, tal como vino en la hoja del censo. */
  condicion?: string | null;
  /** Categoría que calculó el POA (DMC + % de semilleros). */
  categoria?: PoaCategoria;
  /** En qué punto de la cadena está según el libro (`loth-etapa-arbol`). */
  etapa?: EtapaArbol;
  /** El censo y el libro no dicen lo mismo de este árbol. */
  conAviso?: boolean;
}

const sinTildes = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * La condición del regente, llevada a una clase. Acepta cómo se escribe de
 * verdad en la hoja: «Aprovechable», «APROVECHABLE», «Semillero», «Árbol
 * semillero», «Bajo DMC». Lo que no se reconoce es «otra» (y la ficha muestra
 * el texto tal cual), nunca «aprovechable» por descarte.
 */
export function normalizarCondicion(raw: string | null | undefined): Exclude<ClaseArbol, "sin_dato"> | null {
  const s = sinTildes(String(raw ?? "")).toLowerCase().replace(/\s+/g, " ").trim();
  if (!s) return null;
  if (/\bno aprovechable\b/.test(s)) return "otra";
  if (/semiller/.test(s)) return "semillero";
  if (/\bdmc\b|diametro minimo/.test(s)) return "bajo_dmc";
  if (/aprovechab/.test(s)) return "aprovechable";
  return "otra";
}

const CLASE_DE_CATEGORIA: Partial<Record<PoaCategoria, ClaseArbol>> = {
  aprovechable: "aprovechable",
  semillero: "semillero",
  bajo_dmc: "bajo_dmc",
};

/** La clase con la que se pinta: la condición del regente; si no hay, la del POA. */
export function claseDelArbol(t: Pick<ArbolBase, "condicion" | "categoria">): ClaseArbol {
  const c = normalizarCondicion(t.condicion);
  if (c) return c;
  return (t.categoria && CLASE_DE_CATEGORIA[t.categoria]) || "sin_dato";
}

/** De dónde sale la clase: lo que declaró el regente o lo que calculó el POA. */
export function origenDeLaClase(t: Pick<ArbolBase, "condicion" | "categoria">): "regente" | "poa" | null {
  if (normalizarCondicion(t.condicion)) return "regente";
  return t.categoria && CLASE_DE_CATEGORIA[t.categoria] ? "poa" : null;
}

/**
 * La categoría del POA cuando dice OTRA cosa que la condición del regente
 * (p. ej. el regente lo declaró aprovechable y el POA lo reserva como
 * semillero). Null si coinciden o si falta alguna de las dos.
 */
export function poaDiscrepa(t: Pick<ArbolBase, "condicion" | "categoria">): ClaseArbol | null {
  const regente = normalizarCondicion(t.condicion);
  const poa = t.categoria ? CLASE_DE_CATEGORIA[t.categoria] : undefined;
  return regente && poa && regente !== poa ? poa : null;
}

// ── Filtro ───────────────────────────────────────────────────────────────────

export interface FiltroArboles {
  /** Clave de la especie (`claveEspecie`), no el texto crudo. */
  especie: string | null;
  clase: ClaseArbol | null;
  estado: string | null;
  /** La etapa según el libro, o «con aviso» (censo ≠ libro). Opcional: quien no la usa no la manda. */
  etapa?: EtapaFiltro | null;
}

export const FILTRO_ARBOLES_VACIO: FiltroArboles = { especie: null, clase: null, estado: null, etapa: null };

export const filtroActivo = (f: FiltroArboles): boolean =>
  f.especie !== null || f.clase !== null || f.estado !== null || (f.etapa ?? null) !== null;

function pasaEtapa(t: ArbolBase, etapa: EtapaFiltro | null | undefined): boolean {
  if (!etapa) return true;
  return etapa === "con_aviso" ? t.conAviso === true : t.etapa === etapa;
}

export function filtrarArboles<T extends ArbolBase>(arboles: T[], f: FiltroArboles): T[] {
  if (!filtroActivo(f)) return arboles;
  return arboles.filter(
    (t) =>
      (f.especie === null || claveEspecie(t.species) === f.especie) &&
      (f.clase === null || claseDelArbol(t) === f.clase) &&
      (f.estado === null || t.estado === f.estado) &&
      pasaEtapa(t, f.etapa),
  );
}

export interface OpcionFiltro<V extends string = string> {
  valor: V;
  label: string;
  n: number;
}

/**
 * Las opciones de cada filtro, con cuántos árboles hay de cada una en el censo
 * entero. La especie se agrupa por su clave: «Catahua» y «catahua » son la
 * misma, y se muestra como la escribió el primero.
 */
export function opcionesDeFiltro(arboles: ArbolBase[]): {
  especies: OpcionFiltro[];
  clases: OpcionFiltro<ClaseArbol>[];
  estados: OpcionFiltro[];
} {
  const especies = new Map<string, OpcionFiltro>();
  const clases = new Map<ClaseArbol, number>();
  const estados = new Map<string, number>();
  for (const t of arboles) {
    const k = claveEspecie(t.species);
    const e = especies.get(k);
    if (e) e.n += 1;
    else especies.set(k, { valor: k, label: t.species.trim() || "Sin especie", n: 1 });
    const c = claseDelArbol(t);
    clases.set(c, (clases.get(c) ?? 0) + 1);
    estados.set(t.estado, (estados.get(t.estado) ?? 0) + 1);
  }
  return {
    especies: [...especies.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, "es")),
    clases: CLASES_ARBOL.filter((c) => clases.has(c)).map((c) => ({ valor: c, label: CLASE_ARBOL_LABEL[c], n: clases.get(c) ?? 0 })),
    estados: ["en_pie", "talado", "descartado", ...[...estados.keys()].filter((e) => !(e in ESTADO_ARBOL_LABEL))]
      .filter((e) => estados.has(e))
      .map((e) => ({ valor: e, label: ESTADO_ARBOL_LABEL[e] ?? e, n: estados.get(e) ?? 0 })),
  };
}

// ── ¿Qué árbol tengo cerca? ──────────────────────────────────────────────────

export interface ArbolCercano<T extends ArbolBase = ArbolBase> {
  arbol: T;
  /** Metros en el terreno (haversine), no en pantalla. */
  distanciaM: number;
  /** Rumbo desde donde estás hasta el árbol, 0 = norte, en grados. */
  rumboDeg: number;
}

/**
 * Los `n` árboles EN PIE más cercanos a un punto, del más cerca al más lejos.
 * Los talados y descartados no cuentan: en el monte la pregunta es a cuál ir.
 * Empate de distancia (al centímetro) → por código, para que la misma posición
 * dé siempre la misma lista.
 */
export function arbolesCercanos<T extends ArbolBase>(desde: LatLng, arboles: T[], n = 5): ArbolCercano<T>[] {
  if (n <= 0) return [];
  const out: ArbolCercano<T>[] = [];
  for (const t of arboles) {
    if (t.estado !== "en_pie") continue;
    if (!Number.isFinite(t.lat) || !Number.isFinite(t.lng)) continue;
    const hasta: LatLng = [t.lat, t.lng];
    out.push({ arbol: t, distanciaM: distanceM(desde, hasta), rumboDeg: bearingDeg(desde, hasta) });
  }
  // Se compara al centímetro: dos árboles «a la misma distancia» difieren en
  // décimas de milímetro de punto flotante, y eso no puede decidir el orden.
  const cm = (m: number) => Math.round(m * 100);
  out.sort((a, b) => cm(a.distanciaM) - cm(b.distanciaM) || a.arbol.code.localeCompare(b.arbol.code, "es", { numeric: true }));
  return out.slice(0, n);
}

const RUMBOS = [
  { corto: "N", largo: "al norte" },
  { corto: "NE", largo: "al noreste" },
  { corto: "E", largo: "al este" },
  { corto: "SE", largo: "al sureste" },
  { corto: "S", largo: "al sur" },
  { corto: "SO", largo: "al suroeste" },
  { corto: "O", largo: "al oeste" },
  { corto: "NO", largo: "al noroeste" },
] as const;

/** Rumbo en grados → uno de los 8 puntos cardinales (cada uno cubre 45°). */
export function rumboCardinal(deg: number): (typeof RUMBOS)[number] {
  const d = ((deg % 360) + 360) % 360;
  return RUMBOS[Math.round(d / 45) % 8];
}

/** «18 m» · «240 m» · «1.2 km» — distancia de a pie, sin decimales falsos. */
export function textoDistancia(m: number): string {
  if (!Number.isFinite(m) || m < 0) return "—";
  if (m < 1_000) return `${Math.round(m)} m`;
  return `${(m / 1_000).toFixed(m >= 10_000 ? 0 : 1)} km`;
}

/**
 * Por encima de este error del GPS la distancia deja de servir para elegir a
 * cuál árbol ir: con ±50 m, dos árboles a 20 y 40 m pueden estar al revés.
 */
export const GPS_IMPRECISO_M = 50;

// ── ¿Se puede registrar su tala desde el mapa? ───────────────────────────────

export interface TalaDesdeElMapa {
  /** Se ofrece el botón «Registrar tala». */
  puede: boolean;
  /** Por qué no, o qué va a pedir el libro si sí. */
  nota: string | null;
}

/**
 * Qué ofrece la ficha del árbol. Un semillero declarado se queda en pie (es la
 * reserva que exige el plan): ofrecer «Registrar tala» ahí sería escribir la
 * infracción con un clic. Bajo el DMC sí se ofrece, pero avisando que el libro
 * pedirá la justificación (T8).
 */
export function talaDesdeElMapa(t: Pick<ArbolBase, "estado" | "condicion" | "categoria">): TalaDesdeElMapa {
  if (t.estado === "talado") return { puede: false, nota: "Ya está talado." };
  if (t.estado !== "en_pie") return { puede: false, nota: "Está descartado del censo." };
  const clase = claseDelArbol(t);
  if (clase === "semillero") return { puede: false, nota: "Es semillero: se queda en pie." };
  if (clase === "bajo_dmc") return { puede: true, nota: "Está bajo el DMC: el libro te pedirá la justificación." };
  if (poaDiscrepa(t) === "semillero") return { puede: true, nota: "El POA lo reserva como semillero: revísalo antes de talar." };
  return { puede: true, nota: null };
}
