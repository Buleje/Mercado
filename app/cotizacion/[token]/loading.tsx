/**
 * Esqueleto de /cotizacion/[token]: da el límite de Suspense que Next 16 pide
 * para la lectura sin caché de la cotización (sin él, «Blocking Route» en dev).
 * Misma forma que la hoja: membrete, cliente, ítems y totales.
 */
export default function CotizacionLoading() {
  return (
    <main className="min-h-screen bg-[var(--surface-canvas)] px-3 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-2xl animate-pulse overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <div className="flex justify-between gap-4 border-b border-[var(--rule-base)] px-5 py-5">
          <div className="h-5 w-32 rounded bg-[var(--surface-sunken)]" />
          <div className="h-7 w-36 rounded bg-[var(--surface-sunken)]" />
        </div>
        <div className="space-y-2 border-b border-[var(--rule-base)] px-5 py-4">
          <div className="h-4 w-48 rounded bg-[var(--surface-sunken)]" />
          <div className="h-4 w-32 rounded bg-[var(--surface-sunken)]" />
        </div>
        <div className="space-y-3 px-5 py-4">
          <div className="h-10 rounded bg-[var(--surface-sunken)]" />
          <div className="h-10 rounded bg-[var(--surface-sunken)]" />
          <div className="h-10 rounded bg-[var(--surface-sunken)]" />
        </div>
        <div className="h-24 bg-[var(--surface-sunken)]" />
      </div>
    </main>
  );
}
