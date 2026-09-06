"use client";

/**
 * CheckoutShell — header sticky (logo + stepper + trust) + riel de resumen
 * PERSISTENTE. Ambos viven acá, en el layout, así que al navegar entre pasos
 * (datos → entrega → confirmar) NO se recargan: solo cambia la sección central
 * (`children`). El resumen se dibuja desde la config que registra cada paso
 * (useRegisterCheckoutSummary) — mismo CheckoutSummary "shop" que el carrito.
 *
 * Logo redirect (en orden de prioridad):
 *   1. Si el usuario está impersonado por superadmin a un tenant específico,
 *      el logo lo lleva a `/t/[slug]/admin` (su panel "Mi tienda").
 *   2. Si el carrito tiene exactamente UNA tienda, lo lleva al storefront
 *      `/marketplace/[slug]` de esa tienda.
 *   3. Caso por defecto, lo lleva a `/marketplace/tiendas`.
 */

import CheckoutTopBar from "./CheckoutTopBar";
import CheckoutSummary from "./CheckoutSummary";
import CheckoutMobileCtaBar from "./CheckoutMobileCtaBar";
import type { CheckoutStep } from "./CheckoutStepper";
import { useCheckoutSummaryConfig } from "@/contexts/checkout-summary-context";

/** Riel de resumen desktop (columna derecha sticky). Persistente en el layout. */
function CheckoutSummaryHost() {
  const config = useCheckoutSummaryConfig();
  if (!config) return null;
  return (
    <div className="hidden lg:block">
      <CheckoutSummary
        variant="shop"
        ctaLabel={config.ctaLabel}
        ctaHref={config.ctaHref}
        onCtaClick={config.onCtaClick}
        ctaDisabled={config.ctaDisabled}
        ctaLoading={config.ctaLoading}
        couponDiscount={config.couponDiscount}
        loyaltyDiscount={config.loyaltyDiscount}
        showItems={config.showItems}
        helperText={config.helperText}
      />
    </div>
  );
}

/** Barra CTA sticky-bottom mobile. Persistente en el layout. */
function CheckoutMobileBarHost() {
  const config = useCheckoutSummaryConfig();
  if (!config) return null;
  return (
    <CheckoutMobileCtaBar
      primaryLabel={config.mobilePrimaryLabel ?? "Total"}
      total={config.mobileTotal ?? null}
      ctaLabel={config.mobileCtaLabel ?? config.ctaLabel}
      ctaHref={config.ctaHref}
      ctaOnClick={config.onCtaClick}
      ctaDisabled={config.ctaDisabled}
      ctaLoading={config.ctaLoading}
      helperText={config.mobileHelperText ?? config.helperText}
      disabledReason={config.mobileDisabledReason}
    />
  );
}

export default function CheckoutShell({
  current,
  children,
}: {
  current: CheckoutStep;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      <CheckoutTopBar current={current} />
      <main className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8 lg:pt-10">
        {/* Grid persistente: sección central (children) + riel de resumen.
            items-start + sticky (dentro del CheckoutSummary) mantienen el riel
            fijo mientras solo cambia la columna izquierda al navegar pasos. */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 sm:gap-6 lg:gap-8 items-start pb-28 lg:pb-16">
          <div className="min-w-0">{children}</div>
          <CheckoutSummaryHost />
        </div>
      </main>
      <CheckoutMobileBarHost />
    </div>
  );
}
