/** Lo que se ve mientras carga el Resumen. */
export default function EsqueletoResumen() {
  return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-full bg-[var(--surface-sunken)]" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-[var(--surface-sunken)] rounded w-16" />
                  <div className="h-5 bg-[var(--surface-sunken)] rounded w-24" />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-6">
          <div className="h-4 bg-[var(--surface-sunken)] rounded w-48 mb-4" />
          <div className="h-80 bg-[var(--surface-sunken)] rounded-xl" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-6">
            <div className="h-50 bg-[var(--surface-sunken)] rounded-xl" />
          </div>
          <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-6">
            <div className="h-50 bg-[var(--surface-sunken)] rounded-xl" />
          </div>
        </div>
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-6">
          <div className="h-70 bg-[var(--surface-sunken)] rounded-xl" />
        </div>
      </div>
  );
}
