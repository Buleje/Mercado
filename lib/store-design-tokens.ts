/**
 * lib/store-design-tokens.ts
 *
 * Design tokens del storefront publico del tenant. Tipo Wix/Wordpress:
 * el bodeguero personaliza tipografia, colores, redondez, sombras, botones,
 * densidad. Las plantillas (presets) aplican configuraciones completas.
 *
 * Persistencia: serializa como JSON en `footerHtml` con prefix
 * `__BULEJE_PAGE_DATA__::` junto con las sections del SectionsBuilder.
 * Back-compat: si lee `__SECTIONS__::` lo transforma al nuevo formato.
 *
 * Render: lib/store-design-css.ts genera el <style> con CSS vars que se
 * inyecta en /t/[slug] y /t/[slug]/tienda.
 */

import type { Section } from "@/lib/store-sections-types";

// ── Familias tipograficas soportadas (Google Fonts) ─────────────────────
export type FontFamily = "inter" | "playfair" | "manrope" | "bebas" | "quicksand" | "raleway";

export const FONT_FAMILIES: Record<FontFamily, { label: string; stack: string; vibe: string }> = {
  inter:     { label: "Inter",     stack: '"Inter", system-ui, sans-serif',              vibe: "Moderno · limpio · seguro" },
  playfair:  { label: "Playfair",  stack: '"Playfair Display", Georgia, serif',          vibe: "Editorial · elegante · premium" },
  manrope:   { label: "Manrope",   stack: '"Manrope", system-ui, sans-serif',            vibe: "Minimal · profesional · neutro" },
  bebas:     { label: "Bebas Neue",stack: '"Bebas Neue", "Impact", sans-serif',          vibe: "Bold · callejero · joven" },
  quicksand: { label: "Quicksand", stack: '"Quicksand", system-ui, sans-serif',          vibe: "Amigable · redondeado · familiar" },
  raleway:   { label: "Raleway",   stack: '"Raleway", system-ui, sans-serif',            vibe: "Sofisticado · ligero · refinado" },
};

/**
 * Fuentes del EDITOR (StoreCreativeMode usa otra taxonomía que `FontFamily`).
 * Este map traduce la clave elegida en el editor → label de Google Font (para
 * cargar el `<link>`; `null` = fuente de sistema) + stack CSS. Lo consumen la
 * landing (persistido) y el preview en vivo (postMessage), así la tipografía
 * elegida en el editor SÍ se aplica al storefront. (Brandon 2026-06-08.)
 */
export const EDITOR_FONT_MAP: Record<string, { label: string | null; stack: string }> = {
  sistema:    { label: null,         stack: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif" },
  geist:      { label: "Geist",      stack: '"Geist", ui-sans-serif, sans-serif' },
  inter:      { label: "Inter",      stack: '"Inter", ui-sans-serif, sans-serif' },
  poppins:    { label: "Poppins",    stack: '"Poppins", ui-sans-serif, sans-serif' },
  montserrat: { label: "Montserrat", stack: '"Montserrat", ui-sans-serif, sans-serif' },
  raleway:    { label: "Raleway",    stack: '"Raleway", ui-sans-serif, sans-serif' },
  nunito:     { label: "Nunito",     stack: '"Nunito", ui-sans-serif, sans-serif' },
  lato:       { label: "Lato",       stack: '"Lato", ui-sans-serif, sans-serif' },
  roboto:     { label: "Roboto",     stack: '"Roboto", ui-sans-serif, sans-serif' },
  opensans:   { label: "Open Sans",  stack: '"Open Sans", ui-sans-serif, sans-serif' },
};

/** Radio de botón del editor (StoreTheme.buttonStyle) → CSS. */
export const EDITOR_BTN_RADIUS: Record<string, string> = {
  rounded: "12px",
  square: "2px",
  pill: "9999px",
};

// ── Variantes visuales ──────────────────────────────────────────────────
export type HeadingSize  = "compact" | "regular" | "large" | "huge";
export type BorderRadius = "square" | "soft" | "rounded" | "pill";
export type ShadowStyle  = "none" | "soft" | "medium" | "strong";
export type ButtonStyle  = "solid" | "outline" | "gradient" | "minimal";
export type Density      = "compact" | "regular" | "spacious";

// ── DesignTokens — config completa del tenant ───────────────────────────
export interface DesignTokens {
  // Tipografia
  fontFamily: FontFamily;
  headingSize: HeadingSize;

  // Colores (hex)
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;

  // Estilo
  borderRadius: BorderRadius;
  shadowStyle: ShadowStyle;
  buttonStyle: ButtonStyle;
  density: Density;

  // Preset aplicado (si usó plantilla)
  presetId?: string;
}

// ── Defaults — Buleje editorial ─────────────────────────────────────────
export const DEFAULT_DESIGN_TOKENS: DesignTokens = {
  fontFamily: "inter",
  headingSize: "regular",
  primaryColor: "#00A0A0",
  secondaryColor: "#0d2b3a",
  accentColor: "#f4a261",
  backgroundColor: "#ffffff",
  textColor: "#0f172a",
  borderRadius: "rounded",
  shadowStyle: "soft",
  buttonStyle: "solid",
  density: "regular",
};

// ── Plantillas (presets completos) ──────────────────────────────────────
export interface DesignPreset {
  id: string;
  label: string;
  emoji: string;
  description: string;
  /** Tipo de negocio donde queda bien (sugerencia, no obligatorio). */
  bestFor: string[];
  tokens: DesignTokens;
}

export const DESIGN_PRESETS: DesignPreset[] = [
  {
    id: "buleje-default",
    label: "Buleje Clásico",
    emoji: "🛒",
    description: "Verde acuático teal · profesional · cercano. La identidad por defecto.",
    bestFor: ["bodega", "minimarket", "abarrotes"],
    tokens: { ...DEFAULT_DESIGN_TOKENS },
  },
  {
    id: "pizzeria-italiana",
    label: "Pizzería Italiana",
    emoji: "🍕",
    description: "Tomate + crema + Playfair · editorial cálido · clase italiana.",
    bestFor: ["pizzeria", "restaurante", "trattoria"],
    tokens: {
      fontFamily: "playfair",
      headingSize: "large",
      primaryColor: "#c1272d",
      secondaryColor: "#1a3a1f",
      accentColor: "#f4d35e",
      backgroundColor: "#fdf6e3",
      textColor: "#2d1810",
      borderRadius: "soft",
      shadowStyle: "medium",
      buttonStyle: "solid",
      density: "spacious",
      presetId: "pizzeria-italiana",
    },
  },
  {
    id: "polleria-fuego",
    label: "Pollería al Carbón",
    emoji: "🍗",
    description: "Naranja brasa + negro · bold callejero · estilo grill.",
    bestFor: ["polleria", "parrilla", "broaster"],
    tokens: {
      fontFamily: "bebas",
      headingSize: "huge",
      primaryColor: "#ea580c",
      secondaryColor: "#1c1917",
      accentColor: "#fbbf24",
      backgroundColor: "#fffbeb",
      textColor: "#1c1917",
      borderRadius: "rounded",
      shadowStyle: "strong",
      buttonStyle: "gradient",
      density: "regular",
      presetId: "polleria-fuego",
    },
  },
  {
    id: "premium-boutique",
    label: "Boutique Premium",
    emoji: "✨",
    description: "Negro + dorado · minimalista · Manrope · sofisticado y caro.",
    bestFor: ["boutique", "joyeria", "premium", "delicatessen"],
    tokens: {
      fontFamily: "manrope",
      headingSize: "large",
      primaryColor: "#0f0f0f",
      secondaryColor: "#737373",
      accentColor: "#c9a961",
      backgroundColor: "#fafafa",
      textColor: "#0f0f0f",
      borderRadius: "soft",
      shadowStyle: "soft",
      buttonStyle: "minimal",
      density: "spacious",
      presetId: "premium-boutique",
    },
  },
  {
    id: "selva-amazonica",
    label: "Selva Amazónica",
    emoji: "🌿",
    description: "Verde tropical + crema · Raleway · suave y natural · esencia Pucallpa.",
    bestFor: ["jugueria", "frutas", "natural", "selva"],
    tokens: {
      fontFamily: "raleway",
      headingSize: "regular",
      primaryColor: "#15803d",
      secondaryColor: "#365314",
      accentColor: "#fb923c",
      backgroundColor: "#fefce8",
      textColor: "#1c2e0c",
      borderRadius: "rounded",
      shadowStyle: "soft",
      buttonStyle: "solid",
      density: "regular",
      presetId: "selva-amazonica",
    },
  },
  {
    id: "pop-juvenil",
    label: "Pop Juvenil",
    emoji: "🎨",
    description: "Magenta + amarillo · Quicksand · friendly · Gen Z vibe.",
    bestFor: ["heladeria", "cafe", "postres", "snacks"],
    tokens: {
      fontFamily: "quicksand",
      headingSize: "regular",
      primaryColor: "#d946ef",
      secondaryColor: "#06b6d4",
      accentColor: "#facc15",
      backgroundColor: "#fdf4ff",
      textColor: "#3b0764",
      borderRadius: "pill",
      shadowStyle: "strong",
      buttonStyle: "gradient",
      density: "regular",
      presetId: "pop-juvenil",
    },
  },
];

// ── Sugerencia IA (mock) ────────────────────────────────────────────────
//
// El bodeguero "sube" su logo (o lo describe). Devolvemos 3 presets
// sugeridos basados en heuristicas: tipo de negocio + tono del logo.
// Sin llamar a OpenAI/Claude — usa logica local. Brandon: "mock IA es
// suficiente al inicio. Cuando tengamos credit budget movemos a Claude".

export interface AISuggestionInput {
  /** Nombre del negocio (e.g. "Pizza Pucallpa"). */
  businessName: string;
  /** Tipo libre que tipea el dueño (e.g. "pizzeria", "bodega"). */
  businessType?: string;
  /** URL del logo (si la tiene). Se usa para decidir tono claro/oscuro. */
  logoUrl?: string;
}

export function suggestPresets(input: AISuggestionInput): DesignPreset[] {
  const type = (input.businessType ?? "").toLowerCase().trim();
  const name = input.businessName.toLowerCase();
  const ranked: Array<{ preset: DesignPreset; score: number }> = [];

  for (const preset of DESIGN_PRESETS) {
    let score = 0;
    for (const keyword of preset.bestFor) {
      if (type.includes(keyword)) score += 10;
      if (name.includes(keyword)) score += 5;
    }
    // Fallback: si nada matchea, suma 1 para que tengamos algo siempre
    if (score === 0) score = 1;
    ranked.push({ preset, score });
  }

  ranked.sort((a, b) => b.score - a.score);
  // Top 3 unicos
  const topIds = new Set<string>();
  const top: DesignPreset[] = [];
  for (const r of ranked) {
    if (topIds.has(r.preset.id)) continue;
    topIds.add(r.preset.id);
    top.push(r.preset);
    if (top.length === 3) break;
  }
  return top;
}

// ── Persistencia consolidada (sections + design) ────────────────────────

const NEW_PREFIX = "__BULEJE_PAGE_DATA__::";
const OLD_PREFIX = "__SECTIONS__::";

export interface PageData {
  sections: Section[];
  design: DesignTokens;
}

export function serializePageData(data: PageData): string {
  return NEW_PREFIX + JSON.stringify(data);
}

export function deserializePageData(raw: string | null | undefined): PageData {
  const empty: PageData = { sections: [], design: DEFAULT_DESIGN_TOKENS };
  if (!raw) return empty;

  // Formato nuevo
  if (raw.startsWith(NEW_PREFIX)) {
    try {
      const parsed = JSON.parse(raw.slice(NEW_PREFIX.length));
      return {
        sections: Array.isArray(parsed.sections) ? parsed.sections : [],
        design: { ...DEFAULT_DESIGN_TOKENS, ...(parsed.design ?? {}) },
      };
    } catch {
      return empty;
    }
  }

  // Back-compat: formato viejo solo con sections
  if (raw.startsWith(OLD_PREFIX)) {
    try {
      const sections = JSON.parse(raw.slice(OLD_PREFIX.length));
      return {
        sections: Array.isArray(sections) ? sections : [],
        design: DEFAULT_DESIGN_TOKENS,
      };
    } catch {
      return empty;
    }
  }

  return empty;
}

// ── CSS generator: convierte DesignTokens en CSS vars + estilos ────────

const RADIUS_MAP: Record<BorderRadius, string> = {
  square:  "0px",
  soft:    "6px",
  rounded: "14px",
  pill:    "9999px",
};

const SHADOW_MAP: Record<ShadowStyle, string> = {
  none:   "none",
  soft:   "0 1px 3px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.04)",
  medium: "0 4px 12px rgba(0,0,0,0.10), 0 10px 30px rgba(0,0,0,0.06)",
  strong: "0 10px 24px rgba(0,0,0,0.18), 0 24px 60px rgba(0,0,0,0.12)",
};

const HEADING_SIZE_MAP: Record<HeadingSize, { h1: string; h2: string; lineHeight: string }> = {
  compact: { h1: "clamp(2rem,4vw,2.75rem)",    h2: "clamp(1.25rem,2.5vw,1.75rem)", lineHeight: "1.15" },
  regular: { h1: "clamp(2.25rem,5vw,3.5rem)",  h2: "clamp(1.5rem,3vw,2.25rem)",    lineHeight: "1.1" },
  large:   { h1: "clamp(2.75rem,6vw,4.25rem)", h2: "clamp(1.75rem,3.5vw,2.75rem)", lineHeight: "1.05" },
  huge:    { h1: "clamp(3.25rem,7.5vw,5.5rem)",h2: "clamp(2rem,4vw,3.25rem)",      lineHeight: "0.98" },
};

const DENSITY_MAP: Record<Density, { padY: string; gap: string }> = {
  compact:  { padY: "2rem", gap: "1rem" },
  regular:  { padY: "3rem", gap: "1.5rem" },
  spacious: { padY: "5rem", gap: "2.5rem" },
};

/**
 * [SECURITY] Sanea un color que se interpola CRUDO en un `<style>` del storefront
 * público (`app/t/[slug]/page.tsx` → tokensToCssBlock). El write-path de
 * /api/settings solo valida los colores top-level con regex hex; los de
 * `storeTheme.*` (que /t SÍ renderiza) se mergean sin validar, así que un dueño
 * malicioso podía guardar `primaryColor: "red}</style><script>…"` y romper el
 * bloque `<style>` (stored XSS en dev / CSS-injection + HTML-breakout en prod).
 * Este es el ÚNICO chokepoint por donde TODOS los colores entran al CSS: aceptamos
 * solo hex / rgb()/rgba() / hsl()/hsla() / keyword; cualquier otra cosa → fallback.
 */
const SAFE_CSS_COLOR = /^(#[0-9a-fA-F]{3,8}|rgba?\([\d.,%\s]+\)|hsla?\([\d.,%\s]+\)|[a-zA-Z]{1,30})$/;
export function sanitizeCssColor(v: unknown, fallback: string): string {
  return typeof v === "string" && SAFE_CSS_COLOR.test(v.trim()) ? v.trim() : fallback;
}

/** Devuelve un objeto con CSS vars listo para inyectar como `style`. */
export function tokensToCssVars(tokens: DesignTokens): Record<string, string> {
  const heading = HEADING_SIZE_MAP[tokens.headingSize];
  const density = DENSITY_MAP[tokens.density];
  return {
    "--tenant-font":        FONT_FAMILIES[tokens.fontFamily].stack,
    "--tenant-primary":     sanitizeCssColor(tokens.primaryColor, "#00A0A0"),
    "--tenant-secondary":   sanitizeCssColor(tokens.secondaryColor, "#FF6B5B"),
    "--tenant-accent":      sanitizeCssColor(tokens.accentColor, "#00A0A0"),
    "--tenant-bg":          sanitizeCssColor(tokens.backgroundColor, "#ffffff"),
    "--tenant-text":        sanitizeCssColor(tokens.textColor, "#0f172a"),
    "--tenant-radius":      RADIUS_MAP[tokens.borderRadius],
    "--tenant-shadow":      SHADOW_MAP[tokens.shadowStyle],
    "--tenant-h1":          heading.h1,
    "--tenant-h2":          heading.h2,
    "--tenant-line-height": heading.lineHeight,
    "--tenant-pad-y":       density.padY,
    "--tenant-gap":         density.gap,
  };
}

/** Devuelve CSS para inyectar via <style> que aplica los tokens. */
export function tokensToCssBlock(tokens: DesignTokens): string {
  const vars = tokensToCssVars(tokens);
  const varsStr = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`).join("\n");
  const btnStyle = tokens.buttonStyle;
  return `
.tenant-theme {
${varsStr}
  font-family: var(--tenant-font);
  color: var(--tenant-text);
  background: var(--tenant-bg);
}
/* DARK MODE 2026-05-24: el storefront soporta el toggle de dark del usuario,
   pero los tokens del tenant (--tenant-bg/--tenant-text) son light-only. En
   dark, el fondo del tenant quedaba blanco y los títulos (--text-primary, que
   sí se aclara) resultaban casi blancos sobre blanco = invisibles. Fix: en
   .dark, el fondo y texto base usan los tokens dark de Buleje. Los acentos del
   tenant (--tenant-primary/accent en botones) se mantienen intactos. */
.dark .tenant-theme {
  color: var(--text-primary);
  background: var(--surface-canvas);
}
.tenant-theme h1, .tenant-theme [data-tenant-h1] {
  font-size: var(--tenant-h1);
  line-height: var(--tenant-line-height);
}
.tenant-theme h2, .tenant-theme [data-tenant-h2] {
  font-size: var(--tenant-h2);
  line-height: 1.15;
}
.tenant-theme [data-tenant-card],
.tenant-theme .tenant-card {
  border-radius: var(--tenant-radius);
  box-shadow: var(--tenant-shadow);
}
.tenant-theme [data-tenant-button],
.tenant-theme .tenant-button {
  border-radius: var(--tenant-radius);
  ${btnStyle === "solid"    ? `background: var(--tenant-primary); color: #fff; border: none;` : ""}
  ${btnStyle === "outline"  ? `background: transparent; color: var(--tenant-primary); border: 2px solid var(--tenant-primary);` : ""}
  ${btnStyle === "gradient" ? `background: linear-gradient(135deg, var(--tenant-primary) 0%, var(--tenant-accent) 100%); color: #fff; border: none;` : ""}
  ${btnStyle === "minimal"  ? `background: transparent; color: var(--tenant-primary); border: 1px solid var(--tenant-primary)/30; text-decoration: underline; text-underline-offset: 4px;` : ""}
  font-weight: 800;
  transition: transform 0.15s ease, box-shadow 0.2s ease;
}
.tenant-theme [data-tenant-button]:hover,
.tenant-theme .tenant-button:hover {
  transform: translateY(-1px);
  box-shadow: var(--tenant-shadow);
}
`.trim();
}
