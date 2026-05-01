"use client";

/**
 * CheckoutShell — header sticky con logo contextual + stepper + trust badge.
 *
 * Logo redirect (en orden de prioridad):
 *   1. Si el usuario está impersonado por superadmin a un tenant específico,
 *      el logo lo lleva a `/t/[slug]/admin` (su panel "Mi tienda").
 *   2. Si el carrito tiene exactamente UNA tienda, lo lleva al storefront
 *      `/marketplace/[slug]` de esa tienda.
 *   3. Caso por defecto, lo lleva a `/marketplace/tiendas`.
 *
 * Esto resuelve el caso de "estaba comprando en una tienda → quiero volver
 * a esa tienda al cancelar el checkout, no al marketplace global".
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ShieldCheck, Truck } from "@buleje/design-system/icons";
import { BulejeWordmark } from "@/components/ui-system/illustrations";
import CheckoutStepper, { type CheckoutStep } from "./CheckoutStepper";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";

function readActiveTenant(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)active-tenant=([^;]+)/);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

function readImpersonationFlag(): boolean {
  if (typeof document === "undefined") return false;
  return /(?:^|;\s*)superadmin-impersonating=/.test(document.cookie);
}

export default function CheckoutShell({
  current,
  children,
}: {
  current: CheckoutStep;
  children: React.ReactNode;
}) {
  const { byStore } = useMarketplaceCart();
  const [activeTenantSlug, setActiveTenantSlug] = useState<string | null>(null);
  const [isImpersonating, setIsImpersonating] = useState(false);

  useEffect(() => {
    setActiveTenantSlug(readActiveTenant());
    setIsImpersonating(readImpersonationFlag());
  }, []);

  const logoHref = useMemo(() => {
    // 1. Modo superadmin impersonando un tenant → su panel admin
    if (isImpersonating && activeTenantSlug) {
      return `/t/${activeTenantSlug}/admin`;
    }
    // 2. Single-store cart → storefront de esa tienda
    const storeSlugs = Object.values(byStore)
      .map((s) => s.storeSlug)
      .filter((s): s is string => Boolean(s));
    const uniqueSlugs = Array.from(new Set(storeSlugs));
    if (uniqueSlugs.length === 1 && uniqueSlugs[0] && uniqueSlugs[0] !== "main") {
      return `/marketplace/${uniqueSlugs[0]}`;
    }
    // 3. Default — lista de tiendas
    return "/marketplace/tiendas";
  }, [byStore, activeTenantSlug, isImpersonating]);

  const logoLabel = isImpersonating
    ? "Volver a mi tienda"
    : "Volver a las tiendas";

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)]">
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
