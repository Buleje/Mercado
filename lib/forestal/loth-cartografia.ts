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

export interface LothCartografia {
  referencias: LothReferencia[];
  accesos: LothAcceso[];
  /** Nota al pie de la lámina de dispersión (opcional). */
  nota: string;
  updatedAt: string | null;
}

export function emptyCartografia(): LothCartografia {
  return { referencias: [], accesos: [], nota: "", updatedAt: null };
}

const MAX_REFERENCIAS = 120;
const MAX_ACCESOS = 20;

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

  return {
    referencias,
    accesos,
    nota: str(o.nota, 300),
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : null,
  };
}

/** ¿Hay algo que dibujar/imprimir? */
export function hasCartografia(c: LothCartografia | null | undefined): boolean {
  return !!c && (c.referencias.length > 0 || c.accesos.length > 0);
}

/** Punto de una referencia en el formato del mapa. */
export const referenciaLatLng = (r: LothReferencia): LatLng => [r.lat, r.lng];
