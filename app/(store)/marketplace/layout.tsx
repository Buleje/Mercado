import MainWithBackKey from "@/components/marketplace/MainWithBackKey";

/**
 * Layout de `/marketplace/*` — WRAPPER MÍNIMO (Brandon 2026-06-07).
 *
 * Tras mover `marketplace/` dentro del route group `(store)`, todo el chrome
 * (navbar, providers, footer, bottom-nav, widgets) vive en el layout PADRE
 * `app/(store)/layout.tsx` y es PERSISTENTE: navegar entre `/`, `/tiendas` y
 * `/marketplace` ya NO remonta el navbar ni los providers — solo cambia el
 * `<main>` interior. Antes este layout duplicaba navbar + provider tree, lo que
 * causaba el remount/parpadeo que reportó Brandon.
 *
 * Este layout solo aporta:
 *   - `<main id="main-content">` (target del SkipLink WCAG 2.4.1) vía
 *     MainWithBackKey, que las páginas de marketplace NO renderizan por su cuenta.
 *   - Refresh suave del contenido + crossfade al volver de un detail
 *     (`/marketplace/[slug]`) al listado — sin recarga dura del navegador.
 *
 * Metadata: heredada del `(store)` layout (template `%s | Buleje`) + la
 * `generateMetadata()` propia de cada `page.tsx` (marketplace ya tiene la suya).
 */
export default function MarketplaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MainWithBackKey>{children}</MainWithBackKey>;
}
