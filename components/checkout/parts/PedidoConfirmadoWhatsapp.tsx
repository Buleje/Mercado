"use client";

/**
 * PedidoConfirmadoWhatsapp — «Enviar mi pedido por WhatsApp» en la pantalla
 * del pedido YA confirmado (`OrderStatusModal`), con el número de pedido y el
 * total que devolvió el servidor. Va al chat DEL negocio y, con
 * `pedidosCliente.pedidoComoImagen`, con la imagen (kit `BotonPedidoWhatsapp`).
 *
 * Datos, todos de este mismo pedido:
 *   · productos y total → `buleje-last-order` (lo guarda `saveLastOrder` con el
 *     total que respondió `POST /api/orders`);
 *   · nombre, celular, dirección, pago, notas y ubicación → el estado del
 *     checkout que lo acaba de enviar (`useCheckoutFlow`, vive en StoreProviders).
 * Si alguno no es de este pedido (recargó la página, otro pedido) no se dibuja:
 * nada de mandar datos inventados.
 */

import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { BotonPedidoWhatsapp } from "@/components/store/cliente/BotonPedidoWhatsapp";
import { resolverColorCss } from "@/lib/tienda-cliente/imagen-pedido";
import { cn } from "@/lib/utils";
import { useCheckoutFlowOpcional } from "../checkout-flow-context";
import { usePedidosTienda } from "../hooks/usePedidosTienda";
import { datosImagenCheckout, textoPedidoWhatsapp, type PedidoConfirmado } from "./pedido-whatsapp-checkout";

const ultimoPedidoSchema = z.object({
  id: z.string().min(1),
  total: z.number().nonnegative(),
  items: z
    .array(
      z.object({
        name: z.string(),
        quantity: z.number().positive(),
        price: z.number().nonnegative(),
        unit: z.string().optional(),
        image: z.string().optional(),
      }),
    )
    .min(1),
});
type UltimoPedido = z.infer<typeof ultimoPedidoSchema>;

function leerUltimoPedido(): UltimoPedido | null {
  try {
    const r = ultimoPedidoSchema.safeParse(JSON.parse(localStorage.getItem("buleje-last-order") ?? "null"));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

export function PedidoConfirmadoWhatsapp({ orderId, className }: { orderId: string; className?: string }) {
  const flow = useCheckoutFlowOpcional();
  const { config, numeroWhatsapp, nombreNegocio, logo } = usePedidosTienda();
  const [ultimo, setUltimo] = useState<UltimoPedido | null>(null);
  useEffect(() => {
    setUltimo(leerUltimoPedido());
  }, [orderId]);

  const state = flow?.state;
  const pedido = useMemo<PedidoConfirmado | null>(() => {
    if (!state || !ultimo || ultimo.id !== orderId || state.ui.orderId !== orderId) return null;
    return {
      negocio: nombreNegocio,
      numero: orderId,
      items: ultimo.items,
      total: ultimo.total,
      cliente: {
        nombre: state.customer.name,
        celular: state.customer.phone,
        direccion: state.address.location,
        referencia: state.address.reference,
        pago: state.payment.method,
        notas: state.address.notes,
        ubicacion: state.address.ubicacionEnVivo ?? "",
      },
    };
  }, [state, ultimo, orderId, nombreNegocio]);

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
