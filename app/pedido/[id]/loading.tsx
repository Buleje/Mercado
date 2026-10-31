/**
 * Skeleton de /pedido/[id] (seguimiento) — provee el límite de Suspense que
 * Next 16 pide para el acceso dinámico de la ruta (useParams/useSearchParams),
 * evitando el warning "connection() outside <Suspense>".
 */
export default function PedidoLoading() {
  return (
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      <div className="mx-auto max-w-2xl px-4 py-8 animate-pulse">
        <div className="h-6 w-40 rounded bg-[var(--surface-sunken)]" />
        <div className="mt-6 h-40 rounded-2xl bg-[var(--surface-sunken)]" />
        <div className="mt-4 h-24 rounded-2xl bg-[var(--surface-sunken)]" />
        <div className="mt-4 h-24 rounded-2xl bg-[var(--surface-sunken)]" />
      </div>
    </div>
  );
}
