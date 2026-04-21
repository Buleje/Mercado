"use client";

/**
 * CheckoutShell — header sticky con logo + stepper + trust badge.
 *
 * Versión editorial:
 *   - backdrop-blur en scroll
 *   - Border-b rule-base (antes rule-soft)
 *   - Trust badge con ShieldCheck + Truck en pill accent-soft
 *   - Layout responsive: stepper compacto en mobile, expandido en desktop
 *
 * No reemplaza el navbar en /marketplace/carrito — ese vive dentro del
 * marketplace layout. Solo las rutas /checkout/** usan el Shell.
 */

import Link from "next/link";
import { ShieldCheck, Truck } from "@buleje/design-system/icons";
import { BulejeWordmark } from "@/components/ui-system/illustrations";
import CheckoutStepper, { type CheckoutStep } from "./CheckoutStepper";

export default function CheckoutShell({
  current,
  children,
}: {
  current: CheckoutStep;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      <header className="sticky top-0 z-40 border-b border-[var(--rule-base)] bg-[var(--surface-canvas)]/90 backdrop-blur-md supports-[backdrop-filter]:bg-[var(--surface-canvas)]/80">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            <Link
              href="/marketplace"
              aria-label="Volver al marketplace"
              className="flex items-center shrink-0 text-[var(--accent)]"
            >
              <BulejeWordmark
                size={30}
                strokeWidth={1.75}
                textSize={17}
                className="text-[var(--accent)] dark:text-white"
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

      <main className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8 pb-12">
        {children}
      </main>
    </div>
  );
}
