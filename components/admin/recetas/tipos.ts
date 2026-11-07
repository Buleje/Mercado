/** Tipos y cuentas compartidas de Recetas (ver `RecetasModule.tsx`). */

export type Ingrediente = {
  id: string;
  recetaId: string;
  productoId: number;
  cantidad: number;
  unidad: string;
};

export type Receta = {
  id: string;
  tenantId: string;
  nombre: string;
  descripcion?: string;
  productoId?: number;
  costoTotal: number;
  activa: boolean;
  ingredientes: Ingrediente[];
  createdAt: string;
  updatedAt: string;
};

export type ProductInfo = {
  id: number;
  name: string;
  price: number;
  costPrice?: number | null;
  stock?: number;
};

/** Un lote producido, como lo devuelve `GET /api/recetas/produccion`. */
export type LoteProducido = {
  id: string;
  recetaId: string;
  recetaNombre?: string;
  cantidad: number;
  costoReal: number;
  notas?: string | null;
  producidoEn: string;
};

export const PER_PAGE = 10;

/** Margen en % sobre el precio de venta del producto final; `null` si falta precio o costo. */
export function margenDe(receta: Pick<Receta, "productoId" | "costoTotal">, productos: Record<number, ProductInfo>): number | null {
  const precio = receta.productoId ? (productos[receta.productoId]?.price ?? 0) : 0;
  return precio > 0 && receta.costoTotal > 0 ? Math.round(((precio - receta.costoTotal) / precio) * 100) : null;
}

/** Cuántos ingredientes alcanzan con el stock de hoy para UNA unidad de la receta. */
export function disponibilidadDe(receta: Pick<Receta, "ingredientes">, productos: Record<number, ProductInfo>) {
  const total = receta.ingredientes.length;
  const disponibles = receta.ingredientes.filter((ing) => {
    const prod = productos[ing.productoId];
    return prod && (prod.stock ?? 0) >= ing.cantidad;
  }).length;
  return { total, disponibles, faltan: total - disponibles };
}
