"use client";

/**
 * BrandConceptTab — Análisis de logo + generación de conceptos de marca.
 *
 * Cómo funciona (sin API ni ML):
 *   1. Toma el logo actual y lo carga en <canvas> para extraer 6 colores.
 *   2. Cuantiza con bins de 5-bits ignorando blanco/negro/transparente.
 *   3. Sugiere tipografía según vibe del color principal.
 *   4. Genera 8+ conceptos completos con armonías profesionales:
 *      - Análoga (vecinos en rueda)
 *      - Triádica (120°)
 *      - Complementaria (180°)
 *      - Split-complementaria
 *      - Monocromática (mismo hue, distintas luminosidades)
 *   5. Cada concepto trae metadata "idealPara" — verticales donde brilla.
 *   6. Click en concepto → aplica todo en bloque al theme.
 *   7. Vista expandida muestra el concepto activo en 8+ componentes reales.
 *   8. "Ver en tienda" abre el storefront real en nueva pestaña.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  WandSparkles, Loader2, RefreshCw, Check, Sparkles, Moon, Type,
  Image as ImageIcon, Palette, ExternalLink, Eye,
  Tag, ShoppingCart, Heart, Bell,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { StoreTheme } from "./StoreCustomizer";

// ── Helpers de color (RGB ↔ HEX ↔ HSL) ──────────────────────────────

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [
    parseInt(full.slice(0, 2), 16) || 0,
    parseInt(full.slice(2, 4), 16) || 0,
    parseInt(full.slice(4, 6), 16) || 0,
  ];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60)        { r = c; g = x; b = 0; }
  else if (h < 120)  { r = x; g = c; b = 0; }
  else if (h < 180)  { r = 0; g = c; b = x; }
  else if (h < 240)  { r = 0; g = x; b = c; }
  else if (h < 300)  { r = x; g = 0; b = c; }
  else               { r = c; g = 0; b = x; }
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHsl(r, g, b);
}

function hslToHex(h: number, s: number, l: number): string {
  const [r, g, b] = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}

function luminosity(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  const a = [r, g, b].map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

function contrastRatio(a: string, b: string): number {
  const la = luminosity(a);
  const lb = luminosity(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function rotateHue(hex: string, degrees: number): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex((h + degrees + 360) % 360, s, l);
}

function withSL(hex: string, s?: number, l?: number): string {
  const [h, sat, lum] = hexToHsl(hex);
  return hslToHex(h, s ?? sat, l ?? lum);
}

function ensureContrastOn(color: string, background: string, minRatio = 3): string {
  if (contrastRatio(color, background) >= minRatio) return color;
  const [h, s] = hexToHsl(color);
  const bgLum = luminosity(background);
  const target = bgLum > 0.5 ? 0.32 : 0.72;
  return hslToHex(h, Math.min(1, s + 0.1), target);
}

// ── Tipografía sugerida ──────────────────────────────────────────────

function suggestFont(primaryHex: string): { value: string; label: string; vibe: string } {
  const [h, s, l] = hexToHsl(primaryHex);
  if (l < 0.20 || (h >= 30 && h <= 50 && s > 0.5 && l < 0.5)) {
    return { value: "montserrat", label: "Montserrat", vibe: "Elegante geométrica — premium y sofisticada" };
  }
  if ((h <= 25 || h >= 340) && s > 0.5) {
    return { value: "poppins", label: "Poppins", vibe: "Friendly y redonda — comida, energía, cercanía" };
  }
  if (h >= 25 && h <= 55 && s > 0.4) {
    return { value: "nunito", label: "Nunito", vibe: "Calidez redondeada — bodegas y comida casera" };
  }
  if (h >= 70 && h <= 160 && s > 0.3) {
    return { value: "lato", label: "Lato", vibe: "Limpia y orgánica — productos frescos" };
  }
  if (h >= 160 && h <= 200 && s > 0.3) {
    return { value: "inter", label: "Inter", vibe: "Limpia y técnica — marcas confiables modernas" };
  }
  if (h >= 200 && h <= 260 && s > 0.3) {
    return { value: "inter", label: "Inter", vibe: "Limpia y profesional — servicios y tech" };
  }
  if (h >= 260 && h <= 320 && s > 0.3) {
    return { value: "raleway", label: "Raleway", vibe: "Sofisticada y delgada — beauty, moda" };
  }
  if (s < 0.35 && l > 0.55) {
    return { value: "lato", label: "Lato", vibe: "Profesional cálida — minimalista" };
  }
  return { value: "geist", label: "Geist", vibe: "Moderna y versátil — cualquier marca" };
}

function describeBrand(primaryHex: string): { theme: string; tone: string; archetype: string } {
  const [h, s, l] = hexToHsl(primaryHex);
  if (l < 0.10) return { theme: "Sofisticado y serio", tone: "Lujo, autoridad, premium", archetype: "premium" };
  if (l < 0.25 && s < 0.2) return { theme: "Minimalista y profesional", tone: "Tech, B2B, corporativo", archetype: "tech" };
  if (h >= 35 && h <= 55 && s > 0.5 && l > 0.4) return { theme: "Premium y exclusivo", tone: "Joyería, oro, nicho exclusivo", archetype: "luxury" };
  if ((h < 15 || h > 345) && s > 0.4) return { theme: "Energético y urgente", tone: "Comida rápida, ofertas, pasión", archetype: "food" };
  if (h >= 15 && h <= 40 && s > 0.4) return { theme: "Cálido y entusiasta", tone: "Comida casera, bodega, energía positiva", archetype: "warm" };
  if (h >= 40 && h <= 65 && s > 0.4) return { theme: "Optimista y juvenil", tone: "Familia, promociones, alegría", archetype: "warm" };
  if (h >= 80 && h <= 160) return { theme: "Natural y fresco", tone: "Bodega, salud, productos frescos", archetype: "natural" };
  if (h >= 160 && h <= 200) return { theme: "Confiable y limpio", tone: "Salud, agua, tecnología limpia", archetype: "tech" };
  if (h >= 200 && h <= 250) return { theme: "Profesional y confiable", tone: "Servicios, finanzas, B2B", archetype: "tech" };
  if (h >= 250 && h <= 290) return { theme: "Creativo y moderno", tone: "Tech, lujo accesible, beauty", archetype: "beauty" };
  if (h >= 290 && h <= 345) return { theme: "Femenino y juvenil", tone: "Beauty, moda, estilo de vida", archetype: "beauty" };
  return { theme: "Versátil", tone: "Funciona en muchos rubros", archetype: "neutral" };
}

// ── Extracción de colores dominantes ────────────────────────────────

async function extractColors(imageUrl: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const maxSize = 200;
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve([]);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      try {
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const bins = new Map<string, { count: number; r: number; g: number; b: number }>();
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
          if (a < 128) continue;
          const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
          if (lum > 0.95 || lum < 0.05) continue;
          const key = `${r >> 3}-${g >> 3}-${b >> 3}`;
          const existing = bins.get(key);
          if (existing) {
            existing.count += 1;
            existing.r += r;
            existing.g += g;
            existing.b += b;
          } else {
            bins.set(key, { count: 1, r, g, b });
          }
        }
        const sorted = Array.from(bins.values())
          .filter((b) => b.count > 5)
          .sort((a, b) => b.count - a.count)
          .slice(0, 10)
          .map((b) => rgbToHex(b.r / b.count, b.g / b.count, b.b / b.count));
        const uniq: string[] = [];
        for (const c of sorted) {
          const [r1, g1, b1] = hexToRgb(c);
          const tooClose = uniq.some((u) => {
            const [r2, g2, b2] = hexToRgb(u);
            return Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2) < 60;
          });
          if (!tooClose) uniq.push(c);
        }
        resolve(uniq.slice(0, 6));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = (e) => reject(e);
    img.src = imageUrl;
  });
}

// ── Conceptos generados con teoría de color + verticales ────────────

type Concept = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  harmony: string;
  /** Verticales donde el concepto rinde mejor — guía al dueño a elegir */
  idealPara: string[];
  primary: string;
  secondary: string;
  accent: string;
  font: string;
  darkMode: boolean;
  cardStyle: "minimal" | "shadow" | "border" | "glass";
  buttonStyle: "rounded" | "square" | "pill";
  navbarStyle: "solid" | "transparent" | "blur" | "minimal";
  shadowLevel: "none" | "soft" | "deep";
  animations: "none" | "subtle" | "dynamic";
  backgroundPattern: "none" | "dots" | "waves" | "gradient";
  borderRadius: number;
  spacing: "compact" | "normal" | "spacious";
};

function generateConcepts(colors: string[], primaryHex: string): Concept[] {
  const c0 = primaryHex;
  const [, s0, l0] = hexToHsl(c0);

  const primaryUsable = l0 > 0.75
    ? withSL(c0, Math.max(s0, 0.55), 0.55)
    : l0 < 0.18
    ? withSL(c0, Math.max(s0, 0.4), 0.32)
    : c0;

  const primaryDeep = withSL(primaryUsable, Math.min(1, s0 + 0.1), 0.42);
  const primaryBright = withSL(primaryUsable, Math.min(1, s0 + 0.15), 0.55);

  const harmonicSat = Math.max(0.65, Math.min(0.92, s0 + 0.15));
  const harmonicLum = 0.50;

  const analogousA = withSL(rotateHue(primaryUsable, -30), harmonicSat * 0.85, 0.55);
  const analogousB = withSL(rotateHue(primaryUsable, 30), harmonicSat * 0.85, 0.60);
  const triadicA = withSL(rotateHue(primaryUsable, 120), harmonicSat, harmonicLum);
  const triadicB = withSL(rotateHue(primaryUsable, 240), harmonicSat, harmonicLum);
  const complementary = withSL(rotateHue(primaryUsable, 180), Math.max(0.7, s0 + 0.1), harmonicLum);
  const splitA = withSL(rotateHue(primaryUsable, 150), harmonicSat * 0.85, harmonicLum);
  const splitB = withSL(rotateHue(primaryUsable, 210), harmonicSat * 0.85, harmonicLum);
  const monoDark = withSL(primaryUsable, s0, Math.max(0.20, l0 * 0.5));

  const goldAccent = "#d4a437";
  const charcoal = "#1a1a1a";
  const warmRed = "#dc2626";
  const freshGreen = "#16a34a";

  const archetype = describeBrand(c0).archetype;
  const fontGuess = suggestFont(c0).value;
  const isWarm = archetype === "warm" || archetype === "food" || archetype === "natural";

  const concepts: Concept[] = [
    {
      id: "bodega-cercana",
      name: "Bodega de Barrio",
      tagline: "Confianza · Cercanía",
      description: "El color de tu logo en versión cálida + neutro suave + dorado discreto. Look amigable que invita a entrar — los vecinos te reconocen.",
      harmony: "Monocromática + neutro cálido",
      idealPara: ["Bodegas", "Mini-markets", "Tiendas de barrio", "Comercio cercano"],
      primary: primaryUsable,
      secondary: monoDark,
      accent: goldAccent,
      font: isWarm ? "nunito" : fontGuess,
      darkMode: false,
      cardStyle: "shadow",
      buttonStyle: "rounded",
      navbarStyle: "minimal",
      shadowLevel: "soft",
      animations: "subtle",
      backgroundPattern: "none",
      borderRadius: 14,
      spacing: "normal",
    },
    {
      id: "polleria-express",
      name: "Comida Express",
      tagline: "Hambre · Conversión",
      description: "Triádica vibrante con botones pill y animaciones dinámicas. Cards levantan al hover, gradiente sutil — pensado para que pidan rápido.",
      harmony: "Triádica (120°)",
      idealPara: ["Pollerías", "Cevicherías", "Comida rápida", "Restaurantes con delivery"],
      primary: primaryUsable,
      secondary: ensureContrastOn(triadicA, "#ffffff", 2.8),
      accent: ensureContrastOn(triadicB, "#ffffff", 2.8),
      font: archetype === "food" ? "poppins" : fontGuess,
      darkMode: false,
      cardStyle: "shadow",
      buttonStyle: "pill",
      navbarStyle: "minimal",
      shadowLevel: "soft",
      animations: "dynamic",
      backgroundPattern: "gradient",
      borderRadius: 18,
      spacing: "normal",
    },
    {
      id: "minimarket-moderno",
      name: "Mini-market Moderno",
      tagline: "Limpio · Eficiente",
      description: "Navbar blur con glassmorphism, patrón de puntos sutil, cards con sombra suave. App moderna 2026 — confianza tecnológica para clientes jóvenes.",
      harmony: "Split-complementaria (150° / 210°)",
      idealPara: ["Mini-markets", "Cadenas de tiendas", "Productos de consumo", "E-commerce escalable"],
      primary: primaryUsable,
      secondary: splitA,
      accent: splitB,
      font: "inter",
      darkMode: false,
      cardStyle: "glass",
      buttonStyle: "rounded",
      navbarStyle: "blur",
      shadowLevel: "soft",
      animations: "dynamic",
      backgroundPattern: "dots",
      borderRadius: 16,
      spacing: "normal",
    },
    {
      id: "boutique-sofisticada",
      name: "Boutique Sofisticada",
      tagline: "Suave · Premium",
      description: "Análoga sutil + cards minimal + radios grandes + mucho whitespace. Sensación calmada, ideal cuando el producto cuidado vende solo.",
      harmony: "Análoga (-30° / +30°)",
      idealPara: ["Boutiques", "Cosmética", "Regalos", "Productos artesanales"],
      primary: primaryUsable,
      secondary: analogousA,
      accent: analogousB,
      font: archetype === "beauty" ? "raleway" : "lato",
      darkMode: false,
      cardStyle: "minimal",
      buttonStyle: "rounded",
      navbarStyle: "minimal",
      shadowLevel: "soft",
      animations: "subtle",
      backgroundPattern: "none",
      borderRadius: 24,
      spacing: "spacious",
    },
    {
      id: "premium-nocturno",
      name: "Premium Nocturno",
      tagline: "Lujo · Exclusividad",
      description: "Modo oscuro completo con dorado, borders finos, sombras profundas. Productos especiales se sienten exclusivos — eleva tu ticket promedio.",
      harmony: "Monocromática oscura + dorado",
      idealPara: ["Vinos y licores", "Joyería", "Regalos premium", "Productos importados"],
      primary: primaryBright,
      secondary: charcoal,
      accent: goldAccent,
      font: "montserrat",
      darkMode: true,
      cardStyle: "border",
      buttonStyle: "square",
      navbarStyle: "blur",
      shadowLevel: "deep",
      animations: "subtle",
      backgroundPattern: "none",
      borderRadius: 6,
      spacing: "spacious",
    },
    {
      id: "ofertas-bold",
      name: "Ofertas Bold",
      tagline: "Impacto · Urgencia",
      description: "Complementaria 180° + sombras profundas + waves al pie. Todo grita comprá ahora — ideal cuando rotás stock con descuentos agresivos.",
      harmony: "Complementaria (180°)",
      idealPara: ["Ferreterías", "Tiendas mayoristas", "Outlets", "Promociones agresivas"],
      primary: primaryUsable,
      secondary: ensureContrastOn(complementary, "#ffffff", 3),
      accent: warmRed,
      font: archetype === "food" ? "poppins" : fontGuess,
      darkMode: false,
      cardStyle: "shadow",
      buttonStyle: "pill",
      navbarStyle: "minimal",
      shadowLevel: "deep",
      animations: "dynamic",
      backgroundPattern: "waves",
      borderRadius: 14,
      spacing: "compact",
    },
    {
      id: "natural-fresco",
      name: "Natural Fresco",
      tagline: "Orgánico · Saludable",
      description: "Verde fresco con análoga suave, cards con sombra + radios amables. Comunica frescura, salud y producto del día — frutas, verduras, orgánico.",
      harmony: "Análoga + verde acento",
      idealPara: ["Fruterías", "Verdulerías", "Productos orgánicos", "Comida saludable"],
      primary: primaryUsable,
      secondary: analogousB,
      accent: freshGreen,
      font: archetype === "natural" ? "lato" : fontGuess,
      darkMode: false,
      cardStyle: "shadow",
      buttonStyle: "rounded",
      navbarStyle: "blur",
      shadowLevel: "soft",
      animations: "subtle",
      backgroundPattern: "none",
      borderRadius: 18,
      spacing: "spacious",
    },
    {
      id: "editorial-magazine",
      name: "Editorial Magazine",
      tagline: "Minimal · Elegante",
      description: "Cards sin sombra, navbar minimal, botones cuadrados, mucho whitespace. Inspirado en revistas — la marca habla por sí sola.",
      harmony: "Monocromática extrema",
      idealPara: ["Lifestyle", "Marcas con storytelling", "Productos con foto premium", "Curaduría editorial"],
      primary: primaryDeep,
      secondary: charcoal,
      accent: primaryUsable,
      font: archetype === "luxury" ? "raleway" : "montserrat",
      darkMode: false,
      cardStyle: "minimal",
      buttonStyle: "square",
      navbarStyle: "minimal",
      shadowLevel: "none",
      animations: "subtle",
      backgroundPattern: "none",
      borderRadius: 4,
      spacing: "spacious",
    },
  ];

  // Si tenemos 2+ colores extraídos, agregamos "Auténtico" al inicio
  if (colors.length >= 2) {
    concepts.unshift({
      id: "autentico",
      name: "Auténtico del Logo",
      tagline: "Fiel · Reconocible",
      description: "Usa exactamente los colores extraídos de tu logo + neutro cálido. La opción más fiel — clientes te reconocen al instante.",
      harmony: "Colores reales del logo",
      idealPara: ["Marcas con identidad fuerte", "Logos profesionales", "Coherencia visual"],
      primary: primaryUsable,
      secondary: colors[1] || monoDark,
      accent: colors[2] || goldAccent,
      font: fontGuess,
      darkMode: false,
      cardStyle: "shadow",
      buttonStyle: "rounded",
      navbarStyle: "blur",
      shadowLevel: "soft",
      animations: "subtle",
      backgroundPattern: "none",
      borderRadius: 14,
      spacing: "normal",
    });
  }

  return concepts;
}

// ── Componente principal ────────────────────────────────────────────

export default function BrandConceptTab({
  theme,
  onApplyConcept,
}: {
  theme: StoreTheme;
  onApplyConcept: (patches: Partial<StoreTheme>) => void;
}) {
  const [colors, setColors] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeConceptId, setActiveConceptId] = useState<string | null>(null);
  const lastAnalyzed = useRef<string>("");

  const logo = theme.logo;

  const analyze = useCallback(async () => {
    if (!logo) return;
    setAnalyzing(true);
    setError(null);
    try {
      const c = await extractColors(logo);
      setColors(c);
      lastAnalyzed.current = logo;
    } catch (e) {
      console.error("[BrandConcept] extract error", e);
      setError("No se pudo analizar el logo. Probá con otra imagen o asegurate de que sea PNG/JPG válido.");
    } finally {
      setAnalyzing(false);
    }
  }, [logo]);

  useEffect(() => {
    if (logo && logo !== lastAnalyzed.current) {
      void analyze();
    }
  }, [logo, analyze]);

  const primaryColor = colors[0];
  const fontSuggestion = primaryColor ? suggestFont(primaryColor) : null;
  const brandDescription = primaryColor ? describeBrand(primaryColor) : null;
  const concepts = useMemo(
    () => (primaryColor ? generateConcepts(colors, primaryColor) : []),
    [colors, primaryColor],
  );
  const activeConcept = useMemo(
    () => concepts.find((c) => c.id === activeConceptId) ?? null,
    [concepts, activeConceptId],
  );

  const storefrontUrl = useMemo(() => {
    if (typeof window === "undefined") return null;
    const path = window.location.pathname;
    const match = path.match(/^\/t\/([^/]+)\//);
    if (match) return `/t/${match[1]}/tienda`;
    return "/tienda";
  }, []);

  const applyConcept = (concept: Concept, openPreview = false) => {
    setActiveConceptId(concept.id);
    onApplyConcept({
      primaryColor: concept.primary,
      secondaryColor: concept.secondary,
      accentColor: concept.accent,
      fontFamily: concept.font,
      darkModeDefault: concept.darkMode,
      cardStyle: concept.cardStyle,
      buttonStyle: concept.buttonStyle,
      navbarStyle: concept.navbarStyle,
      shadowLevel: concept.shadowLevel,
      animations: concept.animations,
      backgroundPattern: concept.backgroundPattern,
      borderRadius: concept.borderRadius,
      spacing: concept.spacing,
    });
    if (openPreview && storefrontUrl) {
      setTimeout(() => window.open(storefrontUrl, "_blank"), 300);
    }
  };

  return (
    <div className="space-y-8">
      {/* Banner explicativo */}
      <div className="bg-primary/5 dark:bg-primary/10 border-2 border-primary/15 rounded-2xl p-5 flex items-start gap-3">
        <div className="shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <WandSparkles className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-base font-bold text-[var(--text-primary)]">Tu logo guía toda la tienda</p>
          <p className="text-sm text-muted mt-0.5">
            Subimos tu logo, extraemos sus colores reales y te damos <span className="font-bold">conceptos verticales</span> con
            armonías profesionales. Cada concepto cambia colores + fuente + estilos en bloque — y abajo ves cómo
            se aplica a <span className="font-bold">cada componente real</span> de tu tienda.
          </p>
        </div>
      </div>

      {/* ── 1. LOGO ACTUAL ──────────────────────────────────────── */}
      <section className="space-y-4">
        <header className="flex items-start gap-3">
          <div className="shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <ImageIcon className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-extrabold text-[var(--text-primary)] leading-tight">Tu logo actual</p>
            <p className="text-sm text-muted leading-snug mt-0.5">El sistema lo lee para extraer la paleta y el feeling.</p>
          </div>
          {logo && (
            <button
              type="button"
              onClick={() => void analyze()}
              disabled={analyzing}
              className="inline-flex items-center gap-1.5 px-3 h-10 rounded-xl border-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm font-bold text-[var(--text-primary)] hover:border-primary/40 hover:bg-gray-50 dark:hover:bg-surface disabled:opacity-50"
            >
              {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {analyzing ? "Analizando…" : "Re-analizar"}
            </button>
          )}
        </header>

        {!logo ? (
          <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] dark:border-[var(--rule-base)] p-8 text-center">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <ImageIcon className="h-7 w-7 text-primary" />
            </div>
            <p className="text-base font-bold text-[var(--text-primary)]">Subí tu logo primero</p>
            <p className="text-sm text-muted mt-1">
              Andá a <span className="font-bold">Identidad</span> y subí tu logo. Después volvé acá y te genero los conceptos.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl border-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface p-4 flex items-center justify-center min-h-[180px]">
              <div className="relative h-32 w-32">
                <Image src={logo} alt="Logo" fill sizes="128px" className="object-contain" unoptimized={logo.startsWith("data:")} />
              </div>
            </div>

            <div className="md:col-span-2 space-y-3">
              <div className="rounded-2xl border-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Palette className="h-4 w-4 text-primary" />
                  <p className="text-sm font-bold text-[var(--text-primary)]">Paleta extraída</p>
                  {analyzing && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" />}
                </div>
                {error ? (
                  <p className="text-sm text-[var(--data-error-500)]">{error}</p>
                ) : colors.length === 0 ? (
                  <p className="text-sm text-muted">{analyzing ? "Procesando pixels…" : "Click en re-analizar para empezar."}</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {colors.map((c, i) => (
                      <div key={c} className="inline-flex items-center gap-1.5">
                        <div className="h-9 w-9 rounded-lg border-2 border-white dark:border-card shadow-[var(--shadow-sm)]" style={{ backgroundColor: c }} />
                        <div className="leading-tight">
                          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-muted">{i === 0 ? "Dominante" : `#${i + 1}`}</p>
                          <p className="text-xs font-mono text-[var(--text-primary)]">{c.toUpperCase()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {primaryColor && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {fontSuggestion && (
                    <div className="rounded-2xl border-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Type className="h-4 w-4 text-primary" />
                        <p className="text-sm font-bold text-[var(--text-primary)]">Tipografía sugerida</p>
                      </div>
                      <p className="text-2xl font-extrabold text-[var(--text-primary)]" style={{ fontFamily: fontSuggestion.label === "Sistema" ? "system-ui" : `'${fontSuggestion.label}', sans-serif` }}>
                        Aa {fontSuggestion.label}
                      </p>
                      <p className="text-xs text-muted mt-1 leading-snug">{fontSuggestion.vibe}</p>
                    </div>
                  )}
                  {brandDescription && (
                    <div className="rounded-2xl border-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <p className="text-sm font-bold text-[var(--text-primary)]">Tu logo transmite</p>
                      </div>
                      <p className="text-base font-bold text-[var(--text-primary)] leading-tight">{brandDescription.theme}</p>
                      <p className="text-xs text-muted mt-1 leading-snug">{brandDescription.tone}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ── 2. CONCEPTOS ───────────────────────────────────────── */}
      {concepts.length > 0 && (
        <section className="space-y-4">
          <header className="flex items-start gap-3">
            <div className="shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <WandSparkles className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-base font-extrabold text-[var(--text-primary)] leading-tight">{concepts.length} conceptos para tu marca</p>
              <p className="text-sm text-muted leading-snug mt-0.5">
                Cada concepto está pensado para una <span className="font-bold">vertical específica</span>.
                Click para aplicar — abajo ves cómo se ve en cada componente.
              </p>
            </div>
            {storefrontUrl && (
              <a
                href={storefrontUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 h-10 rounded-xl bg-primary text-white text-sm font-bold hover:opacity-90 shrink-0"
              >
                <ExternalLink className="h-4 w-4" />
                Abrir tienda
              </a>
            )}
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {concepts.map((c) => (
              <ConceptCard
                key={c.id}
                concept={c}
                isActive={activeConceptId === c.id}
                onApply={() => applyConcept(c, false)}
                onApplyAndPreview={() => applyConcept(c, true)}
              />
            ))}
          </div>

          <p className="text-xs text-muted text-center pt-2">
            Cada concepto cambia: <span className="font-bold">colores</span> · <span className="font-bold">fuente</span> ·
            <span className="font-bold"> modo claro/oscuro</span> · <span className="font-bold">cards</span> ·
            <span className="font-bold"> botones</span> · <span className="font-bold">navbar</span> ·
            <span className="font-bold"> patrón fondo</span> · <span className="font-bold">radio</span> ·
            <span className="font-bold"> espaciado</span>. Ajustá manual desde
            <span className="font-bold"> Colores</span>, <span className="font-bold">Estilos</span> y <span className="font-bold">Avanzado</span>.
          </p>
        </section>
      )}

      {/* ── 3. VISTA EXPANDIDA del concepto activo ────────────── */}
      {activeConcept && (
        <section className="space-y-4">
          <header className="flex items-start gap-3">
            <div className="shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Eye className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-base font-extrabold text-[var(--text-primary)] leading-tight">
                Cómo se ve {activeConcept.name} en tus componentes
              </p>
              <p className="text-sm text-muted leading-snug mt-0.5">
                Vista previa de los componentes reales con tu paleta aplicada.
              </p>
            </div>
            {storefrontUrl && (
              <a
                href={storefrontUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 h-10 rounded-xl border-2 border-primary text-[var(--accent-ink)] dark:text-[var(--accent)] text-sm font-bold hover:bg-primary/5 shrink-0"
              >
                <ExternalLink className="h-4 w-4" />
                Ver en vivo
              </a>
            )}
          </header>
          <ExpandedPreview concept={activeConcept} />
        </section>
      )}
    </div>
  );
}

// ── Sub-componente: ConceptCard ─────────────────────────────────────

function ConceptCard({
  concept: c,
  isActive,
  onApply,
  onApplyAndPreview,
}: {
  concept: Concept;
  isActive: boolean;
  onApply: () => void;
  onApplyAndPreview: () => void;
}) {
  const buttonRadius = c.buttonStyle === "pill" ? 999 : c.buttonStyle === "square" ? 4 : 10;

  return (
    <div
      className={cn(
        "group rounded-2xl border-2 overflow-hidden transition-all flex flex-col",
        isActive
          ? "border-primary ring-2 ring-primary/20 shadow-[var(--shadow-lg)]"
          : "border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:border-primary/40 hover:shadow-[var(--shadow-xl)]",
      )}
    >
      {/* Mini-mockup grande */}
      <button
        type="button"
        onClick={onApply}
        aria-pressed={isActive}
        className={cn("relative w-full text-left", c.darkMode ? "bg-gray-950" : "bg-white dark:bg-[var(--color-card)]")}
      >
        {/* Navbar */}
        <div
          className="h-10 px-3 flex items-center gap-2"
          style={{
            background: c.navbarStyle === "transparent"
              ? "transparent"
              : c.navbarStyle === "blur"
              ? `${c.primary}cc`
              : c.navbarStyle === "minimal"
              ? (c.darkMode ? "#0a0a0a" : "#fff")
              : c.primary,
          }}
        >
          <div
            className="h-5 w-5 rounded-md"
            style={{
              backgroundColor: c.navbarStyle === "minimal" ? c.primary : "rgba(255,255,255,0.4)",
            }}
          />
          <div
            className="h-2 w-16 rounded-full"
            style={{
              backgroundColor: c.navbarStyle === "minimal"
                ? (c.darkMode ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.7)")
                : "rgba(255,255,255,0.7)",
            }}
          />
          <div className="ml-auto flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  backgroundColor: c.navbarStyle === "minimal"
                    ? (c.darkMode ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.5)")
                    : "rgba(255,255,255,0.6)",
                }}
              />
            ))}
          </div>
        </div>

        {/* Hero */}
        <div
          className="h-24 relative px-4 py-3 flex flex-col justify-center"
          style={{
            background: c.backgroundPattern === "gradient"
              ? `linear-gradient(135deg, ${c.primary}, ${c.accent})`
              : c.backgroundPattern === "dots"
              ? `radial-gradient(${c.primary}40 1px, transparent 1px) ${c.darkMode ? "#0a0a0a" : "#f8fafc"}`
              : c.backgroundPattern === "waves"
              ? `linear-gradient(180deg, ${c.darkMode ? "#0a0a0a" : "#f8fafc"} 0%, ${c.primary}22 100%)`
              : c.darkMode ? "#0a0a0a" : "#f8fafc",
            backgroundSize: c.backgroundPattern === "dots" ? "10px 10px" : undefined,
          }}
        >
          <div
            className="inline-block self-start px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide"
            style={{
              backgroundColor: c.backgroundPattern === "gradient" ? "rgba(255,255,255,0.25)" : `${c.accent}30`,
              color: c.backgroundPattern === "gradient" ? "#fff" : c.accent,
            }}
          >
            Promo
          </div>
          <div
            className="h-2.5 w-3/4 rounded-full mt-2"
            style={{
              backgroundColor: c.backgroundPattern === "gradient"
                ? "rgba(255,255,255,0.9)"
                : (c.darkMode ? "rgba(255,255,255,0.85)" : "rgba(15,23,42,0.85)"),
            }}
          />
          <div
            className="h-1.5 w-1/2 rounded-full mt-1"
            style={{
              backgroundColor: c.backgroundPattern === "gradient"
                ? "rgba(255,255,255,0.6)"
                : (c.darkMode ? "rgba(255,255,255,0.4)" : "rgba(71,85,105,0.6)"),
            }}
          />
          <div
            className="self-start mt-2 h-5 px-2.5 flex items-center text-[length:var(--ts-2xs)] font-bold text-white"
            style={{
              backgroundColor: c.backgroundPattern === "gradient" ? "rgba(255,255,255,0.95)" : c.primary,
              color: c.backgroundPattern === "gradient" ? c.primary : "#fff",
              borderRadius: buttonRadius,
            }}
          >
            Comprar
          </div>
        </div>

        {/* Cards de producto (3) */}
        <div
          className="px-3 pt-3 pb-1 grid grid-cols-3 gap-2"
          style={{ backgroundColor: c.darkMode ? "#0a0a0a" : "#fff" }}
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={cn(
                "p-1.5 flex flex-col gap-1",
                c.cardStyle === "minimal" && (c.darkMode ? "bg-gray-900" : "bg-gray-50"),
                c.cardStyle === "shadow" && (c.darkMode ? "bg-gray-900 shadow-[var(--shadow-lg)]" : "bg-white dark:bg-[var(--color-card)] shadow-[var(--shadow-md)]"),
                c.cardStyle === "border" && "bg-transparent border-2",
                c.cardStyle === "glass" && (c.darkMode ? "bg-white/5 backdrop-blur" : "bg-white/70 backdrop-blur border border-white/40"),
              )}
              style={{
                borderColor: c.cardStyle === "border" ? `${c.primary}50` : undefined,
                borderRadius: c.borderRadius * 0.6,
              }}
            >
              <div
                className="aspect-square rounded"
                style={{
                  background: i === 0
                    ? `linear-gradient(135deg, ${c.primary}66, ${c.accent}33)`
                    : i === 1
                    ? `linear-gradient(135deg, ${c.secondary}66, ${c.primary}33)`
                    : `linear-gradient(135deg, ${c.accent}55, ${c.secondary}33)`,
                  borderRadius: c.borderRadius * 0.4,
                }}
              />
              <div className={cn("h-1.5 w-full rounded-full", c.darkMode ? "bg-white/30" : "bg-gray-300")} />
              <div className="flex items-center gap-1">
                <div className="h-2 w-7 rounded" style={{ backgroundColor: c.primary }} />
                <div className={cn("h-1 w-4 rounded", c.darkMode ? "bg-white/20" : "bg-gray-200")} />
              </div>
            </div>
          ))}
        </div>

        {/* CTA bar abajo */}
        <div
          className="px-3 pb-3 pt-2 flex items-center gap-1.5"
          style={{ backgroundColor: c.darkMode ? "#0a0a0a" : "#fff" }}
        >
          <div
            className="h-6 px-2 flex items-center text-[length:var(--ts-2xs)] font-bold text-white"
            style={{ backgroundColor: c.primary, borderRadius: buttonRadius }}
          >
            Agregar
          </div>
          <div
            className="h-6 px-2 flex items-center text-[length:var(--ts-2xs)] font-bold"
            style={{
              backgroundColor: `${c.accent}20`,
              color: c.accent,
              borderRadius: buttonRadius,
              border: `1px solid ${c.accent}50`,
            }}
          >
            Oferta
          </div>
          <div
            className="h-6 w-6 ml-auto flex items-center justify-center"
            style={{
              backgroundColor: `${c.secondary}25`,
              color: c.secondary,
              borderRadius: buttonRadius,
            }}
          >
            <span className="text-[length:var(--ts-2xs)] font-bold">♥</span>
          </div>
        </div>

        {isActive && (
          <div className="absolute top-2 right-2 h-7 w-7 rounded-full bg-white dark:bg-[var(--color-card)] flex items-center justify-center shadow-[var(--shadow-lg)] ring-2 ring-primary">
            <Check className="h-4 w-4 text-primary" />
          </div>
        )}
        {c.darkMode && (
          <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-black/70 text-white text-[length:var(--ts-2xs)] font-bold">
            <Moon className="h-2.5 w-2.5" />
            Dark
          </span>
        )}
      </button>

      {/* Body */}
      <div className="p-4 bg-[var(--surface-raised)] border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="min-w-0">
            <p className="text-base font-extrabold text-[var(--text-primary)] leading-tight">{c.name}</p>
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-primary mt-0.5">{c.tagline}</p>
          </div>
          <div className="flex gap-1 shrink-0 mt-0.5">
            <div className="h-5 w-5 rounded-full border-2 border-white dark:border-card shadow" style={{ backgroundColor: c.primary }} />
            <div className="h-5 w-5 rounded-full border-2 border-white dark:border-card shadow -ml-2" style={{ backgroundColor: c.secondary }} />
            <div className="h-5 w-5 rounded-full border-2 border-white dark:border-card shadow -ml-2" style={{ backgroundColor: c.accent }} />
          </div>
        </div>
        <p className="text-xs text-muted leading-snug mt-1.5">{c.description}</p>

        {/* Ideal para — chip list */}
        {c.idealPara.length > 0 && (
          <div className="mt-3">
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-muted mb-1.5">
              Ideal para
            </p>
            <div className="flex flex-wrap gap-1">
              {c.idealPara.map((tag) => (
                <span
                  key={tag}
                  className="inline-block px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold"
                  style={{
                    backgroundColor: `${c.primary}15`,
                    color: c.primary,
                    border: `1px solid ${c.primary}30`,
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-muted flex-1 items-end">
          <span>{c.harmony}</span>
          <span>{c.cardStyle} · {c.buttonStyle}</span>
        </div>

        {/* Acciones */}
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onApply}
            className={cn(
              "flex-1 h-10 rounded-xl text-xs font-extrabold transition-colors",
              isActive
                ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] border-2 border-primary"
                : "bg-gray-100 dark:bg-surface text-[var(--text-[var(--accent-ink)] dark:text-[var(--accent)])] hover:bg-primary/10 hover:text-[var(--accent-ink)] dark:text-[var(--accent)] border-2 border-transparent",
            )}
          >
            {isActive ? "✓ Aplicado" : "Aplicar"}
          </button>
          <button
            type="button"
            onClick={onApplyAndPreview}
            className="flex-1 h-10 rounded-xl text-xs font-extrabold bg-primary text-white hover:opacity-90 inline-flex items-center justify-center gap-1.5"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Aplicar y ver
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-componente: ExpandedPreview ─────────────────────────────────
// Muestra el concepto activo en 8+ componentes reales que el cliente ve

function ExpandedPreview({ concept: c }: { concept: Concept }) {
  const buttonRadius = c.buttonStyle === "pill" ? 999 : c.buttonStyle === "square" ? 4 : 10;
  const cardRadius = c.borderRadius;
  const bgPage = c.darkMode ? "#0a0a0a" : "#f8fafc";
  const bgCard = c.darkMode ? "#1a1a1a" : "#ffffff";
  const textPrimary = c.darkMode ? "#fafafa" : "#1a1a1a";
  const textMuted = c.darkMode ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.55)";
  const borderSoft = c.darkMode ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)";
  const cardShadow =
    c.shadowLevel === "deep"
      ? "0 12px 28px -8px rgba(0,0,0,0.20)"
      : c.shadowLevel === "soft"
      ? "0 4px 12px -4px rgba(0,0,0,0.12)"
      : "none";

  const cardBaseStyle = (override: React.CSSProperties = {}): React.CSSProperties => ({
    backgroundColor: bgCard,
    borderRadius: cardRadius,
    border:
      c.cardStyle === "border"
        ? `2px solid ${c.primary}40`
        : c.cardStyle === "minimal"
        ? `1px solid ${borderSoft}`
        : c.cardStyle === "glass"
        ? `1px solid ${c.primary}20`
        : `1px solid ${borderSoft}`,
    boxShadow: c.cardStyle === "shadow" ? cardShadow : undefined,
    ...override,
  });

  return (
    <div
      className="rounded-3xl p-6 space-y-6 border-2"
      style={{
        background: bgPage,
        borderColor: borderSoft,
      }}
    >
      {/* Botones */}
      <div>
        <p
          className="text-xs font-extrabold uppercase tracking-wider mb-3"
          style={{ color: textMuted }}
        >
          Botones
        </p>
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-5 h-11 text-sm font-extrabold text-white"
            style={{
              background: `linear-gradient(135deg, ${c.primary} 0%, ${c.secondary} 100%)`,
              borderRadius: buttonRadius,
              boxShadow: `0 6px 14px -4px ${c.primary}55`,
            }}
          >
            <ShoppingCart className="h-4 w-4" />
            Pedir ahora
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-5 h-11 text-sm font-extrabold border-2"
            style={{
              backgroundColor: bgCard,
              borderRadius: buttonRadius,
              borderColor: c.primary,
              color: c.primary,
            }}
          >
            Ver detalle
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-5 h-11 text-sm font-extrabold"
            style={{
              backgroundColor: `${c.accent}20`,
              borderRadius: buttonRadius,
              color: c.accent,
            }}
          >
            <Tag className="h-4 w-4" />
            Aplicar cupón
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center w-11 h-11"
            style={{
              backgroundColor: `${c.secondary}20`,
              borderRadius: buttonRadius,
              color: c.secondary,
            }}
            aria-label="Favorito"
          >
            <Heart className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Badges + chips */}
      <div>
        <p
          className="text-xs font-extrabold uppercase tracking-wider mb-3"
          style={{ color: textMuted }}
        >
          Badges y chips
        </p>
        <div className="flex flex-wrap gap-2">
          <span
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-extrabold rounded-full text-white"
            style={{
              background: `linear-gradient(135deg, ${c.primary} 0%, ${c.secondary} 100%)`,
            }}
          >
            <Sparkles className="h-3 w-3" />
            Nuevo
          </span>
          <span
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-extrabold rounded-full"
            style={{
              backgroundColor: `${c.accent}20`,
              color: c.accent,
              border: `1px solid ${c.accent}40`,
            }}
          >
            -25%
          </span>
          <span
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-extrabold rounded-full"
            style={{
              backgroundColor: `${c.primary}15`,
              color: c.primary,
            }}
          >
            Stock disponible
          </span>
          <span
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-extrabold rounded-full"
            style={{
              backgroundColor: `${c.secondary}15`,
              color: c.secondary,
            }}
          >
            Más vendido
          </span>
        </div>
      </div>

      {/* Card de producto + input + alert */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Card de producto */}
        <div style={cardBaseStyle()} className="overflow-hidden">
          <div
            className="relative h-32"
            style={{
              background: `linear-gradient(135deg, ${c.primary}40, ${c.accent}30)`,
            }}
          >
            <span
              className="absolute top-2 left-2 inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-extrabold text-white"
              style={{ background: c.accent }}
            >
              -25%
            </span>
            <button
              type="button"
              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/90 flex items-center justify-center"
              aria-label="Favorito"
            >
              <Heart className="h-3.5 w-3.5" style={{ color: c.secondary }} />
            </button>
          </div>
          <div className="p-3">
            <p className="text-sm font-extrabold leading-tight" style={{ color: textPrimary }}>
              Producto destacado
            </p>
            <p className="text-xs mt-0.5" style={{ color: textMuted }}>
              Por unidad
            </p>
            <div className="flex items-baseline gap-2 mt-2">
              <span
                className="text-base font-extrabold tabular-nums"
                style={{ color: c.primary }}
              >
                S/ 14.90
              </span>
              <span
                className="text-xs line-through tabular-nums"
                style={{ color: textMuted }}
              >
                S/ 19.90
              </span>
            </div>
            <button
              type="button"
              className="w-full mt-3 inline-flex items-center justify-center gap-1.5 h-10 text-sm font-extrabold text-white"
              style={{
                background: `linear-gradient(135deg, ${c.primary} 0%, ${c.secondary} 100%)`,
                borderRadius: buttonRadius,
              }}
            >
              <ShoppingCart className="h-4 w-4" />
              Agregar
            </button>
          </div>
        </div>

        {/* Input + form */}
        <div style={cardBaseStyle({ padding: 16 })}>
          <p className="text-xs font-extrabold uppercase tracking-wider mb-2" style={{ color: textMuted }}>
            Formulario
          </p>
          <label
            htmlFor="brand-preview-search"
            className="text-xs font-bold block mb-1.5"
            style={{ color: textPrimary }}
          >
            Buscar producto
          </label>
          <input
            id="brand-preview-search"
            type="text"
            placeholder="Pollo · Arroz · Aceite"
            className="w-full h-11 px-3 text-sm font-medium border-2 outline-none"
            style={{
              backgroundColor: bgPage,
              borderColor: borderSoft,
              borderRadius: buttonRadius,
              color: textPrimary,
            }}
          />
          <button
            type="button"
            className="w-full mt-3 h-10 text-sm font-extrabold text-white"
            style={{
              background: c.primary,
              borderRadius: buttonRadius,
            }}
          >
            Buscar
          </button>
          <p className="text-xs mt-2" style={{ color: textMuted }}>
            Buscamos en el catálogo en vivo
          </p>
        </div>

        {/* Alert / Toast */}
        <div className="space-y-3">
          <div
            className="p-3 flex items-start gap-2"
            style={{
              backgroundColor: `${c.primary}10`,
              border: `1px solid ${c.primary}30`,
              borderRadius: cardRadius,
            }}
          >
            <Bell className="h-4 w-4 shrink-0 mt-0.5" style={{ color: c.primary }} />
            <div className="min-w-0">
              <p className="text-sm font-extrabold" style={{ color: textPrimary }}>
                Tu pedido está en camino
              </p>
              <p className="text-xs mt-0.5" style={{ color: textMuted }}>
                Llega en aprox. 25 min
              </p>
            </div>
          </div>
          <div
            className="p-3 flex items-start gap-2"
            style={{
              backgroundColor: `${c.accent}10`,
              border: `1px solid ${c.accent}30`,
              borderRadius: cardRadius,
            }}
          >
            <Tag className="h-4 w-4 shrink-0 mt-0.5" style={{ color: c.accent }} />
            <div className="min-w-0">
              <p className="text-sm font-extrabold" style={{ color: textPrimary }}>
                Cupón aplicado
              </p>
              <p className="text-xs mt-0.5" style={{ color: textMuted }}>
                BIENVENIDO -10% en tu primera compra
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer mini */}
      <div
        className="rounded-2xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap"
        style={{
          background:
            c.backgroundPattern === "gradient"
              ? `linear-gradient(135deg, ${c.primary} 0%, ${c.secondary} 100%)`
              : `${c.primary}10`,
          color: c.backgroundPattern === "gradient" ? "#fff" : textPrimary,
        }}
      >
        <p className="text-xs font-extrabold">Recibí ofertas exclusivas en tu WhatsApp</p>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-4 h-9 text-xs font-extrabold"
          style={{
            backgroundColor:
              c.backgroundPattern === "gradient" ? "#fff" : c.primary,
            color:
              c.backgroundPattern === "gradient" ? c.primary : "#fff",
            borderRadius: buttonRadius,
          }}
        >
          Suscribirme
        </button>
      </div>

      {/* Color tokens summary */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Primary", color: c.primary },
          { label: "Secondary", color: c.secondary },
          { label: "Accent", color: c.accent },
        ].map((t) => (
          <div
            key={t.label}
            className="flex items-center gap-2 p-3"
            style={{
              backgroundColor: bgCard,
              border: `1px solid ${borderSoft}`,
              borderRadius: cardRadius * 0.7,
            }}
          >
            <div
              className="w-8 h-8 rounded-lg shadow-inner shrink-0"
              style={{ backgroundColor: t.color }}
            />
            <div className="min-w-0">
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider" style={{ color: textMuted }}>
                {t.label}
              </p>
              <p className="text-xs font-mono" style={{ color: textPrimary }}>
                {t.color.toUpperCase()}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
