"use client";

/**
 * /checkout/datos — Step 2: confirmacion de identidad.
 *
 * Brandon, mayo 14 2026: el flujo entero asume que el cliente SE LOGUEA antes
 * de llegar aca (el carrito gatea el "Continuar al checkout" con AuthModal).
 * Por eso esta pagina ya NO tiene inputs de nombre/telefono/email — los datos
 * viven en useCustomer().
 *
 * Estructura:
 *   - AccountPicker (si hay 1+ cuenta guardada en el dispositivo)
 *     · Permite cambiar entre cuentas registradas y abrir login para sumar otra
 *   - Card "Hola [nombre]" con nombre completo + WhatsApp + ubicacion guardada
 *   - Si el perfil esta INCOMPLETO (ej. falta direccion en mi-cuenta) →
 *     link a /marketplace/mi-cuenta y bloqueo del continuar.
 *   - CheckoutSummary sticky + CheckoutMobileCtaBar bottom mobile.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useCallback } from "react";
import {
  ArrowLeft,
  ArrowRight,
  User,
  Phone,
  Mail,
  MapPin,
  UserCircle,
  Sparkles,
  AlertCircle,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
import { useCustomer, isCustomerProfileComplete } from "@/contexts/customer-context";
import { useCheckoutData } from "@/hooks/use-checkout-data";
import CheckoutSummary from "@/components/marketplace/checkout/CheckoutSummary";
import CheckoutMobileCtaBar from "@/components/marketplace/checkout/CheckoutMobileCtaBar";
import AccountPicker from "@/components/marketplace/checkout/AccountPicker";
import {
  CheckoutTransitionOverlay,
  useCheckoutTransition,
} from "@/components/marketplace/checkout/CheckoutTransitionOverlay";

export default function CheckoutDatosPage() {
  const router = useRouter();
  const { itemCount, grandTotal, hydrated: cartHydrated } = useMarketplaceCart();
  const { customer: savedCustomer, accounts } = useCustomer();
  const { setCustomer, setAddress, hydrated: checkoutHydrated } = useCheckoutData();
  const { isPending, pendingLabel, navigateTo } = useCheckoutTransition();

  // Brandon mayo 15 v4 (audit QA #1): reemplazado `setTimeout(250ms)` por
  // los flags `hydrated` reales de los hooks. Antes en redes lentas el cart
  // tardaba > 250ms en hidratar y el guard expulsaba al cliente mid-flow.
  const cartReady = cartHydrated && checkoutHydrated;

  useEffect(() => {
    if (cartReady && itemCount === 0) router.replace("/marketplace/carrito");
  }, [cartReady, itemCount, router]);

  // Sin login → al gate. /carrito ya tiene este check via AuthModal pero
  // protegemos por si el cliente abre /checkout/datos directo (deep link,
  // back-forward del browser, etc.).
  useEffect(() => {
    if (!cartReady) return;
    if (!savedCustomer) {
      const returnTo = encodeURIComponent("/checkout/datos");
      router.replace(`/checkout/auth?returnTo=${returnTo}`);
    }
  }, [cartReady, savedCustomer, router]);

  // Prefetch del proximo paso
  useEffect(() => {
    router.prefetch("/checkout/entrega");
    router.prefetch("/checkout/confirmar");
  }, [router]);

  // Pre-llenar checkoutData con los datos del customer activo, asi /entrega
  // y /confirmar leen del estado central sin tener que pegarle al context
  // de customer.
  useEffect(() => {
    if (!savedCustomer) return;
    setCustomer({
      name: savedCustomer.name || "",
      phone: savedCustomer.phone || "",
      email: savedCustomer.email || "",
    });
    if (savedCustomer.addressLine || savedCustomer.districtName) {
      setAddress({
        address: savedCustomer.addressLine || "",
        notes: savedCustomer.reference || "",
        departmentCode: savedCustomer.departmentCode || "",
        departmentName: savedCustomer.departmentName || "",
        provinceCode: savedCustomer.provinceCode || "",
        provinceName: savedCustomer.provinceName || "",
        districtCode: savedCustomer.districtCode || "",
        districtName: savedCustomer.districtName || "",
        zone: [savedCustomer.districtName, savedCustomer.provinceName, savedCustomer.departmentName]
          .filter(Boolean)
          .join(", "),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedCustomer?.phone]);

  const profileComplete = isCustomerProfileComplete(savedCustomer);

  // Atajo "fast-track": va directo al resumen porque ya tiene direccion.
  // Si no tiene direccion → ir a /entrega para completar.
  const handleContinue = useCallback(() => {
    if (!savedCustomer) return;
    if (profileComplete) {
      navigateTo("/checkout/confirmar", "Preparando tu resumen");
    } else {
      navigateTo("/checkout/entrega", "Calculando tu entrega");
    }
  }, [savedCustomer, profileComplete, navigateTo]);

  if (itemCount === 0 || !savedCustomer) return null;

  const ubicacionTexto = [
    savedCustomer.districtName,
    savedCustomer.provinceName,
    savedCustomer.departmentName,
  ]
    .filter(Boolean)
    .join(", ");
  const fullName = savedCustomer.name?.trim() || "vecino";
  const initial = fullName.charAt(0).toUpperCase();

  return (
    <>
      <div className="pt-6 sm:pt-8 pb-6">
        <Link
          href="/marketplace/carrito"
          className="inline-flex items-center gap-2 h-11 sm:h-9 px-3.5 sm:px-3 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] hover:-translate-y-0.5 transition-all shadow-sm mb-3"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
          Volver al carrito
        </Link>
        <h1 className="text-2xl sm:text-3xl font-black tracking-[var(--ls-tight)] text-[var(--text-primary)]">
          Tus datos
        </h1>
        <p className="mt-1 text-[length:var(--ts-sm)] text-[var(--text-tertiary)]">
          Confirma con qué cuenta estás comprando hoy.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 sm:gap-8 items-start pb-28 lg:pb-16">
        <div className="space-y-6">
          {/* ── AccountPicker — siempre que haya cuentas guardadas ────
                Incluye "Iniciar sesion con otra cuenta" abajo.            */}
          {accounts.length >= 1 && (
            <AccountPicker returnTo="/checkout/datos" />
          )}

          {/* ── Card "Hola [nombre completo]" — datos del cliente activo ── */}
          <div className="rounded-2xl border-2 border-[var(--accent)]/30 bg-linear-to-br from-[var(--accent-soft)] via-[var(--accent-soft)]/60 to-[var(--surface-raised)] overflow-hidden shadow-sm">
            <div className="relative p-5 sm:p-6">
              <div
                aria-hidden
                className="pointer-events-none absolute -top-12 -right-12 h-40 w-40 rounded-full bg-[var(--accent)]/[0.12] blur-3xl"
              />
              <div className="relative flex items-start gap-3 sm:gap-4">
                <span className="inline-flex h-14 w-14 sm:h-16 sm:w-16 shrink-0 items-center justify-center rounded-full bg-[var(--accent-600,var(--accent))] text-white shadow-[0_8px_24px_-8px_var(--accent)] text-lg sm:text-xl font-black uppercase">
                  {initial}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1 inline-flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                    Comprando como
                  </p>
                  <p className="text-xl sm:text-2xl font-black tracking-[var(--ls-tight)] text-[var(--text-primary)] leading-tight">
                    Hola,{" "}
                    <span className="italic font-serif text-[var(--accent)] break-words">
                      {fullName}
                    </span>
                  </p>
                  <p className="mt-1 text-[length:var(--ts-xs)] text-[var(--text-secondary)]">
                    Usamos estos datos para coordinar tu entrega:
                  </p>
                </div>
              </div>

              <dl className="relative mt-5 space-y-2.5 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-4 text-[length:var(--ts-sm)]">
                <div className="flex items-center gap-3">
                  <User className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" strokeWidth={1.75} aria-hidden />
                  <dt className="sr-only">Nombre completo</dt>
                  <dd className="font-bold text-[var(--text-primary)] truncate flex-1">
                    {fullName}
                  </dd>
                </div>
                <div className="flex items-center gap-3 pt-2 border-t border-[var(--rule-soft)]">
                  <Phone className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" strokeWidth={1.75} aria-hidden />
                  <dt className="sr-only">WhatsApp</dt>
                  <dd className="font-bold text-[var(--text-primary)] tabular-nums">
                    +51 {savedCustomer.phone || <span className="text-[var(--data-error-500)] font-bold">Falta WhatsApp</span>}
                  </dd>
                </div>
                {savedCustomer.email && (
                  <div className="flex items-center gap-3 pt-2 border-t border-[var(--rule-soft)]">
                    <Mail className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" strokeWidth={1.75} aria-hidden />
                    <dt className="sr-only">Email</dt>
                    <dd className="font-medium text-[var(--text-secondary)] truncate flex-1">
                      {savedCustomer.email}
                    </dd>
                  </div>
                )}
                <div className="flex items-start gap-3 pt-2 border-t border-[var(--rule-soft)]">
                  <MapPin className="h-4 w-4 mt-0.5 text-[var(--text-tertiary)] shrink-0" strokeWidth={1.75} aria-hidden />
                  <div className="flex-1 min-w-0">
                    <dt className="sr-only">Ubicación</dt>
                    {ubicacionTexto ? (
                      <dd className="font-bold text-[var(--text-primary)] truncate">
                        {ubicacionTexto}
                      </dd>
                    ) : (
                      <dd className="text-[length:var(--ts-xs)] inline-flex items-center gap-1 font-bold text-[var(--data-warn-600,#b45309)]">
                        <AlertCircle className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                        Sin ubicación guardada — la pedimos en el siguiente paso
                      </dd>
                    )}
                    {savedCustomer.addressLine && (
                      <p className="mt-0.5 text-[length:var(--ts-xs)] text-[var(--text-tertiary)] truncate">
                        {savedCustomer.addressLine}
                      </p>
                    )}
                  </div>
                </div>
              </dl>

              <div className="relative mt-4 flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={handleContinue}
                  className="group inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent-600,var(--accent))] px-5 h-12 text-[length:var(--ts-sm)] font-extrabold text-white hover:bg-[var(--accent)]/90 hover:gap-3 transition-all duration-200 shadow-[0_8px_24px_-8px_var(--accent)] flex-1"
                >
                  {profileComplete ? "Continuar al resumen" : "Continuar a entrega"}
                  <ArrowRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                </button>
                <Link
                  href="/marketplace/mi-cuenta"
                  className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-5 h-12 text-[length:var(--ts-xs)] font-bold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                >
                  Editar mi cuenta
                </Link>
              </div>
            </div>
          </div>

          {/* ── Aviso si el perfil esta incompleto — guia al usuario  ─── */}
          {!profileComplete && (
            <div className="rounded-2xl border-2 border-[var(--data-warn-500,#f59e0b)]/30 bg-[var(--data-warn-500,#f59e0b)]/8 p-4 sm:p-5 flex items-start gap-3">
              <UserCircle className="h-5 w-5 text-[var(--data-warn-500,#f59e0b)] shrink-0 mt-0.5" strokeWidth={2} aria-hidden />
              <div className="flex-1 min-w-0">
                <p className="text-base font-extrabold text-[var(--text-primary)] leading-tight">
                  Falta completar tu perfil
                </p>
                <p className="mt-1 text-[length:var(--ts-xs)] text-[var(--text-secondary)]">
                  Sin tu WhatsApp y ubicación no podemos coordinar la entrega. En el siguiente paso
                  podés ingresarlos rapidito.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* CheckoutSummary oculto en mobile — CheckoutMobileCtaBar sticky
            bottom ya cubre total + CTA continuar (Brandon, mayo 14 2026) */}
        <div className="hidden lg:block">
          <CheckoutSummary
            ctaLabel={profileComplete ? "Ir al resumen" : "Continuar a entrega"}
            onCtaClick={handleContinue}
            showItems
            helperText={profileComplete ? "1 click al resumen" : "Pago al recibir o por Yape"}
          />
        </div>
      </div>

      <CheckoutMobileCtaBar
        primaryLabel="Total"
        total={grandTotal}
        ctaLabel={profileComplete ? "Ir al resumen" : "Continuar a entrega"}
        ctaOnClick={handleContinue}
        helperText={profileComplete ? "1 click al resumen" : "Pago al recibir o por Yape"}
      />

      <CheckoutTransitionOverlay show={isPending} label={pendingLabel} />
    </>
  );
}
