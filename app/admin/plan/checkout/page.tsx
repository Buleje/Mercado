/**
 * app/admin/plan/checkout/page.tsx
 *
 * Página de checkout cuando el dueño quiere subir de plan en su panel admin.
 * Recibe `?plan=pro|enterprise|max` por query y muestra:
 *   - Resumen del plan seleccionado (precio, features clave)
 *   - Selector de método de pago (Yape, Plin, Stripe, transferencia, efectivo)
 *   - Confirmación con plantilla per-método
 *   - Detección automática del pago → activa el plan vía setCurrentPlan
 *
 * Server component shell que delega al cliente para la UI interactiva.
 */

import { Suspense } from "react";
import type { Metadata } from "next";
import PlanCheckoutClient from "./PlanCheckoutClient";

export const metadata: Metadata = {
  title: "Confirmar plan — Buleje Seller",
  robots: { index: false, follow: false },
};

export default function PlanCheckoutPage() {
  return (
    <Suspense fallback={null}>
      <PlanCheckoutClient />
    </Suspense>
  );
}
