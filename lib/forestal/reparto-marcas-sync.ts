/**
 * Las casillas «Distribuido», el nombre del bloque «Sin marcar», la firma del
 * Anexo 04 y los códigos 1-01… del reparto de rolliza, guardados por NEGOCIO
 * en el servidor (Brandon, 2026-10-19: «marco en la oficina y en el monte veo
 * lo mismo»). Antes vivían sólo en el navegador.
 *
 * Puro: lo usan la ruta (`/api/admin/forestal/reparto-marcas`) y el cliente
 * (`reparto-sync-cliente.ts`) con las MISMAS reglas de mezcla.
 *
 * · **Marcas por fila con fecha.** Cada casilla es `{ on, at }`; desmarcar
 *   deja `on: false` con su fecha (no se borra), así una hoja vieja de otro
 *   dispositivo no resucita lo desmarcado. Gana la fecha mayor POR FILA: dos
 *   dispositivos que tildan filas distintas a la vez no se pisan.
 * · **Nombre y firma**: lo mismo, un solo valor con fecha.
 * · **Códigos**: `fusionarRegistros` (el servidor manda; un código no se repite).
 */

import { fusionarRegistros, normalizarRegistro, REGISTRO_VACIO, type RegistroCodigos } from "./reparto-codigos";
import { MAX_NOMBRE_SIN_MARCAR } from "./reparto-por-distribuir";

export interface MarcaFila {
  on: boolean;
  /** Milisegundos (Date.now()) de cuando se tildó o destildó. */
  at: number;
}
export interface NombreConFecha {
  valor: string;
  at: number;
}
export interface FirmaConFecha {
  nombre: string;
  cargo: string;
  at: number;
}

export interface EstadoReparto {
  v: 1;
  /** Sube en cada escritura: el cliente descarta una respuesta más vieja que la que ya tiene. */
  rev: number;
  marcas: Record<string, MarcaFila>;
  nombreSinMarcar: NombreConFecha | null;
  firma: FirmaConFecha | null;
  codigos: RegistroCodigos;
}

/** Lo que un dispositivo manda (o tiene por mandar). */
export interface CambioReparto {
  marcas?: Record<string, MarcaFila>;
  nombreSinMarcar?: NombreConFecha;
  firma?: FirmaConFecha;
  codigos?: RegistroCodigos;
}

export const LIMITES_REPARTO = {
  /** Filas con casilla guardadas (las destildadas más viejas se podan primero). */
  marcas: 5000,
  marcasPorCambio: 2000,
  lineasCodigos: 5000,
  clave: 300,
  firma: 120,
  /** Tope del JSON guardado y del cuerpo del PUT. */
  bytes: 600_000,
} as const;

export const ESTADO_VACIO: EstadoReparto = Object.freeze({
  v: 1,
  rev: 0,
  marcas: {},
  nombreSinMarcar: null,
  firma: null,
  codigos: REGISTRO_VACIO,
}) as EstadoReparto;

const esFecha = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0;

/**
 * Junta marcas fila por fila: gana la fecha mayor; empate = se queda la de
 * `base`. `ahora` recorta fechas del futuro (un celular con la hora corrida
 * no puede trabar una fila para siempre). Sin nada nuevo devuelve `base`.
 */
export function fusionarMarcas(
  base: Record<string, MarcaFila>,
  entrantes: Record<string, MarcaFila> | null | undefined,
  ahora = Number.POSITIVE_INFINITY,
): Record<string, MarcaFila> {
  if (!entrantes) return base;
  let out: Record<string, MarcaFila> | null = null;
  for (const [clave, m] of Object.entries(entrantes)) {
    if (!m || typeof m.on !== "boolean" || !esFecha(m.at)) continue;
    const at = Math.min(m.at, ahora);
    const ya = (out ?? base)[clave];
    if (ya && ya.at >= at) continue;
    if (ya && ya.on === m.on && ya.at === at) continue;
    (out ??= { ...base })[clave] = { on: m.on, at };
  }
  return out ?? base;
}

/** Si pasa del tope, se van primero las destildadas más viejas y después las más viejas. */
function podarMarcas(marcas: Record<string, MarcaFila>, max: number): Record<string, MarcaFila> {
  const filas = Object.entries(marcas);
  if (filas.length <= max) return marcas;
  filas.sort((a, b) => Number(a[1].on) - Number(b[1].on) || a[1].at - b[1].at);
  return Object.fromEntries(filas.slice(filas.length - max));
}

const masNuevo = <T extends { at: number }>(ya: T | null, nuevo: T | undefined, ahora: number): T | null => {
  if (!nuevo || !esFecha(nuevo.at)) return ya;
  const at = Math.min(nuevo.at, ahora);
  return ya && ya.at >= at ? ya : { ...nuevo, at };
};

/**
 * Aplica un cambio sobre lo guardado (la regla del servidor y de la vista
 * previa del cliente). Sin nada nuevo devuelve `actual` (`===`); con algo
 * nuevo, `rev` sube uno.
 */
export function fusionarEstado(actual: EstadoReparto | null, cambio: CambioReparto, ahora: number): EstadoReparto {
  const base = actual ?? ESTADO_VACIO;
  const marcas = fusionarMarcas(base.marcas, cambio.marcas, ahora);
  const nombre = masNuevo(base.nombreSinMarcar, cambio.nombreSinMarcar, ahora);
  const firma = masNuevo(base.firma, cambio.firma, ahora);
  const codigos = fusionarRegistros(base.codigos, cambio.codigos ? normalizarRegistro(cambio.codigos) : null);
  if (actual && marcas === base.marcas && nombre === base.nombreSinMarcar && firma === base.firma && codigos === base.codigos) {
    return actual;
  }
  return {
    v: 1,
    rev: base.rev + 1,
    marcas: podarMarcas(marcas, LIMITES_REPARTO.marcas),
    nombreSinMarcar: nombre ? { valor: nombre.valor.slice(0, MAX_NOMBRE_SIN_MARCAR), at: nombre.at } : null,
    firma: firma
      ? { nombre: firma.nombre.slice(0, LIMITES_REPARTO.firma), cargo: firma.cargo.slice(0, LIMITES_REPARTO.firma), at: firma.at }
      : null,
    codigos,
  };
}

/** Lo guardado, limpio; `null` si no hay nada (nunca se guardó). */
export function normalizarEstado(crudo: unknown): EstadoReparto | null {
  if (!crudo || typeof crudo !== "object") return null;
  const o = crudo as Record<string, unknown>;
  const marcas: Record<string, MarcaFila> = {};
  for (const [k, m] of Object.entries((o.marcas as Record<string, unknown>) ?? {})) {
    const x = m as Partial<MarcaFila> | null;
    if (k && k.length <= LIMITES_REPARTO.clave && x && typeof x.on === "boolean" && esFecha(x.at)) marcas[k] = { on: x.on, at: x.at };
  }
  const n = o.nombreSinMarcar as Partial<NombreConFecha> | null | undefined;
  const f = o.firma as Partial<FirmaConFecha> | null | undefined;
  return {
    v: 1,
    rev: esFecha(o.rev) ? Math.trunc(o.rev) : 0,
    marcas,
    nombreSinMarcar: n && typeof n.valor === "string" && esFecha(n.at) ? { valor: n.valor, at: n.at } : null,
    firma:
      f && typeof f.nombre === "string" && typeof f.cargo === "string" && esFecha(f.at)
        ? { nombre: f.nombre, cargo: f.cargo, at: f.at }
        : null,
    codigos: normalizarRegistro(o.codigos),
  };
}

/** Las filas tildadas. */
export const marcadasDe = (e: EstadoReparto): Set<string> =>
  new Set(Object.entries(e.marcas).filter(([, m]) => m.on).map(([k]) => k));

export const cambioVacio = (c: CambioReparto): boolean =>
  !c.nombreSinMarcar && !c.firma && !c.codigos && Object.keys(c.marcas ?? {}).length === 0;

/** Junta dos cambios pendientes (`nuevo` es el último que hizo esta persona). */
export function juntarCambios(previo: CambioReparto, nuevo: CambioReparto): CambioReparto {
  const marcas = { ...(previo.marcas ?? {}), ...(nuevo.marcas ?? {}) };
  const out: CambioReparto = {};
  if (Object.keys(marcas).length > 0) out.marcas = marcas;
  const nombre = nuevo.nombreSinMarcar ?? previo.nombreSinMarcar;
  if (nombre) out.nombreSinMarcar = nombre;
  const firma = nuevo.firma ?? previo.firma;
  if (firma) out.firma = firma;
  const codigos = nuevo.codigos && previo.codigos ? fusionarRegistros(nuevo.codigos, previo.codigos) : (nuevo.codigos ?? previo.codigos);
  if (codigos) out.codigos = codigos;
  return out;
}

/**
 * Lo que queda por mandar después de que `enviado` llegó: sale lo que no
 * cambió mientras viajaba (misma fecha, mismo objeto de códigos).
 */
export function quitarEnviado(pendiente: CambioReparto, enviado: CambioReparto): CambioReparto {
  const out: CambioReparto = {};
  const marcas: Record<string, MarcaFila> = {};
  for (const [k, m] of Object.entries(pendiente.marcas ?? {})) {
    const e = enviado.marcas?.[k];
    if (!e || e.at !== m.at || e.on !== m.on) marcas[k] = m;
  }
  if (Object.keys(marcas).length > 0) out.marcas = marcas;
  if (pendiente.nombreSinMarcar && pendiente.nombreSinMarcar.at !== enviado.nombreSinMarcar?.at) out.nombreSinMarcar = pendiente.nombreSinMarcar;
  if (pendiente.firma && pendiente.firma.at !== enviado.firma?.at) out.firma = pendiente.firma;
  if (pendiente.codigos && pendiente.codigos !== enviado.codigos) out.codigos = pendiente.codigos;
  return out;
}

/**
 * Lo que este navegador tenía ANTES de que existiera el guardado en el
 * servidor, como un cambio: se sube UNA vez, cuando el servidor todavía no
 * tiene nada del negocio (no se pierde lo que se marcó hoy).
 */
export function cambioDesdeLocal(
  local: { marcas: readonly string[]; nombre: string | null; firma: { nombre: string; cargo: string } | null; codigos: RegistroCodigos },
  ahora: number,
): CambioReparto {
  const out: CambioReparto = {};
  if (local.marcas.length > 0) out.marcas = Object.fromEntries(local.marcas.map((k) => [k, { on: true, at: ahora }]));
  if (local.nombre) out.nombreSinMarcar = { valor: local.nombre, at: ahora };
  if (local.firma && (local.firma.nombre || local.firma.cargo)) out.firma = { ...local.firma, at: ahora };
  if (Object.keys(local.codigos.lineas).length > 0 || Object.keys(local.codigos.bloques).length > 0) out.codigos = local.codigos;
  return out;
}
