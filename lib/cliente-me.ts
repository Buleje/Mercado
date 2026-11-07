"use client";

/**
 * lib/cliente-me.ts — la sesión del cliente de la tienda, pedida UNA vez por carga.
 *
 * `CustomerProvider` (hidrata al cliente si no hay nada guardado) y
 * `useCustomerAuthStatus` (navbar, cuenta) preguntaban cada uno a
 * `/api/auth/customer/me` al montar: 2 pedidos iguales en cada página pública,
 * y el endpoint además rota el token en cada uno (16-10, carril velocidad).
 * Con `cachedJson` comparten el pedido en vuelo y su respuesta por 5 s; más
 * tiempo no, para que una entrada/salida recién hecha se vea en la próxima pantalla.
 */
import { cachedJson, invalidateCachedJson } from "@/lib/client-cache-fetch";

export interface RespuestaClienteMe {
  authenticated?: boolean;
  customer?: { name: string; phone?: string };
}

const URL_CLIENTE_ME = "/api/auth/customer/me";
const VIGENCIA_MS = 5_000;

/** `null` si el endpoint falló o respondió con error (= sin sesión). */
export function pedirClienteMe(): Promise<RespuestaClienteMe | null> {
  return cachedJson<RespuestaClienteMe>(URL_CLIENTE_ME, VIGENCIA_MS, { cache: "no-store" });
}

/** Al salir o entrar: que la próxima pantalla pregunte de nuevo. */
export function olvidarClienteMe(): void {
  invalidateCachedJson(URL_CLIENTE_ME);
}
