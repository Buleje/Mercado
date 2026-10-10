/**
 * Los filtros del catálogo del salón (ADR-460): qué se pide en la URL, cómo
 * se lee y cómo se aplica. Sin React ni servidor: lo usan el catálogo (al
 * leer la URL) y el navegador (al filtrar sin recargar), y los tests.
 *
 * La URL: `q` (texto), `categoria` (una del salón), `oferta=1`, `orden`
 * (destacados · precio-asc · precio-desc · descuento · nuevos), `marca`,
 * `disponibles=1`. Cada parámetro pasa su `safeParse`: el que no vale vuelve
 * a su defecto sin tocar a los demás. Una categoría que no es del salón (la
 * bodega de prueba vive en el mismo negocio) se ignora: el catálogo propio
 * muestra SÓLO lo del salón.
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

/** Lo que el filtro necesita de un producto (lo cumple `ProductoSalon`). */
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
}

const ESQUEMA = {
  q: z.string().trim().max(80),
  nombre: z.string().trim().min(1).max(60),
  uno: z.literal("1"),
  orden: z.enum(ORDENES.map((o) => o.id) as [Orden, ...Orden[]]),
};

const primero = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function campo<T>(esquema: z.ZodType<T>, v: string | string[] | undefined): T | undefined {
  const r = esquema.safeParse(primero(v));
  return r.success ? r.data : undefined;
}

/** Minúsculas, sin tildes, «qu» delante de e/i como «k» (queratina = keratina), espacios simples. */
export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/qu(?=[ei])/g, "k")
    .replace(/\s+/g, " ")
    .trim();
}

/** El nombre tal como está en la lista (sin importar tildes ni mayúsculas), o null. */
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

/** Plural simple para buscar: «planchas» encuentra «plancha»; «rizos», «rizo». */
const raiz = (t: string) => (t.length > 3 ? t.replace(/(es|s)$/, "") : t);

/** ¿El producto tiene TODAS las palabras buscadas (en nombre, marca, categoría o descripción)? */
export function coincide(p: Pick<Filtrable, "nombre" | "marca" | "categoria" | "descripcion">, q: string): boolean {
  const palabras = normalizar(q).split(" ").filter(Boolean).map(raiz);
  if (palabras.length === 0) return true;
  const donde = normalizar([p.nombre, p.marca ?? "", p.categoria, p.descripcion ?? ""].join(" "));
  return palabras.every((w) => donde.includes(w));
}

const DESTACADO = (p: Filtrable) => (p.etiqueta?.toLowerCase() === "favorito" ? 2 : 0) + (p.descuento ? 1 : 0);

const COMPARAR: Record<Orden, (a: Filtrable, b: Filtrable) => number> = {
  destacados: (a, b) => DESTACADO(b) - DESTACADO(a) || b.id - a.id,
  "precio-asc": (a, b) => a.precio - b.precio || a.id - b.id,
  "precio-desc": (a, b) => b.precio - a.precio || a.id - b.id,
  descuento: (a, b) => (b.descuento ?? 0) - (a.descuento ?? 0) || a.precio - b.precio,
  nuevos: (a, b) => b.id - a.id,
};

/**
 * Filtra y ordena. `menos` deja afuera un filtro: así se cuentan las píldoras
 * («Shampoo (4)» cuenta con la búsqueda y las ofertas, pero no con la categoría).
 */
export function aplicar<T extends Filtrable>(productos: readonly T[], f: Filtros, menos?: "categoria" | "oferta"): T[] {
  return productos
    .filter(
      (p) =>
        (!f.q || coincide(p, f.q)) &&
        (menos === "categoria" || !f.categoria || p.categoria === f.categoria) &&
        (menos === "oferta" || !f.oferta || Boolean(p.descuento)) &&
        (!f.marca || p.marca === f.marca) &&
        (!f.disponibles || p.stock === null || p.stock > 0),
    )
    .sort(COMPARAR[f.orden]);
}

/** Cuántos productos hay por categoría y en oferta, con los DEMÁS filtros puestos. */
export function contar(productos: readonly Filtrable[], f: Filtros): { porCategoria: Map<string, number>; todos: number; ofertas: number } {
  const sinCategoria = aplicar(productos, f, "categoria");
  const porCategoria = new Map<string, number>();
  for (const p of sinCategoria) porCategoria.set(p.categoria, (porCategoria.get(p.categoria) ?? 0) + 1);
  return { porCategoria, todos: sinCategoria.length, ofertas: aplicar(productos, f, "oferta").filter((p) => p.descuento).length };
}

/** Cuántos ajustes de la hoja «Filtrar y ordenar» no están en su defecto (para el número del botón). */
export function cuantosAjustes(f: Filtros): number {
  return Number(f.orden !== "destacados") + Number(Boolean(f.marca)) + Number(f.oferta) + Number(f.disponibles);
}
