/**
 * /tiendas — skeleton de carga matched al layout final.
 *
 * Brandon 2026-05-21 perf FOUC:
 *   Antes mostraba solo `<PaicheLoading label="Buscando tiendas" />` (icono
 *   centrado). Cuando el contenido real montaba, el layout saltaba a un
 *   grid de cards con filter bar arriba → flash visual gigante.
 *
 *   Este skeleton reproduce la estructura exacta del TiendasClient final:
 *     - Filter bar (chips inline, sort, estrellas, filtros)
 *     - Eyebrow "Tiendas · N · Entrega hoy"
 *     - Grid 1col mobile / 2col tablet / 3-4col desktop
 *     - Cards con aspect-[4/3] + body 3 líneas (mismo que
 *       components/marketplace/MarketplaceStoresView.tsx:544-579)
 *
 *   Tokens del DS — `--surface-raised`, `--surface-sunken`, `--rule-soft`
 *   funcionan en light + dark sin cambios.
 */

export default function TiendasLoading() {
  return (
    <div className="max-w-[1760px] mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-12">
      {/* Filter bar — chips + sort + estrellas + filtros (1 fila mobile) */}
      <div
        aria-hidden="true"
        className="flex items-center gap-2 mb-4 overflow-x-auto scrollbar-none"
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-9 w-24 shrink-0 rounded-full bg-[var(--surface-sunken)] animate-pulse"
          />
        ))}
      </div>

      {/* Eyebrow "Tiendas · N · Entrega hoy" */}
      <div
        aria-hidden="true"
        className="h-4 w-48 bg-[var(--surface-sunken)] rounded mb-3 animate-pulse"
      />

      {/* Grid de cards — mismas dimensiones y aspect ratio que el final */}
      <div
        aria-busy="true"
        aria-label="Cargando tiendas..."
        className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 mt-2"
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            aria-hidden="true"
            className="bg-[var(--surface-raised)] border border-[var(--rule-soft)] rounded-2xl overflow-hidden"
          >
            {/* Image area + badges placeholder */}
            <div className="relative aspect-[4/3] bg-[var(--surface-sunken)] animate-pulse">
              <div className="absolute top-3 left-3 flex gap-2">
                <div className="h-6 w-12 rounded-full bg-[var(--surface-raised)]/70" />
                <div className="h-6 w-16 rounded-full bg-[var(--surface-raised)]/70" />
              </div>
            </div>
            {/* Body */}
            <div className="p-4 space-y-3">
              <div className="h-5 bg-[var(--surface-sunken)] rounded-lg w-3/4 animate-pulse" />
              <div className="h-3 bg-[var(--surface-sunken)] rounded-lg w-full animate-pulse" />
              <div className="flex items-center gap-3">
                <div className="h-3 bg-[var(--surface-sunken)] rounded-lg w-16 animate-pulse" />
                <div className="h-3 bg-[var(--surface-sunken)] rounded-lg w-20 animate-pulse" />
                <div className="h-3 bg-[var(--surface-sunken)] rounded-lg w-16 animate-pulse" />
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-[var(--rule-soft)]">
                <div className="h-4 bg-[var(--surface-sunken)] rounded-lg w-24 animate-pulse" />
                <div className="h-3 bg-[var(--surface-sunken)] rounded-lg w-16 animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
