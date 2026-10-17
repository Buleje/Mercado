/**
 * trozas-recepcion — las decisiones que se toman con el camión en el patio (ADR-336).
 *
 * ## Qué resuelve
 *
 * Recibir una guía de sesenta trozas es marcar sesenta veces lo mismo: cuáles
 * bajaron, qué día bajaron y con qué número las marca el centro. Hacerlo fila
 * por fila no lo hace nadie —y lo que no se hace en el patio se inventa después
 * en la oficina—, así que las tres operaciones son en LOTE sobre una selección.
 *
 * ## La regla que manda acá
 *
 * El **código de planta es único**: es la marca física que alguien pinta sobre
 * la troza, y dos piezas con el mismo número son dos piezas que el patio no
 * puede distinguir. Este módulo no puede garantizarlo solo (el servidor tiene
 * la última palabra), pero sí evita el 99 % de las colisiones: numera saltando
 * los ocupados y señala los repetidos ANTES de guardar.
 *
 * PURO: sin React, sin fetch, sin Prisma.
 */

import type { TrozaImportada } from "./trozas-import";

/**
 * Lo mínimo que una pieza necesita para pasar por las acciones en lote.
 *
 * Genérico y no atado a `TrozaImportada` porque el mismo trabajo se hace en dos
 * momentos: al cargar la guía (piezas todavía sin id) y al corregir la recepción
 * de un ingreso ya guardado (piezas con id). Duplicar las reglas para cada una
 * es cómo terminan diciendo cosas distintas sobre el mismo hecho.
 */
export interface PiezaRecepcionable {
  codigoPlanta?: string | null;
  /** `YYYY-MM-DD`. */
  fechaRecepcion?: string | null;
  noRecepcionada?: boolean | null;
}

// ── Orden ───────────────────────────────────────────────────────────────────

/** Por qué columna se puede ordenar la lista de trozas. */
export type CampoOrden =
  | "orden"
  | "codificacion"
  | "codigoPlanta"
  | "especieComun"
  | "d1Cm"
  | "d2Cm"
  | "largoM"
  | "volumenM3"
  | "fechaRecepcion"
  | "recepcion";

export type DireccionOrden = "asc" | "desc";

/** El valor por el que se ordena. `null` = el dato falta. */
function valorDe(t: TrozaImportada, campo: CampoOrden): string | number | null {
  switch (campo) {
    case "orden": return t.orden;
    case "codificacion": return (t.codificacion ?? "").trim() || null;
    case "codigoPlanta": return (t.codigoPlanta ?? "").trim() || null;
    case "especieComun": return (t.especieComun ?? "").trim() || null;
    case "fechaRecepcion": return (t.fechaRecepcion ?? "").trim() || null;
    // Las que faltan primero: son las que hay que resolver.
    case "recepcion": return t.noRecepcionada ? 0 : 1;
    case "d1Cm": return t.d1Cm ?? null;
    case "d2Cm": return t.d2Cm ?? null;
    case "largoM": return t.largoM ?? null;
    case "volumenM3": return t.volumenM3 ?? null;
  }
}

/**
 * Ordena SIN mutar. Devuelve una copia: la lista original es el orden del
 * documento (casillero 1 de la lista de trozas) y se tiene que poder volver a
 * él — reordenar la fuente perdería el orden en que la guía las declara.
 *
 * Los códigos se comparan como los lee una persona ("2" antes que "10", no
 * ASCII), y **lo que falta va al final en las DOS direcciones**: un dato vacío
 * no es "el más chico", es el que hay que completar — invertir el orden no
 * debería subir los huecos al tope de la tabla.
 */
export function ordenarTrozas(
  trozas: TrozaImportada[],
  campo: CampoOrden,
  dir: DireccionOrden,
): TrozaImportada[] {
  const signo = dir === "asc" ? 1 : -1;
  const copia = [...trozas];
  copia.sort((a, b) => {
    const x = valorDe(a, campo);
    const y = valorDe(b, campo);
    if (x == null || y == null) {
      // El signo NO se aplica acá: los huecos quedan últimos siempre.
      if (x == null && y == null) return a.orden - b.orden;
      return x == null ? 1 : -1;
    }
    const base =
      typeof x === "number" && typeof y === "number"
        ? x - y
        : String(x).localeCompare(String(y), "es-PE", { numeric: true, sensitivity: "base" });
    // Empate → el orden del documento, para que la lista no baile entre renders.
    return base !== 0 ? base * signo : a.orden - b.orden;
  });
  return copia;
}

// ── Código de planta ────────────────────────────────────────────────────────

/** Un código de planta normalizado, o `null` si está vacío. */
export const normalizarCodigo = (v: string | null | undefined): string | null =>
  (v ?? "").trim() || null;

/**
 * Los códigos que aparecen DOS VECES en esta misma lista.
 *
 * Es el duplicado que el servidor no puede explicar bien: si llegan dos piezas
 * con el mismo número en el mismo POST, el rechazo dice "ya existe" sobre algo
 * que todavía no existe. Mejor marcarlo en la fila, con la pieza delante.
 */
export function codigosRepetidos(trozas: PiezaRecepcionable[]): Set<string> {
  const vistos = new Set<string>();
  const repetidos = new Set<string>();
  for (const t of trozas) {
    const c = normalizarCodigo(t.codigoPlanta);
    if (!c) continue;
    const k = c.toUpperCase();
    if (vistos.has(k)) repetidos.add(k);
    else vistos.add(k);
  }
  return repetidos;
}

/** ¿Esta pieza tiene un código repetido dentro de la lista? */
export const tieneCodigoRepetido = (t: PiezaRecepcionable, repetidos: Set<string>): boolean => {
  const c = normalizarCodigo(t.codigoPlanta);
  return Boolean(c && repetidos.has(c.toUpperCase()));
};

export interface OpcionesNumerar {
  /** Desde qué correlativo arranca (el que devuelve el servidor). */
  desde: number;
  /**
   * Códigos que YA existen en el libro. Se saltean: numerar sobre uno ocupado
   * es exactamente la colisión que se quiere evitar.
   */
  ocupados?: Iterable<string>;
  /** Sólo estas posiciones (la selección). Vacío/ausente = todas las recibidas. */
  seleccion?: Set<number>;
  /** `true` = renumera también las que ya tienen código tipeado a mano. */
  pisarExistentes?: boolean;
}

/**
 * Numera las piezas con el correlativo del centro.
 *
 * Reglas, en orden:
 *  1. Una pieza que **no llegó** no se numera: el código es una marca física y
 *     no se pinta lo que no está.
 *  2. Un código ya tipeado a mano **no se pisa** (salvo que se pida), porque
 *     puede ser el que ya está pintado en la troza.
 *  3. Un correlativo **ocupado se saltea** — tanto por el libro (`ocupados`)
 *     como por lo que se acaba de asignar en esta misma lista.
 */
export function numerarTrozas<T extends PiezaRecepcionable>(
  trozas: T[],
  opts: OpcionesNumerar,
): { trozas: T[]; asignados: number; siguiente: number } {
  const tomados = new Set<string>();
  for (const c of opts.ocupados ?? []) {
    const k = normalizarCodigo(c);
    if (k) tomados.add(k.toUpperCase());
  }
  // Lo ya tipeado en esta lista también ocupa: si la fila 3 dice "3037755", el
  // automático no puede volver a usar ese número en la fila 7.
  for (const t of trozas) {
    const c = normalizarCodigo(t.codigoPlanta);
    if (c) tomados.add(c.toUpperCase());
  }

  let n = Math.max(1, Math.floor(opts.desde) || 1);
  const libre = (): string => {
    while (tomados.has(String(n))) n += 1;
    const codigo = String(n);
    tomados.add(codigo);
    n += 1;
    return codigo;
  };

  let asignados = 0;
  const salida = trozas.map((t, i) => {
    if (opts.seleccion && opts.seleccion.size > 0 && !opts.seleccion.has(i)) return t;
    if (t.noRecepcionada) return t;
    if (normalizarCodigo(t.codigoPlanta) && !opts.pisarExistentes) return t;
    if (opts.pisarExistentes) {
      // Al renumerar, el código viejo deja de estar tomado por esta fila.
      const previo = normalizarCodigo(t.codigoPlanta);
      if (previo) tomados.delete(previo.toUpperCase());
    }
    asignados += 1;
    return { ...t, codigoPlanta: libre() };
  });

  return { trozas: salida, asignados, siguiente: n };
}

// ── Acciones en lote ────────────────────────────────────────────────────────

/** Aplica una función a las posiciones seleccionadas (o a todas si no hay selección). */
function enSeleccion<T>(
  trozas: T[],
  seleccion: Set<number> | undefined,
  fn: (t: T) => T,
): T[] {
  const todas = !seleccion || seleccion.size === 0;
  return trozas.map((t, i) => (todas || seleccion!.has(i) ? fn(t) : t));
}

/**
 * Marca si la pieza llegó o no.
 *
 * Al marcar «no llegó» se le saca la fecha de recepción: una pieza que no bajó
 * del camión no puede tener el día en que bajó. El código de planta SE
 * CONSERVA —puede llegar en el próximo viaje con la misma marca— pero no viaja
 * al servidor mientras esté sin recepcionar.
 */
export function marcarRecepcion<T extends PiezaRecepcionable>(
  trozas: T[],
  seleccion: Set<number> | undefined,
  llego: boolean,
): T[] {
  return enSeleccion(trozas, seleccion, (t) =>
    llego
      ? { ...t, noRecepcionada: false }
      : { ...t, noRecepcionada: true, fechaRecepcion: null },
  );
}

/**
 * Pone la fecha en que bajaron del camión. `null` la borra (vuelve a valer la
 * del ingreso). Las que no llegaron no la reciben: sería declarar que llegó
 * algo que no llegó.
 */
export function fecharRecepcion<T extends PiezaRecepcionable>(
  trozas: T[],
  seleccion: Set<number> | undefined,
  fecha: string | null,
): T[] {
  const limpia = (fecha ?? "").trim() || null;
  return enSeleccion(trozas, seleccion, (t) => (t.noRecepcionada ? t : { ...t, fechaRecepcion: limpia }));
}

/** Borra el código de planta de la selección (para renumerar desde cero). */
export function limpiarCodigos<T extends PiezaRecepcionable>(
  trozas: T[],
  seleccion: Set<number> | undefined,
): T[] {
  return enSeleccion(trozas, seleccion, (t) => ({ ...t, codigoPlanta: null }));
}

// ── Resumen ─────────────────────────────────────────────────────────────────

export interface ResumenRecepcion {
  declaradas: number;
  /** Las que bajaron del camión. */
  recibidas: number;
  faltantes: number;
  m3Declarado: number;
  m3Recibido: number;
  /** Recibidas sin código de planta: no se las va a poder buscar en el patio. */
  sinCodigo: number;
  /** Recibidas sin fecha propia: valen por la fecha del ingreso. */
  sinFecha: number;
  /** Códigos repetidos dentro de la lista. */
  repetidos: string[];
}

const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** El estado de la recepción en números — es lo que tiene que cuadrar con la pila. */
export function resumenRecepcion(trozas: (PiezaRecepcionable & { volumenM3?: number | null })[]): ResumenRecepcion {
  const recibidas = trozas.filter((t) => !t.noRecepcionada);
  return {
    declaradas: trozas.length,
    recibidas: recibidas.length,
    faltantes: trozas.length - recibidas.length,
    m3Declarado: r4(trozas.reduce((a, t) => a + (t.volumenM3 ?? 0), 0)),
    m3Recibido: r4(recibidas.reduce((a, t) => a + (t.volumenM3 ?? 0), 0)),
    sinCodigo: recibidas.filter((t) => !normalizarCodigo(t.codigoPlanta)).length,
    sinFecha: recibidas.filter((t) => !(t.fechaRecepcion ?? "").trim()).length,
    repetidos: [...codigosRepetidos(trozas)],
  };
}
