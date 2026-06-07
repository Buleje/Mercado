import Link from "next/link";

/**
 * /marketplace/* not-found.
 *
 * Mayo 2026 (designer audit): mensaje "Tienda no encontrada" se mostraba
 * para URLs como /marketplace/checkout — confuso porque no es una tienda
 * sino una ruta inexistente. Texto neutro + CTAs útiles.
 */
export default function MarketplaceNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface-canvas)] p-4">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-4" aria-hidden>🔍</div>
        <h1 className="text-2xl font-extrabold text-[var(--text-primary)]">
          No encontramos esta página
        </h1>
        <p className="mt-3 text-base text-[var(--text-secondary)] leading-relaxed">
          Es posible que el link esté roto o que la tienda ya no esté
          publicada. Probá explorando las bodegas activas o volvé al inicio.
        </p>
        <div className="mt-8 flex flex-wrap gap-3 justify-center">
          <Link
            href="/marketplace"
            className="rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-extrabold text-white shadow-md hover:bg-[var(--data-success-600)] transition-colors"
          >
            Explorar bodegas
          </Link>
          <Link
            href="/marketplace/carrito"
            className="rounded-full border-2 border-[var(--rule-base)] px-6 py-3 text-sm font-extrabold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          >
            Ver mi carrito
          </Link>
          <Link
            href="/"
            className="rounded-full px-6 py-3 text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            Ir al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
