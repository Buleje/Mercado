"use client";

/**
 * TenantTopNav — barra superior minima compartida entre la landing y el
 * catalogo del tenant. NO tabs (era ruidoso). Logo + nombre + 1 link
 * contextual:
 *   - En /t/[slug]         → link "Ver catalogo"  (CTA al storefront)
 *   - En /t/[slug]/tienda  → link "Información"   (vuelve al landing)
 *
 * Sticky con surface al hacer scroll · transparente al inicio.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ShoppingBag, Info, ArrowRight } from "@buleje/design-system/icons";

interface TenantTopNavProps {
  slug: string;
  displayName?: string;
  logoUrl?: string | null;
  primaryColor?: string;
}

export default function TenantTopNav({
  slug,
  displayName,
  logoUrl,
  primaryColor = "var(--accent)",
}: TenantTopNavProps) {
  const pathname = usePathname() ?? "";
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const onCatalog = pathname.startsWith(`/t/${slug}/tienda`);
  const initials = (displayName ?? slug).slice(0, 2).toUpperCase();

  // Link contextual unico
  const ctaHref = onCatalog ? `/t/${slug}` : `/t/${slug}/tienda`;
  const ctaLabel = onCatalog ? "Información" : "Ver catálogo";
  const CtaIcon = onCatalog ? Info : ShoppingBag;

  return (
    <nav
      aria-label="Navegación de la tienda"
      className={`sticky top-0 z-40 transition-all duration-200 ${
        scrolled
          ? "bg-[var(--surface-canvas)]/95 backdrop-blur-md border-b border-[var(--rule-base)] shadow-sm"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
        {/* Logo + nombre (link a landing) */}
        <Link href={`/t/${slug}`} className="flex items-center gap-2.5 min-w-0">
          <span
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-white text-xs font-black shrink-0 overflow-hidden shadow-sm"
            style={{ background: primaryColor }}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              initials
            )}
          </span>
          <span
            className={`text-base font-black truncate max-w-[200px] transition-colors ${
              scrolled ? "text-[var(--text-primary)]" : "text-[var(--text-primary)]"
            }`}
          >
            {displayName ?? slug}
          </span>
        </Link>

        {/* CTA contextual a la derecha */}
        <Link
          href={ctaHref}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full px-4 h-10 text-sm font-black transition-all hover:gap-2"
          style={{
            background: primaryColor,
            color: "#fff",
          }}
        >
          <CtaIcon className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          <span className="hidden sm:inline">{ctaLabel}</span>
          <span className="sm:hidden">{onCatalog ? "Info" : "Tienda"}</span>
          <ArrowRight className="h-3.5 w-3.5 opacity-80" strokeWidth={2.5} aria-hidden />
        </Link>
      </div>
    </nav>
  );
}
