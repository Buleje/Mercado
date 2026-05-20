"use client";

/**
 * ConditionalGlobalChrome — pass-through trivial.
 *
 * Brandon 2026-05-20 v7: este componente antes ocultaba (en mobile) el chrome
 * global del marketplace cuando la ruta era un storefront `/marketplace/[slug]`,
 * porque el StoreDetailClient tenía su propio top fixed nav. Brandon pidió
 * unificar todos los navs — ahora el storefront usa el MarketplaceNavbar
 * global (con logo dinámico del negocio en el search pill, ver
 * `useStorefrontLogo` en MarketplaceNavbar.tsx). El nav custom del
 * StoreDetailClient se eliminó.
 *
 * Mantenemos este wrapper como pass-through para no tocar app/marketplace/
 * layout.tsx (evita re-render del Suspense tree y refactor riesgoso).
 * Si en el futuro vuelve a haber condicional de chrome por ruta, este es el
 * punto natural para implementarlo.
 */

export default function ConditionalGlobalChrome({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
