/**
 * TiendasBreadcrumb — TS-47 breadcrumb visible para /tiendas con JSON-LD.
 *
 * Si hay zona seleccionada, agrega un crumb extra con el nombre de la zona.
 * Renderiza el JSON-LD inline para SEO (BreadcrumbList).
 *
 * Sprint 4 tiendas blueprint.
 */

import Link from "next/link";
import { ChevronRight, Home } from "@buleje/design-system/icons";

interface Crumb {
  label: string;
  href?: string;
}

interface Props {
  zonaLabel?: string;
}

const BASE_URL = "https://www.buleje.pe";

export default function TiendasBreadcrumb({ zonaLabel }: Props) {
  // Brandon 2026-05-20 v10 audit P0: el item de "Tiendas" siempre tiene
  // href (audit reporto BreadcrumbList con solo 1 item porque la pagina
  // actual omitia el href cuando no habia zonaLabel). Ahora siempre 2+
  // items con item URL — GSC valida correctamente.
  const crumbs: Crumb[] = [
    { label: "Inicio", href: "/" },
    { label: zonaLabel ? "Tiendas" : "Tiendas en Pucallpa", href: "/tiendas" },
  ];
  if (zonaLabel) {
    crumbs.push({ label: zonaLabel });
  }

  const ld = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.label,
      // Siempre emitir `item` cuando tenemos href (es el caso de Inicio
      // y Tiendas; solo el último crumb de zona puede no tenerlo).
      ...(c.href && { item: `${BASE_URL}${c.href}` }),
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
      />
      <nav
        aria-label="Migajas de pan"
        className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-4"
      >
        <ol className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-tertiary)] flex-wrap">
          {crumbs.map((c, i) => (
            <li key={`${c.label}-${i}`} className="flex items-center gap-1.5">
              {i > 0 && (
                <ChevronRight
                  className="h-3 w-3 text-[var(--text-tertiary)]/60 shrink-0"
                  strokeWidth={2}
                  aria-hidden
                />
              )}
              {c.href ? (
                <Link
                  href={c.href}
                  className="inline-flex items-center gap-1 hover:text-[var(--accent)] transition-colors"
                >
                  {i === 0 && (
                    <Home
                      className="h-3 w-3"
                      strokeWidth={1.75}
                      aria-hidden
                    />
                  )}
                  {c.label}
                </Link>
              ) : (
                <span aria-current="page" className="text-[var(--text-primary)]">
                  {c.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
}
