/**
 * OfertasSkeleton — placeholder con altura reservada para /marketplace/ofertas.
 *
 * Perf (CLS): antes, durante la carga el cuerpo era `null` y FinalCTA/BackToTop
 * (que siempre renderean) quedaban pegados arriba; al resolver el fetch, todo el
 * contenido se insertaba ENCIMA y empujaba FinalCTA → CLS ~0.78. Este skeleton
 * ocupa la altura aproximada del contenido real, de modo que el layout no salta
 * cuando llegan los deals. Sin estado, sin fetch — puro layout.
 */
export default function OfertasSkeleton() {
  return (
    <div aria-hidden className="animate-pulse">
      {/* Hero band */}
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        <div className="h-44 sm:h-64 rounded-3xl bg-[var(--surface-sunken)]" />
      </div>

      {/* Filtros (sticky bar) */}
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <div className="flex flex-wrap gap-3">
          <div className="h-12 w-full sm:w-72 rounded-2xl bg-[var(--surface-sunken)]" />
          <div className="h-12 w-32 rounded-2xl bg-[var(--surface-sunken)]" />
          <div className="h-12 w-32 rounded-2xl bg-[var(--surface-sunken)]" />
        </div>
      </div>

      {/* Grid de cards */}
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-16">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-2xl border-2 border-[var(--rule-soft)] overflow-hidden">
              <div className="aspect-square bg-[var(--surface-sunken)]" />
              <div className="p-4 space-y-3">
                <div className="h-4 w-3/4 rounded-full bg-[var(--surface-sunken)]" />
                <div className="h-4 w-1/2 rounded-full bg-[var(--surface-sunken)]" />
                <div className="h-7 w-2/3 rounded-lg bg-[var(--surface-sunken)]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
