/**
 * «Posición de cada campo» del talonario (Brandon 16-10: «un modal donde
 * estará el campo, tipo (2) Autoridad Regional, y pondrá ahí la distancia alto
 * y ancho o x, y… para que todo coincida exacto»): la tabla de TODOS los
 * campos de la hoja con su X/Y/ancho en mm, copiarla a Excel y pegarla de
 * vuelta.
 *
 * Lógica pura, sin React: el nombre de cada campo como en el papel, las filas
 * de la tabla, fijar un valor acotado, el TSV que va a Excel y leer lo pegado
 * (cada renglón se casa por nombre o por N° de casillero).
 */

import {
  acotarPos,
  ALTO_FILA_MAX_MM,
  ALTO_FILA_MIN_MM,
  ANCHO_MAX_MM,
  ANCHO_MIN_MM,
  CATALOGO,
  LETRA_MAX_PT,
  LETRA_MIN_PT,
  POS_MAX_MM,
  POS_MIN_MM,
  type DisposicionHoja,
  type FormatoTalonario,
} from "./gtf-matricial-disposicion";
import { claveElemento } from "./gtf-matricial-edicion";
import { nombreCorto } from "./gtf-matricial-nombres";
import type { PaginaTalonario } from "./gtf-matricial-valores";
import { rotuloDelPapel } from "./gtf-talonario-plantilla";

const r2 = (v: number): number => Math.round(v * 100) / 100;
const entre = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

/** Sin tildes, en minúscula y sin signos: «(2) Autoridad…:» y «(2) autoridad…» son lo mismo. */
export const plano = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9()]+/g, " ")
    .trim();

/** «(2) Autoridad…» → «2»; «(11a) Departamento» → «11a»; también «2», «(2)» u «11a» solos. */
export function numeroDeCasillero(texto: string): string | null {
  const t = texto.trim().toLowerCase();
  const m = /^\((\d{1,2}[a-z]?)\)/.exec(t) ?? /^(\d{1,2}[a-z]?)$/.exec(t);
  return m ? m[1] : null;
}

/**
 * El nombre del campo como en el papel: el rótulo impreso cuando dice más que
 * el del catálogo («(2) Autoridad Regional Forestal y de Fauna Silvestre
 * (ARFFS)»); si no, el del catálogo, que distingue las partes de un mismo
 * casillero («(13) DNI/RUC · el RUC»).
 */
export function nombreDelCampo(formato: FormatoTalonario, id: string): string {
  const label = CATALOGO[formato].campos.find((c) => c.id === id)?.label ?? id;
  const papel = rotuloDelPapel(formato, id);
  const mejor = papel && !label.includes("·") && papel.length > label.length && numeroDeCasillero(papel) === numeroDeCasillero(label);
  return mejor ? papel : label;
}

export const nombreDeColumna = (formato: FormatoTalonario, id: string): string =>
  `Columna ${CATALOGO[formato].columnas.find((c) => c.id === id)?.label ?? id}`;

/** La fila de la tabla en el TSV: lleva sólo la Y de la primera fila. */
export const nombreDeLaTabla = (formato: FormatoTalonario): string => `${CATALOGO[formato].tablaLabel} · 1.ª fila`;

// ── Las filas de la ventana ─────────────────────────────────────────────────

export interface FilaPosicion {
  tipo: "campo" | "columna";
  id: string;
  /** `claveElemento`: la misma con que la hoja elige y marca lo que no entra. */
  clave: string;
  nombre: string;
  grupo: string;
  /** Lo que se imprime en la hoja que se ve; de una columna, su celda más larga. */
  valor: string;
  x: number;
  y: number;
  anchoMm: number;
  letraPt: number;
  visible: boolean;
}

/** Los campos de la hoja, en el orden del papel. Las columnas de la tabla van aparte (`columnasDePosiciones`). */
export function filasDePosiciones(formato: FormatoTalonario, hoja: DisposicionHoja, pagina?: PaginaTalonario): FilaPosicion[] {
  return CATALOGO[formato].campos.flatMap((c) => {
    const p = hoja.campos[c.id];
    if (!p) return [];
    return [{
      tipo: "campo" as const,
      id: c.id,
      clave: claveElemento({ tipo: "campo", id: c.id }),
      nombre: nombreDelCampo(formato, c.id),
      grupo: c.grupo,
      valor: (pagina?.campos[c.id] ?? "").trim(),
      x: p.x,
      y: p.y,
      anchoMm: p.anchoMm,
      letraPt: p.letraPt,
      visible: p.visible,
    }];
  });
}

export interface ColumnaPosicion {
  id: string;
  clave: string;
  nombre: string;
  valor: string;
  x: number;
  anchoMm: number;
  visible: boolean;
}

export function columnasDePosiciones(formato: FormatoTalonario, hoja: DisposicionHoja, pagina?: PaginaTalonario): ColumnaPosicion[] {
  const filas = (pagina?.filas ?? []).slice(0, hoja.tabla.maxFilas);
  return CATALOGO[formato].columnas.flatMap((c) => {
    const p = hoja.tabla.columnas[c.id];
    if (!p) return [];
    const valor = filas.map((f) => (f[c.id] ?? "").trim()).reduce((a, b) => (b.length > a.length ? b : a), "");
    return [{ id: c.id, clave: claveElemento({ tipo: "columna", id: c.id }), nombre: c.label, valor, x: p.x, anchoMm: p.anchoMm, visible: p.visible }];
  });
}

/** El buscador: por nombre (largo o corto) o por el valor. */
export const coincide = (formato: FormatoTalonario, f: { tipo?: "campo" | "columna"; id: string; nombre: string; valor: string }, q: string): boolean => {
  const filtro = plano(q);
  return !filtro || plano(`${f.nombre} ${nombreCorto(formato, f.tipo ?? "campo", f.id)} ${f.valor}`).includes(filtro);
};

// ── Fijar un valor ──────────────────────────────────────────────────────────

export interface CambioPos {
  x?: number;
  y?: number;
  anchoMm?: number;
  letraPt?: number;
  visible?: boolean;
}

/** Fija X/Y en [−50, 1000], el ancho en [1, 1000] y la letra en [5, 24]: fuera de eso el servidor no guarda. */
export function fijarEnHoja(h: DisposicionHoja, tipo: "campo" | "columna", id: string, c: CambioPos): DisposicionHoja {
  const base = {
    ...(c.x != null && { x: r2(acotarPos(c.x)) }),
    ...(c.anchoMm != null && { anchoMm: r2(entre(c.anchoMm, ANCHO_MIN_MM, ANCHO_MAX_MM)) }),
    ...(c.visible != null && { visible: c.visible }),
  };
  if (tipo === "columna") {
    const col = h.tabla.columnas[id];
    if (!col) return h;
    return { ...h, tabla: { ...h.tabla, columnas: { ...h.tabla.columnas, [id]: { ...col, ...base } } } };
  }
  const campo = h.campos[id];
  if (!campo) return h;
  const nuevo = {
    ...campo,
    ...base,
    ...(c.y != null && { y: r2(acotarPos(c.y)) }),
    ...(c.letraPt != null && { letraPt: r2(entre(c.letraPt, LETRA_MIN_PT, LETRA_MAX_PT)) }),
  };
  return { ...h, campos: { ...h.campos, [id]: nuevo } };
}

/** La Y de la primera fila de la tabla y el alto de cada fila. */
export function fijarTabla(h: DisposicionHoja, c: { y?: number; altoFilaMm?: number }): DisposicionHoja {
  return {
    ...h,
    tabla: {
      ...h.tabla,
      ...(c.y != null && { y: r2(acotarPos(c.y)) }),
      ...(c.altoFilaMm != null && { altoFilaMm: r2(entre(c.altoFilaMm, ALTO_FILA_MIN_MM, ALTO_FILA_MAX_MM)) }),
    },
  };
}

// ── Copiar a Excel ──────────────────────────────────────────────────────────

/**
 * La tabla para Excel, separada por tabuladores: Campo · X · Y · Ancho (mm).
 * Los campos, después la Y de la primera fila de la tabla y las columnas
 * (X y ancho). `decimal` = el separador del navegador, para que Excel lea
 * números y no texto.
 */
export function tsvDePosiciones(formato: FormatoTalonario, hoja: DisposicionHoja, decimal: "," | "." = "."): string {
  const n = (v: number) => String(r2(v)).replace(".", decimal);
  const filas: string[][] = [["Campo", "X (mm)", "Y (mm)", "Ancho (mm)"]];
  for (const f of filasDePosiciones(formato, hoja)) filas.push([f.nombre, n(f.x), n(f.y), n(f.anchoMm)]);
  filas.push([nombreDeLaTabla(formato), "", n(hoja.tabla.y), ""]);
  for (const c of columnasDePosiciones(formato, hoja)) filas.push([nombreDeColumna(formato, c.id), n(c.x), "", n(c.anchoMm)]);
  return filas.map((f) => f.join("\t")).join("\n");
}

// ── Pegar desde Excel ───────────────────────────────────────────────────────

/** «12,5», «12.5», «12,5 mm», «1.234,5» → número; vacío → null (no cambia); lo que no es número → NaN. */
export function leerMm(celda: string): number | null {
  let t = celda.trim().replace(/\s*mm$/i, "").replace(/\s/g, "").replace("−", "-");
  if (!t) return null;
  if (t.includes(",") && t.includes(".")) {
    t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else t = t.replace(",", ".");
  return /^-?(\d+\.?\d*|\.\d+)$/.test(t) ? Number(t) : Number.NaN;
}

export interface RenglonPegado {
  campo: string;
  /** null = celda vacía o sin esa columna: no cambia. NaN = no se pudo leer. */
  x: number | null;
  y: number | null;
  anchoMm: number | null;
}

type Columnas = { campo: number; x: number; y: number; ancho: number };

/** Lee la cabecera si la hay («Campo», «X (mm)», «Y», «Ancho»…) en cualquier orden. */
function cabecera(celdas: string[]): Columnas | null {
  const m: Partial<Columnas> = {};
  celdas.forEach((c, i) => {
    const h = plano(c).replace(/\(mm\)|\bmm\b/g, "").trim();
    if (h === "x") m.x ??= i;
    else if (h === "y") m.y ??= i;
    else if (h.startsWith("ancho")) m.ancho ??= i;
    else if (/^(campo|nombre|casillero|rotulo)/.test(h)) m.campo ??= i;
  });
  if (m.x == null && m.y == null && m.ancho == null) return null;
  return { campo: m.campo ?? 0, x: m.x ?? -1, y: m.y ?? -1, ancho: m.ancho ?? -1 };
}

const sinComillas = (c: string): string => {
  const t = c.trim();
  return t.length > 1 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1).replace(/""/g, '"') : t;
};

/**
 * Lo copiado de Excel (tabuladores) o de un CSV con «;». Con cabecera, las
 * columnas se toman por nombre; sin ella, en el orden Campo · X · Y · Ancho.
 */
export function leerPegado(texto: string): RenglonPegado[] {
  const lineas = texto.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim());
  if (!lineas.length) return [];
  const sep = lineas.some((l) => l.includes("\t")) ? "\t" : lineas.some((l) => l.includes(";")) ? ";" : null;
  const partir = (l: string) => (sep ? l.split(sep) : [l]).map(sinComillas);
  const primera = partir(lineas[0]);
  const cab = cabecera(primera);
  const cols: Columnas = cab ?? { campo: 0, x: 1, y: 2, ancho: 3 };
  const celda = (cs: string[], i: number) => (i >= 0 && i < cs.length ? leerMm(cs[i]) : null);
  return lineas.slice(cab ? 1 : 0).flatMap((l) => {
    const cs = partir(l);
    const campo = (cs[cols.campo] ?? "").trim();
    return campo ? [{ campo, x: celda(cs, cols.x), y: celda(cs, cols.y), anchoMm: celda(cs, cols.ancho) }] : [];
  });
}

interface Destino {
  tipo: "campo" | "columna" | "tabla";
  id: string;
  nombre: string;
  numero: string | null;
  /** Los nombres con que se lo reconoce, ya `plano`. */
  alias: string[];
}

const planos = (...xs: Array<string | null | undefined>): string[] => [...new Set(xs.filter((x): x is string => !!x).map(plano))];

function destinosDe(formato: FormatoTalonario): Destino[] {
  const cat = CATALOGO[formato];
  return [
    ...cat.campos.map((c): Destino => ({
      tipo: "campo",
      id: c.id,
      nombre: nombreDelCampo(formato, c.id),
      numero: numeroDeCasillero(c.label),
      alias: planos(c.label, nombreDelCampo(formato, c.id), rotuloDelPapel(formato, c.id), nombreCorto(formato, "campo", c.id)),
    })),
    {
      tipo: "tabla",
      id: "tabla",
      nombre: nombreDeLaTabla(formato),
      numero: null,
      alias: planos(nombreDeLaTabla(formato), cat.tablaLabel, "tabla", "1.ª fila", "primera fila"),
    },
    ...cat.columnas.map((c): Destino => {
      const corto = nombreCorto(formato, "columna", c.id);
      return { tipo: "columna", id: c.id, nombre: nombreDeColumna(formato, c.id), numero: numeroDeCasillero(c.label), alias: planos(c.label, nombreDeColumna(formato, c.id), corto, `Columna ${corto}`) };
    }),
  ];
}

/**
 * A qué campo va un renglón pegado: (1) el nombre exacto (catálogo, papel o
 * corto, sin tildes ni signos); (2) el N° de casillero si es único en la hoja;
 * (3) un pedazo del nombre que sólo tiene uno. Dos que empatan = «ambiguo».
 */
export function casarCampo(formato: FormatoTalonario, texto: string): { tipo: Destino["tipo"]; id: string; nombre: string } | "ambiguo" | null {
  return casar(destinosDe(formato), texto);
}

function casar(ds: Destino[], texto: string): Destino | "ambiguo" | null {
  const q = plano(texto);
  if (!q) return null;
  const exactos = ds.filter((d) => d.alias.includes(q));
  if (exactos.length === 1) return exactos[0];
  let pool = exactos.length > 1 ? exactos : ds;
  const n = numeroDeCasillero(texto);
  if (n) {
    const conN = pool.filter((d) => d.numero === n);
    if (conN.length === 1) return conN[0];
    if (conN.length > 1) pool = conN;
  }
  const resto = plano(n ? texto.trim().replace(/^\(?\d{1,2}[a-z]?\)?/i, "") : texto);
  if (resto.length >= 3) {
    const parecidos = pool.filter((d) => d.alias.some((a) => a.includes(resto)));
    if (parecidos.length === 1) return parecidos[0];
    if (parecidos.length > 1) return "ambiguo";
  }
  return pool !== ds ? "ambiguo" : null;
}

export interface ResultadoPegado {
  hoja: DisposicionHoja;
  /** Los que quedaron distintos (por nombre). */
  cambiados: string[];
  /** Reconocidos con los mismos valores que ya tenían. */
  sinCambio: number;
  /** Renglones que no son ningún campo de esta hoja (o que empatan entre varios). */
  noReconocidos: string[];
  /** Fuera de [−50, 1000] (X/Y) o de [1, 1000] (ancho): se llevaron al borde. */
  acotados: string[];
  /** Cifras que no se pudieron leer («abc»): ese valor quedó como estaba. */
  ilegibles: string[];
}

const fotoDe = (h: DisposicionHoja, d: Destino): string =>
  JSON.stringify(d.tipo === "campo" ? h.campos[d.id] : d.tipo === "columna" ? h.tabla.columnas[d.id] : h.tabla.y);

/**
 * Aplica lo pegado sobre la hoja. Cada renglón cambia sólo lo que trae (celda
 * vacía = no cambia); si dos renglones caen en el mismo campo, gana el último.
 * Las columnas no tienen Y propia y la fila de la tabla sólo tiene Y.
 */
export function aplicarPegado(formato: FormatoTalonario, hoja: DisposicionHoja, texto: string): ResultadoPegado {
  const ds = destinosDe(formato);
  let h = hoja;
  const tocados = new Map<string, Destino>();
  const noReconocidos: string[] = [];
  const acotados = new Set<string>();
  const ilegibles: string[] = [];
  for (const r of leerPegado(texto)) {
    const d = casar(ds, r.campo);
    if (!d || d === "ambiguo") {
      noReconocidos.push(d === "ambiguo" ? `${r.campo} (hay varios con ese nombre)` : r.campo);
      continue;
    }
    const leer = (v: number | null, que: string): number | undefined => {
      if (v == null) return undefined;
      if (Number.isNaN(v)) {
        ilegibles.push(`${d.nombre} · ${que}`);
        return undefined;
      }
      return v;
    };
    const x = d.tipo === "tabla" ? undefined : leer(r.x, "X");
    const y = d.tipo === "columna" ? undefined : leer(r.y, "Y");
    const anchoMm = d.tipo === "tabla" ? undefined : leer(r.anchoMm, "Ancho");
    const fuera = (v: number | undefined, min: number, max: number) => v != null && (v < min || v > max);
    if (fuera(x, POS_MIN_MM, POS_MAX_MM) || fuera(y, POS_MIN_MM, POS_MAX_MM) || fuera(anchoMm, ANCHO_MIN_MM, ANCHO_MAX_MM)) acotados.add(d.nombre);
    h = d.tipo === "tabla" ? fijarTabla(h, { y }) : fijarEnHoja(h, d.tipo, d.id, { x, y, anchoMm });
    tocados.set(`${d.tipo}:${d.id}`, d);
  }
  const cambiados: string[] = [];
  let sinCambio = 0;
  for (const d of tocados.values()) {
    if (fotoDe(h, d) !== fotoDe(hoja, d)) cambiados.push(d.nombre);
    else sinCambio++;
  }
  return { hoja: cambiados.length ? h : hoja, cambiados, sinCambio, noReconocidos, acotados: [...acotados], ilegibles };
}
