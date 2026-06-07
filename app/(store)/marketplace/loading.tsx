/**
 * /marketplace — skeleton de carga estructurado (Brandon 2026-06-07).
 *
 * Antes era `<PaicheLoading variant="page" />` (ícono centrado) → al montar el
 * contenido real, el layout saltaba a la grilla 3-columnas tipo Facebook (rail
 * de categorías + feed/catálogo + rail de banners) = flash visual grande.
 *
 * Este skeleton calca esa estructura para minimizar CLS/FOUC, igual que el de
 * /tiendas. Tokens del DS (--surface-raised/sunken, --rule-soft) → light + dark.
 */
export default function MarketplaceLoading() {
  return (
    <div className="max-w-[1760px] mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-12">
      {/* Tira de categorías (sub-nav horizontal) */}
      <div
        aria-hidden="true"
        className="flex items-center gap-2 mb-5 overflow-x-auto scrollbar-none"
      >
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="h-9 w-20 shrink-0 rounded-full bg-[var(--surface-sunken)] animate-pulse"
          />
        ))}
      </div>

      {/* Grilla 3 columnas: rail izq · feed central · rail der (publicidad) */}
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_300px] gap-6">
        {/* Rail izquierdo — categorías/filtros (oculto en mobile) */}
        <aside aria-hidden="true" className="hidden lg:block space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-8 bg-[var(--surface-sunken)] rounded-lg animate-pulse"
              style={{ width: `${70 + (i % 3) * 10}%` }}
            />
          ))}
        </aside>

        {/* Feed central — grid de cards de tienda/producto */}
        <div
          aria-busy="true"
          aria-label="Cargando marketplace…"
          className="grid grid-cols-2 md:grid-cols-3 gap-4"
        >
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              aria-hidden="true"
              className="bg-[var(--surface-raised)] border border-[var(--rule-soft)] rounded-2xl overflow-hidden"
            >
              <div className="aspect-square bg-[var(--surface-sunken)] animate-pulse" />
              <div className="p-3 space-y-2">
                <div className="h-4 bg-[var(--surface-sunken)] rounded w-3/4 animate-pulse" />
                <div className="h-3 bg-[var(--surface-sunken)] rounded w-1/2 animate-pulse" />
                <div className="h-5 bg-[var(--surface-sunken)] rounded w-1/3 animate-pulse mt-2" />
              </div>
            </div>
          ))}
        </div>

        {/* Rail derecho — banners/publicidad (oculto en mobile y tablet) */}
        <aside aria-hidden="true" className="hidden lg:block space-y-4">
          <div className="h-48 bg-[var(--surface-sunken)] rounded-2xl animate-pulse" />
          <div className="h-32 bg-[var(--surface-sunken)] rounded-2xl animate-pulse" />
        </aside>
      </div>
    </div>
  );
}
