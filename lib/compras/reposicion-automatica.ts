import "server-only";
import { ReorderAlertsDB, type ResultadoBorrador } from "@/lib/db/reorder-alerts.db";
import { enStockBajo, stockMinimoDe, STOCK_MINIMO_GLOBAL_POR_DEFECTO } from "@/lib/inventario/stock-minimo";
import { minimosGlobalesPorNegocio } from "@/lib/inventario/stock-minimo.server";

/**
 * Reposición automática, negocio por negocio (10-10).
 *
 * Los dos crons (`/api/reorder-alerts` y `/api/cron/auto-reorder-check`)
 * pasan por acá: cada producto se cruza SOLO con el historial de compras de su
 * propio negocio y cada borrador se arma con el proveedor y los productos de
 * ese negocio. Antes uno agrupaba los productos de todos los negocios por
 * NOMBRE de proveedor y el otro tenía `"main"` escrito a mano.
 */

export type ProductoParaReponer = {
  id: number;
  tenantId: string;
  name: string;
  stock: number;
  stockMin: number;
  stockMax: number;
  category: string;
  unit: string;
  suggestedQty: number;
  supplierId?: string;
  supplier?: string;
};

export type ReposicionDeNegocio = {
  tenantId: string;
  productos: ProductoParaReponer[];
  borradores: ResultadoBorrador[];
};

/** Productos bajo su mínimo (el propio o el global de su negocio), con cuánto pedir. */
export async function productosBajoMinimo(): Promise<ProductoParaReponer[]> {
  const products = await ReorderAlertsDB.listProductsWithMinStock();
  const minimos = await minimosGlobalesPorNegocio(products.map((p) => p.tenantId));
  const salida: ProductoParaReponer[] = [];
  for (const p of products) {
    const minimoGlobal = minimos.get(p.tenantId) ?? STOCK_MINIMO_GLOBAL_POR_DEFECTO;
    if (!enStockBajo(p, minimoGlobal)) continue;
    const stockMin = stockMinimoDe(p, minimoGlobal);
    const stockMax = p.stockMax ?? stockMin * 3;
    const stock = p.stock ?? 0;
    salida.push({
      id: p.id, tenantId: p.tenantId, name: p.name, stock, stockMin, stockMax,
      category: p.category, unit: p.unit,
      // Al menos 1: un mínimo 0 («avisar sólo al agotarse») igual pide algo.
      suggestedQty: Math.max(stockMax - stock, stockMin, 1),
    });
  }
  return salida;
}

function agrupar<T, K>(lista: readonly T[], clave: (x: T) => K): Map<K, T[]> {
  const mapa = new Map<K, T[]>();
  for (const x of lista) {
    const k = clave(x);
    const grupo = mapa.get(k);
    if (grupo) grupo.push(x);
    else mapa.set(k, [x]);
  }
  return mapa;
}

/**
 * Le pone a cada producto el último proveedor de SU negocio y, si
 * `crearBorradores`, repone un borrador por (negocio, proveedor) sin duplicar.
 */
export async function reponerPorNegocio(
  productos: readonly ProductoParaReponer[],
  { crearBorradores, origen }: { crearBorradores: boolean; origen: string },
): Promise<ReposicionDeNegocio[]> {
  const salida: ReposicionDeNegocio[] = [];
  for (const [tenantId, delNegocio] of agrupar(productos, (p) => p.tenantId)) {
    const proveedores = await ReorderAlertsDB.ultimoProveedorPorProducto(tenantId, delNegocio.map((p) => p.id));
    const conProveedor = delNegocio.map((p) => {
      const prov = proveedores.get(p.id);
      return prov ? { ...p, supplierId: prov.supplierId, supplier: prov.supplierName } : { ...p };
    });
    const borradores: ResultadoBorrador[] = [];
    if (crearBorradores) {
      for (const [supplierId, items] of agrupar(conProveedor.filter((p) => p.supplierId), (p) => p.supplierId as string)) {
        borradores.push(await ReorderAlertsDB.reponerBorrador(tenantId, {
          supplierId,
          nuevoId: `auto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          notes: `Auto-generado por sistema de reabastecimiento (${origen}). ${items.length} productos bajo stock mínimo.`,
          sugeridas: items.map((i) => ({ productId: i.id, quantity: i.suggestedQty })),
        }));
      }
    }
    salida.push({ tenantId, productos: conProveedor, borradores });
  }
  return salida;
}
