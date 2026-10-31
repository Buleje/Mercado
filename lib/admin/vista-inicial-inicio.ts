/**
 * Qué pestaña abre el Inicio del panel (regla pura, sin React).
 *
 * El Inicio abría siempre en «Resumen» (ventas de bodega). Para un aserradero
 * sin ventas de tienda eso era «S/ 0» en todo. La regla: si el negocio usa los
 * libros forestales y el período no trae ventas, abrir «Forestal».
 *
 * Lo que la persona eligió manda SIEMPRE: un `?vista=` en la URL o un click
 * propio en la barra (`eligioAMano`). El `localStorage` de la vista NO sirve de
 * señal: `useVistaModulo` escribe también la vista por defecto, así que
 * «general» recordado no significa «la elegí yo».
 */
export type VentasDelPeriodo = "con" | "sin" | "desconocido";

export interface EntradaVistaInicial {
  vistaActual: string;
  vistaEnUrl: boolean;
  eligioAMano: boolean;
  tieneForestal: boolean;
  ventas: VentasDelPeriodo;
}

/** La vista a la que hay que pasar, o `null` si se deja la que está. */
export function vistaInicialDelInicio(e: EntradaVistaInicial): "forestal" | null {
  if (e.vistaActual !== "general") return null;
  if (e.vistaEnUrl || e.eligioAMano) return null;
  if (!e.tieneForestal || e.ventas !== "sin") return null;
  return "forestal";
}

/** ¿El resumen del período no trae ventas? (sin pedidos y sin importe). */
export function periodoSinVentas(total: number | undefined, pedidos: number | undefined): boolean {
  return (total ?? 0) <= 0 && (pedidos ?? 0) <= 0;
}

export const CLAVE_ELIGIO_A_MANO = "admin-inicio-eligio-a-mano";
