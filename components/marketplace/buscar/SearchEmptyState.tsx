/**
 * SearchEmptyState — Pantalla amable cuando la busqueda no arroja resultados.
 *
 * Usa la ilustracion CanastaVacia del DS + copy optimista + sugerencias
 * accionables (grid 4 categorias + CTA "Ver bodegas cerca").
 */

import Link from "next/link";
import { Package, Beef, Apple, Wine, MessageCircle } from "lucide-react";
import { CanastaVacia } from "@/components/ui-system/illustrations";

interface SearchEmptyStateProps {
  query: string;
}

// Numero de WhatsApp del soporte/admin del marketplace.
// Si no esta configurado en env, ocultamos el CTA.
const SUPPORT_WHATSAPP = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? "51999999999";

function buildWhatsAppUrl(query: string): string {
  const text = `Hola Buleje! Buscaba *${query}* en el marketplace y no lo encontre. ¿Lo tienen disponible o pueden conseguirlo?`;
  return `https://wa.me/${SUPPORT_WHATSAPP.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

const SUGGESTED_CATS = [
  {
    id: "abarrotes",
    label: "Abarrotes",
    Icon: Package,
    href: "/marketplace/categoria/abarrotes",
  },
  {
    id: "carnes",
    label: "Carniceria",
    Icon: Beef,
    href: "/marketplace/categoria/carnes",
  },
  {
    id: "frutas",
    label: "Frutas & Verduras",
    Icon: Apple,
    href: "/marketplace/categoria/frutas-verduras",
  },
  {
    id: "bebidas",
    label: "Bebidas",
    Icon: Wine,
    href: "/marketplace/categoria/bebidas",
  },
];

export default function SearchEmptyState({ query }: SearchEmptyStateProps) {
  return (
    <div className="flex flex-col items-center py-16 sm:py-24 text-center">
      {/* Ilustracion */}
      <div className="text-gray-400 dark:text-gray-600 mb-6">
        <CanastaVacia size={140} strokeWidth={1.5} />
      </div>

      {/* Titulo + copy */}
      <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">
        Sin resultados para{" "}
        <span className="text-primary">&ldquo;{query}&rdquo;</span>
      </h2>

      <p className="mt-3 max-w-md text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
        No encontramos productos que coincidan. Prueba con otra palabra,
        revisa la ortografía o explora las categorías de abajo.
      </p>

      {/* Sugerencias de texto */}
      <ul className="mt-5 space-y-1 text-sm text-gray-500 dark:text-gray-400">
        <li className="flex items-center gap-2 justify-center">
          <span
            className="h-1.5 w-1.5 rounded-full bg-[var(--rule-base)] dark:bg-gray-700 flex-shrink-0"
            aria-hidden="true"
          />
          Prueba con una palabra más corta: &ldquo;arroz&rdquo; en lugar de
          &ldquo;arroz extra largo grano fino&rdquo;
        </li>
        <li className="flex items-center gap-2 justify-center">
          <span
            className="h-1.5 w-1.5 rounded-full bg-[var(--rule-base)] dark:bg-gray-700 flex-shrink-0"
            aria-hidden="true"
          />
          Revisa que no haya errores de ortografía
        </li>
        <li className="flex items-center gap-2 justify-center">
          <span
            className="h-1.5 w-1.5 rounded-full bg-[var(--rule-base)] dark:bg-gray-700 flex-shrink-0"
            aria-hidden="true"
          />
          Busca el nombre genérico del producto
        </li>
      </ul>

      {/* Grid de categorias sugeridas */}
      <div className="mt-10 w-full max-w-xl">
        <h3 className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-gray-400 dark:text-gray-500 mb-4">
          Explora categorias
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {SUGGESTED_CATS.map((cat) => {
            const CatIcon = cat.Icon;
            return (
              <Link
                key={cat.id}
                href={cat.href}
                className="group flex flex-col items-center gap-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 text-center hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-md transition-all duration-200"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--surface-alt)] dark:bg-gray-950 border border-gray-100 dark:border-gray-800 text-gray-700 dark:text-gray-200 group-hover:text-primary transition-colors">
                  <CatIcon
                    className="h-4 w-4"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                </span>
                <span className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">
                  {cat.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* CTA WhatsApp — MK-09: capturar demanda perdida */}
      {SUPPORT_WHATSAPP && (
        <a
          href={buildWhatsAppUrl(query)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#25D366] px-6 py-2.5 text-sm font-bold text-white hover:bg-[#1ebe57] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25D366]"
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          Pedir &ldquo;{query}&rdquo; por WhatsApp
        </a>
      )}

      {/* CTA secundario */}
      <Link
        href="/marketplace/negocios"
        className="mt-3 inline-flex items-center rounded-full border border-gray-300 px-6 py-2.5 text-sm font-semibold text-gray-700 hover:border-primary hover:text-primary transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        Ver bodegas cerca
      </Link>

      {/* Link terciario */}
      <Link
        href="/marketplace/explorar"
        className="mt-3 text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors underline underline-offset-4"
      >
        O explorar todo el marketplace
      </Link>
    </div>
  );
}
