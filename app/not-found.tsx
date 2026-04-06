import Link from "next/link";
import { Home, ShoppingBag } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "404 — Página no encontrada | Buleje",
  description: "La página que buscas no existe o fue movida. Vuelve al inicio de Buleje.",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center max-w-lg">
        {/* Big 404 */}
        <p className="text-[8rem] sm:text-[10rem] leading-none font-black text-primary/20 select-none">
          404
        </p>

        <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground -mt-6">
          Página no encontrada
        </h1>
        <p className="mt-3 text-muted text-base sm:text-lg">
          Lo sentimos, la página que buscas no existe o fue movida.
        </p>

        {/* Quick links */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 bg-primary text-white font-bold rounded-xl px-6 py-3 hover:bg-primary-dark active:scale-95 transition-all shadow-lg"
          >
            <Home className="h-4 w-4" />
            Ir al inicio
          </Link>
          <Link
            href="/#productos"
            className="flex items-center gap-2 bg-white dark:bg-card text-foreground font-bold rounded-xl px-6 py-3 border border-gray-200 dark:border-card-border hover:shadow-md active:scale-95 transition-all"
          >
            <ShoppingBag className="h-4 w-4" />
            Ver productos
          </Link>
        </div>

        <p className="mt-10 text-xs text-muted">
          Buleje — Pucallpa, Ucayali
        </p>
      </div>
    </main>
  );
}
