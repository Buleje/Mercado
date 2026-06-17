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
import { useEffect, useCallback, useState, useRef } from "react";
import type { LucideIcon } from "lucide-react";
import {
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
import CheckoutStepHeader from "@/components/marketplace/checkout/CheckoutStepHeader";
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

  // Checkout invitado (Brandon 2026-05-30): si no hay sesión, NO se redirige a
  // login — se muestra un form de invitado (nombre + WhatsApp) más abajo. El
  // login queda opcional. La API acepta pedidos invitado sin comprobante
  // pre-subido (pago al recibir / Yape al recibir).
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");

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

  // Fast-track Brandon 2026-06-08: perfil completo (incluye dirección guardada)
  // + NO venimos a editar (?edit=1) → saltamos datos directo a confirmar. El
  // efecto de sync de arriba ya escribió la dirección a localStorage (síncrono),
  // así que confirmar la lee sin race. Resultado: carrito → finalizar (2 páginas).
  const autoSkippedRef = useRef(false);
  const [autoSkipping, setAutoSkipping] = useState(false);
  useEffect(() => {
    if (autoSkippedRef.current) return;
    if (!cartReady || itemCount === 0) return;
    if (!profileComplete) return;
    const isEdit =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("edit") === "1";
    if (isEdit) return;
    autoSkippedRef.current = true;
    setAutoSkipping(true);
    // REPLACE (no push): datos es un paso transitorio en el flujo rápido. Con
    // replace, datos NO queda en el historial → "atrás" desde confirmar vuelve
    // al carrito, no a datos (que re-saltaría = loop). Brandon 2026-06-08.
    router.replace("/checkout/confirmar");
  }, [cartReady, itemCount, profileComplete, router]);

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

  // Mientras hidrata el carrito/checkout, o si el carrito está vacío (el effect
  // de arriba redirige a /marketplace/carrito), mostramos un overlay de carga en
  // vez de un blanco que parece "colgado". Brandon 2026-06-08 — fix "se queda
  // cargando y no da imagen": antes era `return null` (main en blanco) durante
  // toda la ventana de hidratación.
  if (!cartReady || itemCount === 0) {
    return <CheckoutTransitionOverlay show label="Cargando tu pedido" />;
  }

  // Fast-track en curso: mostramos solo el overlay de transición (sin flash de
  // la card de cuenta) mientras redirige a confirmar. Brandon 2026-06-08.
  if (autoSkipping) {
    return <CheckoutTransitionOverlay show label="Preparando tu resumen" />;
  }

  // ── Modo INVITADO (Brandon 2026-05-30) ──────────────────────────────────
  // Sin sesión → form simple (nombre + WhatsApp). Guarda en checkoutData y va a
  // /entrega para la dirección. El pedido se cierra con pago al recibir / Yape
  // (sin comprobante pre-subido, que sí requiere login).
  if (!savedCustomer) {
    const phoneOk = /^9\d{8}$/.test(guestPhone.trim());
    const guestValid = guestName.trim().length >= 2 && phoneOk;
    const handleGuestContinue = () => {
      if (!guestValid) return;
      setCustomer({ name: guestName.trim(), phone: guestPhone.trim(), email: "" });
      navigateTo("/checkout/entrega", "Calculando tu entrega");
    };
    return (
      <>
        <CheckoutTransitionOverlay show={isPending} label={pendingLabel} />
        <CheckoutStepHeader
          backHref="/marketplace/carrito"
          backLabel="Volver al carrito"
          title="Tus datos"
          lead="Paso 1 de 3."
          subtitle="Dejanos tu nombre y WhatsApp para coordinar la entrega."
        />
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 sm:gap-6 items-start pb-28 lg:pb-16">
          <div className="space-y-4">
            <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4 sm:p-6 space-y-4">
              <div>
                <label htmlFor="guest-name" className="mb-2 block text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">Nombre completo</label>
                <input id="guest-name" value={guestName} onChange={(e) => setGuestName(e.target.value)} autoFocus placeholder="Ej. María Pérez" className="h-12 w-full rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-[length:var(--ts-sm)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] focus:ring-offset-2 focus:ring-offset-[var(--surface-raised)]" />
              </div>
              <div>
                <label htmlFor="guest-phone" className="mb-2 block text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">WhatsApp</label>
                <input id="guest-phone" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value.replace(/\D/g, "").slice(0, 9))} inputMode="numeric" placeholder="9XXXXXXXX" className="h-12 w-full rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-[length:var(--ts-sm)] font-mono tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] focus:ring-offset-2 focus:ring-offset-[var(--surface-raised)]" />
                {guestPhone.length > 0 && !phoneOk && <p className="mt-2 ml-4 text-[length:var(--ts-2xs)] text-[var(--data-error-500)]">Tu WhatsApp debe tener 9 dígitos y empezar con 9.</p>}
              </div>
              <button type="button" disabled={!guestValid} onClick={handleGuestContinue} className="h-12 w-full rounded-full bg-[var(--accent)] text-base font-bold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50 lg:hidden">
                Continuar a la entrega
              </button>
              <p className="text-center text-[length:var(--ts-sm)] text-[var(--text-tertiary)]">¿Ya tenés cuenta? <Link href="/checkout/auth?returnTo=%2Fcheckout%2Fdatos" className="font-bold text-[var(--accent)] underline underline-offset-2">Iniciá sesión</Link></p>
            </div>
          </div>
          <div className="hidden lg:block">
            <CheckoutSummary ctaLabel="Continuar a la entrega" onCtaClick={handleGuestContinue} ctaDisabled={!guestValid} showItems={false} helperText="Pago al recibir o Yape · sin sorpresas" />
          </div>
        </div>
        <CheckoutMobileCtaBar primaryLabel="Total" total={grandTotal} ctaLabel="Continuar" ctaOnClick={handleGuestContinue} helperText="Pago al recibir o Yape" />
      </>
    );
  }

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
      <CheckoutStepHeader
        backHref="/marketplace/carrito"
        backLabel="Volver al carrito"
        title="Tus datos"
        lead="Paso 1 de 3."
        subtitle="Confirmá con qué cuenta comprás hoy."
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 sm:gap-8 items-start pb-28 lg:pb-16">
        <div className="space-y-4 sm:space-y-5">
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
          <div className="rounded-2xl border border-[var(--accent)]/20 bg-[var(--surface-raised)] overflow-hidden">
            <div className="relative p-4 sm:p-6">
              {/* Hero: avatar + saludo + verified badge */}
              <div className="relative flex items-center gap-3 sm:gap-4 mb-4 sm:mb-5">
                <span className="inline-flex h-14 w-14 sm:h-16 sm:w-16 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)] text-white text-xl sm:text-2xl font-black uppercase">
                  {initial}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-0.5 inline-flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                    Comprando como
                  </p>
                  <p className="text-xl sm:text-2xl font-black tracking-[-0.02em] text-[var(--text-primary)] leading-tight truncate">
                    Hola, <span className="text-[var(--accent)]">{fullName}</span>
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
                  className="group inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-5 h-13 text-base font-extrabold text-white hover:opacity-90 active:scale-[0.98] transition-opacity duration-200"
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
            <div className="rounded-2xl border-2 border-[var(--data-warn-500,#ff6b5b)]/30 bg-[var(--data-warn-500,#ff6b5b)]/8 p-4 sm:p-5 flex items-start gap-3">
              <UserCircle className="h-5 w-5 text-[var(--data-warn-500,#ff6b5b)] shrink-0 mt-0.5" strokeWidth={2} aria-hidden />
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
            ? "bg-[var(--data-warn-50,#fff1ef)] text-[var(--data-warn-600,#c93b2c)]"
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
                ? "text-[var(--data-warn-600,#c93b2c)]"
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
