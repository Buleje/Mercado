"use client";

import { useState, useMemo } from "react";
import { AnimatePresence } from "framer-motion";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import { useCart } from "@/contexts/cart-context";
import { useCustomer } from "@/contexts/customer-context";
import { useSettings } from "@/contexts/settings-context";
import { usePromotions } from "@/contexts/promotions-context";
import type { Customer, SavedLocation } from "@/contexts/customer-context";
import { CheckoutAccountStep, CheckoutSuccessStep } from ".";
import { StepDatos } from "./steps/StepDatos";
import { StepPago } from "./steps/StepPago";
import { StepConfirmar, StepConfirmarFooter } from "./steps/StepConfirmar";
import { MiniCartSummary } from "./parts/MiniCartSummary";
import { CheckoutModalShell } from "./parts/CheckoutModalShell";
import { useCheckoutFlow } from "./checkout-flow-context";
import { useCoupon } from "./hooks/useCoupon";
import { useLoyalty } from "./hooks/useLoyalty";
import { useDescuentoAutomatico } from "./hooks/useDescuentoAutomatico";
import {
  resolveEffectiveValues,
  telefonoDelPedido,
} from "./hooks/checkout-submit-helpers";
import {
  calcularTotalPedido,
  porcentajeDe,
} from "@/lib/pricing/total-pedido";
import { useDniLookup } from "./hooks/useDniLookup";
import { useGeolocation } from "./hooks/useGeolocation";
import { usePhoneSearch } from "./hooks/usePhoneSearch";
import { useStockCheck } from "./hooks/useStockCheck";
import { usePendingOrders } from "./hooks/usePendingOrders";
import { useCheckoutSubmit } from "./hooks/useCheckoutSubmit";
import { useCheckoutHandlers } from "./hooks/useCheckoutHandlers";
import { useCheckoutInit } from "./hooks/useCheckoutInit";
import { validatePhone } from "./parts/phone-validation";
import { getSupabaseBrowser, isSupabaseAuthConfigured } from "@/lib/supabase/client";

/**
 * CheckoutModal — orquestador del wizard de checkout.
 *
 * Reemplaza al monolito anterior de 1333 líneas. La lógica está
 * delegada a hooks (componentes/checkout/hooks/) y los pasos del
 * wizard a componentes/checkout/steps/.
 *
 * Reglas de oro (ver `.github/skills/checkout-flow.instructions.md`):
 *  1. Nunca mutar `submitting` directamente — solo via dispatch.
 *  2. Nunca recalcular totales en cliente — el backend recompone.
 *  3. Tenant awareness: usamos fetch nativo igual que el original;
 *     las APIs de checkout resuelven tenant via cookies y middleware.
 */
export default function CheckoutModal() {
  const {
    items,
    total: cartTotal,
    checkoutOpen,
    closeCheckout,
    clear,
    close: closeCart,
    markOrderPending,
    removeItem,
  } = useCart();
  const { customer, register, findByPhone, openOrderStatusModal } = useCustomer();
  const {
    yape,
    cashEnabled,
    businessName,
    storeTheme,
  } = useSettings();
  const { getBestPromotion } = usePromotions();

  const { state, dispatch, reset } = useCheckoutFlow();
  const phoneSearch = usePhoneSearch({ findByPhone });
  const [editingCustomerData, setEditingCustomerData] = useState(false);
  const [skippedAccount, setSkippedAccount] = useState(false);

  // TECH-DEBT: businessLat/businessLon no están en SettingsCtx aún.
  // Usar coordenadas por defecto de Pucallpa hasta que se agreguen al schema.
  const storeLat = -8.3791;
  const storeLon = -74.5539;

  const effectiveCustomer: Customer | null = phoneSearch.found ?? customer;
  const locations: SavedLocation[] = useMemo(() => {
    if (effectiveCustomer?.locations?.length)
      return effectiveCustomer.locations;
    if (effectiveCustomer?.location)
      return [
        {
          id: "default",
          location: effectiveCustomer.location,
          reference: effectiveCustomer.reference ?? "",
        },
      ];
    return [];
  }, [effectiveCustomer]);

  const promo = getBestPromotion(
    cartTotal,
    state.customer.phone || customer?.phone
  );
  const discount = promo ? porcentajeDe(cartTotal, promo.discountPercent) : 0;

  // Descuento automático (primera compra, volumen, cliente frecuente): lo
  // cotiza el servidor con la misma función que cobra el pedido.
  const autoDescuento = useDescuentoAutomatico({
    telefono: telefonoDelPedido(resolveEffectiveValues(state, effectiveCustomer).phone),
    subtotal: cartTotal,
    unidades: items.reduce((sum, i) => sum + i.quantity, 0),
    activo: checkoutOpen,
  });

  // Vista previa con la fórmula ÚNICA del servidor (lib/pricing/total-pedido).
  // Sin el «tier» de lealtad ni el canje de puntos: el servidor no los cobra
  // y todo pedido con ellos caía en 422. La propina NO entra: se da en mano
  // al repartidor y el pedido no la guarda, así que Yape/Plin/efectivo y el
  // pie cobran solo el total del pedido.
  const totalVistaPrevia = calcularTotalPedido({
    subtotal: cartTotal,
    descuentoCupon: state.coupon.discount,
    descuentoPromo: discount,
    descuentoAutomatico: autoDescuento.descuento?.monto ?? 0,
  });

  // ── Hooks de side effects ───────────────────────────────────────
  const coupon = useCoupon({ state: state.coupon, cartTotal, dispatch });
  const loyalty = useLoyalty(dispatch);
  useDniLookup({ dni: state.customer.dni, dispatch });
  const geo = useGeolocation({ dispatch });
  useStockCheck({ enabled: checkoutOpen, items, dispatch });
  usePendingOrders({
    step: state.step,
    phone: state.customer.phone,
    dispatch,
  });

  const submitter = useCheckoutSubmit({
    state,
    items,
    finalTotal: totalVistaPrevia,
    effectiveCustomer,
    promo,
    discount,
    dispatch,
    cartActions: { clear, closeCart, markOrderPending, removeItem },
    customerActions: { register, openOrderStatusModal },
    closeCheckout,
  });
  // Si un 422 corrigió el total (p. ej. la cotización falló por 429 o red),
  // el resumen muestra el del servidor antes de volver a confirmar.
  const ajuste = submitter.ajusteServidor;
  const descuentoMostrado = ajuste ? ajuste.descuentoAutomatico : autoDescuento.descuento;
  const finalTotal = ajuste?.serverTotal ?? totalVistaPrevia;

  const handlers = useCheckoutHandlers({
    state,
    dispatch,
    storeLat,
    storeLon,
    effectiveCustomer,
    phoneSearch,
    setEditingCustomerData,
    setSkippedAccount,
    fetchLoyaltyPoints: loyalty.fetchPoints,
    fetchReferenceSuggestion: geo.fetchReferenceSuggestion,
    submit: submitter.submit,
  });

  useScrollLock(checkoutOpen);

  useCheckoutInit({
    open: checkoutOpen,
    customer,
    locations,
    storeLat,
    storeLon,
    reset,
    phoneSearch,
    setEditingCustomerData,
    setSkippedAccount,
    fetchLoyaltyPoints: loyalty.fetchPoints,
  });

  if (!checkoutOpen) return null;

  const phoneQueryValidation = validatePhone(phoneSearch.query);
  const showMiniCart =
    (state.step === "cuenta" || state.step === "datos") && items.length > 0;

  const confirmarFooter =
    state.step === "confirmar" ? (
      <StepConfirmarFooter
        submitting={state.ui.submitting}
        submitError={state.ui.submitError}
        finalTotal={finalTotal}
        onBack={() => dispatch({ type: "SET_STEP", step: "pago" })}
        onConfirm={handlers.handleFinalConfirm}
        hasBlockingStockError={state.ui.hasBlockingStockError}
        stockWarnings={state.ui.stockWarnings}
      />
    ) : null;

  return (
    <CheckoutModalShell
      open={checkoutOpen}
      step={state.step}
      itemCount={items.length}
      businessName={businessName}
      storeTheme={storeTheme}
      onClose={closeCheckout}
      topSlot={
        showMiniCart ? (
          <MiniCartSummary items={items} finalTotal={finalTotal} />
        ) : null
      }
      footerSlot={confirmarFooter}
    >
      <AnimatePresence mode="wait">
        {state.step === "cuenta" && (
          <CheckoutAccountStep
            phoneQuery={phoneSearch.query}
            onPhoneQueryChange={(v) => phoneSearch.setQuery(v)}
            phoneQueryValidation={phoneQueryValidation}
            phoneSearching={phoneSearch.searching}
            phoneNotFound={phoneSearch.notFound}
            onPhoneSearch={handlers.handlePhoneSearchSubmit}
            onSkipAccount={handlers.handleSkipAccount}
            onGoogleSignIn={async () => {
              // IGUAL QUE EL MARKETPLACE (Brandon 2026-06-22): Google sign-in vía
              // Supabase OAuth (el mismo flujo que `OAuthButton` usa en /marketplace
              // y el login). Vuelve a la ruta actual; el callback
              // `/api/auth/oauth/callback` crea la sesión de customer (tenant-aware
              // por `x-tenant-id` del middleware, igual que el marketplace).
              const here = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/";
              if (!isSupabaseAuthConfigured()) {
                // Fallback al flujo custom si Supabase no está configurado.
                window.location.href = `/api/auth/google?redirect=${encodeURIComponent(here)}`;
                return;
              }
              const supabase = getSupabaseBrowser();
              const origin = typeof window !== "undefined" ? window.location.origin : "";
              const { error } = await supabase.auth.signInWithOAuth({
                provider: "google",
                options: { redirectTo: `${origin}/api/auth/oauth/callback?next=${encodeURIComponent(here)}` },
              });
              if (error) {
                // Si Supabase falla, degradamos al flujo custom para no dejar al
                // cliente sin opción de continuar con Google.
                window.location.href = `/api/auth/google?redirect=${encodeURIComponent(here)}`;
              }
            }}
          />
        )}

        {state.step === "datos" && (
          <StepDatos
            state={state}
            dispatch={dispatch}
            effectiveCustomer={effectiveCustomer}
            customer={customer}
            foundCustomer={phoneSearch.found}
            skippedAccount={skippedAccount}
            editingCustomerData={editingCustomerData}
            setEditingCustomerData={setEditingCustomerData}
            locations={locations}
            onSelectLocation={handlers.handleSelectLocation}
            onUseNewAddress={handlers.handleUseNewAddress}
            onRequestGeo={geo.requestGeolocation}
            onMapPick={handlers.handleMapPick}
            onSubmit={handlers.handleDataSubmit}
            onBack={() => dispatch({ type: "SET_STEP", step: "cuenta" })}
          />
        )}

        {state.step === "pago" && (
          <StepPago
            state={state}
            dispatch={dispatch}
            items={items}
            finalTotal={finalTotal}
            cartTotal={cartTotal}
            discount={discount}
            promo={promo}
            descuentoAutomatico={descuentoMostrado}
            effectiveCustomer={effectiveCustomer}
            loyaltyPoints={state.loyalty.points}
            yape={yape}
            cashEnabled={cashEnabled}
            onValidateCoupon={coupon.validate}
            onSubmit={handlers.handlePaymentSubmit}
            onBackToDatos={() =>
              dispatch({ type: "SET_STEP", step: "datos" })
            }
          />
        )}

        {state.step === "confirmar" && (
          <StepConfirmar
            state={state}
            items={items}
            finalTotal={finalTotal}
            cartTotal={cartTotal}
            discount={discount}
            descuentoAutomatico={descuentoMostrado}
            effectiveCustomer={effectiveCustomer}
            onEditAddress={() => dispatch({ type: "SET_STEP", step: "datos" })}
          />
        )}

        {state.step === "exito" && (
          <CheckoutSuccessStep
            orderId={state.ui.orderId}
            value={finalTotal}
            onClose={closeCheckout}
          />
        )}
      </AnimatePresence>
    </CheckoutModalShell>
  );
}
