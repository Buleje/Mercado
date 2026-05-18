"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useSettings } from "@/contexts/settings-context";

// Rutas Buleje-brand (cross-vendor marketplace, landing, vender, etc.) que NO
// deben heredar el theme custom de un tenant. El override de colores/tipografía
// solo aplica al storefront white-label `/t/[slug]/...`. Antes el injector
// pintaba la home, /tiendas y /marketplace con el primaryColor del tenant
// `main` (verde), perdiendo la identidad de Buleje (teal #00B4A6).
function isWhiteLabelStorefront(pathname: string | null): boolean {
  return !!pathname && pathname.startsWith("/t/");
}

/**
 * ThemeInjector — aplica el theme custom del tenant a TODA la tienda.
 *
 * Filosofía:
 *   - Inyectar CSS variables en :root → la mayoría de componentes ya
 *     consumen var(--accent), var(--color-primary), etc. y heredan solos.
 *   - Selectores quirúrgicos sobre clases del DS (.product-card, .store-card,
 *     .store-header) — NO usar selectores genéricos como [class*="bg-gray-"]
 *     que rompen elementos no-themables (category chips, badges, etc).
 *   - SIN animaciones globales que causen flicker (no fadeInUp en sections).
 *   - SIN hover transforms que causen layout shift.
 *   - !important solo cuando es estrictamente necesario para sobrescribir
 *     utility classes inline.
 */

const GOOGLE_FONTS: Record<string, { url: string; family: string }> = {
  inter:      { url: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap", family: "'Inter', sans-serif" },
  poppins:    { url: "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap", family: "'Poppins', sans-serif" },
  montserrat: { url: "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap", family: "'Montserrat', sans-serif" },
  raleway:    { url: "https://fonts.googleapis.com/css2?family=Raleway:wght@400;500;600;700;800&display=swap", family: "'Raleway', sans-serif" },
  nunito:     { url: "https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800&display=swap", family: "'Nunito', sans-serif" },
  lato:       { url: "https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&display=swap", family: "'Lato', sans-serif" },
  roboto:     { url: "https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;900&display=swap", family: "'Roboto', sans-serif" },
  opensans:   { url: "https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800&display=swap", family: "'Open Sans', sans-serif" },
};

// ── Helpers de color ─────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  if (!hex || !hex.startsWith("#")) return [0, 0, 0];
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [
    parseInt(full.slice(0, 2), 16) || 0,
    parseInt(full.slice(2, 4), 16) || 0,
    parseInt(full.slice(4, 6), 16) || 0,
  ];
}

function rgba(hex: string, alpha: number): string {
  if (!hex || !hex.startsWith("#")) return hex;
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

function shade(hex: string, factor: number): string {
  if (!hex.startsWith("#")) return hex;
  const [r, g, b] = hexToRgb(hex);
  const adj = (c: number) => factor < 0
    ? Math.max(0, Math.round(c * (1 + factor)))
    : Math.min(255, Math.round(c + (255 - c) * factor));
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(adj(r))}${toHex(adj(g))}${toHex(adj(b))}`;
}

function luminosity(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  const a = [r, g, b].map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

// Texto contraste (blanco o casi negro) para un fondo dado
function readableText(hex: string): string {
  return luminosity(hex) > 0.55 ? "#0f172a" : "#ffffff";
}

export default function ThemeInjector() {
  const { storeTheme } = useSettings();
  const pathname = usePathname();
  const allowThemeOverride = isWhiteLabelStorefront(pathname);

  // audit P0 UX #3 (Brandon 2026-05-18): el effect anterior forzaba
  // classList.remove("dark") cada vez que cargaba storeTheme, anulando
  // el toggle de dark mode del usuario en /marketplace/[slug] y /t/[slug].
  // Reverte a NO interferir — el ThemeProvider del root layout es la
  // única fuente de verdad de la clase `dark` en <html>.

  const allCSS = useMemo(() => {
    if (!storeTheme || !allowThemeOverride) return "";

    const t = storeTheme as {
      primaryColor?: string;
      secondaryColor?: string;
      accentColor?: string;
      backgroundColor?: string;
      textColor?: string;
      fontFamily?: string;
      borderRadius?: number;
      spacing?: string;
      cardStyle?: string;
      shadowLevel?: string;
      buttonStyle?: string;
      navbarStyle?: string;
      animations?: string;
      backgroundPattern?: string;
      customCSS?: string;
    };

    // ── Derivados ─────────────────────────────────────────────────────
    const primary = t.primaryColor && t.primaryColor.startsWith("#") ? t.primaryColor : "#00B4A6";
    const secondary = t.secondaryColor && t.secondaryColor.startsWith("#") ? t.secondaryColor : "#f97316";
    const accent = t.accentColor && t.accentColor.startsWith("#") ? t.accentColor : primary;
    const primaryDark = shade(primary, -0.18);
    const primaryLight = shade(primary, 0.20);
    const accentDark = shade(accent, -0.18);
    const onPrimary = readableText(primary);

    const radius = typeof t.borderRadius === "number" ? t.borderRadius : 12;
    const radiusSm = Math.max(4, Math.round(radius * 0.5));
    const radiusLg = Math.round(radius * 1.33);
    const radiusXl = Math.round(radius * 1.66);

    // ── 1. CSS variables (la base de todo) ────────────────────────────
    const vars = `
      --color-primary: ${primary};
      --color-primary-dark: ${primaryDark};
      --color-primary-light: ${primaryLight};
      --color-secondary: ${secondary};
      --color-secondary-dark: ${shade(secondary, -0.18)};
      --color-accent: ${accent};
      --brand-primary: ${primary};
      --brand-primary-light: ${primaryLight};
      --brand-primary-bg: ${rgba(primary, 0.05)};
      --brand-secondary: ${secondary};
      --accent: ${accent};
      --accent-600: ${accentDark};
      --accent-soft: ${rgba(accent, 0.08)};
      --accent-muted: ${rgba(accent, 0.16)};
      --on-primary: ${onPrimary};
      --store-radius: ${radius}px;
      --store-radius-sm: ${radiusSm}px;
      --store-radius-lg: ${radiusLg}px;
      --store-radius-xl: ${radiusXl}px;
      ${t.backgroundColor ? `--color-bg: ${t.backgroundColor};` : ""}
      ${t.textColor ? `--color-text: ${t.textColor};` : ""}
    `;

    // ── 2. Tipografía ─────────────────────────────────────────────────
    const fontConfig = t.fontFamily ? GOOGLE_FONTS[t.fontFamily] : null;
    const fontCSS = fontConfig
      ? `body{font-family:${fontConfig.family}}`
      : "";

    // ── 3. Border radius — solo aplicar a tarjetas y botones de tienda ──
    const radiusCSS = `
      .store-card, .product-card{ border-radius: ${radiusLg}px; }
    `;

    // ── 4. Spacing entre secciones del storefront ─────────────────────
    const spacingCSS = t.spacing === "compact" ? `
      main > section{padding-top:2.5rem;padding-bottom:2.5rem}
      @media(min-width:640px){main > section{padding-top:3.5rem;padding-bottom:3.5rem}}
    ` : t.spacing === "spacious" ? `
      main > section{padding-top:4rem;padding-bottom:4rem}
      @media(min-width:640px){main > section{padding-top:5.5rem;padding-bottom:5.5rem}}
    ` : "";

    // ── 5. Cards (productos + tiendas) ────────────────────────────────
    const cardCSS = ({
      minimal: `
        .product-card,.store-card{
          border:1px solid ${rgba(primary, 0.08)};
          box-shadow:none;
          background:transparent;
        }
      `,
      shadow: `
        .product-card,.store-card{
          box-shadow:0 2px 8px ${rgba(primary, 0.08)}, 0 1px 3px rgba(0,0,0,0.05);
          border:1px solid transparent;
        }
        .product-card:hover,.store-card:hover{
          box-shadow:0 8px 20px ${rgba(primary, 0.14)}, 0 2px 6px rgba(0,0,0,0.06);
        }
      `,
      border: `
        .product-card,.store-card{
          border:2px solid ${rgba(primary, 0.16)};
          box-shadow:none;
        }
        .product-card:hover,.store-card:hover{
          border-color:${rgba(primary, 0.4)};
        }
      `,
      glass: `
        .product-card,.store-card{
          background:rgba(255,255,255,0.75);
          backdrop-filter:blur(10px) saturate(1.3);
          -webkit-backdrop-filter:blur(10px) saturate(1.3);
          border:1px solid rgba(255,255,255,0.5);
          box-shadow:0 4px 16px ${rgba(primary, 0.08)};
        }
        .dark .product-card,.dark .store-card{
          background:rgba(15,23,42,0.55);
          border-color:rgba(255,255,255,0.08);
        }
      `,
    } as Record<string, string>)[t.cardStyle ?? "shadow"] ?? "";

    // ── 6. Botones — solo aplicar al store, no al admin/checkout ──────
    const btnRadius = t.buttonStyle === "pill" ? 9999 : t.buttonStyle === "square" ? 4 : radius;
    const btnCSS = `
      main button:not([class*="rounded-full"]):not(.no-theme-btn),
      main a[class*="rounded-xl"],
      main a[class*="rounded-lg"]{
        border-radius:${btnRadius}px;
      }
    `;

    // ── 7. Animaciones — SUTILES, sin fadeInUp ni layout shift ────────
    // CRITICO: NO usar `will-change`, NO `transition-all`, NO animar property
    // que cambie cada render. Solo box-shadow on hover (no afecta layout).
    const animCSS = t.animations === "none" ? `
      .product-card,.store-card{ transition: none; }
    ` : t.animations === "dynamic" ? `
      .product-card,.store-card{
        transition: box-shadow 0.25s ease;
      }
      @media (hover: hover) {
        .product-card:hover,.store-card:hover{
          transform: translateY(-2px);
          transition: box-shadow 0.25s ease, transform 0.25s ease;
        }
      }
    ` : `
      .product-card,.store-card{
        transition: box-shadow 0.2s ease;
      }
    `;

    // ── 8. Background pattern — SUTIL, fixed para no flicker ──────────
    const bgPatternCSS = t.backgroundPattern === "gradient" ? `
      body{
        background-image: linear-gradient(180deg, ${rgba(primary, 0.04)} 0%, transparent 30%);
        background-attachment: fixed;
      }
    ` : t.backgroundPattern === "dots" ? `
      body{
        background-image: radial-gradient(${rgba(primary, 0.10)} 1px, transparent 1px);
        background-size: 24px 24px;
        background-attachment: fixed;
      }
    ` : "";

    // ── 9. Navbar — quirúrgico sobre .store-header solamente ──────────
    // CRITICO:
    //   - NO forzar color global del header (rompe chips internos blancos sobre blanco).
    //   - NO transparent puro (fundirse con body causa pérdida de legibilidad).
    //   - "solid" usa primary como bg pero NO fuerza color heredado — solo
    //     teñimos el strip superior; los hijos mantienen sus colores propios.
    const navCSS = ({
      transparent: `
        .store-header{
          background: rgba(255,255,255,0.92);
          border-bottom: 1px solid ${rgba(primary, 0.08)};
          box-shadow: none;
        }
        .dark .store-header{ background: rgba(15,23,42,0.92); }
      `,
      blur: `
        .store-header{
          background: rgba(255,255,255,0.86);
          backdrop-filter: blur(16px) saturate(1.4);
          -webkit-backdrop-filter: blur(16px) saturate(1.4);
          border-bottom: 1px solid ${rgba(primary, 0.10)};
        }
        .dark .store-header{ background: rgba(15,23,42,0.85); }
      `,
      minimal: `
        .store-header{
          background: #ffffff;
          border-bottom: 1px solid ${rgba(primary, 0.10)};
          box-shadow: 0 1px 3px ${rgba(primary, 0.04)};
        }
        .dark .store-header{ background: #0a0a0a; }
      `,
      solid: `
        .store-header{
          background: ${primary};
          border-bottom: 1px solid ${rgba(primaryDark, 0.6)};
        }
        /* Tintar links y textos directos del header, no los chips con bg propio */
        .store-header > div > div > a,
        .store-header > div > div > nav > a,
        .store-header > div > div > nav > button,
        .store-header > div > a{
          color: ${onPrimary};
        }
      `,
    } as Record<string, string>)[t.navbarStyle ?? "minimal"] ?? "";

    // ── 10. Inputs (focus ring + selección) ───────────────────────────
    const inputCSS = `
      main input:focus-visible,
      main textarea:focus-visible,
      main select:focus-visible{
        outline: none;
        border-color: ${primary};
        box-shadow: 0 0 0 3px ${rgba(primary, 0.16)};
      }
      main input[type="checkbox"]:checked,
      main input[type="radio"]:checked{
        accent-color: ${primary};
      }
      main ::selection{ background: ${rgba(primary, 0.20)}; }
    `;

    // ── 11. Footer — accent en headings ───────────────────────────────
    const footerCSS = `
      footer h3, footer h4{
        color: ${luminosity(primary) < 0.4 ? primaryLight : primary};
      }
      footer a:hover{
        color: ${primary};
      }
    `;

    // ── 12. Toasts y dialogs — solo radius coherente ─────────────────
    const dialogCSS = `
      [role="dialog"]{ border-radius: ${radiusXl}px; }
      [role="status"], [role="alert"]{ border-radius: ${radius}px; }
    `;

    // ── 13. Background body color ─────────────────────────────────────
    const bodyBgCSS = t.backgroundColor ? `body{background-color:${t.backgroundColor}}` : "";

    return [
      `:root{${vars}}`,
      bodyBgCSS,
      fontCSS,
      radiusCSS,
      spacingCSS,
      cardCSS,
      btnCSS,
      animCSS,
      bgPatternCSS,
      navCSS,
      inputCSS,
      footerCSS,
      dialogCSS,
      t.customCSS ?? "",
    ].filter(Boolean).join("\n");
  }, [storeTheme, allowThemeOverride]);

  if (!storeTheme || !allowThemeOverride) return null;

  const fontFamily = (storeTheme as { fontFamily?: string }).fontFamily;
  const fontConfig = fontFamily ? GOOGLE_FONTS[fontFamily] : null;

  return (
    <>
      {fontConfig && <link rel="stylesheet" href={fontConfig.url} />}
      <style>{allCSS}</style>
    </>
  );
}
