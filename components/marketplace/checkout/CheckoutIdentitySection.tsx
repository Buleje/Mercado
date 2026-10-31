"use client";

/**
 * CheckoutIdentitySection — captura de identidad DENTRO de /checkout/entrega.
 *
 * Brandon 2026-07-06: los pasos "datos" y "entrega" se unificaron en una sola
 * página. Esta sección va arriba del form de entrega y captura quién recibe:
 *   - Invitado (sin sesión): inputs nombre + WhatsApp, enlazados directo al
 *     checkout-data (isCustomerValid se deriva de ahí → habilita el CTA en vivo)
 *     + reconocimiento por teléfono (autocompleta el nombre si ya compró antes).
 *   - Logueado: chip compacto "Comprando como {nombre}" + link "Cambiar".
 *
 * Solo sincroniza el CUSTOMER (nombre/tel/email). La dirección la maneja la
 * propia entrega vía useSavedAddresses (libreta con auto-selección) — no la
 * tocamos acá para no competir por el estado de la dirección.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "@buleje/design-system/icons";
import { useCustomer } from "@/contexts/customer-context";
import { useCheckoutData } from "@/hooks/use-checkout-data";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";

const RETURN_TO = "/checkout/auth?returnTo=%2Fcheckout%2Fentrega";

export default function CheckoutIdentitySection() {
  const { customer: savedCustomer } = useCustomer();
  const { customer, setCustomer } = useCheckoutData();
  const { byStore } = useMarketplaceCart();

  const nameTouchedRef = useRef(false);
  const [recognizedFirstName, setRecognizedFirstName] = useState<string | null>(null);

  // Logueado: reflejar los datos de la cuenta en el checkout-data para que
  // /confirmar los lea (isCustomerValid). Solo customer — la dirección la
  // maneja la libreta de entrega.
  useEffect(() => {
    if (!savedCustomer) return;
    setCustomer({
      name: savedCustomer.name || "",
      phone: savedCustomer.phone || "",
      email: savedCustomer.email || "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedCustomer?.phone]);

  const guestStoreSlug = Object.values(byStore)[0]?.storeSlug ?? "";
  const phone = customer.phone ?? "";
  const phoneOk = /^9\d{8}$/.test(phone.trim());

  // Reconocimiento por WhatsApp (invitado): si ya compró en esta tienda,
  // autocompletamos el nombre de pila. Debounce 450ms + abort anti-race.
  // Silencioso: es una mejora opcional, nunca rompe el checkout público.
  useEffect(() => {
    if (savedCustomer) return;
    if (!guestStoreSlug || !/^9\d{8}$/.test(phone)) {
      setRecognizedFirstName(null);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/marketplace/checkout/customer-by-phone?phone=${phone}&storeSlug=${encodeURIComponent(guestStoreSlug)}`,
          { signal: ctrl.signal },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { found?: boolean; firstName?: string | null };
        if (!data.found || !data.firstName) {
          setRecognizedFirstName(null);
          return;
        }
        setRecognizedFirstName(data.firstName);
        if (!nameTouchedRef.current && !customer.name) setCustomer({ name: data.firstName });
      } catch {
        // AbortError o red caída — el autocompletado es opcional.
      }
    }, 450);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, guestStoreSlug, savedCustomer]);

  // ── Logueado: chip compacto ────────────────────────────────────────────
  if (savedCustomer) {
    const fullName = savedCustomer.name?.trim() || "vecino";
    const initial = fullName.charAt(0).toUpperCase();
    return (
      <div className="flex items-center gap-3 sm:gap-4">
        <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)] text-white text-lg font-bold uppercase">
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-0.5">
            Comprando como
          </p>
          <p className="text-base font-semibold tracking-[-0.01em] text-[var(--text-primary)] leading-tight truncate">
            {fullName}
          </p>
          {savedCustomer.phone && (
            <p className="text-[length:var(--ts-sm)] text-[var(--text-secondary)] truncate">
              +51 {savedCustomer.phone}
              {savedCustomer.email ? ` · ${savedCustomer.email}` : ""}
            </p>
          )}
        </div>
        <Link
          href={RETURN_TO}
          className="shrink-0 text-[length:var(--ts-sm)] font-bold text-[var(--accent)] hover:underline underline-offset-2"
        >
          Cambiar
        </Link>
      </div>
    );
  }

  // ── Invitado: inputs enlazados al checkout-data ────────────────────────
  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor="ck-name"
          className="mb-2 block text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]"
        >
          Nombre completo
        </label>
        <input
          id="ck-name"
          value={customer.name ?? ""}
          onChange={(e) => {
            nameTouchedRef.current = true;
            setCustomer({ name: e.target.value });
          }}
          placeholder="Ej. María Pérez"
          className="h-12 w-full rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-base text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] focus:ring-offset-2 focus:ring-offset-[var(--surface-raised)]"
        />
      </div>
      <div>
        <label
          htmlFor="ck-phone"
          className="mb-2 block text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]"
        >
          WhatsApp
        </label>
        <input
          id="ck-phone"
          value={phone}
          onChange={(e) => setCustomer({ phone: e.target.value.replace(/\D/g, "").slice(0, 9) })}
          inputMode="numeric"
          placeholder="9XXXXXXXX"
          className="h-12 w-full rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-base font-mono tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] focus:ring-offset-2 focus:ring-offset-[var(--surface-raised)]"
        />
        {phone.length > 0 && !phoneOk && (
          <p className="mt-2 ml-1 text-sm text-[var(--data-error-500)]">
            Tu WhatsApp debe tener 9 dígitos y empezar con 9.
          </p>
        )}
        {phoneOk && recognizedFirstName && (
          <p className="mt-2 ml-1 inline-flex items-center gap-1.5 text-sm font-bold text-[var(--accent)]">
            <CheckCircle2 className="h-4 w-4" strokeWidth={2.5} aria-hidden />
            ¡Hola de nuevo, {recognizedFirstName}! Te reconocimos.
          </p>
        )}
      </div>
      <p className="text-center text-base text-[var(--text-tertiary)]">
        ¿Ya tienes cuenta?{" "}
        <Link href={RETURN_TO} className="font-bold text-[var(--accent)] underline underline-offset-2">
          Inicia sesión
        </Link>
      </p>
    </div>
  );
}
