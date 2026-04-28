"use client";

/**
 * /admin/store-analytics — Página standalone con la analítica de productos.
 *
 * Acceso vía nav admin o link directo. Hereda el layout `app/admin/layout.tsx`
 * (que ya cubre auth + chrome). El módulo es 100% client component porque
 * fetchea datos del usuario logueado.
 */

import StoreAnalyticsModule from "@/components/admin/StoreAnalyticsModule";

export default function StoreAnalyticsPage() {
  return (
    <main className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <StoreAnalyticsModule />
    </main>
  );
}
