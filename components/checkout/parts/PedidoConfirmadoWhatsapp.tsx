"use client";

/**
 * PedidoConfirmadoWhatsapp — «Enviar mi pedido por WhatsApp» en la pantalla
 * del pedido YA confirmado (`OrderStatusModal`), con el número de pedido y el
 * total que devolvió el servidor. Va al chat DEL negocio y, con
 * `pedidosCliente.pedidoComoImagen`, con la imagen (kit `BotonPedidoWhatsapp`).
 *
 * Datos, todos de este mismo pedido:
 *   · al confirmar, `useGuardarPedidoConfirmado` (en `CheckoutSuccessStep`) junta
 *     productos y total del servidor (`buleje-last-order`) con nombre, celular,
 *     entrega, pago y ubicación del checkout, y los guarda en sessionStorage
 *     (ver `pedido-confirmado-guardado.ts`): así sobrevive a una recarga;
 *   · si no se pudo guardar, el estado vivo del checkout (`useCheckoutFlow`).
 * Si nada es de este pedido no se dibuja: nada de mandar datos inventados.
 */

import { useEffect, useMemo, useState } from "react";
import { BotonPedidoWhatsapp } from "@/components/store/cliente/BotonPedidoWhatsapp";
import { resolverColorCss } from "@/lib/tienda-cliente/imagen-pedido";
import { cn } from "@/lib/utils";
import { useCheckoutFlowOpcional } from "../checkout-flow-context";
import { usePedidosTienda } from "../hooks/usePedidosTienda";
import type { CheckoutState } from "../types";
import { datosImagenCheckout, textoPedidoWhatsapp, type PedidoWhatsapp } from "./pedido-whatsapp-checkout";
import {
  guardarPedidoConfirmado,
  leerPedidoConfirmado,
  leerUltimoPedido,
  type DatosPedidoGuardado,
} from "./pedido-confirmado-guardado";

/** Lo que va al mensaje, armado del checkout que acaba de confirmar `orderId`. */
function datosDelCheckout(orderId: string, state: CheckoutState | undefined): DatosPedidoGuardado | null {
  const ultimo = leerUltimoPedido();
  if (!state || !ultimo || ultimo.id !== orderId || state.ui.orderId !== orderId) return null;
  return {
    id: orderId,
    total: ultimo.total,
    items: ultimo.items.map(({ name, quantity, price, image }) => ({ name, quantity, price, image })),
    cliente: {
      nombre: state.customer.name,
      celular: state.customer.phone,
      direccion: state.address.location,
      referencia: state.address.reference,
      pago: state.payment.method,
      ubicacion: state.address.ubicacionEnVivo ?? "",
    },
  };
}

/** En la pantalla de éxito: guarda el pedido para que el botón sobreviva a una recarga. */
export function useGuardarPedidoConfirmado(orderId: string): void {
  const flow = useCheckoutFlowOpcional();
  const { numeroWhatsapp } = usePedidosTienda();
  const state = flow?.state;
  useEffect(() => {
    // Sin WhatsApp del negocio el botón no existe: no se guarda nada.
    if (!orderId || !numeroWhatsapp) return;
    const datos = datosDelCheckout(orderId, state);
    if (datos) guardarPedidoConfirmado(datos);
  }, [orderId, numeroWhatsapp, state]);
}

export function PedidoConfirmadoWhatsapp({ orderId, className }: { orderId: string; className?: string }) {
  const flow = useCheckoutFlowOpcional();
  const { config, numeroWhatsapp, nombreNegocio, logo } = usePedidosTienda();
  const state = flow?.state;
  const [datosPedido, setDatosPedido] = useState<DatosPedidoGuardado | null>(null);
  useEffect(() => {
    setDatosPedido(leerPedidoConfirmado(orderId) ?? datosDelCheckout(orderId, state));
  }, [orderId, state]);

  const pedido = useMemo<PedidoWhatsapp | null>(
    () =>
      datosPedido
        ? {
            negocio: nombreNegocio,
            numero: datosPedido.id,
            items: datosPedido.items,
            total: datosPedido.total,
            cliente: { ...datosPedido.cliente, notas: "" },
          }
        : null,
    [datosPedido, nombreNegocio],
  );

  const texto = useMemo(() => (pedido ? textoPedidoWhatsapp(pedido) : ""), [pedido]);
  const datos = useMemo(
    () => (pedido ? datosImagenCheckout(pedido, { colorAcento: resolverColorCss("var(--color-primary)"), logo }) : null),
    [pedido, logo],
  );

  if (!numeroWhatsapp || !pedido) return null;

  return (
    <div className={cn("rounded-2xl border border-primary/30 bg-primary/5 p-4 space-y-2", className)} data-testid="pedido-confirmado-whatsapp">
      <p className="text-sm font-semibold text-[var(--text-primary)]">
        Avísale a {nombreNegocio}: mándale tu pedido{config.pedidoComoImagen ? " con foto" : ""} por WhatsApp.
      </p>
      <BotonPedidoWhatsapp
        datos={datos}
        comoImagen={config.pedidoComoImagen}
        texto={texto}
        numero={numeroWhatsapp}
        nombreArchivo={`pedido-${orderId.slice(-8)}.png`}
        className="bg-primary text-white hover:bg-primary-dark transition-colors"
        claseAviso="text-center text-[var(--text-secondary)]"
        claseEnlace="text-[var(--accent-ink)] dark:text-[var(--accent)]"
      >
        Enviar mi pedido por WhatsApp
      </BotonPedidoWhatsapp>
    </div>
  );
}
