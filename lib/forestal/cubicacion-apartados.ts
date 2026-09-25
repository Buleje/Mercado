/**
 * cubicacion-apartados — separar el lote EN CURSO del cubicador en bloques
 * ("apartados") con su propio total (piezas · pie tablar · m³ · especie).
 *
 * Función EXTRA sobre la cubicación normal: la asignación pieza→apartado vive
 * AFUERA de `PiezaCubicada` a propósito. Es una anotación de sesión (qué se
 * separó y en qué bloque), no un dato de la pieza — así no toca ninguno de
 * los consumidores del lote (resumen, Excel/PDF, Anexo 04, Libro CTP,
 * cubicaciones guardadas) y la cubicación continua sigue exactamente igual.
 */
import type { PiezaCubicada } from "./cubicacion";
import { m3DesdePt } from "./cubicacion";

/** pieza.id → número de apartado (1-indexado). */
export type ApartadosAsignados = Record<string, number>;

/** número de apartado → nombre puesto a mano ("Camión A", "Cliente López"). */
export type NombresApartado = Record<number, string>;

export interface TotalPiezas {
  filas: number;
  piezas: number;
  pieTablar: number;
  m3: number;
  especies: string[];
  /** Ids de las piezas que entraron en la cuenta — para "usar estas filas"
   *  (marcar para imprimir, dictar en voz) sin recalcular nada aparte. */
  ids: string[];
}

export interface ApartadoResumen extends TotalPiezas {
  numero: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Totaliza cualquier lista de filas — el mismo cálculo que un apartado
 *  cerrado, pero también sirve para previsualizar el bloque TODAVÍA sin
 *  cerrar (lo pendiente, o lo marcado) antes de tocar "Cerrar apartado". */
export function totalizarFilas(filas: PiezaCubicada[]): TotalPiezas {
  const especies: string[] = [];
  for (const f of filas) {
    const e = f.especie?.trim() || "Sin especie";
    if (!especies.includes(e)) especies.push(e);
  }
  const pieTablar = r2(filas.reduce((a, f) => a + f.pieTablar, 0));
  return {
    filas: filas.length,
    piezas: filas.reduce((a, f) => a + (f.cantidad > 0 ? f.cantidad : 1), 0),
    pieTablar,
    // El m³ del bloque sale del pie tablar (÷ 424), igual que el total de la
    // tabla: sumar los m³ ya redondeados de cada fila movía el número unas
    // milésimas y los dos totales de la misma pantalla no coincidían.
    m3: m3DesdePt(pieTablar),
    especies,
    ids: filas.map((f) => f.id),
  };
}

/** Siguiente número libre: 1 si todavía no hay ningún apartado cerrado. */
export const siguienteApartado = (asignados: ApartadosAsignados): number => {
  const nums = Object.values(asignados);
  return nums.length ? Math.max(...nums) + 1 : 1;
};

/** Filas que todavía no entraron a ningún apartado. */
export const filasPendientes = (rows: PiezaCubicada[], asignados: ApartadosAsignados): PiezaCubicada[] =>
  rows.filter((r) => asignados[r.id] == null);

export const asignarApartado = (asignados: ApartadosAsignados, ids: string[], numero: number): ApartadosAsignados => {
  if (ids.length === 0) return asignados;
  const next = { ...asignados };
  for (const id of ids) next[id] = numero;
  return next;
};

/** Deshace un apartado entero: sus filas vuelven a quedar pendientes. */
export const disolverApartado = (asignados: ApartadosAsignados, numero: number): ApartadosAsignados => {
  const next: ApartadosAsignados = {};
  for (const [id, n] of Object.entries(asignados)) if (n !== numero) next[id] = n;
  return next;
};

/** Quita la asignación de varios ids a la vez (los deja pendientes de nuevo). */
export const quitarAsignaciones = (asignados: ApartadosAsignados, ids: string[]): ApartadosAsignados => {
  if (ids.length === 0) return asignados;
  const next = { ...asignados };
  let cambio = false;
  for (const id of ids) {
    if (id in next) { delete next[id]; cambio = true; }
  }
  return cambio ? next : asignados;
};

/** Nombre a mano de un apartado, ya recortado — "" si no tiene. */
export const nombreDeApartado = (numero: number, nombres: NombresApartado): string => (nombres[numero] ?? "").trim();

/**
 * Etiqueta a mostrar: "Apartado N" solo, o "Apartado N · nombre" si le
 * pusieron uno. SINGLE SOURCE — la usan la columna de la tabla, el panel, el
 * Excel y el PDF; nadie arma este texto por su cuenta (mismo criterio que
 * `tipoDePieza` con el tipo comercial).
 */
export const etiquetaApartado = (numero: number, nombres: NombresApartado): string => {
  const nombre = nombreDeApartado(numero, nombres);
  return nombre ? `Apartado ${numero} · ${nombre}` : `Apartado ${numero}`;
};

/** Pone (o borra, con cadena vacía/sólo espacios) el nombre de un apartado. */
export const renombrarApartado = (nombres: NombresApartado, numero: number, nombre: string): NombresApartado => {
  if (!nombre.trim()) {
    if (!(numero in nombres)) return nombres;
    const next = { ...nombres };
    delete next[numero];
    return next;
  }
  if (nombres[numero] === nombre) return nombres;
  return { ...nombres, [numero]: nombre };
};

/**
 * Poda nombres de apartados que ya no tienen NINGUNA fila asignada — los
 * números no se reciclan (`siguienteApartado` siempre sigue del más alto),
 * pero un lote NUEVO vuelve a arrancar en 1: sin esto, el nombre viejo de
 * "Apartado 1" de un lote anterior se le pegaría al primer apartado del
 * lote siguiente. Misma firma "devuelve la MISMA referencia si no hay nada
 * que podar" que `podarAsignados`.
 */
export const podarNombres = (nombres: NombresApartado, asignados: ApartadosAsignados): NombresApartado => {
  const vivos = new Set(Object.values(asignados));
  const next: NombresApartado = {};
  let cambio = false;
  for (const [numStr, nombre] of Object.entries(nombres)) {
    const num = Number(numStr);
    if (vivos.has(num)) next[num] = nombre; else cambio = true;
  }
  return cambio ? next : nombres;
};

/**
 * Filtra asignaciones a ids que siguen existiendo en el lote — evita
 * fantasmas cuando se borra una fila, se vacía el lote o se carga otro.
 * Devuelve la MISMA referencia si no había nada que podar (evita loops de
 * efecto cuando se usa como `setState(prev => podarAsignados(prev, rows))`).
 */
export const podarAsignados = (asignados: ApartadosAsignados, rows: PiezaCubicada[]): ApartadosAsignados => {
  const vivos = new Set(rows.map((r) => r.id));
  const next: ApartadosAsignados = {};
  let cambio = false;
  for (const [id, n] of Object.entries(asignados)) {
    if (vivos.has(id)) next[id] = n;
    else cambio = true;
  }
  return cambio ? next : asignados;
};

/** Un apartado por fila de la tabla: número, totales y especie(s) que trae. */
export function resumenApartados(rows: PiezaCubicada[], asignados: ApartadosAsignados): ApartadoResumen[] {
  const porNumero = new Map<number, PiezaCubicada[]>();
  for (const r of rows) {
    const n = asignados[r.id];
    if (n == null) continue;
    const arr = porNumero.get(n);
    if (arr) arr.push(r); else porNumero.set(n, [r]);
  }
  return [...porNumero.entries()]
    .sort(([a], [b]) => a - b)
    .map(([numero, filas]) => ({ numero, ...totalizarFilas(filas) }));
}
