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

import CheckoutTopBar from "./CheckoutTopBar";
import type { CheckoutStep } from "./CheckoutStepper";

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
      <main className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8 pb-12">
        {children}
      </main>
    </div>
  );
}
