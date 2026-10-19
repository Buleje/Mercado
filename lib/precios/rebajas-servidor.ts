import "server-only";
import { ProductsDB } from "@/lib/db/products.db";
import { SalesDB } from "@/lib/db/sales.db";
import { OrdersDB } from "@/lib/db/orders.db";
import { BatchesDB } from "@/lib/db/batches.db";
import { KitsDB } from "@/lib/db/kits.db";
import { limaDateKey } from "@/lib/utils";
import type { ProductoPrecio } from "@/lib/admin/comandos-ia/precios";
import { armarRebajas, elegirLoteQueVence, REBAJA_VENCE_DIAS, REBAJA_VENTANA_DIAS, type DatosRebaja, type ListaRebajas, type OpcionesRebaja } from "./rebajas";

/**
 * Los datos de la regla de rebajas (`rebajas.ts`), leídos por las DB classes:
 *  · unidades vendidas en la ventana: caja (Sale) + pedidos no cancelados (Order)
 *    + salidas como componente de un kit (kardex `[kit #id]`, no tienen SaleItem);
 *  · el lote que manda (`elegirLoteQueVence`): el no vencido más próximo a vencer
 *    en 15 días; los vencidos con stock sólo si no queda ninguno sin vencer.
 * Lo usan Sugerencias de precio y Precios en bloque: la MISMA lectura para las dos.
 */
export async function leerDatosDeRebaja(
  tenantId: string,
  productos: ProductoPrecio[],
  dias: number = REBAJA_VENTANA_DIAS,
): Promise<DatosRebaja> {
  const ids = productos.map((p) => p.id);
  const desde = new Date(Date.now() - dias * 86_400_000);
  const [caja, pedidos, enKits, porVencer, vencidos] = await Promise.all([
    ids.length ? SalesDB.findSaleItemsByProducts(tenantId, ids, desde) : Promise.resolve([]),
    ids.length ? OrdersDB.findOrderItemsByProducts(tenantId, ids, desde) : Promise.resolve([]),
    KitsDB.salidasComoComponente(tenantId, ids, desde),
    BatchesDB.getExpiring(tenantId, REBAJA_VENCE_DIAS),
    BatchesDB.getExpiredWithStock(tenantId),
  ]);

  const vendidas = new Map<number, number>();
  for (const i of [...caja, ...pedidos, ...enKits]) {
    const id = Number(i.productId);
    vendidas.set(id, (vendidas.get(id) ?? 0) + Number(i.quantity ?? 0));
  }

  const hoy = limaDateKey();
  const vence = elegirLoteQueVence([...vencidos, ...porVencer], hoy, new Set(ids));
  return { productos, vendidas, vence, hoy, dias };
}

/** La lista de rebajas del negocio entero (productos activos). */
export async function listaDeRebajas(
  tenantId: string,
  opciones: OpcionesRebaja & { dias?: number } = {},
): Promise<ListaRebajas> {
  const productos = (await ProductsDB.getAll(tenantId)).filter((p) => p.active);
  const datos = await leerDatosDeRebaja(tenantId, productos, opciones.dias);
  return armarRebajas(datos, opciones);
}
