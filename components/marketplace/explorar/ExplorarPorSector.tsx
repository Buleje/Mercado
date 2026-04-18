"use client";

/**
 * ExplorarPorSector — Mini-boxes con icons del DS (lucide) para navegar por
 * categorias/sectores. Sin imagenes, solo iconos grises minimalistas.
 * 2 cols mobile / 4 tablet / 8 desktop.
 */

import Link from "next/link";
import {
  Package,
  Beef,
  Croissant,
  Wine,
  Pill,
  Wrench,
  Apple,
  Candy,
} from "lucide-react";

interface Sector {
  id: string;
  label: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  href: string;
}

// Links a /marketplace/categoria/[slug] — slugs canonicos del registry en
// `lib/db/marketplace-catalog.db.ts`. Los sectores sin categoria canonica
// (licoreria, ferreteria, confiteria) apuntan al fallback mas cercano
// (bebidas, limpieza-hogar, abarrotes) para no romper flow.
const SECTORES: Sector[] = [
  { id: "abarrotes", label: "Abarrotes", Icon: Package, href: "/marketplace/categoria/abarrotes" },
  { id: "carniceria", label: "Carniceria", Icon: Beef, href: "/marketplace/categoria/carnes" },
  { id: "panaderia", label: "Panaderia", Icon: Croissant, href: "/marketplace/categoria/panaderia" },
  { id: "licoreria", label: "Licoreria", Icon: Wine, href: "/marketplace/categoria/bebidas" },
  { id: "farmacia", label: "Farmacia", Icon: Pill, href: "/marketplace/categoria/farmacia" },
  { id: "ferreteria", label: "Ferreteria", Icon: Wrench, href: "/marketplace/categoria/limpieza-hogar" },
  { id: "fruteria", label: "Fruteria", Icon: Apple, href: "/marketplace/categoria/frutas-verduras" },
  { id: "confiteria", label: "Confiteria", Icon: Candy, href: "/marketplace/categoria/abarrotes" },
];

export default function ExplorarPorSector() {
  return (
    <section
      aria-labelledby="sectores-heading"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
    >
      <header className="mb-6 sm:mb-8">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.25em] text-gray-400 mb-2">
          Catalogo
        </span>
        <h2
          id="sectores-heading"
          className="text-2xl sm:text-3xl font-extrabold tracking-[-0.02em] text-gray-900 dark:text-white"
        >
          Explora por sector
        </h2>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {SECTORES.map((s) => {
          const SIcon = s.Icon;
          return (
            <Link
              key={s.id}
              href={s.href}
              className="group flex flex-col items-center gap-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 sm:p-5 text-center hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-md transition-all duration-200"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-gray-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-800 text-gray-700 dark:text-gray-200 group-hover:text-primary transition-colors">
                <SIcon className="h-4.5 w-4.5" strokeWidth={1.5} />
              </span>
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                {s.label}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
