import Link from "next/link";
import { Search, Store, Wallet, Truck } from "@buleje/design-system/icons";

/**
 * MarketplaceHomeHeader — header SSR (server component) del home /marketplace.
 *
 * Por qué SSR: el resto de la home son secciones `dynamic({ ssr: false })`, así
 * que Google veía una página sin contenido ni <h1>. Este header se renderiza
 * en servidor → aporta el <h1> con keyword, una propuesta de valor crawlable y
 * un trust strip con data real. También mejora la primera impresión mobile
 * (antes abría con un banner promo sin contexto).
 *
 * Slim a propósito: NO es el hero editorial grande que se removió en abr-2026
 * (ese duplicaba el banner rotativo). Esto es una cabecera compacta + SEO.
 */
export default function MarketplaceHomeHeader({
  storeCount,
}: {
  storeCount?: number;
}) {
  return (
    <header className="border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)]">
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <p className="text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">
          Marketplace · Pucallpa
        </p>
        <h1 className="mt-2 text-2xl sm:text-4xl lg:text-5xl font-black leading-[1.05] tracking-[var(--ls-tight)] text-[var(--text-primary)]">
          Tus bodegas y tiendas favoritas,{" "}
          <span className="text-[var(--accent)]">a un toque</span>
        </h1>
        <p className="mt-3 max-w-2xl text-sm sm:text-lg leading-relaxed text-[var(--text-secondary)]">
          Pedí de bodegas, minimarkets y tiendas del Perú en un solo lugar.
          Delivery rápido y pago con Yape, tarjeta o efectivo.
        </p>

        {/* Búsqueda — link crawlable hacia el catálogo completo, con apariencia
            de barra de búsqueda (la búsqueda en vivo vive en el navbar). */}
        <Link
          href="/marketplace/explorar"
          className="mt-5 flex w-full max-w-xl items-center gap-3 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 py-3.5 text-left transition-colors hover:border-[var(--accent)]"
        >
          <Search className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]" strokeWidth={2} aria-hidden />
          <span className="text-sm sm:text-base font-medium text-[var(--text-tertiary)]">
            Buscar productos, bodegas o categorías
          </span>
        </Link>

        {/* Trust strip — señales reales, sin números inventados. */}
        <ul className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-semibold text-[var(--text-secondary)]">
          {storeCount && storeCount > 0 ? (
            <li className="inline-flex items-center gap-2">
              <Store className="h-4 w-4 text-[var(--accent)]" strokeWidth={2} aria-hidden />
              {storeCount} {storeCount === 1 ? "tienda activa" : "tiendas activas"}
            </li>
          ) : null}
          <li className="inline-flex items-center gap-2">
            <Wallet className="h-4 w-4 text-[var(--accent)]" strokeWidth={2} aria-hidden />
            Yape, tarjeta o efectivo
          </li>
          <li className="inline-flex items-center gap-2">
            <Truck className="h-4 w-4 text-[var(--accent)]" strokeWidth={2} aria-hidden />
            Delivery rápido
          </li>
        </ul>
      </div>
    </header>
  );
}
