"use client";

/**
 * /checkout/** layout — wrap simplificado SIN navbar/promo/secondary.
 *
 * El usuario en /checkout enfoca en completar la compra (Amazon-style).
 * Solo logo + stepper + indicador "Compra segura".
 *
 * Excepción: /checkout/auth renderiza fondo vacío SIN shell (solo modal).
 *
 * NOTE: vive fuera de /marketplace para escapar del marketplace layout
 * (que tiene navbar + promo + secondary nav). Reusa los providers via
 * MarketplaceStoreProviders con tenantSlug="main".
 */

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import MarketplaceStoreProviders from "@/components/MarketplaceStoreProviders";
import MotionProvider from "@/components/MotionProvider";
import CheckoutShell from "@/components/marketplace/checkout/CheckoutShell";
import type { CheckoutStep } from "@/components/marketplace/checkout/CheckoutStepper";
import { CheckoutDataProvider } from "@/contexts/checkout-data-context";
import { CheckoutSummaryProvider } from "@/contexts/checkout-summary-context";

function pathToStep(pathname: string | null): CheckoutStep {
  // datos+entrega unificados → /checkout/datos (redirect) y /checkout/entrega
  // son el MISMO paso "entrega" en el stepper.
  if (!pathname) return "entrega";
  if (pathname.includes("/confirmar")) return "confirmar";
  return "entrega";
}

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // /checkout/auth es una pantalla-gate: solo modal sobre fondo vacío, sin shell
  const isAuthGate = pathname === "/checkout/auth";
  const current = pathToStep(pathname);

  return (
    <MarketplaceStoreProviders tenantSlug="main">
      <CheckoutDataProvider>
        <CheckoutSummaryProvider>
          <MotionProvider>
            <Suspense fallback={null}>
              {isAuthGate ? (
                <div className="min-h-screen bg-[var(--surface-canvas)]">{children}</div>
              ) : (
                <CheckoutShell current={current}>{children}</CheckoutShell>
              )}
            </Suspense>
          </MotionProvider>
        </CheckoutSummaryProvider>
      </CheckoutDataProvider>
    </MarketplaceStoreProviders>
  );
}
