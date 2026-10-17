/**
 * Skeleton de /cuenta — fiel al layout real de CuentaDashboardClient (audit
 * 2026-06-26): hero grande (tier + saludo + puntos + progreso) → fila de 4 stats
 * → pedidos recientes → grilla de accesos. Antes mostraba un layout distinto
 * (card chica + tabs + direcciones) que no existe en el dashboard.
 */
export default function Loading() {
  return (
    <div className="min-h-screen bg-[var(--surface-sunken)] dark:bg-background">
      {/* Header placeholder */}
      <div className="h-[6.75rem] sm:h-[7.75rem]" />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-5 pb-28">
        {/* Hero grande — tier + saludo + puntos + progreso */}
        <div
          className="h-44 sm:h-48 rounded-3xl animate-pulse"
          style={{ background: "color-mix(in oklch, var(--color-primary, #00A0A0) 16%, var(--surface-sunken))" }}
        />

        {/* Fila de 4 stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-[var(--color-card)] dark:bg-[var(--surface-sunken)] rounded-2xl border border-[var(--rule-soft)] dark:border-[var(--rule-base)] p-4 animate-pulse text-center space-y-2"
            >
              <div className="h-7 w-10 mx-auto bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-lg" />
              <div className="h-2.5 w-16 mx-auto bg-[var(--surface-sunken)] dark:bg-[var(--surface-raised)] rounded-full" />
            </div>
          ))}
        </div>

        {/* Pedidos recientes — header + lista */}
        <div className="bg-[var(--color-card)] dark:bg-[var(--surface-sunken)] rounded-2xl border border-[var(--rule-soft)] dark:border-[var(--rule-base)] p-4 sm:p-5 space-y-3 animate-pulse">
          <div className="h-4 w-40 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-lg" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-28 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-full" />
                <div className="h-2.5 w-44 bg-[var(--surface-sunken)] dark:bg-[var(--surface-raised)] rounded-full" />
              </div>
              <div className="h-4 w-16 bg-[var(--rule-soft)] dark:bg-[var(--surface-raised)] rounded-full shrink-0" />
            </div>
          ))}
        </div>

        {/* Accesos rápidos — grilla */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-24 bg-[var(--color-card)] dark:bg-[var(--surface-sunken)] rounded-2xl border border-[var(--rule-soft)] dark:border-[var(--rule-base)] animate-pulse"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
