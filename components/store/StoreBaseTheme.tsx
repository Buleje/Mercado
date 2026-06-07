"use client";

/**
 * StoreBaseTheme — Inyecta el concepto de diseño BASE de la tienda individual
 * + aplica overrides del admin (borderRadius, spacing) si están configurados.
 *
 * Este componente NO depende del theme custom del tenant. Provee la fundación
 * moderna y armoniosa sobre la que se aplican los conceptos de marca (Marca,
 * Colores, Estilos del admin StoreCustomizer).
 *
 * Filosofía:
 *   - Sistema de espaciado consistente en escala 4 (4, 8, 12, 16, 24, 32, 48, 64).
 *   - Tipografía con escala modular 1.25 (Major Third) — h1 → 5xl, h2 → 4xl, h3 → 2xl.
 *   - Sombras suaves coloreadas con primary tint (más cálidas que negras puras).
 *   - Border radius escalado: sm 8, md 12, lg 16, xl 20, 2xl 24.
 *   - Transitions 200ms ease para estados hover/active — nunca >300ms.
 *   - Letter-spacing -0.02em en headlines para tipografía moderna pro.
 *   - Section padding generoso (5-7rem) en lugar de cramped 2-3rem.
 *
 * Brandon (2026-05-05): pidió "concepto base para que todo sea armonioso, pro
 * y moderno como base, para que los diseños personalizados se apliquen mejor."
 *
 * Se monta UNA SOLA VEZ en TenantTiendaClient. Después el ThemeInjector aplica
 * el theme del admin encima, override-ando lo necesario.
 */

// CSS global como template literal — usamos `<style>` con dangerouslySetInnerHTML
// porque es App Router (no styled-jsx) y necesitamos selectores que afecten
// elementos fuera del subtree de este componente.
const STORE_BASE_CSS = `
      /* ─── 1. RESET & SCROLL ─────────────────────────────────────── */
      html {
        scroll-behavior: smooth;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        text-rendering: optimizeLegibility;
      }

      /* ─── 2. JERARQUÍA TIPOGRÁFICA MODERNA ──────────────────────── */
      /* Aplicado a tienda individual — sin afectar admin. */
      main h1, main h2, main h3 {
        letter-spacing: -0.022em;
        font-feature-settings: "ss01", "cv01";
      }
      main h1 { line-height: 1.05; }
      main h2 { line-height: 1.10; }
      main h3 { line-height: 1.15; }

      /* Body text más legible */
      main p {
        line-height: 1.6;
      }

      /* ─── 3. SOMBRAS SUAVES COLOREADAS ──────────────────────────── */
      /* Sombras con tint del primary, no negras puras — feel cálido moderno. */
      .store-card,
      main article,
      main .product-card {
        --shadow-tint: var(--color-primary, #00A0A0);
      }

      /* ─── 4. ESCALA DE BORDER RADIUS COHESIVA ───────────────────── */
      /* La tienda usa un sistema escalado basado en --store-radius. */
      :root {
        --store-radius-xs: 6px;
        --store-radius-sm: 10px;
        --store-radius-md: 14px;
        --store-radius-lg: 20px;
        --store-radius-xl: 28px;
      }

      /* ─── 5. SECTION SPACING GENEROSO ────────────────────────────── */
      /* Por defecto las secciones tienen mayor presencia. */
      main > section {
        padding-top: clamp(3rem, 6vw, 5rem);
        padding-bottom: clamp(3rem, 6vw, 5rem);
      }

      /* ─── 6. CONTAINER MAX-WIDTH AMPLIO ─────────────────────────── */
      /* Para que la tienda se sienta espaciosa en monitores grandes. */
      main .store-container {
        max-width: 1600px;
        margin-left: auto;
        margin-right: auto;
        padding-left: clamp(1rem, 3vw, 2rem);
        padding-right: clamp(1rem, 3vw, 2rem);
      }

      /* ─── 7. TRANSITIONS GLOBALES ────────────────────────────────── */
      /* Duraciones consistentes — nunca >300ms. */
      main button:not(.no-theme-btn),
      main a[role="button"],
      main a[class*="rounded-"] {
        transition-property: background-color, border-color, color, box-shadow, transform;
        transition-duration: 200ms;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
      }

      /* ─── 8. FOCUS RING CONSISTENTE ──────────────────────────────── */
      main *:focus-visible {
        outline: 2px solid var(--color-primary, #00A0A0);
        outline-offset: 2px;
        border-radius: 4px;
      }

      /* ─── 9. SELECTION ───────────────────────────────────────────── */
      main ::selection {
        background-color: color-mix(in oklch, var(--color-primary, #00A0A0) 25%, transparent);
        color: inherit;
      }

      /* ─── 10. SCROLLBAR (webkit) ─────────────────────────────────── */
      main *::-webkit-scrollbar {
        width: 10px;
        height: 10px;
      }
      main *::-webkit-scrollbar-track {
        background: transparent;
      }
      main *::-webkit-scrollbar-thumb {
        background: color-mix(in oklch, var(--color-primary, #00A0A0) 25%, transparent);
        border-radius: 9999px;
      }
      main *::-webkit-scrollbar-thumb:hover {
        background: color-mix(in oklch, var(--color-primary, #00A0A0) 45%, transparent);
      }

      /* ─── 11. PRECIO — PROMINENCIA Y TABULAR ─────────────────────── */
      .product-price,
      [data-price] {
        font-feature-settings: "tnum", "lnum";
        letter-spacing: -0.02em;
      }

      /* ─── 12. IMAGES — LAZY-LOAD SMOOTH ──────────────────────────── */
      main img[loading="lazy"] {
        background: linear-gradient(
          110deg,
          color-mix(in oklch, var(--color-primary, #00A0A0) 5%, transparent) 8%,
          color-mix(in oklch, var(--color-primary, #00A0A0) 12%, transparent) 18%,
          color-mix(in oklch, var(--color-primary, #00A0A0) 5%, transparent) 33%
        );
        background-size: 200% 100%;
      }

      /* ─── 13. BOTONES PRIMARIOS DE LA TIENDA ─────────────────────── */
      main .btn-primary,
      main button.btn-primary {
        background: var(--color-primary, #00A0A0);
        color: var(--on-primary, #ffffff);
        font-weight: 800;
        letter-spacing: 0.005em;
        box-shadow:
          0 4px 12px color-mix(in oklch, var(--color-primary, #00A0A0) 25%, transparent),
          0 1px 3px rgba(0, 0, 0, 0.06);
      }
      main .btn-primary:hover {
        box-shadow:
          0 8px 20px color-mix(in oklch, var(--color-primary, #00A0A0) 35%, transparent),
          0 2px 6px rgba(0, 0, 0, 0.08);
        transform: translateY(-1px);
      }
      main .btn-primary:active {
        transform: translateY(0);
      }

      /* ─── 14. HEADINGS DE SECCIÓN — STRIP ACCENT ─────────────────── */
      /* Pequeño strip primary antes de h2 — solo si tiene la clase. */
      main h2.section-title-accent::before {
        content: "";
        display: inline-block;
        width: 4px;
        height: 1em;
        background: var(--color-primary, #00A0A0);
        margin-right: 0.6em;
        vertical-align: -0.06em;
        border-radius: 2px;
      }

      /* ─── 15. MOBILE — PADDINGS AJUSTADOS ────────────────────────── */
      @media (max-width: 640px) {
        main > section {
          padding-top: 2.5rem;
          padding-bottom: 2.5rem;
        }
        main h1 {
          letter-spacing: -0.018em;
        }
      }

      /* ─── 15.5 OCULTAR BREADCRUMBS GLOBALES EN STOREFRONT ───────── */
      /* Brandon (2026-05-05): el breadcrumb "Inicio > Tienda" rompe el flujo
         visual del hero. Ocultamos los nav[aria-label="Breadcrumb"] que están
         como hijos directos del body o del wrapper raíz — pero NO los que
         están dentro de <main> (productos individuales, recetas, etc). */
      body > nav[aria-label="Breadcrumb"],
      body > div > nav[aria-label="Breadcrumb"]:not(main *) {
        display: none !important;
      }

      /* ─── 16. PREFERS REDUCED MOTION ─────────────────────────────── */
      @media (prefers-reduced-motion: reduce) {
        main *, main *::before, main *::after {
          animation-duration: 0.01ms !important;
          transition-duration: 0.01ms !important;
        }
        html { scroll-behavior: auto; }
      }
`;

import { useSettings } from "@/contexts/settings-context";

/**
 * Construye CSS de overrides desde storeTheme.borderRadius (number, px) y
 * storeTheme.spacing ("compact" | "balanced" | "spacious"). El admin los
 * configura en el StoreCustomizer.
 *
 * FIX 2026-05-07 (audit storefront-admin): antes el componente ignoraba
 * estos valores → el customizer del admin no tenía efecto en la tienda.
 */
function buildAdminOverridesCSS(theme: {
  borderRadius?: number;
  spacing?: string;
}): string {
  const parts: string[] = [];

  if (typeof theme.borderRadius === "number" && theme.borderRadius >= 0 && theme.borderRadius <= 64) {
    const r = theme.borderRadius;
    parts.push(`
      :root {
        --store-radius-xs: ${Math.max(2, Math.round(r * 0.33))}px;
        --store-radius-sm: ${Math.max(4, Math.round(r * 0.55))}px;
        --store-radius-md: ${Math.max(6, Math.round(r * 0.78))}px;
        --store-radius-lg: ${r}px;
        --store-radius-xl: ${Math.round(r * 1.4)}px;
      }
    `);
  }

  if (theme.spacing === "compact") {
    parts.push(`
      main > section {
        padding-top: clamp(2rem, 4vw, 3rem) !important;
        padding-bottom: clamp(2rem, 4vw, 3rem) !important;
      }
    `);
  } else if (theme.spacing === "spacious") {
    parts.push(`
      main > section {
        padding-top: clamp(4rem, 8vw, 7rem) !important;
        padding-bottom: clamp(4rem, 8vw, 7rem) !important;
      }
    `);
  }
  // "balanced" o vacío → mantener defaults del STORE_BASE_CSS.

  return parts.join("\n");
}

export default function StoreBaseTheme() {
  const { storeTheme } = useSettings();
  const overrides = storeTheme
    ? buildAdminOverridesCSS({
        borderRadius: storeTheme.borderRadius,
        spacing: storeTheme.spacing,
      })
    : "";
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STORE_BASE_CSS }} />
      {overrides && <style dangerouslySetInnerHTML={{ __html: overrides }} />}
    </>
  );
}
