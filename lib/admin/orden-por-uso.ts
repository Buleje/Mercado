/**
 * «Menú en tu orden» (Brandon 19-10): cada persona ve primero las pestañas que
 * más abre; las que no abrió en 30 días van directo al «Más».
 *
 * El contador es `{ "tab:vista": { n, ultima } }` por persona, más una entrada
 * `#desde` con el día en que empezó a contar: sin 7 días de datos el orden es
 * el de siempre (una semana de uso dice algo; una tarde, no). Funciones puras:
 * guardar y leer lo hace `hooks/use-uso-de-pestanas.ts`.
 */

export interface UsoDeVista {
  /** Veces que la abriste. */
  n: number;
  /** Última vez (ms). */
  ultima: number;
}
export type ContadorDeUso = Record<string, UsoDeVista>;

/** Entrada especial: `ultima` = cuándo empezó a contar. */
export const CLAVE_DESDE = "#desde";
export const DIAS_RECIENTES = 30;
export const DIAS_MINIMOS = 7;
/** Cuántas vistas se recuerdan por persona (las más viejas salen). */
export const TOPE_USO = 120;
const DIA_MS = 86_400_000;

function podar(c: ContadorDeUso, tope = TOPE_USO): ContadorDeUso {
  const vistas = Object.entries(c).filter(([k]) => k !== CLAVE_DESDE);
  if (vistas.length < tope) return c;
  const quedan = vistas.sort((a, b) => b[1].ultima - a[1].ultima).slice(0, tope - 1);
  const out: ContadorDeUso = Object.fromEntries(quedan);
  if (c[CLAVE_DESDE]) out[CLAVE_DESDE] = c[CLAVE_DESDE];
  return out;
}

/** Suma una apertura de `clave` («tab:vista»). Empieza a contar los días la primera vez. */
export function sumarUso(c: ContadorDeUso, clave: string, ahora: number): ContadorDeUso {
  const previo = c[clave];
  const nuevo: ContadorDeUso = { ...c, [clave]: { n: (previo?.n ?? 0) + 1, ultima: ahora } };
  if (!nuevo[CLAVE_DESDE]) nuevo[CLAVE_DESDE] = { n: 0, ultima: ahora };
  return podar(nuevo);
}

/** Junta el de esta computadora con el del servidor: la mayor cuenta, la fecha más nueva y el inicio más viejo. */
export function unirContadores(a: ContadorDeUso, b: ContadorDeUso): ContadorDeUso {
  const out: ContadorDeUso = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const previo = out[k];
    if (!previo) out[k] = v;
    else if (k === CLAVE_DESDE) out[k] = { n: 0, ultima: Math.min(previo.ultima, v.ultima) };
    else out[k] = { n: Math.max(previo.n, v.n), ultima: Math.max(previo.ultima, v.ultima) };
  }
  return podar(out);
}

/** Para el servidor (que guarda listas): `[{ k, n, u }]`. */
export function contadorALista(c: ContadorDeUso): { k: string; n: number; u: number }[] {
  return Object.entries(c).map(([k, v]) => ({ k, n: v.n, u: v.ultima }));
}

/** De la lista guardada (o JSON roto) al contador; descarta lo que no tiene forma. */
export function listaAContador(lista: unknown): ContadorDeUso {
  if (!Array.isArray(lista)) return {};
  const out: ContadorDeUso = {};
  for (const item of lista) {
    const it = item as { k?: unknown; n?: unknown; u?: unknown } | null;
    if (!it || typeof it.k !== "string" || !it.k || typeof it.n !== "number" || typeof it.u !== "number") continue;
    if (!Number.isFinite(it.n) || !Number.isFinite(it.u) || it.n < 0) continue;
    out[it.k] = { n: Math.floor(it.n), ultima: it.u };
  }
  return out;
}

/** Días desde que empezó a contar (0 sin datos). */
export function diasDeDatos(c: ContadorDeUso | null, ahora: number): number {
  const desde = c?.[CLAVE_DESDE]?.ultima;
  return desde ? Math.max(0, Math.floor((ahora - desde) / DIA_MS)) : 0;
}

export interface OrdenPorUso<T extends string> {
  /** Las que se muestran, de más a menos usada (o el orden de siempre si no aplica). */
  visiblesEnOrden: T[];
  /** Directo al «Más»: no abiertas en 30 días. */
  aMas: T[];
  /** `false` = sin datos suficientes: orden de siempre. */
  aplicado: boolean;
}

/**
 * Ordena las pestañas de una barra (`prefijo` = su `?tab=`) por el uso de
 * esta persona. Empate: el orden de siempre. Sin ninguna usada en 30 días no
 * hay de dónde sacar un orden: queda el de siempre (no se esconde todo).
 * La `activa` nunca va al «Más»: si le tocaba, va última de las visibles.
 */
export function ordenPorUso<T extends string>(
  ids: readonly T[],
  contador: ContadorDeUso | null,
  prefijo: string,
  ahora: number = Date.now(),
  activa: T | null = null,
): OrdenPorUso<T> {
  const deSiempre: OrdenPorUso<T> = { visiblesEnOrden: [...ids], aMas: [], aplicado: false };
  const dias = diasDeDatos(contador, ahora);
  if (!contador || dias < DIAS_MINIMOS) return deSiempre;

  const usadas = ids
    .map((id, i) => ({ id, i, uso: contador[`${prefijo}:${id}`] }))
    .filter((x) => x.uso && ahora - x.uso.ultima <= DIAS_RECIENTES * DIA_MS);
  if (usadas.length === 0) return deSiempre;

  const visiblesEnOrden = usadas.sort((a, b) => b.uso.n - a.uso.n || a.i - b.i).map((x) => x.id);
  /* Sin entrada = no se abrió desde que empezó a contar: es «no abierta en 30 días»
     sólo si ya cuenta hace 30. Antes, queda visible detrás de las usadas (una
     pestaña nueva o que el plan habilitó ayer no se esconde al día 7). */
  if (dias < DIAS_RECIENTES) visiblesEnOrden.push(...ids.filter((id) => !contador[`${prefijo}:${id}`]));
  const aMas = ids.filter((id) => !visiblesEnOrden.includes(id));
  if (activa != null && aMas.includes(activa)) {
    aMas.splice(aMas.indexOf(activa), 1);
    visiblesEnOrden.push(activa);
  }
  return { visiblesEnOrden, aMas, aplicado: true };
}
