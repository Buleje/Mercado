import Link from "next/link";
import { Home, ShoppingBag, Search, MapPin } from "lucide-react";
import type { Metadata } from "next";
import { zones } from "@/data/zones";
import { categories } from "@/data/products";

export const metadata: Metadata = {
  title: "404 — Pagina no encontrada | Buleje",
  description:
    "La pagina que buscas no existe o fue movida. Explora productos, zonas de cobertura o vuelve al inicio.",
  robots: { index: false, follow: true },
};

const topZones = zones.slice(0, 5);
const topCategories = categories.filter((c) => c.id !== "todos").slice(0, 4);

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="text-center max-w-lg">
        {/* Big 404 */}
        <p className="text-[8rem] sm:text-[10rem] leading-none font-black text-primary/20 select-none">
          404
        </p>

        <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground -mt-6">
          Pagina no encontrada
        </h1>
        <p className="mt-3 text-muted text-base">
          Lo sentimos, esta pagina no existe o fue movida.
        </p>

        {/* Search prompt */}
        <div className="mt-6">
          <Link
            href="/buscar"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-5 py-3 text-sm text-slate-500 hover:border-emerald-300 hover:text-emerald-600 transition-colors shadow-sm"
          >
            <Search className="h-4 w-4" />
            Buscar productos...
          </Link>
        </div>

        {/* Quick links */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 bg-primary text-white font-bold rounded-xl px-6 py-3 hover:bg-primary-dark active:scale-95 transition-all shadow-lg"
          >
            <Home className="h-4 w-4" />
            Ir al inicio
          </Link>
          <Link
            href="/tienda"
            className="flex items-center gap-2 bg-white dark:bg-card text-foreground font-bold rounded-xl px-6 py-3 border border-gray-200 dark:border-card-border hover:shadow-md active:scale-95 transition-all"
          >
            <ShoppingBag className="h-4 w-4" />
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
                {cat.emoji} {cat.label}
              </Link>
            ))}
          </div>
        </div>

        <p className="mt-8 text-xs text-muted">
          Buleje — Software ERP para Bodegas del Peru
        </p>
      </div>
    </main>
  );
}
