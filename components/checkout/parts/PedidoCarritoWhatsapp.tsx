"use client";

/**
 * PedidoCarritoWhatsapp — la vista previa + «Enviar» del carrito lateral cuando
 * la tienda vende por WhatsApp (modo `whatsapp`, sin checkout). Con el
 * WhatsApp del negocio (`usePedidosTienda`) va a SU chat y, con
 * `pedidosCliente.pedidoComoImagen`, con la imagen del kit dibujada ANTES del
 * clic (`BotonPedidoWhatsapp`). Sin número, el carrito sigue como antes.
 *
 * Este modo no pide datos: usa lo que ya hay a mano — el cliente guardado en
 * este navegador (nombre, celular, dirección) y, si no, el nombre de Google
 * (interruptor `loginGoogle`). No hay pedido en el sistema: el total es la
 * vista previa del carrito y el mensaje dice «(lo confirma el negocio)».
 */

import { useEffect, useMemo, useRef } from "react";
import { BotonPedidoWhatsapp } from "@/components/store/cliente/BotonPedidoWhatsapp";
import { useClienteTienda } from "@/components/store/cliente/use-cliente-tienda";
import { useCart, type CartItem } from "@/contexts/cart-context";
import { useCustomer } from "@/contexts/customer-context";
import type { ResultadoEnvio } from "@/lib/tienda-cliente/contrato";
import { resolverColorCss } from "@/lib/tienda-cliente/imagen-pedido";
import { usePedidosTienda } from "../hooks/usePedidosTienda";
import { datosImagenCheckout, textoPedidoWhatsapp, type PedidoWhatsapp } from "./pedido-whatsapp-checkout";

/** Lo mismo que hacía el carrito tras mandar el pedido por WhatsApp. */
const PAUSA_CONFIRMAR_MS = 1800;

export interface PedidoCarritoWhatsappProps {
  items: readonly CartItem[];
  /** Total de la vista previa del carrito (promo y cupón ya restados). */
  total: number;
  onEditar: () => void;
}

export function PedidoCarritoWhatsapp({ items, total, onEditar }: PedidoCarritoWhatsappProps) {
  const { config, numeroWhatsapp, nombreNegocio, logo } = usePedidosTienda();
  const { customer } = useCustomer();
  const google = useClienteTienda();
  const { markOrderPending, openConfirmModal } = useCart();
  const reloj = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (reloj.current !== null) window.clearTimeout(reloj.current);
    },
    [],
  );

  const nombre = customer?.name?.trim() || (config.loginGoogle ? google.cliente?.nombre : "") || "";
  const pedido = useMemo<PedidoWhatsapp>(
    () => ({
      negocio: nombreNegocio,
      items: items.map((i) => ({
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        unit: i.unit,
        image: i.image,
        note: i.note,
      })),
      total,
      cliente: {
        nombre,
        celular: customer?.phone ?? "",
        direccion: customer?.location ?? "",
        referencia: customer?.reference ?? "",
        pago: null,
        notas: "",
        ubicacion: "",
      },
    }),
    [nombreNegocio, items, total, nombre, customer],
  );
  const texto = useMemo(() => textoPedidoWhatsapp(pedido), [pedido]);
  const datos = useMemo(
    () =>
      numeroWhatsapp && items.length > 0
        ? datosImagenCheckout(pedido, { colorAcento: resolverColorCss("var(--color-primary)"), logo })
        : null,
    [numeroWhatsapp, items.length, pedido, logo],
  );

  const alEnviar = (r: ResultadoEnvio) => {
    if (r.via === "cancelado") return;
    markOrderPending();
    window.dispatchEvent(
      new CustomEvent("buleje:orderCreated", {
        detail: { orderId: `WA-${Date.now().toString(36).toUpperCase()}`, customerName: nombre || undefined },
      }),
    );
    reloj.current = window.setTimeout(() => openConfirmModal(), PAUSA_CONFIRMAR_MS);
  };

  if (!numeroWhatsapp) return null;

  return (
    <div
      className="rounded-2xl border border-[var(--data-success-500)]/40 bg-[var(--surface-raised)] p-4 space-y-3"
      data-testid="carrito-whatsapp-kit"
    >
      <p className="text-sm font-bold text-[var(--text-primary)]">
        Así le llega a {nombreNegocio}
        {config.pedidoComoImagen ? " (con foto del pedido)" : ""}
      </p>
      <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2.5 text-sm leading-relaxed text-[var(--text-secondary)]">
        {texto}
      </div>
      <BotonPedidoWhatsapp
        datos={datos}
        comoImagen={config.pedidoComoImagen}
        texto={texto}
        numero={numeroWhatsapp}
        nombreArchivo="pedido.png"
        onEnviado={alEnviar}
        className="bg-primary text-white hover:bg-primary-dark transition-colors"
        claseAviso="text-center text-[var(--text-secondary)]"
        claseEnlace="text-[var(--accent-ink)] dark:text-[var(--accent)]"
      />
      <button
        type="button"
        onClick={onEditar}
        className="h-12 w-full rounded-xl border border-[var(--rule-base)] text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
      >
        ← Editar el carrito
      </button>
    </div>
  );
}
