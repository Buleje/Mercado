/**
 * cubicacion-por-ficha — «cuánto salió de cada comunidad / de cada comprador».
 * PURO: agrupa cubicaciones GUARDADAS por la CCNN de origen o por el comprador
 * de su ficha y suma lo que se congeló al guardar (`totales`, `valor`); no
 * recubica. El m³ sale del PT total ÷ 424 (`m3DesdePt`), no de sumar m³.
 *
 * Agrupa por el id de la ficha del Directorio si lo hay y, si no, por el
 * nombre normalizado («Comunidad Nativa San Luis» = «COMUNIDAD NATIVA SAN LUIS»).
 * Una cubicación con sólo el nombre se suma a la del mismo nombre que sí
 * trae id: es la misma comunidad escrita sin elegirla de la lista.
 */
import { m3DesdePt } from "./cubicacion";
import type { CubicacionRegistro } from "./cubicacion-registro";

export type PorFicha = "comunidad" | "comprador";

export const CLAVE_SIN_DATO = "sin";

export interface FilaPorFicha {
  clave: string;
  etiqueta: string;
  /** La fila de las cubicaciones sin ese dato (las viejas). */
  sin: boolean;
  cubicaciones: number;
  piezas: number;
  pieTablar: number;
  m3: number;
  valor: number;
}

/** Sin mayúsculas, tildes ni espacios de más. */
export const normalizarNombreFicha = (v: string): string =>
  v.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

const datoDe = (c: CubicacionRegistro, por: PorFicha): { id: string; nombre: string } =>
  por === "comunidad"
    ? { id: c.ficha?.comunidadParteId?.trim() ?? "", nombre: c.ficha?.comunidad?.trim() ?? "" }
    : { id: c.ficha?.clienteParteId?.trim() ?? "", nombre: c.cliente?.trim() ?? "" };

/** La clave y el rótulo de cada cubicación de la lista (por id de cubicación). */
export function clasificar(lista: readonly CubicacionRegistro[], por: PorFicha): Map<string, { clave: string; etiqueta: string }> {
  const datos = lista.map((c) => ({ c, ...datoDe(c, por) }));
  const idDeNombre = new Map<string, string>();
  for (const d of datos) {
    const k = normalizarNombreFicha(d.nombre);
    if (d.id && k && !idDeNombre.has(k)) idDeNombre.set(k, d.id);
  }
  const rotulo = new Map<string, string>();
  const rotuloMixto = new Set<string>();
  const res = new Map<string, { clave: string; etiqueta: string }>();
  for (const d of datos) {
    const k = normalizarNombreFicha(d.nombre);
    const idFinal = d.id || (k ? idDeNombre.get(k) : undefined);
    const clave = idFinal ? `id:${idFinal}` : k ? `n:${k}` : CLAVE_SIN_DATO;
    /* El rótulo: el primer nombre bien escrito (ni todo mayúsculas ni todo minúsculas); si no hay, el primero. */
    const mixto = d.nombre !== d.nombre.toUpperCase() && d.nombre !== d.nombre.toLowerCase();
    if (d.nombre && (!rotulo.has(clave) || (mixto && !rotuloMixto.has(clave)))) rotulo.set(clave, d.nombre);
    if (mixto) rotuloMixto.add(clave);
    res.set(d.c.id, { clave, etiqueta: "" });
  }
  for (const [id, v] of res) {
    res.set(id, { clave: v.clave, etiqueta: v.clave === CLAVE_SIN_DATO ? "" : rotulo.get(v.clave) ?? "Sin nombre" });
  }
  return res;
}

/** Una fila por comunidad/comprador, de más a menos PT; «sin dato» al final. */
export function agruparPorFicha(lista: readonly CubicacionRegistro[], por: PorFicha): FilaPorFicha[] {
  const claves = clasificar(lista, por);
  const filas = new Map<string, FilaPorFicha>();
  for (const c of lista) {
    const k = claves.get(c.id);
    if (!k) continue;
    const sin = k.clave === CLAVE_SIN_DATO;
    const f = filas.get(k.clave) ?? {
      clave: k.clave,
      etiqueta: sin ? (por === "comunidad" ? "Sin comunidad" : "Sin comprador") : k.etiqueta,
      sin,
      cubicaciones: 0,
      piezas: 0,
      pieTablar: 0,
      m3: 0,
      valor: 0,
    };
    f.cubicaciones += 1;
    f.piezas += c.totales.piezas;
    f.pieTablar += c.totales.pieTablar;
    f.valor += c.valor;
    filas.set(k.clave, f);
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return [...filas.values()]
    .map((f) => ({ ...f, pieTablar: r2(f.pieTablar), valor: r2(f.valor), m3: m3DesdePt(r2(f.pieTablar)) }))
    .sort((a, b) => Number(a.sin) - Number(b.sin) || b.pieTablar - a.pieTablar || a.etiqueta.localeCompare(b.etiqueta, "es"));
}

/** Las cubicaciones de la lista que pertenecen a esa fila. */
export function deLaFila(lista: readonly CubicacionRegistro[], por: PorFicha, clave: string): CubicacionRegistro[] {
  const claves = clasificar(lista, por);
  return lista.filter((c) => claves.get(c.id)?.clave === clave);
}

/** Suma de TODAS las filas (la de abajo de la tabla). */
export function totalDeFilas(filas: readonly FilaPorFicha[]): Omit<FilaPorFicha, "clave" | "etiqueta" | "sin"> {
  const pieTablar = Math.round(filas.reduce((a, f) => a + f.pieTablar, 0) * 100) / 100;
  return {
    cubicaciones: filas.reduce((a, f) => a + f.cubicaciones, 0),
    piezas: filas.reduce((a, f) => a + f.piezas, 0),
    pieTablar,
    m3: m3DesdePt(pieTablar),
    valor: Math.round(filas.reduce((a, f) => a + f.valor, 0) * 100) / 100,
  };
}
