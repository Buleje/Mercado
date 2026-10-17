/**
 * Skeleton de /pedido/[id]/gracias — provee el límite de Suspense que Next 16
 * (Cache Components) pide para el acceso dinámico de la ruta, y da un estado de
 * carga acorde al rediseño en vez de un flash en blanco.
 */
export default function GraciasLoading() {
  return (
    <div className="relative min-h-screen bg-[var(--surface-canvas)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-linear-to-b from-[var(--accent-soft)] to-transparent"
      />
      <div className="relative mx-auto max-w-[30rem] px-4 py-10 sm:py-14 animate-pulse">
        <div className="mx-auto mb-5 h-20 w-20 rounded-full bg-[var(--surface-sunken)]" />
        <div className="mx-auto h-8 w-3/5 rounded-lg bg-[var(--surface-sunken)]" />
        <div className="mx-auto mt-3 h-4 w-4/5 rounded bg-[var(--surface-sunken)]" />
        <div className="mt-8 h-28 rounded-2xl bg-[var(--surface-sunken)]" />
        <div className="mt-4 h-13 rounded-full bg-[var(--surface-sunken)]" />
        <div className="mt-2.5 h-13 rounded-full bg-[var(--surface-sunken)]" />
      </div>
    </div>
  );
}
