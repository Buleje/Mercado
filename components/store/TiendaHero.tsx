"use client";

/**
 * TiendaHero — Hero de la tienda publica tenant-scoped.
 *
 * Estructura:
 *   LEFT (60%): badge teal + h1 editorial + subtitle + 2 CTAs
 *   RIGHT (40%): ilustracion grande con wash teal sutil de fondo
 *
 * Wiring de StoreCustomizer (2026-05-05):
 *   El admin puede customizar heroBadge / heroTitle / heroSubtitle / heroCTA /
 *   heroImage desde /admin?tab=store-customizer. Antes este componente estaba
 *   100% hardcoded — los settings se persistian pero no se reflejaban en la
 *   tienda. Ahora se leen de useSettings().storeTheme con fallback editorial
 *   si el dueño no los configuro.
 *
 * CTAs:
 *   - Primario: heroCTA del theme (fallback "Ver productos") → href segun heroLink
 *   - Secundario: "Mi carrito" → abre el cart sidebar via useCart().open()
 */

import Link from "next/link";
import Image from "next/image";
import { ShoppingBag, ShoppingCart } from "@buleje/design-system/icons";
import { DoniaElena } from "@/components/ui-system/illustrations/pucallpa-locals";
import { useCart } from "@/contexts/cart-context";
import { useSettings } from "@/contexts/settings-context";

export interface TiendaHeroProps {
  slug: string;
  storeName: string;
  productCount: number;
}

export default function TiendaHero({ slug, storeName, productCount }: TiendaHeroProps) {
  const { open: openCart, count } = useCart();
  const { storeTheme } = useSettings();

  // ── Texto del hero ────────────────────────────────────────────────────────
  // Defaults editoriales si el dueño no configuro nada en StoreCustomizer.
  const badge    = storeTheme?.heroBadge?.trim()    || "Tu bodega en Ciudad Constitución";
  const title    = storeTheme?.heroTitle?.trim()    || "Todo lo que necesitas, en 25 minutos";
  const subtitle = storeTheme?.heroSubtitle?.trim() || `Frescos, calidos, con la confianza de tu barrio. ${storeName} te lleva la despensa completa a la puerta — Yape, Plin o efectivo.`;
  const ctaText  = storeTheme?.heroCTA?.trim()      || "Ver productos";
  const heroBg   = (storeTheme as { heroImage?: string } | null | undefined)?.heroImage?.trim();
  // FIX 2026-05-07 (audit storefront-admin): badge debajo del avatar configurable.
  // Antes "Hecho en Pucallpa" estaba hardcoded — un negocio en Lima/Cusco mostraba
  // Pucallpa igual. Ahora lee storeTheme.heroOriginBadge con fallback editorial.
  const originBadge = (storeTheme as { heroOriginBadge?: string } | null | undefined)?.heroOriginBadge?.trim()
    || "Hecho en Ciudad Constitución";

  // ── Paleta dinámica según heroBg ──────────────────────────────────────────
  // Con imagen → overlay oscuro + texto blanco. Sin imagen → tokens del DS
  // (responde a light/dark global). Brandon decisión 2026-05-09: el default
  // del proyecto es light, entonces sin heroBg el hero se pinta claro.
  const palette = heroBg
    ? {
        title: "text-white",
        subtitle: "text-white/70",
        meta: "text-white/50",
        dot: "bg-white/25",
        secondaryBtn:
          "border border-white/20 hover:border-white/40 bg-white/5 hover:bg-white/10 text-white",
        card: "bg-white/[0.04] border border-white/10",
        illust: "text-white/90",
      }
    : {
        title: "text-[var(--text-primary)]",
        subtitle: "text-[var(--text-secondary)]",
        meta: "text-[var(--text-tertiary)]",
        dot: "bg-[var(--text-tertiary)]/40",
        secondaryBtn:
          "border border-[var(--rule-base)] hover:border-[var(--color-primary)]/50 bg-[var(--surface-raised)] hover:bg-[var(--surface-sunken)] text-[var(--text-primary)]",
        card: "bg-[var(--surface-raised)] border border-[var(--rule-base)]",
        illust: "text-[var(--text-primary)]/85",
      };

  // ── Destino del CTA primario ──────────────────────────────────────────────
  // heroLink puede ser "tienda" | "whatsapp" | "categorias" | "custom".
  const ctaHref = (() => {
    const link = storeTheme?.heroLink;
    if (link === "whatsapp") {
      const phone = (storeTheme?.whatsapp || "").replace(/\D/g, "");
      const msg   = encodeURIComponent(storeTheme?.whatsappMessage || "Hola, quiero hacer un pedido.");
      return phone ? `https://wa.me/${phone}?text=${msg}` : "#productos";
    }
    if (link === "categorias") return "#categorias";
    // "tienda" + "custom" (que actualmente no se captura) caen al ancla por defecto.
    return "#productos";
  })();

  return (
    <section
      className="relative overflow-hidden border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] data-[bg=image]:bg-transparent"
      data-bg={heroBg ? "image" : "solid"}
      aria-label="Bienvenida a la tienda"
    >
      {/* perf audit P1: el fondo del hero pasó de CSS background-image (sin
          optimizar) a next/image (optimizado, priority por ser LCP). El gradiente
          oscuro queda como overlay separado encima de la imagen. */}
      {heroBg && (
        <>
          <Image
            src={heroBg}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div
            aria-hidden
            className="absolute inset-0"
            style={{ background: "linear-gradient(to bottom, rgba(6,10,13,0.78), rgba(6,10,13,0.92))" }}
          />
        </>
      )}

      {/* Ambient glows — solo cuando NO hay imagen de fondo (para no competir). */}
      {!heroBg && (
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-[var(--accent)]/12 blur-[120px]" />
          <div className="absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-white/5 blur-[100px]" />
        </div>
      )}

      <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16 lg:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12 items-center">
          {/* LEFT — copy + CTAs (3/5 cols) */}
          <div className="lg:col-span-3 text-center lg:text-left">
            <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent)] mb-5">
              {badge}
            </span>
            <h1 className={`text-3xl sm:text-4xl lg:text-5xl font-extrabold ${palette.title} leading-[1.08] tracking-tight`}>
              {title}
            </h1>
            <p className={`mt-5 text-base sm:text-lg ${palette.subtitle} leading-relaxed max-w-xl lg:max-w-none mx-auto lg:mx-0`}>
              {subtitle}
            </p>

            {/* CTAs */}
            <div className="mt-7 flex flex-col sm:flex-row gap-3 items-center lg:items-start justify-center lg:justify-start">
              <Link
                href={ctaHref}
                target={ctaHref.startsWith("http") ? "_blank" : undefined}
                rel={ctaHref.startsWith("http") ? "noopener noreferrer" : undefined}
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] text-white font-bold text-sm transition-all active:scale-[0.98] shadow-lg shadow-[var(--color-primary)]/25 w-full sm:w-auto"
              >
                <ShoppingBag className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
                <span>{ctaText}</span>
              </Link>
              <button
                type="button"
                onClick={openCart}
                className={`inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl ${palette.secondaryBtn} font-semibold text-sm transition-all w-full sm:w-auto`}
              >
                <ShoppingCart className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
                <span>Mi carrito{count > 0 ? ` (${count})` : ""}</span>
              </button>
            </div>

            {/* Meta stats — compact */}
            <div className={`mt-7 flex flex-wrap items-center justify-center lg:justify-start gap-x-5 gap-y-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider ${palette.meta} tabular-nums`}>
              <span>
                {productCount > 0
                  ? `${productCount} producto${productCount !== 1 ? "s" : ""}`
                  : "Proximamente"}
              </span>
              <span className={`h-1 w-1 rounded-full ${palette.dot}`} aria-hidden="true" />
              <span>Delivery 25 min</span>
              <span className={`h-1 w-1 rounded-full ${palette.dot}`} aria-hidden="true" />
              <span>Yape · Plin · Efectivo</span>
            </div>
          </div>

          {/* RIGHT — ilustracion (2/5 cols) — solo cuando NO hay imagen de fondo. */}
          {!heroBg && (
            <div className="lg:col-span-2 flex justify-center lg:justify-end">
              <div className="relative">
                {/* Wash teal detras */}
                <div
                  className="absolute inset-0 rounded-full bg-[var(--accent)]/15 blur-[40px] scale-90"
                  aria-hidden="true"
                />
                {/* Card contenedora sutil */}
                <div
                  className={`relative rounded-3xl ${palette.card} p-6 sm:p-8 backdrop-blur-sm`}
                  aria-hidden="true"
                >
                  <DoniaElena
                    size={260}
                    strokeWidth={1.5}
                    className={palette.illust}
                  />
                </div>
                {/* Micro-badge identidad */}
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-[var(--accent-600,var(--accent))] text-white text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider shadow-lg whitespace-nowrap">
                  {originBadge}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
