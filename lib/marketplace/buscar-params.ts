/**
 * Buscador del marketplace (/marketplace/buscar): lo que viaja en el link.
 *
 * Una sola fuente para el servidor (page.tsx lee el link → MarketplaceSearchDB)
 * y para el cliente (BuscarClient arma el link al tocar un filtro). Si el link
 * y la consulta no hablan igual, el filtro se dibuja y no filtra (SUPMKT-2).
 *
 * Sin "server-only" ni "use client": lo importan los dos lados.
 */
import { z } from "zod";

export const ORDENES_BUSCAR = ["relevance", "price_asc", "price_desc", "rating", "newest"] as const;
export type OrdenBuscar = (typeof ORDENES_BUSCAR)[number];

/** `all` = todo · `inStock` = se puede pedir · `outOfStock` = agotado. */
export type DisponibilidadBuscar = "all" | "inStock" | "outOfStock";

export type FiltrosBuscar = {
  categories: string[];
  stores: string[];
  priceMin: number | null;
  priceMax: number | null;
  availability: DisponibilidadBuscar;
  /** 0 = cualquier calificación; 1..4 = tiendas con esas estrellas o más. */
  minRating: number;
  zone: string | null;
};

export type ParamsBuscar = FiltrosBuscar & {
  q: string;
  sort: OrdenBuscar;
  page: number;
};

export const FILTROS_VACIOS: FiltrosBuscar = {
  categories: [],
  stores: [],
  priceMin: null,
  priceMax: null,
  availability: "all",
  minRating: 0,
  zone: null,
};

// ── Leer el link ──────────────────────────────────────────────────────────────

/** Next pasa `?a=1&a=2` como array: para los campos de un valor vale el primero. */
function primero(v: unknown): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" && s.trim() !== "" ? s.trim() : undefined;
}

function varios(v: unknown): string[] {
  const arr = Array.isArray(v) ? v : v == null ? [] : [v];
  return arr
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter(Boolean);
}

const precio = z
  .preprocess(primero, z.coerce.number().min(0).max(1_000_000).optional())
  .catch(undefined);

const esquemaLink = z.object({
  q: z.preprocess(primero, z.string().max(100).optional()).catch(undefined),
  cat: z.preprocess(varios, z.array(z.string().max(80)).max(30)).catch([]),
  store: z.preprocess(varios, z.array(z.string().max(80)).max(30)).catch([]),
  sort: z.preprocess(primero, z.enum(ORDENES_BUSCAR)).catch("relevance"),
  min: precio,
  max: precio,
  page: z.preprocess(primero, z.coerce.number().int().min(1).max(500)).catch(1),
  stock: z.preprocess(primero, z.enum(["1", "0"]).optional()).catch(undefined),
  rating: z.preprocess(primero, z.coerce.number().int().min(1).max(4).optional()).catch(undefined),
  zone: z.preprocess(primero, z.string().max(60).optional()).catch(undefined),
});

/** searchParams crudos → filtros válidos. Un valor roto se ignora, nunca revienta. */
export function leerParamsBuscar(raw: Record<string, unknown>): ParamsBuscar {
  const r = esquemaLink.safeParse(raw);
  if (!r.success) {
    return { ...FILTROS_VACIOS, q: "", sort: "relevance", page: 1 };
  }
  const d = r.data;
  return {
    q: d.q ?? "",
    sort: d.sort,
    page: d.page,
    categories: d.cat,
    stores: d.store,
    priceMin: d.min ?? null,
    priceMax: d.max ?? null,
    availability: d.stock === "1" ? "inStock" : d.stock === "0" ? "outOfStock" : "all",
    minRating: d.rating ?? 0,
    zone: d.zone ?? null,
  };
}

// ── Escribir el link ──────────────────────────────────────────────────────────

/** Filtros → `q=arroz&stock=1…` (sin `?`). Inverso exacto de `leerParamsBuscar`. */
export function linkBuscar(p: ParamsBuscar): string {
  const s = new URLSearchParams();
  if (p.q) s.set("q", p.q);
  if (p.sort !== "relevance") s.set("sort", p.sort);
  if (p.page > 1) s.set("page", String(p.page));
  p.categories.forEach((c) => s.append("cat", c));
  p.stores.forEach((id) => s.append("store", id));
  if (p.priceMin != null) s.set("min", String(p.priceMin));
  if (p.priceMax != null) s.set("max", String(p.priceMax));
  if (p.availability === "inStock") s.set("stock", "1");
  if (p.availability === "outOfStock") s.set("stock", "0");
  if (p.minRating > 0) s.set("rating", String(p.minRating));
  if (p.zone) s.set("zone", p.zone);
  return s.toString();
}

export function hayFiltrosActivos(f: FiltrosBuscar): boolean {
  return (
    f.categories.length > 0 ||
    f.stores.length > 0 ||
    f.priceMin != null ||
    f.priceMax != null ||
    f.availability !== "all" ||
    f.minRating > 0 ||
    f.zone != null
  );
}

// ── Relevancia ────────────────────────────────────────────────────────────────

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * Qué tan bien coincide el nombre con lo buscado (menor = mejor):
 * 0 empieza con lo buscado · 1 una palabra empieza con eso · 2 lo contiene ·
 * 3 no está en el nombre (entró por la categoría).
 * Ej. «arroz»: «Arroz Costeño 5 kg» 0 · «Porción de Arroz Chaufa» 1 ·
 * «Galletas arrozadas» 1 · «Mazamorra con arroz» 1 · «Abarrotes» 3.
 */
export function puntajeRelevancia(nombre: string, q: string): number {
  const n = normalizar(nombre);
  const b = normalizar(q);
  if (!b) return 3;
  if (n.startsWith(b)) return 0;
  if (n.split(/[^a-z0-9ñ]+/).some((w) => w.startsWith(b))) return 1;
  if (n.includes(b)) return 2;
  return 3;
}

/**
 * Ordena por coincidencia con lo buscado; las estrellas de la tienda sólo
 * desempatan, después el nombre. No muta la lista.
 */
export function ordenarPorRelevancia<T>(
  filas: readonly T[],
  q: string,
  datos: (f: T) => { nombre: string; rating: number },
): T[] {
  return filas
    .map((f) => {
      const d = datos(f);
      return { f, p: puntajeRelevancia(d.nombre, q), r: d.rating, n: d.nombre };
    })
    .sort((a, b) => a.p - b.p || b.r - a.r || a.n.localeCompare(b.n, "es", { sensitivity: "base" }))
    .map((x) => x.f);
}
