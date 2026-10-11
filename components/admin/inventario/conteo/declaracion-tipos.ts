/** Tipos y cuentas de la Declaración de inventario (la foto oficial del almacén). */

export type ProductItem = {
  id: string;
  sku: string;
  name: string;
  stock: number;
  costPrice: number;
  price: number;
  categoryName: string;
};

export type PorCategoria = Record<string, ProductItem[]>;

export type DeclaracionData = {
  fecha: string;
  totalProductos: number;
  totalUnidades: number;
  valorCosto: number;
  valorPrecio: number;
  porCategoria?: PorCategoria;
  categorias?: PorCategoria;
};

export type HistorialEntry = {
  fecha: string;
  totalProductos: number;
  totalUnidades: number;
  valorCosto: number;
  valorPrecio: number;
  categorias: number;
  savedAt: string;
};

export type ResumenCategoria = { unidades: number; valorCosto: number };

export type DeclaracionAnterior = {
  fecha: string;
  categorias: Record<string, ResumenCategoria>;
  valorTotal: number;
};

/** Lo que devuelve `/api/inventory/declaracion`, con los dos formatos que ha tenido. */
type RespuestaApi = {
  fecha: string;
  totalProductos?: number;
  totalUnidades?: number;
  valorCosto?: number;
  valorPrecio?: number;
  resumen?: { totalProductos?: number; totalUnidades?: number; totalValorCosto?: number; totalValorPrecio?: number };
  porCategoria?: PorCategoria;
  categorias?: PorCategoria;
};

export function mapearRespuesta(raw: RespuestaApi): DeclaracionData {
  return {
    fecha: raw.fecha,
    totalProductos: raw.totalProductos ?? raw.resumen?.totalProductos ?? 0,
    totalUnidades: raw.totalUnidades ?? raw.resumen?.totalUnidades ?? 0,
    valorCosto: raw.valorCosto ?? raw.resumen?.totalValorCosto ?? 0,
    valorPrecio: raw.valorPrecio ?? raw.resumen?.totalValorPrecio ?? 0,
    porCategoria: raw.porCategoria,
    categorias: raw.categorias,
  };
}

export const categoriasDe = (d: DeclaracionData): PorCategoria => d.porCategoria ?? d.categorias ?? {};

export const unidadesDe = (items: ProductItem[]) => items.reduce((s, p) => s + p.stock, 0);
export const costoDe = (items: ProductItem[]) => items.reduce((s, p) => s + p.stock * p.costPrice, 0);
export const precioDe = (items: ProductItem[]) => items.reduce((s, p) => s + p.stock * p.price, 0);

export function resumenPorCategoria(d: DeclaracionData): Record<string, ResumenCategoria> {
  const out: Record<string, ResumenCategoria> = {};
  for (const [cat, items] of Object.entries(categoriasDe(d))) out[cat] = { unidades: unidadesDe(items), valorCosto: costoDe(items) };
  return out;
}
