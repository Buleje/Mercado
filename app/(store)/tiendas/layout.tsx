import MainWithBackKey from "@/components/marketplace/MainWithBackKey";

/**
 * Layout de `/tiendas/*` — WRAPPER MÍNIMO (Brandon 2026-06-07).
 *
 * Igual que `marketplace/layout.tsx`: tras mover `tiendas/` dentro del route
 * group `(store)`, el chrome (navbar + providers + footer + bottom-nav) vive en
 * el layout PADRE persistente `app/(store)/layout.tsx`. Navegar entre `/`,
 * `/tiendas` y `/marketplace` ya NO remonta el navbar — solo cambia el `<main>`.
 *
 * Aporta el `<main id="main-content">` (SkipLink target) + refresh suave +
 * crossfade del contenido al volver de un detail, vía MainWithBackKey.
 *
 * Metadata: heredada del `(store)` layout + el `export const metadata` propio
 * de `tiendas/page.tsx`.
 */
export default function TiendasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MainWithBackKey>{children}</MainWithBackKey>;
}
