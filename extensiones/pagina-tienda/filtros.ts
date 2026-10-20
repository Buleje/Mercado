/**
 * Los filtros del catálogo de la tienda de cada negocio (ADR-511): qué se pide
 * en la URL, cómo se lee y cómo se aplica. Nació de `pagina-musa/filtros.ts`
 * sin lo de Musa (necesidades, orden por códigos MU/KT, categorías fijas): las
 * categorías son las del negocio y el orden «Destacados» es el suyo.
 *
 * La URL: `q` (texto), `categoria` (la CLAVE de una del negocio, «pollo-brasa»;
 * también se acepta su nombre), `oferta=1`, `orden` (destacados · precio-asc ·
 * precio-desc · descuento · nuevos), `marca`, `disponibles=1`. Cada parámetro
 * pasa su `safeParse`: el que no vale vuelve a su defecto sin tocar a los demás.
 *
 * Sin React ni servidor: lo usan el catálogo (al leer la URL), el navegador (al
 * filtrar sin recargar) y `__tests__/tienda-filtros.test.ts`.
 */
import { z } from "zod";
import type { ParametrosDeBusqueda } from "../_contrato";

export const ORDENES = [
  { id: "destacados", texto: "Destacados" },
  { id: "precio-asc", texto: "Precio: de menor a mayor" },
  { id: "precio-desc", texto: "Precio: de mayor a menor" },
  { id: "descuento", texto: "Mayor descuento" },
  { id: "nuevos", texto: "Lo más nuevo" },
] as const;
export type Orden = (typeof ORDENES)[number]["id"];

export interface Filtros {
  q: string;
  categoria: string | null;
  oferta: boolean;
  orden: Orden;
  marca: string | null;
  disponibles: boolean;
}

export const SIN_FILTROS: Filtros = { q: "", categoria: null, oferta: false, orden: "destacados", marca: null, disponibles: false };

/** Lo que el filtro necesita de un producto (lo cumple `ProductoTienda`). */
export interface Filtrable {
  id: number;
  nombre: string;
  marca: string | null;
  categoria: string;
  descripcion: string | null;
  precio: number;
  descuento: number | null;
  stock: number | null;
  etiqueta: string | null;
  codigo?: string | null;
}

const ESQUEMA = {
  q: z.string().trim().max(80),
  nombre: z.string().trim().min(1).max(80),
  uno: z.literal("1"),
  orden: z.enum(ORDENES.map((o) => o.id) as [Orden, ...Orden[]]),
};

const primero = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function campo<T>(esquema: z.ZodType<T>, v: string | string[] | undefined): T | undefined {
  const r = esquema.safeParse(primero(v));
  return r.success ? r.data : undefined;
}

/** Minúsculas, sin tildes, guiones como espacios, espacios simples. */
export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** El valor tal como está en la lista (sin importar tildes, mayúsculas ni guiones), o null. */
function deLaLista(valor: string | undefined, lista: readonly string[]): string | null {
  if (!valor) return null;
  const n = normalizar(valor);
  return lista.find((x) => normalizar(x) === n) ?? null;
}

export function leerFiltros(busqueda: ParametrosDeBusqueda, categorias: readonly string[], marcas: readonly string[]): Filtros {
  return {
    q: campo(ESQUEMA.q, busqueda.q) ?? "",
    categoria: deLaLista(campo(ESQUEMA.nombre, busqueda.categoria), categorias),
    oferta: campo(ESQUEMA.uno, busqueda.oferta) !== undefined,
    orden: campo(ESQUEMA.orden, busqueda.orden) ?? "destacados",
    marca: deLaLista(campo(ESQUEMA.nombre, busqueda.marca), marcas),
    disponibles: campo(ESQUEMA.uno, busqueda.disponibles) !== undefined,
  };
}

/** Los filtros como parámetros de la URL (sin los que están en su defecto), en un orden fijo. */
export function aParametros(f: Filtros): [string, string][] {
  const p: [string, string][] = [];
  if (f.q) p.push(["q", f.q]);
  if (f.categoria) p.push(["categoria", f.categoria]);
  if (f.oferta) p.push(["oferta", "1"]);
  if (f.orden !== "destacados") p.push(["orden", f.orden]);
  if (f.marca) p.push(["marca", f.marca]);
  if (f.disponibles) p.push(["disponibles", "1"]);
  return p;
}

export const CLAVES_DE_FILTRO = ["q", "categoria", "oferta", "orden", "marca", "disponibles"] as const;

/** Plural simple para buscar: «pizzas» encuentra «pizza»; «panes», «pan». */
const raiz = (t: string) => (t.length > 3 ? t.replace(/(es|s)$/, "") : t);

/**
 * ¿El producto tiene TODAS las palabras buscadas (en nombre, marca, categoría,
 * descripción o código)? `nombreCategoria` deja buscar por el nombre que se lee
 * («pollo a la brasa») y no sólo por la clave.
 */
export function coincide(p: Pick<Filtrable, "nombre" | "marca" | "categoria" | "descripcion" | "codigo">, q: string, nombreCategoria?: string): boolean {
  const palabras = normalizar(q).split(" ").filter(Boolean).map(raiz);
  if (palabras.length === 0) return true;
  const donde = normalizar([p.nombre, p.marca ?? "", p.categoria, nombreCategoria ?? "", p.descripcion ?? "", p.codigo ?? ""].join(" "));
  return palabras.every((w) => donde.includes(w));
}

/** Con etiqueta del dueño o rebaja, adelante; lo demás, en el orden en que el negocio tiene sus productos. */
const DESTACADO = (p: Filtrable) => (p.etiqueta ? 2 : 0) + (p.descuento ? 1 : 0);

const COMPARAR: Record<Orden, (a: Filtrable, b: Filtrable) => number> = {
  destacados: (a, b) => DESTACADO(b) - DESTACADO(a),
  "precio-asc": (a, b) => a.precio - b.precio || a.id - b.id,
  "precio-desc": (a, b) => b.precio - a.precio || a.id - b.id,
  descuento: (a, b) => (b.descuento ?? 0) - (a.descuento ?? 0) || a.precio - b.precio,
  nuevos: (a, b) => b.id - a.id,
};

/**
 * Filtra y ordena (el `sort` es estable: a igual peso queda el orden del
 * negocio). `menos` deja afuera un filtro: así se cuentan las píldoras
 * («Pizzas (4)» cuenta con la búsqueda y las ofertas, pero no con la categoría).
 */
export function aplicar<T extends Filtrable>(
  productos: readonly T[],
  f: Filtros,
  menos?: "categoria" | "oferta",
  nombreCategoria: (clave: string) => string = (c) => c,
): T[] {
  return productos
    .filter(
      (p) =>
        (!f.q || coincide(p, f.q, nombreCategoria(p.categoria))) &&
        (menos === "categoria" || !f.categoria || p.categoria === f.categoria) &&
        (menos === "oferta" || !f.oferta || Boolean(p.descuento)) &&
        (!f.marca || p.marca === f.marca) &&
        // Sin existencias cargadas (null) nunca cuenta como agotado.
        (!f.disponibles || p.stock === null || p.stock > 0),
    )
    .sort(COMPARAR[f.orden]);
}

/** Cuántos productos hay por categoría y en oferta, con los DEMÁS filtros puestos. */
export function contar(
  productos: readonly Filtrable[],
  f: Filtros,
  nombreCategoria?: (clave: string) => string,
): { porCategoria: Map<string, number>; todos: number; ofertas: number } {
  const sinCategoria = aplicar(productos, f, "categoria", nombreCategoria);
  const porCategoria = new Map<string, number>();
  for (const p of sinCategoria) porCategoria.set(p.categoria, (porCategoria.get(p.categoria) ?? 0) + 1);
  return { porCategoria, todos: sinCategoria.length, ofertas: aplicar(productos, f, "oferta", nombreCategoria).filter((p) => p.descuento).length };
}

/** Cuántos ajustes de la hoja «Filtrar y ordenar» no están en su defecto (para el número del botón). */
export function cuantosAjustes(f: Filtros): number {
  return Number(f.orden !== "destacados") + Number(Boolean(f.marca)) + Number(f.oferta) + Number(f.disponibles);
}
