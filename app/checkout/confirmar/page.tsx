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
  User,
  ShoppingBag,
  UserCircle,
  Tag,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  Eye,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
import { useCheckoutData } from "@/hooks/use-checkout-data";
import { useCustomer, type Customer } from "@/contexts/customer-context";
import { csrfHeaders } from "@/lib/csrf-client";
import { AuthModal, useAuthModal } from "@/components/auth/AuthModal";
import CheckoutSummary from "@/components/marketplace/checkout/CheckoutSummary";
import OrderDetailsModal from "@/components/marketplace/checkout/OrderDetailsModal";
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
  const { byStore, totalByStore, itemCount, grandTotal, clearStore } = useMarketplaceCart();
  const {
    customer,
    address,
    payment,
    coupons,
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
  const [toastOpen, setToastOpen] = useState(false);
  const [toastData, setToastData] = useState<{ title: string; subtitle: string } | null>(null);

  // Espera a que el cart + checkout-data estén hidratados antes de redirigir
  // (fix de la race que mandaba a /datos al avanzar desde /entrega).
  const [cartReady, setCartReady] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setCartReady(true), 250);
    return () => window.clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!cartReady || !hydrated) return;
    // CRÍTICO: si ya hay resultados (pedido confirmado), NO redirigir. El
    // flow de success se encarga del redirect a /tiendas. Sin este guard,
    // tras confirmar el reset() vacía customer/address y los redirects
    // de "datos faltantes" disparaban un loop /confirmar → /datos.
    if (results.length > 0 || submitting) return;
    if (itemCount === 0) router.replace("/marketplace/carrito");
    else if (!isCustomerValid) router.replace("/checkout/datos");
    else if (!isAddressValid) router.replace("/checkout/entrega");
  }, [
    cartReady, hydrated, itemCount, isCustomerValid, isAddressValid,
    router, results.length, submitting,
  ]);

  // Prefetch destino post-compra
  useEffect(() => {
    router.prefetch("/tiendas");
  }, [router]);

  const storeIds = Object.keys(byStore);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- legacy useCallback, ok hasta refactor a React Compiler-only
  const handleConfirm = useCallback(async () => {
    if (storeIds.length === 0) return;
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
                  amountPEN: storeSubtotal,
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
            // eslint-disable-next-line no-console
            console.error(
              `[orders ${r.status}] storeSlug="${g.storeSlug}"\n  sentBody = ${bodyStr}\n  serverResponse = ${respStr}`,
            );
            // eslint-disable-next-line no-console
            console.error("[orders] sentBody object:", requestBody);
            // eslint-disable-next-line no-console
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
          storeSlug: group.storeSlug,
          storeName: group.storeName,
          total: totalByStore[sid!]?.total ?? 0,
          itemsCount: group.items.reduce((s, i) => s + i.quantity, 0),
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
        } catch {
          /* silent */
        }
      }
      setToastOpen(true);
      setSubmitting(false);
      // Redirect a /tiendas (directorio real). Tras 2.8s para que se vea el toast.
      // El reset del checkout-data ocurre DESPUÉS del redirect — si lo hacemos
      // antes, el useEffect de redirect rebotaría a /datos.
      setTimeout(() => {
        router.replace("/tiendas");
        // Pequeño delay extra para asegurar que el unmount de /confirmar ya
        // pasó antes de limpiar customer/address.
        window.setTimeout(() => reset(), 300);
      }, 2800);
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

  // ── Result screen editorial ─────────────────────────────────────
  if (results.length > 0) {
    const succeeded = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);
    const allOk = succeeded.length === results.length;
    const allFail = succeeded.length === 0;

    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-8 sm:p-12 text-center space-y-6">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-20 -right-20 h-[280px] w-[280px] rounded-full bg-[var(--accent)]/[0.06] blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-20 -left-20 h-[240px] w-[240px] rounded-full bg-[var(--accent)]/[0.04] blur-3xl"
          />

          <div className="relative flex justify-center">
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
            <h1 className="text-[clamp(1.75rem,4vw,3rem)] font-black tracking-[-0.035em] text-[var(--text-primary)] leading-[0.95]">
              {allOk ? (
                <>
                  ¡Listo,
                  <br />
                  <span className="italic font-serif text-[var(--accent)]">
                    gracias por comprar!
                  </span>
                </>
              ) : allFail ? (
                <>
                  No pudimos enviar
                  <br />
                  <span className="italic font-serif text-[var(--data-error-500)]">tu pedido.</span>
                </>
              ) : (
                <>
                  Pedido
                  <br />
                  <span className="italic font-serif text-[var(--accent)]">a medias.</span>
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
                            <strong className="tabular-nums text-[var(--data-warning-500,#f97316)]">
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
              href="/marketplace"
              className="inline-flex items-center justify-center rounded-full border border-[var(--rule-base)] px-6 h-11 text-[length:var(--ts-sm)] font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
            >
              Volver al marketplace
            </Link>
            {failed.length > 0 && (
              <button
                type="button"
                onClick={() => setResults([])}
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-6 h-11 text-[length:var(--ts-sm)] font-bold text-white hover:bg-[var(--accent)]/90 hover:gap-3 transition-all shadow-[0_6px_20px_-10px_var(--accent)]"
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

  return (
    <>
      <div className="pt-6 sm:pt-8 pb-6">
        <Link
          href="/checkout/entrega"
          className="inline-flex items-center gap-2 h-11 sm:h-9 px-3.5 sm:px-3 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] hover:-translate-y-0.5 transition-all shadow-sm mb-3"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
          Volver a entrega
        </Link>
        <h1 className="text-2xl sm:text-3xl font-black tracking-[var(--ls-tight)] text-[var(--text-primary)]">
          Revisa tu pedido
        </h1>
        <p className="mt-1 text-[length:var(--ts-sm)] text-[var(--text-tertiary)]">
          Verificá que todo esté bien antes de confirmar.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 sm:gap-8 items-start pb-16">
        <div className="space-y-5">
          {/* Auth gate editorial */}
          {showAuthBanner && (
            <aside
              aria-label="Iniciar sesión para rastrear pedidos"
              className="relative overflow-hidden rounded-2xl border-2 border-[var(--accent)]/30 bg-linear-to-br from-[var(--accent-soft)] via-[var(--accent-soft)] to-[var(--surface-raised)] p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute -top-8 -right-8 h-24 w-24 rounded-full bg-[var(--accent)]/[0.12] blur-2xl"
              />
              <span className="relative inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent-600,var(--accent))] text-white shrink-0">
                <UserCircle className="h-5 w-5" strokeWidth={2} aria-hidden />
              </span>
              <div className="relative flex-1 min-w-0">
                <p className="text-base sm:text-lg font-black tracking-[var(--ls-tight)] text-[var(--text-primary)]">
                  Inicia sesión para{" "}
                  <span className="italic font-serif text-[var(--accent)]">trackearlo.</span>
                </p>
                <p className="mt-1 text-[length:var(--ts-xs)] text-[var(--text-secondary)] leading-snug">
                  Recibe updates por WhatsApp, acumulá puntos Buleje y compra más rápido la próxima.
                </p>
              </div>
              <div className="relative flex flex-col sm:flex-row gap-2 w-full sm:w-auto shrink-0">
                <button
                  type="button"
                  onClick={openAuthModal}
                  className="inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-5 h-10 text-[length:var(--ts-xs)] font-bold text-white hover:bg-[var(--accent)]/90 transition-colors"
                >
                  Iniciar sesión
                </button>
                <button
                  type="button"
                  onClick={() => setGuestMode(true)}
                  className="inline-flex items-center justify-center rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 h-10 text-[length:var(--ts-xs)] font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
                >
                  Invitado
                </button>
              </div>
            </aside>
          )}

          {/* Banner de descuento por tier (Cliente Frecuente / VIP / Embajador) */}
          <div className="mb-4">
            <TierDiscountBanner
              customerPhone={customer.phone}
              total={grandTotal}
            />
          </div>

          {/* Grid de review cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ReviewCard
              kicker="Datos"
              title="Quién recibe"
              icon={User}
              editHref="/checkout/datos"
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
              editHref="/checkout/entrega"
            >
              <dl className="space-y-1.5 text-[length:var(--ts-sm)]">
                <Row label="Dirección" value={address.address} />
                {address.zone && <Row label="Zona" value={address.zone} />}
                {address.notes && <Row label="Notas" value={address.notes} />}
              </dl>
            </ReviewCard>

            <ReviewCard
              kicker="Pago"
              title="Cómo pagás"
              icon={Wallet}
              editHref="/checkout/entrega"
            >
              <p className="text-base sm:text-lg font-black tracking-[var(--ls-tight)] text-[var(--text-primary)] capitalize">
                {payment.method}
              </p>
              {payment.method === "efectivo" && payment.cashAmount && (
                <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] mt-1">
                  Llevás{" "}
                  <span className="font-bold tabular-nums text-[var(--text-secondary)]">
                    S/{payment.cashAmount}
                  </span>
                </p>
              )}
            </ReviewCard>

            <ReviewCard
              kicker="Pedido"
              title={`${itemCount} ${itemCount === 1 ? "producto" : "productos"}`}
              icon={ShoppingBag}
              editHref="/marketplace/carrito"
            >
              <p className="text-base sm:text-lg font-black tracking-[var(--ls-tight)] text-[var(--text-primary)] tabular-nums">
                {fmt(grandTotal)}
              </p>
              <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] mt-1">
                de {storeIds.length} {storeIds.length === 1 ? "tienda" : "tiendas"}
              </p>
            </ReviewCard>
          </div>

          {/* Cupones aplicados (si hay) */}
          {couponEntries.length > 0 && (
            <ReviewCard
              kicker="Descuentos"
              title="Cupones aplicados"
              icon={Tag}
              editHref="/checkout/entrega"
              wide
            >
              <ul className="space-y-1.5 text-[length:var(--ts-sm)]">
                {couponEntries.map(([slug, c]) => (
                  <li key={slug} className="flex justify-between gap-3">
                    <span className="text-[var(--text-secondary)] truncate">
                      <span className="font-bold text-[var(--text-primary)]">{c.code}</span>{" "}
                      <span className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                        (
                        {byStore[
                          Object.keys(byStore).find((id) => byStore[id].storeSlug === slug) || ""
                        ]?.storeName ?? slug}
                        )
                      </span>
                    </span>
                    <span className="text-[var(--accent)] font-black tabular-nums shrink-0">
                      −{fmt(c.discount)}
                    </span>
                  </li>
                ))}
              </ul>
            </ReviewCard>
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
                  <strong className="text-[var(--text-primary)] tabular-nums font-black">
                    {loyalty.redeemPoints}
                  </strong>{" "}
                  puntos
                </span>
                <span className="text-[var(--accent)] font-black tabular-nums">
                  −{fmt(loyaltyDiscountTotal)}
                </span>
              </div>
            </ReviewCard>
          )}

          {/* Productos detallados */}
          <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-6 sm:p-7 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="inline-flex items-center gap-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1.5">
                  <span
                    aria-hidden
                    className="inline-flex h-[3px] w-6 rounded-full bg-[var(--accent)]"
                  />
                  <ShoppingBag className="h-3 w-3" strokeWidth={2} aria-hidden />
                  Productos
                </p>
                <h2 className="text-lg sm:text-xl font-black tracking-[var(--ls-tight)] text-[var(--text-primary)]">
                  Tu pedido en detalle
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {/* Botón OJO animado — abre modal con imágenes grandes */}
                <button
                  type="button"
                  onClick={() => setDetailsOpen(true)}
                  aria-label="Ver detalle completo del pedido"
                  className="group relative inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition-all hover:scale-110"
                >
                  {/* Halo pulse permanente */}
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-full bg-[var(--accent)]/40 animate-ping"
                  />
                  <Eye
                    className="relative h-5 w-5 transition-transform group-hover:scale-110"
                    strokeWidth={2.25}
                    aria-hidden
                  />
                </button>
                <Link
                  href="/marketplace/carrito"
                  className="inline-flex items-center rounded-full bg-[var(--surface-sunken)] px-4 h-9 text-[length:var(--ts-xs)] font-bold text-[var(--accent)] hover:bg-[var(--accent-soft)] transition-colors"
                >
                  Editar
                </Link>
              </div>
            </div>

            <div className="space-y-5 divide-y divide-[var(--rule-soft)]">
              {storeIds.map((sid) => {
                const g = byStore[sid];
                const sub = totalByStore[sid]?.total ?? 0;
                return (
                  <div key={sid} className="space-y-2 pt-5 first:pt-0">
                    <div className="flex justify-between items-baseline gap-3">
                      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                        {g.storeName}
                      </p>
                      <p className="text-[length:var(--ts-sm)] font-black tabular-nums text-[var(--text-primary)]">
                        {fmt(sub)}
                      </p>
                    </div>
                    <ul className="text-[length:var(--ts-xs)] text-[var(--text-secondary)] space-y-1">
                      {g.items.map((it) => (
                        <li
                          key={`${it.storeId}-${it.productId}`}
                          className="flex justify-between gap-3"
                        >
                          <span className="truncate">
                            <span className="tabular-nums font-semibold text-[var(--text-primary)] mr-1">
                              {it.quantity}×
                            </span>
                            {it.name}
                          </span>
                          <span className="tabular-nums shrink-0 font-semibold">
                            {fmt(it.price * it.quantity)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>

          {errorMsg && (
            <div className="rounded-2xl border border-[var(--data-error-500)]/30 bg-[var(--data-error-50)] px-5 py-4 text-[length:var(--ts-sm)] text-[var(--data-error-500)] font-semibold">
              {errorMsg}
            </div>
          )}

          {/* Mobile sticky CTA (ronda 4: OrderSummaryCard compact con breakdown rapido) */}
          <div className="lg:hidden space-y-3">
            <OrderSummaryCard
              variant="compact"
              itemCount={itemCount}
              savings={couponDiscountTotal + loyaltyDiscountTotal}
              lines={[]}
              total={grandTotal - couponDiscountTotal - loyaltyDiscountTotal}
            />
            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting}
              className={cn(
                "group inline-flex w-full items-center justify-center gap-2 rounded-full px-6 h-14",
                "text-[length:var(--ts-sm)] font-black tracking-[var(--ls-tight)] transition-all duration-200",
                "bg-[var(--accent-600,var(--accent))] text-white hover:bg-[var(--accent)]/90 hover:gap-3",
                "shadow-[0_8px_24px_-10px_var(--accent)]",
                "disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none",
              )}
            >
              <ShieldCheck className="h-4 w-4" strokeWidth={2.5} aria-hidden />
              {submitting ? "Procesando..." : `Confirmar pedido · ${fmt(grandTotal)}`}
            </button>
          </div>
        </div>

        <CheckoutSummary
          ctaLabel={submitting ? "Procesando..." : "Confirmar pedido"}
          onCtaClick={handleConfirm}
          ctaLoading={submitting}
          couponDiscount={couponDiscountTotal}
          loyaltyDiscount={loyaltyDiscountTotal}
          showItems
          helperText="Al confirmar aceptás que cada bodega te contacte por WhatsApp"
        />
        <AuthModal open={authModalOpen} onClose={closeAuthModal} />
      </div>

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
  children,
  wide,
}: {
  kicker: string;
  title: string;
  icon: typeof User;
  editHref: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5 sm:p-6 transition-colors hover:border-[var(--accent)]/40",
        wide && "sm:col-span-2",
      )}
    >
      <div className="flex items-start justify-between mb-3 gap-3">
        <div>
          <p className="inline-flex items-center gap-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
            <span
              aria-hidden
              className="inline-flex h-[3px] w-5 rounded-full bg-[var(--accent)]"
            />
            <Icon className="h-3 w-3" strokeWidth={2} aria-hidden />
            {kicker}
          </p>
          <h3 className="text-base font-black tracking-[var(--ls-tight)] text-[var(--text-primary)]">
            {title}
          </h3>
        </div>
        <Link
          href={editHref}
          className="inline-flex items-center rounded-full bg-[var(--surface-sunken)] px-3 h-7 text-[length:var(--ts-2xs)] font-bold text-[var(--accent)] hover:bg-[var(--accent-soft)] transition-colors shrink-0"
        >
          Editar
        </Link>
      </div>
      {children}
    </section>
  );
}
