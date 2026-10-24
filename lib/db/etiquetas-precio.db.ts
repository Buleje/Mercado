import "server-only";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";
import type { CambioDePrecio, ProductoEtiquetable } from "@/lib/etiquetas/precio";

/** Tope de filas de historial que se leen de una vez (un tenant que reprecia todo a diario). */
const FILAS_MAX = 5000;

/**
 * Lo que las etiquetas de precio leen del historial de precios: el ÚLTIMO
 * cambio de cada producto desde una fecha. Una sola query (índice
 * `[tenantId, productId, changedAt desc]` / `[changedAt]`), sin N+1.
 *
 * Sirve para «los que cambiaron de precio hoy» y para el precio anterior
 * tachado (que `lib/etiquetas/precio.ts` sólo muestra si fue una baja reciente).
 * Y los productos con su precio vivo, sin la caché del catálogo.
 */
export const EtiquetasPrecioDB = {
  async ultimosCambiosDesde(tenantId: string, desde: Date): Promise<Record<number, CambioDePrecio>> {
    const filas = await prisma.priceHistory.findMany({
      where: { tenantId, changedAt: { gte: desde } },
      orderBy: { changedAt: "desc" },
      select: { productId: true, oldPrice: true, newPrice: true, changedAt: true },
      take: FILAS_MAX,
    });
    const porProducto: Record<number, CambioDePrecio> = {};
    const vistas = new Map<number, number>();
    for (const f of filas) {
      // Vienen del más nuevo al más viejo: la 1.ª fila es el último cambio;
      // la 2.ª dice desde cuándo regía su «antes» (un «Deshacer» a los 2 min no es rebaja).
      const n = (vistas.get(f.productId) ?? 0) + 1;
      vistas.set(f.productId, n);
      if (n === 1) {
        porProducto[f.productId] = {
          antes: toNumOrZero(f.oldPrice),
          ahora: toNumOrZero(f.newPrice),
          cuando: f.changedAt.toISOString(),
          antesDesde: null,
        };
      } else if (n === 2) {
        porProducto[f.productId].antesDesde = f.changedAt.toISOString();
      }
    }
    return porProducto;
  },

  /**
   * Los productos que se pueden etiquetar (activos, sin servicios) con su
   * precio BASE leído al momento, SIN caché: el cambio masivo y el import CSV
   * cambian `price` sin vaciar la de `ProductsDB.getAll` (5 min) y la etiqueta
   * tiene que decir lo mismo que cobra la caja ahora.
   */
  async productosEtiquetables(tenantId: string): Promise<ProductoEtiquetable[]> {
    const filas = await prisma.product.findMany({
      where: { tenantId, deletedAt: null, active: true, NOT: { type: "service" } },
      select: { id: true, name: true, category: true, price: true, unit: true, barcode: true, sku: true, brand: true },
    });
    return filas
      .map((p) => ({
        id: p.id,
        nombre: p.name,
        categoria: p.category,
        precio: toNumOrZero(p.price),
        unidad: p.unit,
        barcode: p.barcode ?? null,
        sku: p.sku ?? null,
        marca: p.brand ?? null,
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  },
};
