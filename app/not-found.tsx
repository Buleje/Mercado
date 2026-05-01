import Link from "next/link";
import { Home, ShoppingBag, Search, MapPin } from "@buleje/design-system/icons";
import type { Metadata } from "next";
import { zones } from "@/data/zones";
import { categories } from "@/data/products";
import { PaicheMascot } from "@/components/ui-system/illustrations/PaicheMascot";
import { buildTenantTitle } from "@/lib/store-metadata";

// `title.absolute` evita el doble "Buleje" en tiendas individuales y mantiene
// el sufijo del marketplace en resto del sitio.
export async function generateMetadata(): Promise<Metadata> {
  return buildTenantTitle(
    "404 — El paiche se fue por otro río",
    "La página que buscas no existe o fue movida. Explora productos, zonas de cobertura o vuelve al inicio.",
    { index: false, follow: true },
  );
}

const topZones = zones.slice(0, 5);
const topCategories = categories.filter((c) => c.id !== "todos").slice(0, 4);

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--surface-canvas)] px-4 py-12">
      <div className="text-center max-w-2xl">
        {/* Paiche — símbolo amazónico perdido en el río equivocado */}
        <div className="text-[var(--accent)] flex justify-center mb-8">
          <PaicheMascot size={200} strokeWidth={1.75} animated />
        </div>

        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-3">
          Error 404
        </p>
        <h1 className="font-display text-4xl sm:text-5xl font-normal tracking-[var(--ls-tight)] text-[var(--text-primary)]">
          El paiche se fue por otro río
        </h1>
        <p className="mt-4 text-lg text-[var(--text-secondary)] leading-relaxed max-w-md mx-auto">
          La página que buscas no existe. Pero tu próxima compra sí —
          vuelve al inicio o busca lo que necesitas.
        </p>

        {/* Search prompt */}
        <div className="mt-6">
          <Link
            href="/buscar"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 py-3 text-sm text-[var(--text-tertiary)] hover:border-[var(--rule-strong)] hover:text-[var(--text-primary)] transition-colors"
          >
            <Search className="h-4 w-4" strokeWidth={1.75} />
            Buscar productos…
          </Link>
        </div>

        {/* Quick links */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 bg-[var(--text-primary)] text-[var(--surface-canvas)] font-bold rounded-full px-6 py-3 text-sm hover:opacity-90 active:scale-95 transition-all"
          >
            <Home className="h-4 w-4" strokeWidth={1.75} />
            Ir al inicio
          </Link>
          <Link
            href="/tienda"
            className="inline-flex items-center gap-2 bg-transparent text-[var(--text-primary)] font-bold rounded-full px-6 py-3 text-sm border border-[var(--rule-base)] hover:border-[var(--rule-strong)] active:scale-95 transition-all"
          >
            <ShoppingBag className="h-4 w-4" strokeWidth={1.75} />
            Ver productos
          </Link>
        </div>

        {/* Zone links — SEO internal linking */}
        <div className="mt-10 border-t border-slate-100 dark:border-slate-800 pt-6">
          <div className="flex items-center justify-center gap-1 mb-3">
            <MapPin className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Buleje en tu ciudad
            </span>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {topZones.map((zone) => (
              <Link
                key={zone.slug}
                href={`/zona/${zone.slug}`}
                className="text-xs text-slate-400 hover:text-emerald-600 transition-colors"
              >
                {zone.name}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap justify-center gap-2 mt-2">
            {topCategories.map((cat) => (
              <Link
                key={cat.id}
                href={`/tienda/categoria/${cat.id}`}
                className="text-xs text-slate-400 hover:text-emerald-600 transition-colors"
              >
                {cat.label}
              </Link>
            ))}
          </div>
        </div>

        <p className="mt-8 text-xs text-muted">
          Buleje — Software ERP para Bodegas del Perú
        </p>
      </div>
    </main>
  );
}
