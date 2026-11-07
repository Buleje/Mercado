"use client";

/**
 * useGoogleCheckout — «Continuar con Google» dentro del checkout de cualquier
 * tienda (2026-10-11, interruptor `pedidosCliente.loginGoogle`).
 *
 * - Entrar: Supabase (`useClienteTienda().entrarConGoogle`, que manda
 *   `origen=tienda` para que el callback vuelva a esta misma página) con
 *   `?checkout=resume`, así el checkout se reabre solo al volver. Si el sitio
 *   no tiene Supabase, cae al flujo propio `/api/auth/google`.
 * - Al volver: rellena el nombre del pedido (sólo si está vacío, una vez por
 *   apertura) y deja ver la cuenta (`cliente`).
 *
 * Regla de la casa: esta identidad SÓLO rellena el nombre. No cambia precios,
 * descuentos, puntos ni a quién se asigna el pedido (eso sale de
 * `getCustomerPayload` en el servidor).
 */

import { useCallback, useEffect, useRef } from "react";
import { useClienteTienda } from "@/components/store/cliente/use-cliente-tienda";
import type { ClienteTienda } from "@/lib/tienda-cliente/contrato";
import type { CheckoutDispatch } from "./useCheckoutState";

/** Marca de la URL que reabre el checkout (la usa también el aviso de carrito abandonado). */
export const MARCA_REABRIR = "checkout";
export const VALOR_REABRIR = "resume";

/** La página actual con `?checkout=resume` (ruta interna, sin el origen). */
export function rutaParaVolverAlCheckout(href: string): string {
  const url = new URL(href);
  url.searchParams.set(MARCA_REABRIR, VALOR_REABRIR);
  return `${url.pathname}${url.search}`;
}

type Args = {
  activo: boolean;
  checkoutOpen: boolean;
  /** Nombre que ya tiene el pedido (`state.customer.name`). */
  nombreActual: string;
  dispatch: CheckoutDispatch;
  /** El carrito tiene productos (se mira al montar, para `?checkout=resume`). */
  hayProductos: boolean;
  /** La tienda cobra con checkout (no en modo WhatsApp) y ya se sabe. */
  puedeReabrir: boolean;
  openCheckout: () => void;
};

export interface GoogleCheckout {
  /** Cuenta de Google con la que entró (null = no entró o el negocio lo apagó). */
  cliente: ClienteTienda | null;
  /** `undefined` = el negocio apagó el botón. */
  entrar: ((volverA?: string) => Promise<void>) | undefined;
  salir: () => Promise<void>;
}

export function useGoogleCheckout({
  activo,
  checkoutOpen,
  nombreActual,
  dispatch,
  hayProductos,
  puedeReabrir,
  openCheckout,
}: Args): GoogleCheckout {
  const { cliente: clienteKit, disponible, entrarConGoogle: entrarKit, salir: salirKit } = useClienteTienda();
  const cliente = activo ? clienteKit : null;

  // Vuelta de Google (o del aviso de carrito abandonado). La marca se borra
  // SIEMPRE al montar; sólo reabre si en ese momento el carrito ya tenía
  // productos (si no, el primer «Agregar» abría el checkout de golpe). El
  // modo de la tienda puede llegar después: la decisión ya quedó tomada.
  // `null` = todavía no se miró (StrictMode corre el efecto dos veces).
  const reabrirPendiente = useRef<boolean | null>(null);
  useEffect(() => {
    if (reabrirPendiente.current !== null || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const conMarca = url.searchParams.get(MARCA_REABRIR) === VALOR_REABRIR;
    reabrirPendiente.current = conMarca && hayProductos;
    if (conMarca) {
      url.searchParams.delete(MARCA_REABRIR);
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
    // Sólo al montar: `hayProductos` se lee en ese instante a propósito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!reabrirPendiente.current || !puedeReabrir) return;
    reabrirPendiente.current = false;
    openCheckout();
  }, [puedeReabrir, openCheckout]);

  // Nombre relleno solo, una vez por apertura. «Sólo si está vacío» lo decide
  // el reducer con el estado de ESE momento (después del RESET de la apertura).
  const rellenado = useRef(false);
  useEffect(() => {
    if (!checkoutOpen) {
      rellenado.current = false;
      return;
    }
    if (!cliente || rellenado.current) return;
    rellenado.current = true;
    dispatch({ type: "RELLENAR_NOMBRE_SI_VACIO", name: cliente.nombre });
  }, [checkoutOpen, cliente, dispatch]);

  const entrarConGoogle = useCallback(async () => {
    const volverA = rutaParaVolverAlCheckout(window.location.href);
    if (disponible) {
      await entrarKit(volverA);
      return;
    }
    // Sin Supabase en este sitio: el flujo propio (GOOGLE_CLIENT_ID/SECRET).
    window.location.href = `/api/auth/google?redirect=${encodeURIComponent(volverA)}`;
  }, [disponible, entrarKit]);

  const salir = useCallback(async () => {
    // «No soy yo»: el nombre que puso Google se va con la cuenta.
    if (cliente && nombreActual.trim() === cliente.nombre.trim()) {
      dispatch({ type: "SET_CUSTOMER", patch: { name: "" } });
    }
    await salirKit();
  }, [cliente, nombreActual, dispatch, salirKit]);

  return { cliente, entrar: activo ? entrarConGoogle : undefined, salir };
}
