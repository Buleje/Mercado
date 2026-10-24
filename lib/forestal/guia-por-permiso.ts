/**
 * guia-por-permiso.ts — cómo se MUESTRA y se ELIGE una guía o una troza cuando
 * su N° o su código se repite entre permisos (ADR-504, carril pantalla).
 *
 * Brandon (19-10): «permiso 1 GTF 4 / permiso 2 GTF 4 (dos talonarios)… el
 * sistema sólo diferenciará según el número de permiso». En pantalla eso se
 * lee «GTF 4 · permiso 017»: el N° del permiso es la cola del código
 * (`19-SEC/REG-PLT-2021-017` → `017`), el código entero va en el ⓘ o el title.
 *
 * Las reglas que DECIDEN (qué guía es, qué troza es) viven en
 * `identidad-guia.ts` (carril importar). Esto sólo lee lo que el servidor
 * contestó y lo pone en palabras.
 *
 * PURO y client-safe.
 */

import { claveNumeroGtf } from "./gtf-talonario";

// ── Cómo se nombra ───────────────────────────────────────────────────────────

/**
 * El N° corto de un permiso: la cola numérica de su código.
 * `19-SEC/REG-PLT-2021-017` → `017` · `10-HUA-PUE/PER-FMP-2026-007` → `007`.
 * Un código sin número al final se devuelve entero (recortado a 18).
 */
export function numeroDePermiso(codigo: string | null | undefined): string | null {
  const c = (codigo ?? "").trim();
  if (!c) return null;
  const cola = /(?:^|[-/\s])(\d{1,6})\s*$/.exec(c)?.[1];
  if (cola) return cola;
  return c.length > 18 ? `${c.slice(0, 17)}…` : c;
}

/** «permiso 017» · «sin permiso». */
export function etiquetaPermiso(codigo: string | null | undefined): string {
  const n = numeroDePermiso(codigo);
  return n ? `permiso ${n}` : "sin permiso";
}

/** «GTF 4 · permiso 017» — así se distinguen los dos talonarios. */
export function etiquetaGuiaConPermiso(gtfNumber: string | null | undefined, permiso: string | null | undefined): string {
  const n = (gtfNumber ?? "").trim() || "—";
  return `GTF ${n} · ${etiquetaPermiso(permiso)}`;
}

/** La identidad del permiso para comparar: el id si lo hay, si no el código escrito. */
function llaveDePermiso(g: { contratoId?: string | null; permiso?: string | null }): string {
  if (g.contratoId) return `id:${g.contratoId}`;
  const p = (g.permiso ?? "").trim().toUpperCase().replace(/\s+/g, "");
  return p ? `cod:${p}` : "∅";
}

/**
 * Los N° de guía (por `claveNumeroGtf`, tramo a tramo) que en esta lista
 * aparecen con DOS O MÁS permisos distintos. La pantalla agrega el permiso al
 * lado del N° sólo en ésos: «GTF 4» basta mientras haya un solo talonario.
 */
export function numerosEnVariosPermisos(
  guias: readonly { gtfNumber?: string | null; contratoId?: string | null; permiso?: string | null }[],
): Set<string> {
  const permisos = new Map<string, Set<string>>();
  for (const g of guias) {
    const n = claveDeNumero(g.gtfNumber);
    if (!n) continue;
    const s = permisos.get(n) ?? new Set<string>();
    s.add(llaveDePermiso(g));
    permisos.set(n, s);
  }
  return new Set([...permisos].filter(([, s]) => s.size > 1).map(([n]) => n));
}

/** La clave con la que se compara un N° de guía (tramo a tramo, o el texto sin bordes). */
export function claveDeNumero(gtfNumber: string | null | undefined): string | null {
  const t = (gtfNumber ?? "").trim();
  if (!t) return null;
  return claveNumeroGtf(t) ?? t.toUpperCase();
}

// ── El permiso del libro ─────────────────────────────────────────────────────

/** El permiso del libro (el del chip, ADR-431): su id y su código escrito. */
export interface PermisoDelLibro {
  id: string;
  codigo?: string | null;
}

/** ¿Esta guía o troza es del permiso del libro? Por id; sin id, por el código escrito. */
function esDelPermiso(x: { contratoId?: string | null; permiso?: string | null }, delLibro: PermisoDelLibro): boolean {
  if (x.contratoId) return x.contratoId === delLibro.id;
  return !!x.permiso && !!delLibro.codigo && llaveDePermiso({ permiso: x.permiso }) === llaveDePermiso({ permiso: delLibro.codigo });
}

/**
 * La ÚNICA de la lista que es del permiso del libro, y el resto. Si ninguna
 * o más de una lo son, `suya` es `null`: entonces no hay preferencia que valga.
 */
export function separarPorPermisoDelLibro<T extends { contratoId?: string | null; permiso?: string | null }>(
  lista: readonly T[],
  delLibro: PermisoDelLibro | null,
): { suya: T | null; resto: T[] } {
  if (!delLibro) return { suya: null, resto: [...lista] };
  const suyas = lista.filter((x) => esDelPermiso(x, delLibro));
  if (suyas.length !== 1) return { suya: null, resto: [...lista] };
  return { suya: suyas[0]!, resto: lista.filter((x) => x !== suyas[0]) };
}

// ── Un código en varias trozas (el escáner) ─────────────────────────────────

/** «el permiso 020» · «los permisos 020 y 031» — los permisos de una lista, sin repetir. */
function nombrarPermisos(lista: readonly { permiso?: string | null }[]): string {
  const nombres = [...new Set(lista.map((x) => etiquetaPermiso(x.permiso)))];
  if (nombres.length === 1) return nombres[0] === "sin permiso" ? "la guía sin permiso" : `el ${nombres[0]}`;
  const numeros = nombres.map((n) => n.replace(/^permiso /, ""));
  return `los permisos ${numeros.slice(0, -1).join(", ")} y ${numeros[numeros.length - 1]}`;
}

export interface EleccionDeTroza<T> {
  /** La que se toma sola: la ÚNICA del permiso del libro con «Solo este permiso». */
  tomar: T | null;
  /** Lo que se dice al tomarla («la del permiso 017, el del libro…»). */
  nota: string | null;
  /** Para elegir a mano, con la del libro primero si la hay. */
  candidatas: T[];
  /** El id de la del permiso del libro, para marcarla. */
  delLibroId: string | null;
  mensaje: string;
}

/**
 * El escáner leyó un código que está en VARIAS trozas (ADR-504: troza =
 * código + permiso; el 12 del permiso 017 y el 12 del 020 son dos). Nunca
 * se toma «la primera»:
 *  · Con «Solo este permiso» y UNA sola de ese permiso → se toma ésa y se dice.
 *  · Con permiso en el chip (sin «solo este») → se pregunta, la del libro primero.
 *  · Sin permiso en el libro → se pregunta, cada una con su permiso.
 */
export function elegirTrozaPorPermiso<T extends { id: string; contratoId?: string | null; permiso?: string | null }>(
  codigo: string,
  trozas: readonly T[],
  libro: { activo: PermisoDelLibro | null; soloEste: boolean },
): EleccionDeTroza<T> {
  const permisos = new Set(trozas.map((t) => llaveDePermiso(t)));
  const variosPermisos = permisos.size > 1;
  const { suya, resto } = variosPermisos ? separarPorPermisoDelLibro(trozas, libro.activo) : { suya: null, resto: [...trozas] };
  const cod = codigo ? `El código ${codigo}` : "Esa etiqueta";
  if (suya && libro.soloEste) {
    return {
      tomar: suya,
      nota: `la del ${etiquetaPermiso(suya.permiso ?? libro.activo?.codigo)}, el del libro (hay ${resto.length === 1 ? "otra" : "otras"} en ${nombrarPermisos(resto)})`,
      candidatas: [suya, ...resto],
      delLibroId: suya.id,
      mensaje: "",
    };
  }
  if (!variosPermisos) {
    return { tomar: null, nota: null, candidatas: [...trozas], delLibroId: null, mensaje: `${cod} está en ${trozas.length} trozas: elige cuál.` };
  }
  return {
    tomar: null,
    nota: null,
    candidatas: suya ? [suya, ...resto] : resto,
    delLibroId: suya?.id ?? null,
    mensaje: `${cod} está en ${permisos.size} permisos: elige cuál${suya ? " (el del libro va primero)" : ""}.`,
  };
}

// ── Avisos del importador, en corto ─────────────────────────────────────────

/** Un aviso de identidad (ADR-504) leído en una línea; el texto entero va al ⓘ. */
export interface AvisoDeIdentidad {
  tipo: "identicas" | "guia-ambigua" | "guia-sin-permiso" | "codigo-ocupado" | "codigo-varias" | "codigo-sin-permiso";
  corto: string;
}

/**
 * Reconoce los avisos que escriben `identidad-guia.ts`, el import del libro y
 * el alta de trozas, y los dice en una línea que se entiende de un vistazo:
 *
 *   «Filas 12 y 13 idénticas (troza 4).»          → «Filas 12 y 13 idénticas: entraron las dos»
 *   «La guía N° 4 está en 2 permisos (…)»        → «GTF 4 ambigua: elige el permiso del archivo»
 *   «Ya hay una guía N° 4 sin permiso …»         → «La GTF 4 sin permiso puede ser ésta: revísala»
 *   «Ese código de planta ya está usado …: 12 …» → «Código 12 ya existe en el libro (GTF 4) …»
 *
 * `null` = no es un aviso de identidad: se muestra tal cual.
 */
export function leerAvisoDeIdentidad(mensaje: string | null | undefined): AvisoDeIdentidad | null {
  const m = (mensaje ?? "").trim();
  if (!m) return null;

  const identicas = /Filas ([\d, y]+) idénticas(?: \(troza ([^)]+)\))?/i.exec(m);
  if (identicas) {
    const filas = identicas[1]!.trim();
    const cuantas = filas.split(/,| y /).filter((s) => s.trim()).length;
    const entraron = cuantas === 2 ? "entraron las dos" : `entraron las ${cuantas}`;
    return { tipo: "identicas", corto: `Filas ${filas} idénticas${identicas[2] ? ` (troza ${identicas[2]})` : ""}: ${entraron}` };
  }

  const ambigua = /guía N° ?(\S+) está en (\d+) permisos/i.exec(m);
  if (ambigua) return { tipo: "guia-ambigua", corto: `GTF ${ambigua[1]} ambigua: elige el permiso del archivo` };

  const sinPermiso = /Ya hay una guía N° ?(\S+) sin permiso/i.exec(m);
  if (sinPermiso) return { tipo: "guia-sin-permiso", corto: `La GTF ${sinPermiso[1]} sin permiso puede ser ésta: revísala y ponle el permiso` };

  const ocupado = /código de planta ya está usado en el libro: ([^\s(;]+)(?: \(GTF ([^,)]+))?/i.exec(m);
  if (ocupado) {
    const guia = ocupado[2] ? ` (GTF ${ocupado[2].trim()})` : "";
    return { tipo: "codigo-ocupado", corto: `Código ${ocupado[1]} ya existe en el libro${guia}: si es de otro permiso, entra al terminar ADR-504` };
  }

  const varias = /código (\S+) está en (\d+) trozas/i.exec(m) ?? /(?:^|\s)(?:el |los )?códigos? (\S+?),? (?:está|están) en más de una troza/i.exec(m);
  if (varias) return { tipo: "codigo-varias", corto: `Código ${varias[1]} está en ${varias[2] && /^\d+$/.test(varias[2]) ? varias[2] : "varias"} trozas: elígela a mano` };

  const conSinPermiso = /La troza (\S+) ya está en el libro (sin permiso|con un permiso)/i.exec(m);
  if (conSinPermiso) {
    return {
      tipo: "codigo-sin-permiso",
      corto: `Código ${conSinPermiso[1]} ya está en el libro ${conSinPermiso[2]}: ponle el permiso a la guía y vuelve a subir`,
    };
  }
  return null;
}
