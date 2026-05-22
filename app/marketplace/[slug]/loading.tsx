/**
 * /marketplace/[slug] — skeleton de carga matched al storefront real.
 *
 * Brandon 2026-05-21 perf FOUC v4:
 *   Antes mostraba `<PaicheLoading label="Abriendo la tienda…" />` (icono
 *   centrado). Cuando StoreDetailClient montaba, el layout saltaba a:
 *     hero banner + sticky nav + filter bar + grid de productos + reviews.
 *   Estructuras completamente opuestas → flash visual gigante al entrar a
 *   una tienda desde /tiendas o /marketplace.
 *
 *   Este skeleton reproduce la estructura real del storefront:
 *     - Hero card con cover + logo placeholder
 *     - Stats row (rating · delivery · zona · estado)
 *     - Filter row (search + grid/list toggle)
 *     - Sidebar de categorías (desktop) + grid 2/3/4-col de productos
 *
 *   Tokens del DS — `--surface-raised`, `--surface-sunken`, `--rule-soft`
 *   funcionan en light + dark sin cambios.
 */

export default function StoreDetailLoading() {
  return (
    <div className="max-w-7xl mx-auto">
      {/* ── Hero card (cover + logo + título) ── */}
      <div
        aria-hidden="true"
        className="relative w-full aspect-[16/6] sm:aspect-[16/5] bg-[var(--surface-sunken)] animate-pulse"
      >
        <div className="absolute bottom-4 left-4 sm:bottom-6 sm:left-6 flex items-center gap-3">
          <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl bg-[var(--surface-raised)]/80" />
          <div className="space-y-2">
            <div className="h-5 w-40 bg-[var(--surface-raised)]/80 rounded" />
            <div className="h-3 w-24 bg-[var(--surface-raised)]/60 rounded" />
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8">
        {/* Stats row (rating · delivery · zona · estado) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              aria-hidden="true"
              className="h-16 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3 space-y-2"
            >
              <div className="h-3 w-12 bg-[var(--surface-sunken)] rounded animate-pulse" />
              <div className="h-4 w-20 bg-[var(--surface-sunken)] rounded animate-pulse" />
            </div>
          ))}
        </div>

        {/* Filter row — search + toggle vista */}
        <div className="flex items-center gap-2 my-4">
          <div className="h-12 flex-1 max-w-md rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] animate-pulse" />
          <div className="h-9 w-20 rounded-full bg-[var(--surface-sunken)] animate-pulse" />
        </div>

        {/* Sidebar (desktop) + Grid */}
        <div className="flex gap-6">
          <aside
            aria-hidden="true"
            className="hidden lg:flex w-48 shrink-0 flex-col gap-2"
          >
            <div className="h-4 w-24 bg-[var(--surface-sunken)] rounded mb-2 animate-pulse" />
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-10 rounded-lg bg-[var(--surface-sunken)] animate-pulse"
              />
            ))}
          </aside>

          <div className="flex-1">
            <div
              aria-busy="true"
              aria-label="Cargando productos..."
              className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4"
            >
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  aria-hidden="true"
                  className="bg-[var(--surface-raised)] border border-[var(--rule-soft)] rounded-2xl overflow-hidden"
                >
                  <div className="relative aspect-square bg-[var(--surface-sunken)] animate-pulse" />
                  <div className="p-3 space-y-2">
                    <div className="h-4 w-3/4 bg-[var(--surface-sunken)] rounded animate-pulse" />
                    <div className="h-3 w-1/2 bg-[var(--surface-sunken)] rounded animate-pulse" />
                    <div className="flex items-center justify-between pt-1">
                      <div className="h-5 w-16 bg-[var(--surface-sunken)] rounded animate-pulse" />
                      <div className="h-7 w-7 rounded-full bg-[var(--surface-sunken)] animate-pulse" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
