/**
 * «Salir» del cliente de la tienda, del lado del navegador (2026-10-11).
 *
 * Un solo pedido a `POST /api/auth/customer/logout`: anula y vence la cookie
 * de cliente (verificada o de seguimiento de invitado) y cierra la sesión de
 * Google de Supabase. No toca la sesión del panel.
 *
 * Lo que el navegador recuerda (localStorage del cliente de esta tienda) lo
 * borra quien llama: `useCustomer().salir()` o, en la portada de una página
 * propia sin proveedores, `useDatosCuentaSinProveedor`.
 */
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";

export const RUTA_SALIR_CLIENTE = "/api/auth/customer/logout";

/** Cierra la sesión del cliente en el servidor. Nunca tira: devuelve si el servidor respondió bien. */
export async function cerrarSesionCliente(): Promise<boolean> {
  try {
    const res = await fetch(RUTA_SALIR_CLIENTE, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: csrfHeaders(),
    });
    if (!res.ok) logger.warn("[salir-cliente] el servidor no cerró la sesión", { status: res.status });
    return res.ok;
  } catch (err) {
    logger.warn("[salir-cliente] no se pudo cerrar la sesión", { error: String(err) });
    return false;
  }
}
