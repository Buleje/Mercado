"use client";

/**
 * El checkout de la tienda montado en la portada (ADR-511). Lo baja
 * `ProveedorCheckout` al tocar «Finalizar compra» (trozo aparte: la portada no
 * lo carga de entrada). Sólo IMPORTA el checkout y los modales del pedido de
 * siempre: nada de la zona de peligro se cambia acá.
 *
 * · Los proveedores de la tienda SIN otro carrito (`sinCarrito`): usa el de la
 *   bolsa, así el pedido vacía la misma bolsa y no hay dos carritos peleando.
 * · El checkout y los modales del pedido (confirmación, estado, éxito), los
 *   mismos que monta el layout en el catálogo y la ficha. En un portal al
 *   `<body>`, fuera de `[data-pagina]`: se ve igual que allá.
 * · El cliente llega prellenado: el checkout lee al cliente UNA vez, al abrirse,
 *   así que se abre recién cuando la cuenta ya se leyó (o a los 2,5 s, sin ella).
 */
import { Suspense, useEffect } from "react";
import { createPortal } from "react-dom";
import CheckoutModal from "@/components/CheckoutModal";
import OrderSuccessModal from "@/components/marketplace/order-success/OrderSuccessModal";
import MotionProvider from "@/components/MotionProvider";
import OrderConfirmModal from "@/components/OrderConfirmModal";
import OrderStatusModalWrapper from "@/components/OrderStatusModalWrapper";
import StoreProviders from "@/components/StoreProviders";
import { useCart } from "@/contexts/cart-context";
import { useCustomer } from "@/contexts/customer-context";
import type { PropsCheckoutEnPortada } from "./BolsaCheckoutPortada";

/** Sin cuenta leída todavía: el cliente llega en una transición; un respiro antes de abrir sin él. */
const RESPIRO_MS = 150;
/** Si la sesión no responde, se abre igual (sin prellenar) en vez de dejar esperando. */
const TOPE_MS = 2500;

export function CheckoutEnPortada({ slug, pedido, alAbrir }: PropsCheckoutEnPortada) {
  return createPortal(
    <StoreProviders tenantSlug={slug} sinCarrito temaDelEditor={false}>
      <MotionProvider>
        <Abridor pedido={pedido} alAbrir={alAbrir} />
        <CheckoutModal />
        <OrderConfirmModal />
        <OrderStatusModalWrapper />
        <Suspense fallback={null}>
          <OrderSuccessModal />
        </Suspense>
      </MotionProvider>
    </StoreProviders>,
    document.body,
  );
}

/** Abre el checkout cuando ya se sabe quién compra (así llega prellenado). */
function Abridor({ pedido, alAbrir }: Pick<PropsCheckoutEnPortada, "pedido" | "alAbrir">) {
  const { openCheckout } = useCart();
  const { hydrated, customer } = useCustomer();

  useEffect(() => {
    if (!pedido) return;
    const abrir = () => {
      openCheckout();
      alAbrir();
    };
    if (hydrated && customer) {
      abrir();
      return;
    }
    const espera = setTimeout(abrir, hydrated ? RESPIRO_MS : TOPE_MS);
    return () => clearTimeout(espera);
  }, [pedido, hydrated, customer, openCheckout, alAbrir]);

  return null;
}
