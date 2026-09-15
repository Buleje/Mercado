/**
 * loth-cartografia — el CONTEXTO del plano forestal: lo que un revisor necesita
 * para llegar al área y ubicarla en el territorio, y que no vive en ninguna
 * tabla del libro:
 *
 *   · REFERENCIAS — centros poblados, campamentos, puntos de acopio, hitos y el
 *     punto de ingreso a la UMF, cada uno con su coordenada;
 *   · ACCESOS — el cuadro "ACCESO A LA UMF" de cualquier plano oficial: tramo,
 *     tiempo y movilidad (auto-camioneta, moto lineal, bote, a pie).
 *
 * Igual que la parcela EUDR, vive en el KV `PlatformSetting` (sin migración) y
 * la forma se valida acá. PURO y client-safe: lo consumen el mapa, el panel de
 * edición, el endpoint y las láminas imprimibles.
 */

import type { LatLng } from "./loth-geo";

export const REFERENCIA_TIPOS = [
  { tipo: "centro_poblado", label: "Centro poblado", color: "#1d4ed8" },
  { tipo: "campamento", label: "Campamento", color: "#b45309" },
  { tipo: "acopio", label: "Punto de acopio", color: "#7c3aed" },
  { tipo: "ingreso", label: "Ingreso a la UMF", color: "#dc2626" },
  { tipo: "hito", label: "Hito / referencia", color: "#0f766e" },
] as const;

export type ReferenciaTipo = (typeof REFERENCIA_TIPOS)[number]["tipo"];

const TIPOS = new Set<string>(REFERENCIA_TIPOS.map((t) => t.tipo));

export function referenciaMeta(tipo: string): { tipo: ReferenciaTipo; label: string; color: string } {
  return REFERENCIA_TIPOS.find((t) => t.tipo === tipo) ?? REFERENCIA_TIPOS[REFERENCIA_TIPOS.length - 1];
}

/**
 * Tipos de vía del plano: los mismos que rotula un mapa forestal oficial
 * (vía de acceso, vía marginal, trocha de arrastre, río/quebrada).
 */
export const VIA_TIPOS = [
  { tipo: "acceso", label: "Vía de acceso", color: "#a21caf", dash: "" },
  { tipo: "marginal", label: "Vía marginal", color: "#65a30d", dash: "10 6" },
  { tipo: "trocha", label: "Trocha de arrastre", color: "#b45309", dash: "4 5" },
  { tipo: "rio", label: "Río / quebrada", color: "#0284c7", dash: "" },
] as const;

export type ViaTipo = (typeof VIA_TIPOS)[number]["tipo"];

const VIA_SET = new Set<string>(VIA_TIPOS.map((t) => t.tipo));

export function viaMeta(tipo: string): { tipo: ViaTipo; label: string; color: string; dash: string } {
  return VIA_TIPOS.find((t) => t.tipo === tipo) ?? VIA_TIPOS[0];
}

/** Movilidades del cuadro de acceso (las que usa un plan de manejo en selva). */
export const MOVILIDADES = ["auto-camioneta", "moto lineal", "bote / peque-peque", "a pie", "avioneta"] as const;

export interface LothReferencia {
  id: string;
  nombre: string;
  tipo: ReferenciaTipo;
  lat: number;
  lng: number;
  nota: string;
}

export interface LothAcceso {
  id: string;
  /** Tramo: "Puerto Bermúdez — C.P. Unión Siria". */
  lugar: string;
  /** Tiempo del tramo tal cual se declara: "30 min", "2 h". */
  tiempo: string;
  movilidad: string;
}

export interface LothVia {
  id: string;
  nombre: string;
  tipo: ViaTipo;
  /** Traza de la vía ([lat, lng]); mínimo 2 puntos. */
  puntos: LatLng[];
}

/**
 * El PREDIO: el inmueble entero donde vive el área de aprovechamiento.
 *
 * Un plano de expediente pide DOS polígonos —el del predio completo y el exacto
 * del área trabajada— y hasta acá el módulo dibujaba uno solo: el segundo. Sin
 * el contorno del predio no se puede mostrar que el área declarada cae adentro,
 * que es justo lo que revisa quien recibe el expediente.
 *
 * Su identidad (nombre, sector, comunidad) tampoco vivía en ninguna tabla: la
 * carátula del libro llega hasta distrito/provincia/departamento. Va acá, en el
 * mismo KV que el resto del contexto cartográfico y sin migración.
 */
export interface LothPredio {
  /** "Fundo San Miguel", "Predio rural N° 0123". */
  nombre: string;
  /** Sector o zona dentro del distrito. */
  sector: string;
  /** Comunidad nativa o campesina, si el predio pertenece a una. */
  comunidad: string;
  /** Contorno del inmueble ([lat, lng]); vacío = todavía no se levantó. */
  vertices: LatLng[];
}

export interface LothCartografia {
  referencias: LothReferencia[];
  vias: LothVia[];
  accesos: LothAcceso[];
  /** Contorno e identidad del inmueble que contiene el área de aprovechamiento. */
  predio: LothPredio;
  /** Nota al pie de la lámina de dispersión (opcional). */
  nota: string;
  updatedAt: string | null;
}

export function emptyPredio(): LothPredio {
  return { nombre: "", sector: "", comunidad: "", vertices: [] };
}

export function emptyCartografia(): LothCartografia {
  return { referencias: [], vias: [], accesos: [], predio: emptyPredio(), nota: "", updatedAt: null };
}

/** ¿El predio tiene contorno dibujable? Tres vértices es el mínimo de un área. */
export function hasPredio(p: LothPredio | null | undefined): boolean {
  return !!p && p.vertices.length >= 3;
}

const MAX_REFERENCIAS = 120;
const MAX_ACCESOS = 20;
const MAX_VIAS = 40;
const MAX_PUNTOS_VIA = 500;
const MAX_VERTICES_PREDIO = 500;

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

const validLatLng = (lat: unknown, lng: unknown): boolean =>
  typeof lat === "number" &&
  typeof lng === "number" &&
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  lat >= -90 &&
  lat <= 90 &&
  lng >= -180 &&
  lng <= 180 &&
  !(lat === 0 && lng === 0);

/**
 * Genera un id estable sin `Math.random`/`Date.now` (romperían el determinismo
 * y los tests): índice + nombre normalizado bastan dentro de una colección.
 */
function fallbackId(prefix: string, index: number, seed: string): string {
  const slug = seed
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  return `${prefix}-${index + 1}${slug ? `-${slug}` : ""}`;
}

/** Normaliza la entrada del editor/API a una cartografía canónica. */
export function normalizeCartografia(raw: unknown): LothCartografia {
  const o = (raw ?? {}) as Record<string, unknown>;

  const refsRaw = Array.isArray(o.referencias) ? o.referencias.slice(0, MAX_REFERENCIAS) : [];
  const referencias: LothReferencia[] = [];
  refsRaw.forEach((r, i) => {
    const it = (r ?? {}) as Record<string, unknown>;
    const lat = Number(it.lat);
    const lng = Number(it.lng);
    if (!validLatLng(lat, lng)) return;
    const nombre = str(it.nombre, 80) || `Referencia ${i + 1}`;
    const tipo = TIPOS.has(String(it.tipo)) ? (String(it.tipo) as ReferenciaTipo) : "hito";
    referencias.push({
      id: str(it.id, 40) || fallbackId("ref", i, nombre),
      nombre,
      tipo,
      lat,
      lng,
      nota: str(it.nota, 160),
    });
  });

  const viasRaw = Array.isArray(o.vias) ? o.vias.slice(0, MAX_VIAS) : [];
  const vias: LothVia[] = [];
  viasRaw.forEach((v, i) => {
    const it = (v ?? {}) as Record<string, unknown>;
    const rawPts = Array.isArray(it.puntos) ? it.puntos.slice(0, MAX_PUNTOS_VIA) : [];
    const puntos: LatLng[] = [];
    for (const p of rawPts) {
      const pair = p as unknown[];
      if (!Array.isArray(pair) || pair.length < 2) continue;
      const lat = Number(pair[0]);
      const lng = Number(pair[1]);
      if (validLatLng(lat, lng)) puntos.push([lat, lng]);
    }
    if (puntos.length < 2) return; // una vía de un solo punto no es una vía
    const nombre = str(it.nombre, 80) || `Vía ${i + 1}`;
    vias.push({
      id: str(it.id, 40) || fallbackId("via", i, nombre),
      nombre,
      tipo: VIA_SET.has(String(it.tipo)) ? (String(it.tipo) as ViaTipo) : "acceso",
      puntos,
    });
  });

  const accRaw = Array.isArray(o.accesos) ? o.accesos.slice(0, MAX_ACCESOS) : [];
  const accesos: LothAcceso[] = [];
  accRaw.forEach((a, i) => {
    const it = (a ?? {}) as Record<string, unknown>;
    const lugar = str(it.lugar, 120);
    if (!lugar) return; // una fila sin tramo no dice nada
    accesos.push({
      id: str(it.id, 40) || fallbackId("acc", i, lugar),
      lugar,
      tiempo: str(it.tiempo, 40),
      movilidad: str(it.movilidad, 40),
    });
  });

  const predioRaw = (o.predio ?? {}) as Record<string, unknown>;
  const predioPts = Array.isArray(predioRaw.vertices) ? predioRaw.vertices.slice(0, MAX_VERTICES_PREDIO) : [];
  const predioVertices: LatLng[] = [];
  for (const p of predioPts) {
    const pair = p as unknown[];
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const lat = Number(pair[0]);
    const lng = Number(pair[1]);
    if (validLatLng(lat, lng)) predioVertices.push([lat, lng]);
  }
  const predio: LothPredio = {
    nombre: str(predioRaw.nombre, 120),
    sector: str(predioRaw.sector, 120),
    comunidad: str(predioRaw.comunidad, 120),
    // Menos de tres vértices no cierra un área: se guarda vacío antes que
    // dejar una línea que la lámina intentaría rellenar.
    vertices: predioVertices.length >= 3 ? predioVertices : [],
  };

  return {
    referencias,
    vias,
    accesos,
    predio,
    nota: str(o.nota, 300),
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : null,
  };
}

/** ¿Hay algo que dibujar/imprimir? */
export function hasCartografia(c: LothCartografia | null | undefined): boolean {
  return (
    !!c &&
    (c.referencias.length > 0 ||
      c.vias.length > 0 ||
      c.accesos.length > 0 ||
      hasPredio(c.predio) ||
      Boolean(c.predio?.nombre || c.predio?.sector || c.predio?.comunidad))
  );
}

/** Punto de una referencia en el formato del mapa. */
export const referenciaLatLng = (r: LothReferencia): LatLng => [r.lat, r.lng];
