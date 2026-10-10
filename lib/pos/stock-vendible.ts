/**
 * ¿Este ítem se puede vender hoy?
 *
 * El POS tenía la misma cuenta escrita en DIEZ lugares —la grilla, el buscador,
 * los frecuentes, Express, el alta al carrito, el escaneo por lista— y en todos
 * decía lo mismo: `stock != null && stock <= 0`. Ninguno miraba el TIPO.
 *
 * El schema es explícito desde siempre: *`"service"` = sin stock*. Un servicio
 * lleva `stock` en 0 porque no tiene stock que llevar, no porque se haya
 * terminado. El POS lo leía como mercadería agotada y lo dejaba **deshabilitado
 * y con cartel «Agotado»**: medido el 2026-09-11 en el tenant real, «Aserrado de
 * madera» (S/ 50) no se podía cobrar desde el mostrador — el aserradero no podía
 * vender su propio servicio.
 *
 * Una sola función para los diez focos: si mañana aparece otro tipo sin stock
 * (una seña, un alquiler por hora), se agrega acá y no en diez archivos.
 */

/** Lo mínimo que hace falta saber de un ítem para decidir si se puede vender. */
export interface ItemVendible {
  stock?: number | null;
  /** `"product"` (default) | `"service"`. */
  type?: string | null;
}

/** Los tipos que NO llevan stock: su `stock` en 0 no significa «agotado». */
const SIN_STOCK_PROPIO = new Set(["service"]);

/** `true` si el ítem lleva stock y ya no queda. Un servicio nunca se agota. */
export function estaAgotado(item: ItemVendible): boolean {
  if (SIN_STOCK_PROPIO.has((item.type ?? "product").toLowerCase())) return false;
  return item.stock != null && item.stock <= 0;
}

/** El complemento, para los filtros que preguntan al revés. */
export const sePuedeVender = (item: ItemVendible): boolean => !estaAgotado(item);
