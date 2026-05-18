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
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  ArrowRight,
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
      <div className="pt-4 sm:pt-8 pb-5 sm:pb-6">
        {/* Brandon 2026-05-18: back link sutil estilo /carrito (sin border-pill
            pesado que competía con el CTA primario). Consistencia entre pasos. */}
        <Link
          href="/marketplace/carrito"
          className="inline-flex items-center gap-1.5 text-[length:var(--ts-sm)] font-bold text-[var(--text-secondary)] hover:text-[var(--accent)] hover:gap-2 transition-all mb-3"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          Volver al carrito
        </Link>
        <h1 className="text-3xl sm:text-4xl font-black tracking-[-0.025em] text-[var(--text-primary)] leading-none">
          Tus datos
        </h1>
        <p className="mt-2 text-[length:var(--ts-sm)] sm:text-base text-[var(--text-secondary)] leading-snug">
          <span className="font-semibold text-[var(--text-primary)]">Paso 2 de 4.</span>{" "}
          Confirma con qué cuenta comprás hoy.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 sm:gap-8 items-start pb-28 lg:pb-16">
        <div className="space-y-6">
          {/* ── AccountPicker — siempre que haya cuentas guardadas ────
                Incluye "Iniciar sesion con otra cuenta" abajo.            */}
          {accounts.length >= 1 && (
            <AccountPicker returnTo="/checkout/datos" />
          )}

          {/* ── Card "Hola [nombre]" v2 (Brandon 2026-05-18 rediseño) ──
                Cambios:
                - Hero más compacto (avatar + título inline saludo).
                - Datos en grid: cada dato como mini-pill con icono compact.
                - "Verificado" badge inline cuando el perfil está completo.
                - CTA primary full-width destacado + "Editar" como link sutil. */}
          <div className="rounded-3xl border-2 border-[var(--accent)]/25 bg-linear-to-br from-[var(--accent-soft)] via-[var(--surface-canvas)] to-[var(--accent-soft)]/40 overflow-hidden shadow-sm">
            <div className="relative p-5 sm:p-7">
              <div
                aria-hidden
                className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-[var(--accent)]/[0.12] blur-3xl"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute -bottom-20 -left-12 h-36 w-36 rounded-full bg-[var(--accent)]/[0.08] blur-3xl"
              />

              {/* Hero: avatar + saludo + verified badge */}
              <div className="relative flex items-center gap-3 sm:gap-4 mb-4 sm:mb-5">
                <span className="inline-flex h-14 w-14 sm:h-16 sm:w-16 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-[var(--accent-600,var(--accent))] to-[var(--accent)] text-white shadow-[0_8px_24px_-8px_var(--accent)] text-xl sm:text-2xl font-black uppercase ring-2 ring-white/30">
                  {initial}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-0.5 inline-flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                    Comprando como
                  </p>
                  <p className="text-xl sm:text-2xl font-black tracking-[-0.02em] text-[var(--text-primary)] leading-tight truncate">
                    Hola, <span className="italic font-serif text-[var(--accent)]">{fullName}</span>
                  </p>
                  {profileComplete && (
                    <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full bg-[var(--data-success-50,var(--accent-soft))] text-[var(--data-success-600,var(--accent))] text-[length:var(--ts-2xs)] font-extrabold">
                      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--data-success-500,var(--accent))]" />
                      Perfil verificado
                    </span>
                  )}
                </div>
              </div>

              {/* Datos en grid 2-col mobile, 1-col en card */}
              <div className="relative grid grid-cols-1 gap-2">
                <DataRow icon={Phone} label="WhatsApp" value={savedCustomer.phone ? `+51 ${savedCustomer.phone}` : null} missing="Falta tu WhatsApp" />
                {savedCustomer.email && (
                  <DataRow icon={Mail} label="Email" value={savedCustomer.email} />
                )}
                <DataRow
                  icon={MapPin}
                  label="Ubicación"
                  value={ubicacionTexto || null}
                  missing="La pedimos en el siguiente paso"
                  secondary={savedCustomer.addressLine ?? undefined}
                  warningOnMissing
                />
              </div>

              {/* CTA primary + edit link sutil */}
              <div className="relative mt-5 space-y-2">
                <button
                  type="button"
                  onClick={handleContinue}
                  className="group inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-linear-to-r from-[var(--accent-600,var(--accent))] to-[var(--accent)] px-5 h-13 text-base font-extrabold text-white hover:gap-3 active:scale-[0.98] transition-all duration-200 shadow-[0_12px_32px_-10px_var(--accent)]"
                >
                  {profileComplete ? "Continuar al resumen" : "Continuar a entrega"}
                  <ArrowRight className="h-4.5 w-4.5" strokeWidth={2.75} aria-hidden />
                </button>
                <Link
                  href="/marketplace/mi-cuenta"
                  className="inline-flex w-full items-center justify-center gap-1.5 h-10 text-[length:var(--ts-sm)] font-bold text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
                >
                  Editar mi cuenta
                  <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
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

/**
 * Brandon 2026-05-18: row compacta para mostrar dato del cliente con ícono.
 * Reemplaza el dl pesado anterior con un layout limpio fila por dato.
 */
function DataRow({
  icon: Icon,
  label,
  value,
  missing,
  secondary,
  warningOnMissing = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string | null;
  missing?: string;
  secondary?: string;
  warningOnMissing?: boolean;
}) {
  const isMissing = !value;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3.5 py-2.5">
      <span
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-xl shrink-0",
          isMissing && warningOnMissing
            ? "bg-[var(--data-warn-50,#fef3c7)] text-[var(--data-warn-600,#b45309)]"
            : "bg-[var(--accent-soft)] text-[var(--accent)]",
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={2.25} aria-hidden />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] leading-tight">
          {label}
        </p>
        {value ? (
          <>
            <p className="text-[length:var(--ts-sm)] font-extrabold text-[var(--text-primary)] tabular-nums truncate leading-tight mt-0.5">
              {value}
            </p>
            {secondary && (
              <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] truncate leading-tight mt-0.5">
                {secondary}
              </p>
            )}
          </>
        ) : (
          <p
            className={cn(
              "inline-flex items-center gap-1 text-[length:var(--ts-xs)] font-bold leading-tight mt-0.5",
              warningOnMissing
                ? "text-[var(--data-warn-600,#b45309)]"
                : "text-[var(--data-error-500)]",
            )}
          >
            <AlertCircle className="h-3 w-3" strokeWidth={2.25} aria-hidden />
            {missing ?? "Falta este dato"}
          </p>
        )}
      </div>
    </div>
  );
}
