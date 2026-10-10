/**
 * ctp-radar-apariencia — el tamaño y el color con que se dibuja la cadena.
 *
 * El mismo grafo lo mira gente distinta en pantallas distintas: el jefe de patio
 * en una laptop de 13", el fiscalizador con el dibujo proyectado en una pared, y
 * quien cierra el mes barriendo cuarenta líneas. Un solo tamaño de bloque no
 * sirve para los tres, así que el tamaño dejó de ser constante del código y pasó
 * a ser preferencia de quien mira, guardada por tenant en el navegador.
 *
 * Datos puros (sin JSX) para que el lienzo, los controles y el panel los
 * compartan sin importarse entre sí.
 */

import { z } from "zod";

/** `titulo` es el eslabón anterior a la guía: el título habilitante de origen. */
export type NodeKind = "titulo" | "ingreso" | "corrida" | "despacho";

/** Medidas del dibujo en unidades del viewBox. El zoom multiplica encima de esto. */
export interface RadarDims {
  /** Ancho del bloque. */
  w: number;
  /** Alto del bloque. */
  h: number;
  /** Aire vertical entre bloques de una misma columna. */
  gapY: number;
  /** Aire entre columnas: es el carril donde viven las líneas y sus etiquetas. */
  gapX: number;
}

export interface RadarApariencia {
  dims: RadarDims;
  /** Sólo los colores ELEGIDOS a mano; ausente = el token del design system. */
  colores: Partial<Record<NodeKind, string>>;
  /** Volumen escrito sobre cada línea. Con cuarenta aristas ensucia más de lo que informa. */
  etiquetasArista: boolean;
  /** El alto del bloque crece con la cantidad de la línea (`ctp-radar-altura`). */
  altoPorCantidad: boolean;
  /** Dibujar la columna del título habilitante, el eslabón anterior a la guía. */
  columnaTitulo: boolean;
}

export const DIMS_DEFAULT: RadarDims = { w: 196, h: 62, gapY: 14, gapX: 104 };

/**
 * Color de cada columna cuando nadie eligió uno. Son tokens, no hex: siguen el
 * tema claro/oscuro sin que el radar tenga que enterarse.
 *
 * Producción usa `--data-6` y no `--data-info-500`: medido dentro del panel
 * admin, `--data-info-500` resuelve al MISMO `oklch(0.69 0.13 175)` que
 * `--accent`, así que ingreso y producción se dibujaban del mismo color
 * mientras la leyenda prometía dos. `--data-6` es de la paleta de series de
 * datos y sí contrasta contra el verde azulado en los dos temas.
 */
export const COLOR_TOKEN: Record<NodeKind, string> = {
  titulo: "var(--data-8)",
  ingreso: "var(--accent)",
  corrida: "var(--data-6)",
  despacho: "var(--data-success-600)",
};

export const APARIENCIA_DEFAULT: RadarApariencia = {
  dims: DIMS_DEFAULT,
  colores: {},
  etiquetasArista: true,
  altoPorCantidad: false,
  // Arranca encendida: la columna se dibuja sola sólo si algún ingreso declara
  // título, así que en un libro sin el dato no molesta, y en uno con el dato la
  // pregunta de EUDR queda a la vista sin que nadie tenga que descubrir la opción.
  columnaTitulo: true,
};

/**
 * Hasta dónde se puede estirar cada medida. Los topes no son estéticos: por
 * debajo del mínimo el texto del bloque deja de leerse, y por encima del máximo
 * una columna de veinte líneas se vuelve un rollo de varios metros.
 */
export const LIMITES = {
  w: { min: 140, max: 340, paso: 4 },
  h: { min: 46, max: 130, paso: 2 },
  gapY: { min: 4, max: 44, paso: 2 },
  gapX: { min: 60, max: 260, paso: 4 },
} as const;

export type MedidaKey = keyof typeof LIMITES;

export const MEDIDAS: { key: MedidaKey; label: string; hint: string }[] = [
  { key: "w", label: "Ancho del bloque", hint: "Cuánto texto entra antes de cortarse con «…»" },
  { key: "h", label: "Alto del bloque", hint: "Agranda también la letra de adentro" },
  { key: "gapY", label: "Aire entre bloques", hint: "Separación vertical dentro de cada columna" },
  { key: "gapX", label: "Aire entre columnas", hint: "El carril por donde pasan las líneas" },
];

export interface PresetTamano {
  key: string;
  label: string;
  hint: string;
  dims: RadarDims;
}

/**
 * Los valores caen en la grilla `min + n·paso` de `LIMITES` a propósito: el
 * `<input type=range>` redondea al paso más cercano, así que un preset fuera de
 * grilla (190 con paso 4 desde 60) muestra 190 en el número y 192 en el slider.
 */
export const PRESETS_TAMANO: PresetTamano[] = [
  { key: "compacto", label: "Compacto", hint: "Más líneas por pantalla; la letra se achica", dims: { w: 156, h: 48, gapY: 8, gapX: 72 } },
  { key: "normal", label: "Normal", hint: "El tamaño de siempre", dims: DIMS_DEFAULT },
  { key: "comodo", label: "Cómodo", hint: "Para leer sin acercarse a la pantalla", dims: { w: 252, h: 86, gapY: 20, gapX: 140 } },
  { key: "grande", label: "Grande", hint: "Para proyectar o mostrarle el dibujo a un tercero", dims: { w: 320, h: 118, gapY: 28, gapX: 192 } },
];

export interface PaletaRadar {
  key: string;
  label: string;
  hint: string;
  colores: Record<NodeKind, string>;
}

/**
 * Paletas de columna. Ninguna usa ámbar ni rojo a propósito: en este dibujo el
 * ámbar significa «hueco en la cadena» y el rojo «CITES». Repintar una columna
 * con esos colores haría ver un problema donde no lo hay.
 */
export const PALETAS: PaletaRadar[] = [
  { key: "sistema", label: "Sistema", hint: "La del panel; sigue el tema claro/oscuro", colores: COLOR_TOKEN },
  { key: "contraste", label: "Contraste", hint: "Tonos bien separados entre sí", colores: { titulo: "var(--data-2)", ingreso: "var(--data-8)", corrida: "var(--data-6)", despacho: "var(--data-5)" } },
  { key: "calida", label: "Cálida", hint: "Coral de la marca; ojo que se parece al rojo de CITES", colores: { titulo: "var(--data-5)", ingreso: "var(--data-7)", corrida: "var(--data-8)", despacho: "var(--data-6)" } },
  { key: "tinta", label: "Tinta", hint: "Escala de grises, para imprimir o proyectar", colores: { titulo: "var(--data-4)", ingreso: "var(--data-1)", corrida: "var(--data-2)", despacho: "var(--data-3)" } },
];

export const KINDS: { key: NodeKind; label: string }[] = [
  { key: "titulo", label: "Título habilitante" },
  { key: "ingreso", label: "Ingreso (GTF)" },
  { key: "corrida", label: "Producción" },
  { key: "despacho", label: "Despacho" },
];

/** El color con el que se dibuja una columna: el elegido, o el del design system. */
export function colorDe(ap: RadarApariencia, kind: NodeKind): string {
  return ap.colores[kind] ?? COLOR_TOKEN[kind];
}

/**
 * Cuánto se agranda el texto de un bloque respecto del tamaño normal. Va por el
 * MENOR de los dos crecimientos: si sólo se estiró el ancho, agrandar la letra
 * la haría chocar contra el borde de abajo.
 */
export function escalaTexto(d: RadarDims): number {
  return Math.min(1.7, Math.max(0.82, Math.min(d.w / DIMS_DEFAULT.w, d.h / DIMS_DEFAULT.h)));
}

/**
 * Cuántos caracteres entran en un ancho dado, a un tamaño de letra dado. El
 * 0.62 es el ancho medio de un carácter de la fuente del panel medido contra el
 * corte que ya usaba el radar (22 caracteres en 150 px a 11 px de letra).
 */
export function caben(anchoDisponible: number, fontSize: number): number {
  return Math.max(6, Math.floor(anchoDisponible / (fontSize * 0.62)));
}

/** La paleta que coincide exactamente con los colores elegidos, si hay alguna. */
export function paletaActiva(ap: Pick<RadarApariencia, "colores">): PaletaRadar | null {
  return (
    PALETAS.find((p) =>
      KINDS.every(({ key }) => (ap.colores[key] ?? COLOR_TOKEN[key]) === p.colores[key]),
    ) ?? null
  );
}

/** El preset que coincide exactamente con las medidas actuales, si hay alguno. */
export function presetActivo(d: RadarDims): PresetTamano | null {
  return PRESETS_TAMANO.find((p) => p.dims.w === d.w && p.dims.h === d.h && p.dims.gapY === d.gapY && p.dims.gapX === d.gapX) ?? null;
}

// ─── Persistencia ──────────────────────────────────────────────────────────

/**
 * El navegador es entrada externa: alguien puede haber editado el storage a
 * mano, o el formato pudo cambiar entre versiones. Se valida y se recorta a los
 * límites — un `w: 99999` guardado dibujaría un lienzo que cuelga la pestaña.
 */
const ESQUEMA = z.object({
  dims: z.object({ w: z.number(), h: z.number(), gapY: z.number(), gapX: z.number() }),
  colores: z.object({
    titulo: z.string().max(64).optional(),
    ingreso: z.string().max(64).optional(),
    corrida: z.string().max(64).optional(),
    despacho: z.string().max(64).optional(),
  }),
  etiquetasArista: z.boolean(),
  // Opcionales: lo guardado por una versión anterior no traía estos campos y
  // debe seguir cargando (si no, la preferencia entera se descarta en silencio).
  altoPorCantidad: z.boolean().optional(),
  columnaTitulo: z.boolean().optional(),
});

export function acotar(key: MedidaKey, v: number): number {
  const l = LIMITES[key];
  if (!Number.isFinite(v)) return DIMS_DEFAULT[key];
  return Math.min(l.max, Math.max(l.min, Math.round(v)));
}

function clave(): string {
  let slug = "main";
  try {
    slug = localStorage.getItem("active-tenant-slug") ?? "main";
  } catch {
    /* storage bloqueado (modo privado): se usa el default */
  }
  return `buleje-ctp-radar-apariencia-${slug}`;
}

export function leerApariencia(): RadarApariencia {
  if (typeof window === "undefined") return APARIENCIA_DEFAULT;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(clave());
  } catch {
    return APARIENCIA_DEFAULT;
  }
  if (!raw) return APARIENCIA_DEFAULT;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return APARIENCIA_DEFAULT;
  }
  const p = ESQUEMA.safeParse(json);
  if (!p.success) return APARIENCIA_DEFAULT;
  const d = p.data.dims;
  return {
    dims: { w: acotar("w", d.w), h: acotar("h", d.h), gapY: acotar("gapY", d.gapY), gapX: acotar("gapX", d.gapX) },
    colores: p.data.colores,
    etiquetasArista: p.data.etiquetasArista,
    altoPorCantidad: p.data.altoPorCantidad ?? APARIENCIA_DEFAULT.altoPorCantidad,
    columnaTitulo: p.data.columnaTitulo ?? APARIENCIA_DEFAULT.columnaTitulo,
  };
}

export function guardarApariencia(ap: RadarApariencia): void {
  try {
    localStorage.setItem(clave(), JSON.stringify(ap));
  } catch {
    /* quota o storage bloqueado: la sesión sigue con la apariencia elegida */
  }
}
