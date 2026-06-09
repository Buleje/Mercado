"use client";

/**
 * CheckoutTopBar — header sticky UNIFICADO del flujo de compra (carrito +
 * /checkout/**). Logo wordmark + stepper + trust badge "Pago seguro · Delivery".
 *
 * Brandon 2026-06-08: antes el carrito usaba un header minimal ("B Buleje ·
 * Compra segura") y el stepper iba en el body, mientras /checkout usaba este
 * header con el stepper arriba. Resultado: la "barra de arriba" se veía distinta
 * entre carrito y finalizar. Ahora ambos comparten ESTE componente — el stepper
 * avanza carrito → finalizar en la misma barra.
 *
 * Logo redirect (en orden de prioridad):
 *   1. Superadmin impersonando un tenant → su panel `/t/[slug]/admin`.
 *   2. Caso por defecto → directorio `/tiendas`.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ShieldCheck, Truck } from "@buleje/design-system/icons";
import { BulejeWordmark } from "@/components/ui-system/illustrations";
import CheckoutStepper, { type CheckoutStep } from "./CheckoutStepper";

function readActiveTenant(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)active-tenant=([^;]+)/);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

function readImpersonationFlag(): boolean {
  if (typeof document === "undefined") return false;
  return /(?:^|;\s*)superadmin-impersonating=/.test(document.cookie);
}

export default function CheckoutTopBar({ current }: { current: CheckoutStep }) {
  const [activeTenantSlug, setActiveTenantSlug] = useState<string | null>(null);
  const [isImpersonating, setIsImpersonating] = useState(false);

  useEffect(() => {
    setActiveTenantSlug(readActiveTenant());
    setIsImpersonating(readImpersonationFlag());
  }, []);

  const logoHref = useMemo(() => {
    if (isImpersonating && activeTenantSlug) {
      return `/t/${activeTenantSlug}/admin`;
    }
    return "/tiendas";
  }, [activeTenantSlug, isImpersonating]);

  const logoLabel = isImpersonating ? "Volver a mi tienda" : "Volver a las tiendas";

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--rule-base)] bg-[var(--surface-canvas)]/90 backdrop-blur-md supports-[backdrop-filter]:bg-[var(--surface-canvas)]/80">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          <Link
            href={logoHref}
            aria-label={logoLabel}
            title={logoLabel}
            className="flex items-center shrink-0 text-[var(--accent)]"
          >
            <BulejeWordmark
              size={30}
              strokeWidth={1.75}
              textSize={17}
              className="text-[var(--accent-600)] dark:text-white"
            />
          </Link>

          <div className="flex-1 flex justify-center min-w-0 overflow-x-auto scrollbar-none">
            <CheckoutStepper current={current} />
          </div>

          <div className="hidden md:inline-flex items-center gap-2 rounded-full bg-[var(--accent-soft)] px-3.5 py-1.5 text-[length:var(--ts-xs)] font-semibold text-[var(--accent)] shrink-0">
            <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Pago seguro
            <span aria-hidden className="h-3 w-px bg-[var(--accent)]/30" />
            <Truck className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Delivery 25 min
          </div>

          <span className="md:hidden inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-semibold text-[var(--accent)] shrink-0">
            <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Seguro
          </span>
        </div>
      </div>
    </header>
  );
}
