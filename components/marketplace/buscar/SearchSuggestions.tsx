"use client";

/**
 * SearchSuggestions — Pantalla editorial cuando el usuario no ha escrito nada.
 *
 * 4 secciones:
 *   1. Busquedas populares (chips teal-soft)
 *   2. Explorar por categoria (grid 8 sectores con iconos)
 *   3. Tiendas destacadas (3 cards con ilustracion)
 *   4. Inspiracion culinaria (link a /recetas)
 *
 * Sin fotos stock. Sin emojis. Solo iconos Lucide + ilustraciones DS.
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
  ArrowRight,
} from "lucide-react";
import {
  BodegaAbriendo,
  VerduraFresca,
  BebidasVarias,
  PaicheEnOlla,
} from "@/components/ui-system/illustrations";

// ── Datos mock / editoriales ──────────────────────────────────────────────────

const POPULAR_SEARCHES = [
  "arroz",
  "pollo",
  "leche",
  "detergente",
  "coca cola",
  "pan",
  "azucar",
  "aceite",
  "fideos",
  "jabon",
];

const SECTORES = [
  {
    id: "abarrotes",
    label: "Abarrotes",
    Icon: Package,
    href: "/marketplace/categoria/abarrotes",
  },
  {
    id: "carniceria",
    label: "Carniceria",
    Icon: Beef,
    href: "/marketplace/categoria/carnes",
  },
  {
    id: "panaderia",
    label: "Panaderia",
    Icon: Croissant,
    href: "/marketplace/categoria/panaderia",
  },
  {
    id: "bebidas",
    label: "Bebidas",
    Icon: Wine,
    href: "/marketplace/categoria/bebidas",
  },
  {
    id: "farmacia",
    label: "Farmacia",
    Icon: Pill,
    href: "/marketplace/categoria/farmacia",
  },
  {
    id: "limpieza",
    label: "Limpieza",
    Icon: Wrench,
    href: "/marketplace/categoria/limpieza-hogar",
  },
  {
    id: "frutas",
    label: "Frutas & Verduras",
    Icon: Apple,
    href: "/marketplace/categoria/frutas-verduras",
  },
  {
    id: "confiteria",
    label: "Confiteria",
    Icon: Candy,
    href: "/marketplace/categoria/abarrotes",
  },
];

// Cards editoriales de tiendas destacadas (mock hasta tener API)
const TIENDAS_DESTACADAS = [
  {
    id: "bodega-central",
    name: "Bodega Central",
    zone: "Calleria",
    description: "Abarrotes y limpieza con delivery en 20 min",
    Illustration: BodegaAbriendo,
  },
  {
    id: "verduras-frescas",
    name: "Verduras Frescas",
    zone: "Manantay",
    description: "Frutas y verduras del mercado, todos los dias",
    Illustration: VerduraFresca,
  },
  {
    id: "licorera-pucallpa",
    name: "Licorera Pucallpa",
    zone: "Yarinacocha",
    description: "Bebidas, cervezas y gaseosas al mejor precio",
    Illustration: BebidasVarias,
  },
];

// ── Sub-secciones ─────────────────────────────────────────────────────────────

function SectionHeader({ label, title }: { label: string; title: string }) {
  return (
    <header className="mb-5 sm:mb-6">
      <span className="inline-block text-[10px] font-bold uppercase tracking-[0.25em] text-gray-400 dark:text-gray-500 mb-1.5">
        {label}
      </span>
      <h2 className="text-xl sm:text-2xl font-extrabold tracking-[-0.02em] text-gray-900 dark:text-white">
        {title}
      </h2>
    </header>
  );
}

function PopularSearches() {
  return (
    <section aria-labelledby="populares-heading" className="mb-12">
      <SectionHeader label="Tendencias" title="Busquedas populares" />
      <div className="flex flex-wrap gap-2">
        {POPULAR_SEARCHES.map((term) => (
          <Link
            key={term}
            href={`/marketplace/buscar?q=${encodeURIComponent(term)}`}
            className="inline-flex items-center rounded-full border border-primary/30 bg-primary/5 dark:bg-primary/10 px-4 py-1.5 text-sm font-semibold text-primary hover:bg-primary/10 dark:hover:bg-primary/20 hover:border-primary/50 transition-all duration-150"
          >
            {term}
          </Link>
        ))}
      </div>
    </section>
  );
}

function CategoryGrid() {
  return (
    <section aria-labelledby="categorias-heading" className="mb-12">
      <SectionHeader label="Catalogo" title="Explorar por categoria" />
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
                <SIcon
                  className="h-[18px] w-[18px]"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </span>
              <span className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white leading-tight">
                {s.label}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function TiendasDestacadas() {
  return (
    <section aria-labelledby="tiendas-heading" className="mb-12">
      <SectionHeader label="Bodegas" title="Tiendas destacadas" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {TIENDAS_DESTACADAS.map((t) => {
          const Illu = t.Illustration;
          return (
            <Link
              key={t.id}
              href="/marketplace/negocios"
              className="group flex items-center gap-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 sm:p-5 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-md transition-all duration-200"
            >
              <div className="flex-shrink-0 text-gray-400 dark:text-gray-600 group-hover:text-gray-600 dark:group-hover:text-gray-400 transition-colors">
                <Illu size={64} strokeWidth={1.5} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500 mb-0.5">
                  {t.zone}
                </p>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white leading-snug">
                  {t.name}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug line-clamp-2">
                  {t.description}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function InspirationStrip() {
  return (
    <section
      aria-labelledby="inspiracion-heading"
      className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 sm:p-8"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-5">
          <div className="text-gray-400 dark:text-gray-600 flex-shrink-0">
            <PaicheEnOlla size={72} strokeWidth={1.5} />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-gray-400 dark:text-gray-500 block mb-1">
              Inspiracion
            </span>
            <h2
              id="inspiracion-heading"
              className="text-lg sm:text-xl font-extrabold tracking-tight text-gray-900 dark:text-white"
            >
              Recetas de la selva
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-xs">
              Encuentra todos los ingredientes para tus recetas favoritas
              en una sola compra.
            </p>
          </div>
        </div>
        <Link
          href="/recetas"
          className="inline-flex items-center gap-2 rounded-lg border border-primary/40 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/5 transition-colors flex-shrink-0"
        >
          Ver recetas
          <ArrowRight
            className="h-3.5 w-3.5"
            strokeWidth={2}
            aria-hidden="true"
          />
        </Link>
      </div>
    </section>
  );
}

// ── Componente raiz ───────────────────────────────────────────────────────────

export default function SearchSuggestions() {
  return (
    <div className="mt-8 sm:mt-10">
      <PopularSearches />
      <CategoryGrid />
      <TiendasDestacadas />
      <InspirationStrip />
    </div>
  );
}
