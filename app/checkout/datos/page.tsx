"use client";

/**
 * /checkout/datos — Step 2: datos personales.
 *
 * Form pill-style: nombre + teléfono + email opcional.
 * Pre-llena con useCustomer si esta logged in. Fast-track al confirmar
 * cuando el perfil esta completo. Auto-redirect al carrito si vacio.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import {
  ArrowLeft,
  ArrowRight,
  User,
  Phone,
  Mail,
  UserCircle,
  Sparkles,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
import { useCustomer, isCustomerProfileComplete } from "@/contexts/customer-context";
import { useCheckoutData } from "@/hooks/use-checkout-data";
import CheckoutSummary from "@/components/marketplace/checkout/CheckoutSummary";
import AccountPicker from "@/components/marketplace/checkout/AccountPicker";
import {
  CheckoutTransitionOverlay,
  useCheckoutTransition,
} from "@/components/marketplace/checkout/CheckoutTransitionOverlay";

function pillCls(error?: boolean) {
  return cn(
    "w-full rounded-full border bg-[var(--surface-raised)] pl-11 pr-4 h-12",
    "text-[length:var(--ts-sm)] text-[var(--text-primary)]",
    "placeholder:text-[var(--text-tertiary)]",
    "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--surface-raised)]",
    error
      ? "border-[var(--data-error)] focus:ring-[var(--data-error)]/30"
      : "border-[var(--rule-base)] focus:border-[var(--accent)] focus:ring-[var(--accent-soft)]",
  );
}

export default function CheckoutDatosPage() {
  const router = useRouter();
  const { itemCount } = useMarketplaceCart();
  const { customer: savedCustomer, accounts } = useCustomer();
  const { customer, setCustomer, setAddress, isCustomerValid, hydrated } = useCheckoutData();
  const [touched, setTouched] = useState({ name: false, phone: false });
  const { isPending, pendingLabel, navigateTo } = useCheckoutTransition();

  // Auto-redirect si carrito vacio. Esperamos a que el cart context haya
  // hidratado: el primer render puede mostrar itemCount=0 antes de leer
  // localStorage.
  const [cartReady, setCartReady] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setCartReady(true), 250);
    return () => window.clearTimeout(t);
  }, []);
  useEffect(() => {
    if (cartReady && itemCount === 0) router.replace("/marketplace/carrito");
  }, [cartReady, itemCount, router]);

  // Prefetch del próximo paso
  useEffect(() => {
    router.prefetch("/checkout/entrega");
    router.prefetch("/checkout/confirmar");
  }, [router]);

  // Pre-llenar con datos del customer logged in (siempre sincroniza con el activo)
  useEffect(() => {
    if (!savedCustomer) return;
    setCustomer({
      name: savedCustomer.name || "",
      phone: savedCustomer.phone || "",
      email: savedCustomer.email || "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedCustomer?.phone]);

  const handleFastTrack = useCallback(() => {
    if (!savedCustomer || !isCustomerProfileComplete(savedCustomer)) return;
    setCustomer({
      name: savedCustomer.name,
      phone: savedCustomer.phone || "",
      email: savedCustomer.email || "",
    });
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
    navigateTo("/checkout/confirmar", "Preparando tu resumen");
  }, [savedCustomer, setCustomer, setAddress, navigateTo]);

  const profileComplete = isCustomerProfileComplete(savedCustomer);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setTouched({ name: true, phone: true });
      if (!isCustomerValid) return;
      navigateTo("/checkout/entrega", "Calculando tu entrega");
    },
    [isCustomerValid, navigateTo],
  );

  const showNameError = touched.name && customer.name.trim().length < 2;
  const showPhoneError = touched.phone && customer.phone.trim().replace(/\D/g, "").length < 6;

  if (itemCount === 0) return null;

  return (
    <>
      <div className="pt-6 sm:pt-8 pb-6">
        <Link
          href="/marketplace/carrito"
          className="inline-flex items-center gap-1.5 text-[length:var(--ts-xs)] text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors mb-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          Volver al carrito
        </Link>
        <h1 className="text-2xl sm:text-3xl font-black tracking-[var(--ls-tight)] text-[var(--text-primary)]">
          Tus datos
        </h1>
        <p className="mt-1 text-[length:var(--ts-sm)] text-[var(--text-tertiary)]">
          Los usamos para coordinar la entrega por WhatsApp.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 sm:gap-8 items-start pb-16">
        <div className="space-y-6">
          {/* ── Account picker (si hay >=1 cuenta guardada) ───────── */}
          {accounts.length >= 1 && (
            <AccountPicker returnTo="/checkout/datos" />
          )}

          {/* ── Fast-track banner ──────────────────────────────────── */}
          {profileComplete && (
            <div className="relative overflow-hidden rounded-2xl border-2 border-[var(--accent)]/30 bg-linear-to-br from-[var(--accent-soft)] via-[var(--accent-soft)] to-[var(--surface-raised)] p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div
                aria-hidden
                className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-[var(--accent)]/[0.12] blur-2xl"
              />
              <span className="relative inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent)] text-white shrink-0 shadow-[0_4px_16px_-6px_var(--accent)]">
                <Sparkles className="h-5 w-5" strokeWidth={2} aria-hidden />
              </span>
              <div className="relative flex-1 min-w-0">
                <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
                  Bienvenido de vuelta
                </p>
                <p className="text-base sm:text-lg font-black tracking-[var(--ls-tight)] text-[var(--text-primary)]">
                  Hola de nuevo,{" "}
                  <span className="italic font-serif text-[var(--accent)]">
                    {savedCustomer?.name?.split(" ")[0]}.
                  </span>
                </p>
                <p className="mt-1 text-[length:var(--ts-xs)] text-[var(--text-secondary)] leading-snug">
                  Tenemos tus datos guardados — salta directo a confirmar el pedido en 1 click.
                </p>
              </div>
              <button
                type="button"
                onClick={handleFastTrack}
                className="relative group inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-5 h-11 text-[length:var(--ts-xs)] font-bold text-white hover:bg-[var(--accent)]/90 hover:gap-3 transition-all duration-200 shadow-[0_6px_20px_-10px_var(--accent)] shrink-0"
              >
                Ir al resumen
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
              </button>
            </div>
          )}

          {/* ── Form editorial ────────────────────────────────────── */}
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-6 sm:p-8 space-y-6"
            noValidate
          >
            {savedCustomer && !profileComplete && (
              <div className="rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)]/20 px-4 py-3 flex items-center gap-3">
                <UserCircle className="h-5 w-5 text-[var(--accent)] shrink-0" strokeWidth={1.75} aria-hidden />
                <div className="flex-1 min-w-0">
                  <p className="text-[length:var(--ts-xs)] font-bold text-[var(--text-primary)]">
                    Hola, {savedCustomer.name?.split(" ")[0] ?? "vecino"}
                  </p>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">
                    Pre-llenamos tus datos guardados. Puedes editarlos.
                  </p>
                </div>
              </div>
            )}

            {/* Nombre */}
            <div>
              <label
                htmlFor="ck-name"
                className="mb-2 block text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]"
              >
                Nombre completo
              </label>
              <div className="relative">
                <User
                  className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none"
                  strokeWidth={1.75}
                  aria-hidden
                />
                <input
                  id="ck-name"
                  type="text"
                  value={customer.name}
                  onChange={(e) => setCustomer({ name: e.target.value })}
                  onBlur={() => setTouched((p) => ({ ...p, name: true }))}
                  placeholder="Tu nombre completo"
                  maxLength={100}
                  autoComplete="name"
                  required
                  className={pillCls(showNameError)}
                />
              </div>
              {showNameError && (
                <p className="mt-2 ml-4 text-[length:var(--ts-2xs)] text-[var(--data-error)]">
                  Ingresá tu nombre completo (mínimo 2 caracteres).
                </p>
              )}
            </div>

            {/* Teléfono */}
            <div>
              <label
                htmlFor="ck-phone"
                className="mb-2 block text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]"
              >
                Teléfono / WhatsApp
              </label>
              <div className="relative">
                <Phone
                  className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none"
                  strokeWidth={1.75}
                  aria-hidden
                />
                <span
                  aria-hidden
                  className="absolute left-10 top-1/2 -translate-y-1/2 text-[length:var(--ts-xs)] font-bold text-[var(--text-secondary)] pointer-events-none select-none"
                >
                  +51
                </span>
                <input
                  id="ck-phone"
                  type="tel"
                  value={customer.phone}
                  onChange={(e) => setCustomer({ phone: e.target.value })}
                  onBlur={() => setTouched((p) => ({ ...p, phone: true }))}
                  placeholder="916 409 675"
                  maxLength={20}
                  autoComplete="tel"
                  required
                  className={cn(pillCls(showPhoneError), "pl-[4.75rem]")}
                />
              </div>
              {showPhoneError ? (
                <p className="mt-2 ml-4 text-[length:var(--ts-2xs)] text-[var(--data-error)]">
                  Ingresá un teléfono válido (mínimo 6 dígitos).
                </p>
              ) : (
                <p className="mt-2 ml-4 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                  Te contactamos por WhatsApp para coordinar la entrega.
                </p>
              )}
            </div>

            {/* Email */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label
                  htmlFor="ck-email"
                  className="block text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]"
                >
                  Email
                </label>
                <span className="inline-flex items-center rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-semibold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  Opcional
                </span>
              </div>
              <div className="relative">
                <Mail
                  className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none"
                  strokeWidth={1.75}
                  aria-hidden
                />
                <input
                  id="ck-email"
                  type="email"
                  value={customer.email}
                  onChange={(e) => setCustomer({ email: e.target.value })}
                  placeholder="tu@email.com"
                  maxLength={120}
                  autoComplete="email"
                  className={pillCls(false)}
                />
              </div>
              <p className="mt-2 ml-4 text-xs text-[var(--text-tertiary)]">
                Te enviamos el comprobante del pedido aquí.
              </p>
            </div>

            {/* CTA mobile — desktop usa el summary */}
            <div className="flex justify-end pt-2 lg:hidden">
              <button
                type="submit"
                disabled={!isCustomerValid}
                className={cn(
                  "group inline-flex w-full items-center justify-center gap-2 rounded-full px-6 h-12",
                  "text-[length:var(--ts-sm)] font-bold tracking-[var(--ls-tight)] transition-all duration-200",
                  "bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 hover:gap-3",
                  "shadow-[0_6px_20px_-10px_var(--accent)]",
                  "disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none",
                )}
              >
                Continuar a entrega
                <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
            </div>
          </form>
        </div>

        <CheckoutSummary
          ctaLabel="Continuar a entrega"
          onCtaClick={() => {
            setTouched({ name: true, phone: true });
            if (isCustomerValid) navigateTo("/checkout/entrega", "Calculando tu entrega");
          }}
          ctaDisabled={!isCustomerValid}
          showItems
          helperText="Pago al recibir o por Yape"
        />
      </div>
      <CheckoutTransitionOverlay show={isPending} label={pendingLabel} />
    </>
  );
}
