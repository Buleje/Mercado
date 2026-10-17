"use client";

/**
 * El checkout de la tienda montado en la portada. Lo baja `ProveedorTienda`
 * al tocar «Finalizar compra» (trozo aparte: la portada no lo carga de entrada).
 *
 * · Los proveedores de la tienda SIN otro carrito (`sinCarrito`): usa el de la
 *   bolsa, así el pedido vacía la misma bolsa y no hay dos carritos peleando.
 * · El checkout de siempre y los modales del pedido (confirmación, estado del
 *   pedido, éxito), los mismos que monta el layout de la tienda.
 * · En un portal al `<body>` con el marco del salón (`data-marco` + `CSS_GLOBAL`),
 *   igual que en el catálogo: dentro de `[data-pagina]` el acento en oscuro es
 *   rosa claro y los botones con texto blanco no se leerían.
 * · El cliente llega prellenado: el checkout lee al cliente UNA vez, al abrirse
 *   (`useCheckoutInit`), así que se abre recién cuando la cuenta ya se leyó
 *   (guardado del navegador o la sesión de `/api/auth/customer/me`).
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
import type { PropsCheckoutEnPortada } from "./ProveedorTienda";
import { CSS_GLOBAL, ID_PAGINA } from "./tema";

/** Sin cuenta leída todavía: el cliente llega en una transición; un respiro antes de abrir sin él. */
const RESPIRO_MS = 150;
/** Si la sesión no responde, se abre igual (sin prellenar) en vez de dejar esperando. */
const TOPE_MS = 2500;

export function CheckoutEnPortada({ slug, pedido, alAbrir }: PropsCheckoutEnPortada) {
  return createPortal(
    <div data-marco={ID_PAGINA} className="contents">
      <style dangerouslySetInnerHTML={{ __html: CSS_GLOBAL }} />
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
      </StoreProviders>
    </div>,
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
