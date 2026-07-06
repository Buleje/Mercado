"use client";

/**
 * /checkout/confirmar — Step 4: confirmación final.
 *
 * Hero editorial + 4 review cards en grid + place-order sticky CTA.
 * Al confirmar, POST por tienda (Promise.allSettled) → redirect a gracias
 * o result screen (éxito / parcial / error).
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  AlertCircle,
  MapPin,
  Wallet,
  Banknote,
  Smartphone,
  User,
  ShoppingBag,
  UserCircle,
  Tag,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  Eye,
  Pencil,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
import { useCheckoutData } from "@/hooks/use-checkout-data";
import { useCustomer, isCustomerProfileComplete, type Customer } from "@/contexts/customer-context";
import { csrfHeaders } from "@/lib/csrf-client";
import { AuthModal, useAuthModal } from "@/components/auth/AuthModal";
import { useRegisterCheckoutSummary } from "@/contexts/checkout-summary-context";
import CheckoutUpsell from "@/components/marketplace/checkout/CheckoutUpsell";
import CheckoutStepHeader from "@/components/marketplace/checkout/CheckoutStepHeader";
import CheckoutCouponFields from "@/components/marketplace/checkout/CheckoutCouponFields";
import OrderDetailsModal from "@/components/marketplace/checkout/OrderDetailsModal";
import CheckoutEditModal from "@/components/marketplace/checkout/CheckoutEditModal";
import PaicheSuccessToast from "@/components/marketplace/checkout/PaicheSuccessToast";
import { CheckoutTransitionOverlay } from "@/components/marketplace/checkout/CheckoutTransitionOverlay";
import OrderSummaryCard from "@/components/ui-system/OrderSummaryCard";
import { PaicheMascot } from "@/components/ui-system/illustrations";
import { setLastOrder } from "@/components/marketplace/RepetirUltimoPedido";
import { incrementOrderCount } from "@/components/marketplace/ClienteFrecuenteBadge";
import TierDiscountBanner from "@/components/marketplace/TierDiscountBanner";
import { useSavedAddresses } from "@/hooks/use-saved-addresses";

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

type PerStoreResult = {
  storeName: string;
  storeSlug: string;
  success: boolean;
  orderId?: string | number;
  error?: string;
  /** Código de error del backend para distinguir 409/422 y guiar al cliente. */
  errorCode?: string;
  /** Producto que falló stock (para mostrar CTA "Ajustar X en mi carrito"). */
  errorProductName?: string;
  /** Stock disponible en el momento del fallo. */
  errorAvailable?: number | null;
};

export default function CheckoutConfirmarPage() {
  const router = useRouter();
  const { byStore, totalByStore, itemCount, grandTotal, clearStore, hydrated: cartHydrated } = useMarketplaceCart();
  const {
    customer,
    address,
    payment,
    setPayment,
    coupons,
    setCouponForStore,
    loyalty,
    paymentProofs,
    isCustomerValid,
    isAddressValid,
    couponDiscountTotal,
    loyaltyDiscountTotal,
    reset,
    hydrated,
  } = useCheckoutData();
  const { customer: loggedCustomer, register: registerCustomer } = useCustomer();
  const { saveAddress: persistAddress } = useSavedAddresses();
  const { authModalOpen, openAuthModal, closeAuthModal } = useAuthModal();
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<PerStoreResult[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [guestMode, setGuestMode] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Editar datos/entrega en un modal in-place (Brandon 2026-07-06) — sin redirigir.
  const [editMode, setEditMode] = useState<"datos" | "entrega" | null>(null);
  const [toastOpen, setToastOpen] = useState(false);
  const [toastData, setToastData] = useState<{ title: string; subtitle: string } | null>(null);
  // Cupón editable acá también: el flujo rápido (perfil completo) salta
  // /entrega, así que confirmar es el único lugar universal para aplicarlo.
  const [couponsOpen, setCouponsOpen] = useState(false);

  // Brandon mayo 15 v4 (audit QA #1): reemplazado `setTimeout(250ms)` por
  // los flags reales `hydrated` de ambos hooks. En redes lentas el cart no
  // hidrataba a tiempo y el guard expulsaba al cliente mid-flow.
  const cartReady = cartHydrated && hydrated;

  // Brandon 2026-06-08: SIN método de pago por defecto — el cliente debe elegir
  // explícitamente uno en el selector (Efectivo/Yape/Plin) antes de confirmar. El
  // botón "Confirmar pedido" queda deshabilitado mientras no haya elección.
  const needsPaymentChoice = payment.method === "";

  useEffect(() => {
    if (!cartReady) return;
    // CRÍTICO: si ya hay resultados (pedido confirmado), NO redirigir. El
    // flow de success se encarga del redirect a /tiendas. Sin este guard,
    // tras confirmar el reset() vacía customer/address y los redirects
    // de "datos faltantes" disparaban un loop /confirmar → /datos.
    if (results.length > 0 || submitting) return;
    if (itemCount === 0) router.replace("/marketplace/carrito");
    else if (!isCustomerValid) router.replace("/checkout/entrega");
    else if (!isAddressValid) router.replace("/checkout/entrega");
  }, [
    cartReady, itemCount, isCustomerValid, isAddressValid,
    router, results.length, submitting,
  ]);

  // Prefetch destino post-compra
  useEffect(() => {
    router.prefetch("/tiendas");
  }, [router]);

  // Checkout invitado (Brandon 2026-05-30): si el cliente llegó con datos
  // válidos sin loguearse (vino del form de invitado en /datos), activamos
  // guestMode automáticamente — no le pedimos elegir "login o invitado" otra
  // vez. El login sigue disponible en el banner si querés cuenta.
  useEffect(() => {
    if (!loggedCustomer && isCustomerValid) setGuestMode(true);
  }, [loggedCustomer, isCustomerValid]);

  const storeIds = Object.keys(byStore);

   
  const handleConfirm = useCallback(async () => {
    if (storeIds.length === 0) return;
    // Defensa: sin método de pago elegido no se envía (el botón ya está
    // deshabilitado, esto cubre cualquier camino alterno). Brandon 2026-06-08.
    if (payment.method === "") {
      setErrorMsg("Elegí un método de pago para confirmar tu pedido.");
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);

    try {
      localStorage.setItem(
        "marketplace-customer-info",
        JSON.stringify({
          name: customer.name.trim(),
          phone: customer.phone.trim(),
          address: address.address.trim(),
        }),
      );
    } catch {
      /* silent */
    }

    const settled = await Promise.allSettled(
      storeIds.map((sid, idx) => {
        const g = byStore[sid];
        const couponEntry = coupons[g.storeSlug];
        const redeemForThisStore = idx === 0 ? loyalty.redeemPoints || 0 : 0;
        const storeProof = paymentProofs[g.storeSlug];
        const storeSubtotal = totalByStore[sid]?.total ?? 0;
        // PENTEST 2026-05-18 Fase 1 CRIT #1: amountPEN debe descontar
        // los descuentos que el cliente CONOCE (cupón + loyalty redeem) ANTES
        // de firmar el proof token. El tier discount es server-side (calculado
        // dentro de createFromCart) — el cliente no lo sabe, así que el server
        // permite que amountPEN sea >= order.total (sobre-pago por tier OK).
        // Antes: amountPEN = subtotal bruto → PENTEST-001 cancelaba TODA orden
        // con cupón/loyalty porque order.total < subtotal.
        const couponDiscountForStore = typeof couponEntry?.discount === "number" ? couponEntry.discount : 0;
        const loyaltyDiscountForStore = idx === 0 ? loyaltyDiscountTotal : 0;
        const proofAmount = Math.max(
          0,
          storeSubtotal - couponDiscountForStore - loyaltyDiscountForStore,
        );
        const requestBody = {
          storeSlug: g.storeSlug,
          customerName: customer.name.trim(),
          customerPhone: customer.phone.trim(),
          customerAddress: address.address.trim(),
          notes: address.notes.trim() || undefined,
          paymentMethod: payment.method,
          couponCode: couponEntry?.code,
          loyaltyRedeemPoints: redeemForThisStore || undefined,
          items: g.items.map((i) => ({
            storeProductId: i.storeProductId,
            productId: i.productId,
            name: i.name,
            quantity: i.quantity,
            retailPrice: i.price,
            unit: i.unit ?? "unidad",
          })),
          ...(storeProof
            ? {
                paymentProof: {
                  proofUrl: storeProof.proofUrl,
                  proofToken: storeProof.proofToken,
                  reference: storeProof.reference,
                  // CRIT #1: subtotal - cupón - loyalty (descuentos client-side).
                  // El server tolera tier extra via PENTEST-001 ajustado.
                  amountPEN: proofAmount,
                },
              }
            : {}),
        };
        return fetch("/api/marketplace/orders", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(requestBody),
        }).then(async (r) => {
          if (!r.ok) {
            const data = await r.json().catch(() => ({}));
            // 🔍 Logs de diagnóstico — strings JSON inline para que Chrome los
            // muestre completos sin tener que expandir objetos.
            const bodyStr = JSON.stringify(requestBody);
            const respStr = JSON.stringify(data);
             
            console.error(
              `[orders ${r.status}] storeSlug="${g.storeSlug}"\n  sentBody = ${bodyStr}\n  serverResponse = ${respStr}`,
            );
             
            console.error("[orders] sentBody object:", requestBody);
             
            console.error("[orders] server response object:", data);
            const detail: string =
              typeof data?.message === "string"
                ? data.message
                : typeof data?.error === "string"
                  ? data.error
                  : typeof data?.error?.message === "string"
                    ? data.error.message
                    : `Error ${r.status}`;
            // Adjuntar metadata estructurada (code/productName/available)
            // al Error para que la UI pueda mostrar un mensaje accionable.
            const errWithMeta = new Error(detail) as Error & {
              code?: string;
              productName?: string | null;
              available?: number | null;
            };
            errWithMeta.code = typeof data?.code === "string" ? data.code : undefined;
            errWithMeta.productName = typeof data?.productName === "string" ? data.productName : null;
            errWithMeta.available = typeof data?.available === "number" ? data.available : null;
            throw errWithMeta;
          }
          return r.json();
        });
      }),
    );

    const next: PerStoreResult[] = storeIds.map((sid, idx) => {
      const g = byStore[sid];
      const r = settled[idx];
      if (r.status === "fulfilled") {
        // El server responde { data: { orderId, ... } } o (legacy) { id, ... }.
        // Soportamos ambos formatos.
        const v = r.value as
          | { data?: { orderId?: string | number; id?: string | number } }
          | { id?: string | number; orderId?: string | number }
          | null
          | undefined;
        const orderId =
          (v && "data" in v && v.data
            ? v.data.orderId ?? v.data.id
            : undefined) ??
          (v && "orderId" in v ? v.orderId : undefined) ??
          (v && "id" in v ? v.id : undefined);
        return { storeName: g.storeName, storeSlug: g.storeSlug, success: true, orderId };
      }
      const reason = r.reason as (Error & {
        code?: string;
        productName?: string | null;
        available?: number | null;
      }) | undefined;
      const message = reason instanceof Error ? reason.message : "Error desconocido";
      return {
        storeName: g.storeName,
        storeSlug: g.storeSlug,
        success: false,
        error: message,
        errorCode: reason?.code,
        errorProductName: reason?.productName ?? undefined,
        errorAvailable: reason?.available ?? null,
      };
    });
    setResults(next);

    for (const r of next) {
      if (!r.success) continue;
      const sid = storeIds.find((id) => byStore[id]?.storeSlug === r.storeSlug);
      if (sid) clearStore(sid);
    }

    const failed = next.filter((r) => !r.success);
    const succeeded = next.filter((r) => r.success);

    // ── Activar features de marca: lastOrder + tier counter ──
    // El primer pedido exitoso queda como "último pedido" para el hero
    // de /tiendas. Cada pedido exitoso suma al contador de tier.
    if (succeeded.length > 0) {
      const firstSuccess = succeeded[0];
      const sid = storeIds.find(
        (id) => byStore[id]?.storeSlug === firstSuccess.storeSlug,
      );
      const group = sid ? byStore[sid] : null;
      if (group && firstSuccess.orderId !== undefined) {
        setLastOrder({
          orderId: String(firstSuccess.orderId),
          storeId: sid,
          storeSlug: group.storeSlug,
          storeName: group.storeName,
          total: totalByStore[sid!]?.total ?? 0,
          itemsCount: group.items.reduce((s, i) => s + i.quantity, 0),
          // Snapshot completo de items — REQUERIDO para que el modal de
          // "Repetir tu compra" en /tiendas pueda mostrar la lista marcable.
          // Sin esto, RepetirUltimoPedido cae al Link fallback y nunca abre
          // el modal. Brandon, mayo 14 2026.
          items: group.items.map((i) => ({
            productId: i.productId,
            storeProductId: i.storeProductId,
            name: i.name,
            imageUrl: i.image ?? null,
            unit: i.unit ?? null,
            price: i.price,
            quantity: i.quantity,
            category: i.category ?? null,
          })),
          ts: Date.now(),
        });
      }
      // Sumar 1 por cada tienda exitosa (cada POST /orders es un pedido)
      for (let i = 0; i < succeeded.length; i++) {
        incrementOrderCount();
      }
    }

    if (succeeded.length > 0) {
      const fullProfile: Customer = {
        name: customer.name.trim(),
        phone: customer.phone.trim(),
        email: customer.email.trim() || undefined,
        location: address.address.trim(),
        reference: address.notes.trim(),
        addressLine: address.address.trim(),
        departmentCode: address.departmentCode || undefined,
        departmentName: address.departmentName || undefined,
        provinceCode: address.provinceCode || undefined,
        provinceName: address.provinceName || undefined,
        districtCode: address.districtCode || undefined,
        districtName: address.districtName || undefined,
        ...(loggedCustomer?.dni ? { dni: loggedCustomer.dni } : {}),
        ...(loggedCustomer?.birthday ? { birthday: loggedCustomer.birthday } : {}),
        ...(loggedCustomer?.locations ? { locations: loggedCustomer.locations } : {}),
        ...(loggedCustomer?.activeLocationId
          ? { activeLocationId: loggedCustomer.activeLocationId }
          : {}),
      };
      registerCustomer(fullProfile);

      // Guardar la dirección en la lista para futuros pedidos
      if (address.address?.trim()) {
        persistAddress({
          address: address.address.trim(),
          notes: address.notes?.trim() ?? "",
          departmentCode: address.departmentCode ?? "",
          departmentName: address.departmentName ?? "",
          provinceCode: address.provinceCode ?? "",
          provinceName: address.provinceName ?? "",
          districtCode: address.districtCode ?? "",
          districtName: address.districtName ?? "",
          zone: address.zone ?? "",
        });
      }
    }

    if (failed.length === 0) {
      // NO llamar reset() aquí: vacía customer/address y dispara el useEffect
      // de redirect que mandaba al usuario de vuelta a /datos. El reset se
      // hace tras el redirect a /tiendas (más abajo, dentro del setTimeout).
      const first = succeeded[0];
      // Toast paiche de celebración + redirect a /marketplace/tiendas
      // (preferencia del dueño: tras la compra, mantener al cliente
      // explorando otras tiendas en lugar de ir a la página de "gracias").
      const storeCount = succeeded.length;
      setToastData({
        title: storeCount === 1 ? "¡Pedido realizado!" : `¡${storeCount} pedidos realizados!`,
        subtitle:
          storeCount === 1
            ? "Tu bodega te contacta por WhatsApp en minutos. Sigue explorando."
            : `Cada una de las ${storeCount} tiendas te contacta por WhatsApp. Sigue explorando.`,
      });
      // Guardamos snapshot completo del pedido para el modal de éxito que se
      // abrirá automáticamente en /tiendas (y luego desde el badge del nav).
      // Si por alguna razón el server no devolvió orderId, igual guardamos el
      // snapshot para que el modal aparezca — el usuario hizo la compra.
      if (succeeded.length > 0 && typeof window !== "undefined") {
        try {
          // Snapshot de items del cart (antes del reset que vacía el cart)
          const itemsSnapshot = Object.values(byStore).flatMap((g) =>
            g.items.map((i) => ({
              productId: i.productId,
              name: i.name,
              price: i.price,
              quantity: i.quantity,
              imageUrl: i.image ?? "",
              storeName: g.storeName,
              storeSlug: g.storeSlug,
            })),
          );
          localStorage.setItem(
            "marketplace-last-order",
            JSON.stringify({
              orderIds: succeeded
                .map((s) => s.orderId)
                .filter((id): id is string | number => id !== undefined)
                .map(String),
              ts: Date.now(),
              autoOpen: true, // dispara apertura del modal en /tiendas
              customer: {
                name: customer.name,
                phone: customer.phone,
              },
              address: {
                line: address.address,
                district: address.districtName,
                province: address.provinceName,
                department: address.departmentName,
                notes: address.notes,
              },
              total: grandTotal,
              items: itemsSnapshot,
              storeNames: Array.from(new Set(succeeded.map((s) => s.storeName))),
            }),
          );
          // buleje-last-order (Brandon 2026-07-06): las páginas públicas de
          // pedido (/pedido/[id] y /gracias) prueban propiedad con el teléfono
          // vía este key. Antes NUNCA se escribía → /public daba 404 (tracking)
          // y /gracias caía al endpoint privado (401). Lo persistimos acá.
          if (first.orderId !== undefined && customer.phone) {
            localStorage.setItem(
              "buleje-last-order",
              JSON.stringify({
                orderId: String(first.orderId),
                customerPhone: customer.phone,
                ts: Date.now(),
              }),
            );
          }
        } catch {
          /* silent */
        }
      }
      setToastOpen(true);
      setSubmitting(false);
      // Brandon 2026-05-29 (audit): el cliente necesita su COMPROBANTE y tracking.
      // 1 solo pedido con id → página de gracias (número + seguimiento). Varias
      // tiendas o sin id → /tiendas con el modal de éxito (snapshot localStorage).
      // El reset ocurre DESPUÉS del redirect (sino el useEffect rebota a /datos).
      setTimeout(() => {
        if (succeeded.length === 1 && first.orderId !== undefined) {
          router.replace(`/pedido/${first.orderId}/gracias`);
        } else {
          router.replace("/tiendas");
        }
        window.setTimeout(() => reset(), 300);
      }, 1600);
      return;
    } else if (succeeded.length > 0) {
      setErrorMsg(`${succeeded.length} pedidos enviados, ${failed.length} fallaron. Reintentalos.`);
      setSubmitting(false);
    } else {
      setErrorMsg(`No pudimos enviar tus pedidos: ${failed[0].error}`);
      setSubmitting(false);
    }
  }, [
    storeIds,
    byStore,
    customer,
    address,
    payment,
    coupons,
    loyalty,
    clearStore,
    reset,
    router,
    registerCustomer,
    loggedCustomer,
    persistAddress,
  ]);

  // Riel de resumen persistente — lo dibuja el layout (CheckoutShell). Se
  // registra antes de cualquier early-return (result screen / carrito vacío).
  useRegisterCheckoutSummary({
    ctaLabel: submitting
      ? "Procesando..."
      : needsPaymentChoice
        ? "Elegí cómo pagás"
        : "Confirmar pedido",
    onCtaClick: handleConfirm,
    ctaDisabled: submitting || needsPaymentChoice,
    ctaLoading: submitting,
    showItems: true,
    couponDiscount: couponDiscountTotal,
    loyaltyDiscount: loyaltyDiscountTotal,
    helperText: needsPaymentChoice
      ? "Elegí un método de pago para confirmar"
      : "Al confirmar aceptás que cada bodega te contacte por WhatsApp",
    mobileTotal: Math.max(0, grandTotal - couponDiscountTotal - loyaltyDiscountTotal),
    mobileCtaLabel: submitting
      ? "Procesando tu pedido..."
      : needsPaymentChoice
        ? "Elegí cómo pagás"
        : "Confirmar pedido",
  });

  // ── Result screen editorial ─────────────────────────────────────
  if (results.length > 0) {
    const succeeded = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);
    const allOk = succeeded.length === results.length;
    const allFail = succeeded.length === 0;

    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-6 sm:p-10 text-center space-y-6">
          <div className="flex justify-center">
            {allOk ? (
              <div className="text-[var(--accent)]">
                <PaicheMascot size={140} animated />
              </div>
            ) : allFail ? (
              <span className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-[var(--data-error-50)] text-[var(--data-error-500)]">
                <AlertCircle className="h-10 w-10" strokeWidth={1.5} />
              </span>
            ) : (
              <span className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                <CheckCircle2 className="h-10 w-10" strokeWidth={1.5} />
              </span>
            )}
          </div>

          <div className="relative">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-3">
              {allOk ? "Pedido confirmado" : allFail ? "Algo falló" : "Parcialmente enviado"}
            </p>
            <h1 className="text-[clamp(1.75rem,4vw,3rem)] font-bold tracking-[-0.035em] text-[var(--text-primary)] leading-[0.95]">
              {allOk ? (
                <>
                  ¡Listo,
                  <br />
                  <span className="text-[var(--accent)]">
                    gracias por comprar!
                  </span>
                </>
              ) : allFail ? (
                <>
                  No pudimos enviar
                  <br />
                  <span className="text-[var(--data-error-500)]">tu pedido.</span>
                </>
              ) : (
                <>
                  Pedido
                  <br />
                  <span className="text-[var(--accent)]">a medias.</span>
                </>
              )}
            </h1>
            {errorMsg && (
              <p className="mt-4 text-[length:var(--ts-sm)] text-[var(--data-error-500)]">{errorMsg}</p>
            )}
          </div>

          <ul className="relative space-y-2 text-left max-w-xl mx-auto">
            {results.map((r, i) => (
              <li
                key={i}
                className={cn(
                  "rounded-2xl border px-5 py-4 flex items-start gap-3",
                  r.success
                    ? "border-[var(--accent)]/30 bg-[var(--accent-soft)]"
                    : "border-[var(--data-error-500)]/30 bg-[var(--data-error-50)]",
                )}
              >
                {r.success ? (
                  <CheckCircle2
                    className="h-5 w-5 text-[var(--accent)] mt-0.5 shrink-0"
                    strokeWidth={2.25}
                  />
                ) : (
                  <AlertCircle
                    className="h-5 w-5 text-[var(--data-error-500)] mt-0.5 shrink-0"
                    strokeWidth={2.25}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[length:var(--ts-sm)] font-bold text-[var(--text-primary)]">
                    {r.storeName}
                  </p>
                  {r.error && r.errorCode === "STOCK_INSUFFICIENT" ? (
                    <div className="mt-1 space-y-2">
                      <p className="text-[length:var(--ts-xs)] text-[var(--text-secondary)] leading-relaxed">
                        Sin stock para{" "}
                        <strong className="text-[var(--text-primary)]">
                          {r.errorProductName ?? "uno de los productos"}
                        </strong>
                        {typeof r.errorAvailable === "number" && r.errorAvailable >= 0 && (
                          <>
                            {" "}— quedan{" "}
                            <strong className="tabular-nums text-[var(--data-warning-500,#ff6b5b)]">
                              {r.errorAvailable}
                            </strong>
                            .
                          </>
                        )}{" "}
                        Volvé al carrito a ajustar la cantidad y reintentá.
                      </p>
                      <Link
                        href="/marketplace/carrito"
                        className="inline-flex items-center gap-1.5 text-[length:var(--ts-xs)] font-bold text-[var(--accent)] hover:underline"
                      >
                        <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                        Ajustar mi carrito
                      </Link>
                    </div>
                  ) : r.error ? (
                    <p className="text-[length:var(--ts-xs)] text-[var(--text-secondary)] mt-0.5">
                      {r.error}
                    </p>
                  ) : null}
                  {r.success && r.orderId && (
                    <Link
                      href={`/pedido/${r.orderId}/gracias`}
                      className="inline-flex items-center gap-1 mt-1 text-[length:var(--ts-xs)] text-[var(--accent)] font-bold hover:gap-2 transition-all"
                    >
                      Ver pedido #{r.orderId}
                      <ArrowRight className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <div className="relative pt-2 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/tiendas"
              className="inline-flex items-center justify-center rounded-full border border-[var(--rule-base)] px-6 h-11 text-[length:var(--ts-sm)] font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
            >
              Volver a tiendas
            </Link>
            {failed.length > 0 && (
              <button
                type="button"
                onClick={() => setResults([])}
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-6 h-11 text-[length:var(--ts-sm)] font-bold text-white hover:opacity-90 transition-opacity"
              >
                Reintentar
                <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (itemCount === 0) return null;

  const showAuthBanner = !loggedCustomer && !guestMode;
  const couponEntries = Object.entries(coupons);
  // Todos los productos aplanados (cross-store) para la fila Temu de la sección
  // de pedido. Brandon 2026-06-08.
  const allItems = storeIds.flatMap((sid) => byStore[sid].items);

  // Flujo rápido (logueado con dirección guardada): solo carrito → finalizar, así
  // que el "atrás" vuelve al carrito (no a entrega, que es sub-edición). Coincide
  // con el stepper de 2 pasos. Brandon 2026-06-08.
  const fastFlow = isCustomerProfileComplete(loggedCustomer);

  return (
    <>
      {/* Header compartido (Brandon 2026-06-01): mismo formato que datos y
          entrega — back link + h1 + subtítulo, tamaños y padding unificados. */}
      <CheckoutStepHeader
        backHref={fastFlow ? "/marketplace/carrito" : "/checkout/entrega"}
        backLabel={fastFlow ? "Volver al carrito" : "Volver a entrega"}
        title="Revisá tu pedido"
        lead="Último paso."
        subtitle="Verificá que todo esté bien antes de confirmar."
      />

      <div className="space-y-4 sm:space-y-5">
          {/* Auth gate v2 — Brandon 2026-05-18: compactado.
              Antes: aside con padding p-5/p-6 + iframe italic font-serif
              + descripción larga + 2 botones — competía con el CTA primario
              "Confirmar pedido" del summary. Ocupaba ~180px de altura.
              Ahora: row horizontal h-auto compacta con icono + texto corto
              + chip "Iniciar sesión" + "Invitado" como text link sutil. */}
          {showAuthBanner && (
            <aside
              aria-label="Iniciar sesión para rastrear pedidos"
              className="rounded-2xl border border-[var(--accent)]/25 bg-[var(--accent-soft)]/40 p-3.5 sm:p-4 flex items-center gap-3"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)] text-white shrink-0">
                <UserCircle className="h-5 w-5" strokeWidth={2.25} aria-hidden />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[length:var(--ts-sm)] font-extrabold text-[var(--text-primary)] leading-tight">
                  ¿Tracking + puntos por este pedido?
                </p>
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)] leading-tight mt-0.5">
                  Iniciá sesión o continuá como invitado.
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={openAuthModal}
                  className="inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-3.5 h-9 text-[length:var(--ts-xs)] font-extrabold text-white hover:bg-[var(--accent)]/90 active:scale-95 transition-all shadow-sm"
                >
                  Iniciar sesión
                </button>
                <button
                  type="button"
                  onClick={() => setGuestMode(true)}
                  className="text-[length:var(--ts-xs)] font-bold text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors px-1.5"
                >
                  Invitado
                </button>
              </div>
            </aside>
          )}

          {/* Banner de descuento por tier (Cliente Frecuente / VIP / Embajador) */}
          <div className="empty:hidden">
            <TierDiscountBanner
              customerPhone={customer.phone}
              total={grandTotal}
            />
          </div>

          {/* Grid de review cards — Brandon 2026-06-08: solo Datos y Entrega.
              "Pago" y "Pedido" se movieron a la sección Temu de abajo (fila de
              productos + selector de pago). En sm+ van lado a lado. */}
          <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
            <ReviewCard
              kicker="Datos"
              title="Quién recibe"
              icon={User}
              onEdit={() => setEditMode("datos")}
              className="col-span-2 sm:col-span-1"
            >
              <dl className="space-y-1.5 text-[length:var(--ts-sm)]">
                <Row label="Nombre" value={customer.name} />
                <Row label="Teléfono" value={customer.phone} />
                {customer.email && <Row label="Email" value={customer.email} />}
              </dl>
            </ReviewCard>

            <ReviewCard
              kicker="Entrega"
              title="Dónde te llega"
              icon={MapPin}
              onEdit={() => setEditMode("entrega")}
              className="col-span-2 sm:col-span-1"
            >
              <dl className="space-y-1.5 text-[length:var(--ts-sm)]">
                <Row label="Dirección" value={address.address} />
                {address.zone && <Row label="Zona" value={address.zone} />}
                {address.notes && <Row label="Notas" value={address.notes} />}
              </dl>
            </ReviewCard>

          </div>

          {/* Cupón de descuento — EDITABLE acá (no solo lectura). El flujo
              rápido salta /entrega, así que este es el único lugar universal
              donde el cliente puede aplicar/quitar su cupón. El descuento lo
              re-valida el backend al crear la orden (anti-fraude). */}
          {couponEntries.length > 0 || couponsOpen ? (
            <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4 sm:p-5 space-y-3">
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] shrink-0"
                >
                  <Tag className="h-4 w-4" strokeWidth={2.25} />
                </span>
                <div>
                  <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] leading-tight">
                    Descuentos
                  </p>
                  <h3 className="text-base font-bold tracking-[var(--ls-tight)] text-[var(--text-primary)] leading-tight">
                    ¿Tienes un cupón?
                  </h3>
                </div>
              </div>
              <CheckoutCouponFields
                byStore={byStore}
                coupons={coupons}
                setCouponForStore={setCouponForStore}
                totalByStore={totalByStore}
              />
            </section>
          ) : (
            <button
              type="button"
              onClick={() => setCouponsOpen(true)}
              className="inline-flex items-center gap-2 self-start rounded-full border border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 h-11 text-base font-bold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
            >
              <Tag className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              <span>¿Tienes un cupón? Agrégalo</span>
              <span className="text-[var(--accent)] font-extrabold" aria-hidden>
                +
              </span>
            </button>
          )}

          {/* Loyalty canjeado */}
          {loyalty.redeemPoints > 0 && (
            <ReviewCard
              kicker="Puntos Buleje"
              title="Canjeás puntos"
              icon={Sparkles}
              editHref="/checkout/entrega"
              wide
            >
              <div className="flex justify-between items-baseline text-[length:var(--ts-sm)]">
                <span className="text-[var(--text-secondary)]">
                  <strong className="text-[var(--text-primary)] tabular-nums font-bold">
                    {loyalty.redeemPoints}
                  </strong>{" "}
                  puntos
                </span>
                <span className="text-[var(--accent)] font-bold tabular-nums">
                  −{fmt(loyaltyDiscountTotal)}
                </span>
              </div>
            </ReviewCard>
          )}

          {/* Productos (estilo Temu) + método de pago — Brandon 2026-06-08:
              fila horizontal de cards (imagen arriba, precio abajo) y debajo el
              selector de pago. Reemplaza las cards "Pago"/"Pedido" + el detalle
              en lista. */}
          <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4 sm:p-6 space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="inline-flex items-center gap-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
                  <span
                    aria-hidden
                    className="inline-flex h-[3px] w-6 rounded-full bg-[var(--accent)]"
                  />
                  <ShoppingBag className="h-3 w-3" strokeWidth={2} aria-hidden />
                  Tu pedido
                </p>
                <h2 className="text-base sm:text-lg font-bold tracking-[var(--ls-tight)] text-[var(--text-primary)]">
                  {itemCount} {itemCount === 1 ? "producto" : "productos"} ·{" "}
                  <span className="tabular-nums">{fmt(grandTotal)}</span>
                </h2>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setDetailsOpen(true)}
                  aria-label="Ver detalle del pedido"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--accent)] hover:bg-[var(--accent-soft)] transition-colors"
                >
                  <Eye className="h-4 w-4" strokeWidth={2} aria-hidden />
                </button>
                <Link
                  href="/marketplace/carrito"
                  className="inline-flex items-center rounded-full bg-[var(--surface-sunken)] px-4 h-9 text-[length:var(--ts-xs)] font-bold text-[var(--accent)] hover:bg-[var(--accent-soft)] transition-colors"
                >
                  Editar
                </Link>
              </div>
            </div>

            {/* Fila de productos — imagen arriba, precio abajo. UNA sola fila con
                scroll horizontal si hay muchos (estilo Temu). */}
            <ul className="flex gap-3 overflow-x-auto -mx-1 px-1 pb-1 snap-x snap-mandatory scrollbar-none">
              {allItems.map((it, idx) => (
                <li
                  key={`${it.storeId}-${it.productId}-${idx}`}
                  className="snap-start shrink-0 w-[104px] sm:w-[116px]"
                >
                  <div className="relative aspect-square overflow-hidden rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)]">
                    {it.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={it.image}
                        alt={it.name}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-[var(--text-tertiary)]">
                        <ShoppingBag className="h-7 w-7" strokeWidth={1.5} aria-hidden />
                      </span>
                    )}
                    <span className="absolute top-1.5 right-1.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--text-primary)]/85 px-1.5 text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--surface-canvas)] backdrop-blur-sm">
                      ×{it.quantity}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[length:var(--ts-sm)] font-bold tabular-nums leading-tight text-[var(--text-primary)]">
                    {fmt(it.price * it.quantity)}
                  </p>
                  <p className="text-[length:var(--ts-2xs)] leading-tight text-[var(--text-tertiary)] line-clamp-1">
                    {it.name}
                  </p>
                </li>
              ))}
            </ul>

            {/* Método de pago — debajo de la fila de productos. SIN default: el
                cliente elige uno (radio). Badges con color de marca (Yape morado,
                Plin teal, Efectivo verde) + buen contraste. Brandon 2026-06-08. */}
            <div className="border-t border-[var(--rule-soft)] pt-4">
              <p className="inline-flex items-center gap-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-2.5">
                <Wallet className="h-3 w-3" strokeWidth={2} aria-hidden />
                Método de pago
                {needsPaymentChoice && (
                  <span className="normal-case tracking-normal font-bold text-[var(--text-tertiary)]">
                    · elegí uno
                  </span>
                )}
              </p>
              <div role="radiogroup" aria-label="Método de pago" className="grid gap-2 sm:grid-cols-3">
                {([
                  { key: "efectivo", label: "Efectivo", sub: "Pagás al recibir", Icon: Banknote, color: "#16A34A" },
                  { key: "yape", label: "Yape", sub: "Con tu app", Icon: Smartphone, color: "#742284" },
                  { key: "plin", label: "Plin", sub: "Con tu app", Icon: Smartphone, color: "#0E9594" },
                ] as const).map(({ key, label, sub, Icon, color }) => {
                  const active = payment.method === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      aria-label={`Pagar con ${label}`}
                      onClick={() => setPayment({ method: key })}
                      className={cn(
                        "group flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-colors",
                        active
                          ? "bg-[var(--surface-sunken)]"
                          : "border-[var(--rule-base)] bg-[var(--surface-canvas)] hover:border-[var(--text-tertiary)]/40",
                      )}
                      style={active ? { borderColor: color } : undefined}
                    >
                      <span
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white"
                        style={{ backgroundColor: color }}
                      >
                        <Icon className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[length:var(--ts-sm)] font-extrabold leading-tight text-[var(--text-primary)]">
                          {label}
                        </span>
                        <span className="block text-[length:var(--ts-2xs)] leading-tight text-[var(--text-tertiary)]">
                          {sub}
                        </span>
                      </span>
                      {/* Círculo de elección (radio) */}
                      <span
                        aria-hidden
                        className={cn(
                          "relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                          !active && "border-[var(--rule-base)] group-hover:border-[var(--text-tertiary)]",
                        )}
                        style={active ? { borderColor: color } : undefined}
                      >
                        {active && (
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
              {payment.method === "efectivo" && payment.cashAmount && (
                <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] mt-2.5">
                  Llevás{" "}
                  <span className="font-bold tabular-nums text-[var(--text-secondary)]">
                    S/{payment.cashAmount}
                  </span>
                </p>
              )}
              {(payment.method === "yape" || payment.method === "plin") && (
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-2.5 leading-snug">
                  Coordinás el comprobante por WhatsApp al confirmar, o subilo en{" "}
                  <Link href="/checkout/entrega?edit=1" className="font-bold text-[var(--accent)] underline">
                    pago
                  </Link>
                  .
                </p>
              )}
            </div>
          </section>

          {errorMsg && (
            <div className="rounded-2xl border border-[var(--data-error-500)]/30 bg-[var(--data-error-50)] px-5 py-4 text-[length:var(--ts-sm)] text-[var(--data-error-500)] font-semibold">
              {errorMsg}
            </div>
          )}

          {/* Brandon, mayo 14 2026: el CTA mobile vivia inline aca y rompia
              la consistencia con /carrito /datos /entrega (todas usan
              CheckoutMobileCtaBar sticky bottom). Removido — el bar global
              cubre el confirmar abajo. */}
        </div>

        {/* Upsell final — "¿Le sumás algo?" (no tapa el CTA principal) */}
        <CheckoutUpsell />

        <AuthModal open={authModalOpen} onClose={closeAuthModal} />

      {/* Editar datos/entrega en modal in-place (sin redirigir) */}
      {editMode && (
        <CheckoutEditModal mode={editMode} onClose={() => setEditMode(null)} />
      )}

      {/* Modal de detalle del pedido (abierto desde el botón ojo) */}
      <OrderDetailsModal
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        groups={storeIds.map((sid) => ({
          storeId: sid,
          storeName: byStore[sid].storeName,
          storeSlug: byStore[sid].storeSlug,
          items: byStore[sid].items,
        }))}
        totalByStore={totalByStore}
        grandTotal={grandTotal}
      />

      {/* Toast paiche de éxito — aparece tras la compra y antes del redirect */}
      <PaicheSuccessToast
        show={toastOpen}
        title={toastData?.title ?? "¡Pedido realizado!"}
        subtitle={toastData?.subtitle ?? "Gracias por comprar en Buleje."}
        onDismiss={() => setToastOpen(false)}
      />

      {/* Overlay paiche durante el envío del pedido (POST a /api/marketplace/orders) */}
      <CheckoutTransitionOverlay show={submitting} label="Enviando tu pedido" />
    </>
  );
}

// ── Sub-componentes ────────────────────────────────────────────────────────
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] shrink-0 self-center">
        {label}
      </dt>
      <dd className="text-right font-semibold text-[var(--text-primary)] truncate">{value}</dd>
    </div>
  );
}

function ReviewCard({
  kicker,
  title,
  icon: Icon,
  editHref,
  onEdit,
  children,
  wide,
  dense,
  className,
}: {
  kicker: string;
  title: string;
  icon: typeof User;
  /** Navegación (fallback). Preferí `onEdit` para editar en modal sin redirigir. */
  editHref?: string;
  onEdit?: () => void;
  children: React.ReactNode;
  wide?: boolean;
  /** Cards a media columna (Pago/Pedido): icono + lápiz arriba, título a ancho
   *  completo debajo → no envuelve en mobile y queda como "stat card". */
  dense?: boolean;
  className?: string;
}) {
  const editCls =
    "inline-flex items-center justify-center h-7 w-7 sm:h-8 sm:w-8 rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] active:scale-95 transition-all shrink-0";
  const editLink = onEdit ? (
    <button type="button" onClick={onEdit} aria-label={`Editar ${title}`} className={editCls}>
      <Pencil className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
    </button>
  ) : editHref ? (
    <Link href={editHref} aria-label={`Editar ${title}`} className={editCls}>
      <Pencil className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
    </Link>
  ) : null;
  const iconChip = (
    <span
      aria-hidden
      className="inline-flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] shrink-0"
    >
      <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={2.25} />
    </span>
  );
  return (
    <section
      className={cn(
        // Brandon 2026-05-18: card más fina. Antes p-5/p-6 + eyebrow con
        // pseudo-line accent + kicker uppercase. Ahora layout más limpio:
        // icono cuadrado accent + título inline. Edit con ícono lápiz sutil.
        // Brandon 2026-06-01: header más compacto en mobile (icon/pencil h-7).
        "group rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3.5 sm:p-5 transition-all hover:border-[var(--accent)]/40 hover:shadow-sm",
        wide && "col-span-2",
        className,
      )}
    >
      {dense ? (
        <div className="mb-2.5 sm:mb-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            {iconChip}
            {editLink}
          </div>
          <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] leading-tight">
            {kicker}
          </p>
          <h3 className="text-[length:var(--ts-sm)] sm:text-base font-bold tracking-[var(--ls-tight)] text-[var(--text-primary)] leading-tight mt-0.5">
            {title}
          </h3>
        </div>
      ) : (
        <div className="flex items-start justify-between mb-2.5 sm:mb-3 gap-2">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            {iconChip}
            <div className="min-w-0">
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] leading-tight">
                {kicker}
              </p>
              <h3 className="text-[length:var(--ts-sm)] sm:text-base font-bold tracking-[var(--ls-tight)] text-[var(--text-primary)] leading-tight mt-0.5">
                {title}
              </h3>
            </div>
          </div>
          {editLink}
        </div>
      )}
      {children}
    </section>
  );
}
