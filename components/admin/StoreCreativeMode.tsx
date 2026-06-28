"use client";

import { CardTitle, SectionTitle } from "@buleje/design-system";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  X,
  Monitor,
  Tablet,
  Smartphone,
  Undo2,
  Redo2,
  Save,
  Palette,
  Store,
  Image as ImageIcon,
  Phone,
  Layout,
  GripVertical,
  Type,
  Sparkles,
  WandSparkles,
  SlidersHorizontal,
  Bot,
  Code2,
  Check,
  ExternalLink,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  Columns2,
  Clock,
  Plus,
  Trash2,
  Home,
  ShoppingBag,
  ShieldCheck,
  Tag,
  Megaphone,
  Quote,
  MapPin,
  Star,
  ArrowLeft,
  Square,
  RotateCcw,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Copy,
  Download,
  Upload,
  Users,
  Share2,
  Maximize2,
  Keyboard,
  MousePointer,
} from "@buleje/design-system/icons";
import { Field } from "@/components/admin/shared/Field";
import ImageUpload from "./ImageUpload";
import { cn } from "@/lib/utils";
import { EDITOR_FONT_MAP, EDITOR_BTN_RADIUS } from "@/lib/store-design-tokens";
import { csrfHeaders } from "@/lib/csrf-client";
import type { StoreTheme } from "./StoreCustomizer";
import type { SectionKey } from "./StorefrontEditor";
import type { Section, SectionTemplate } from "@/lib/store-sections-types";
import { SECTION_TEMPLATES } from "@/lib/store-sections-types";

// Etiquetas legibles por tipo de sección custom (SectionRenderer / ADR-301 Fase 4).
const CUSTOM_SECTION_LABELS: Record<string, string> = {
  about: "Sobre nosotros",
  hours: "Horarios",
  payment: "Métodos de pago",
  "how-to-order": "Cómo pedir",
  faq: "Preguntas frecuentes",
  benefits: "Beneficios",
  gallery: "Galería",
  "image-text": "Imagen + texto",
  cta: "Banner de acción",
  video: "Video",
  map: "Mapa de ubicación",
  logos: "Marcas / logos",
  countdown: "Cuenta regresiva",
  team: "Nuestro equipo",
  social: "Redes sociales",
  categories: "Categorías visual",
};

// Lote F: ¿la sección custom está vacía de contenido? → badge "Falta contenido"
// para guiar al dueño (score de completitud por sección).
function customSectionEmpty(section: Section): boolean {
  const d = section.data as Record<string, unknown>;
  const arr = (k: string, f: string) => Array.isArray(d[k]) && (d[k] as Array<Record<string, unknown>>).filter((x) => x && x[f]).length === 0;
  switch (section.type) {
    case "gallery": return arr("images", "url");
    case "logos": return arr("logos", "url");
    case "team": return arr("members", "name");
    case "categories": return arr("items", "name");
    case "social": return arr("links", "url");
    case "video": return !d.videoUrl;
    case "map": return !d.address;
    case "cta": return !d.buttonLabel;
    case "about":
    case "image-text": return !d.body && !d.title;
    default: return false;
  }
}

// Tienda section labels for preview
const TIENDA_SECTION_LABELS: Record<string, string> = {
  daily_special: "Oferta del Dia",
  seasonal_promo: "Promo de Temporada",
  countdown: "Cuenta Regresiva",
  flash_deals: "Ofertas Relampago",
  popular_products: "Mas Vendidos",
  featured_carousel: "Productos Destacados",
  combos: "Combos",
  last_units: "Ultimas Unidades",
  recipes: "Recetas",
  favorites: "Favoritos",
  recently_viewed: "Vistos Recientemente",
};

const TIENDA_SECTION_KEYS = Object.keys(TIENDA_SECTION_LABELS) as string[];

type Viewport = "desktop" | "tablet" | "mobile";
type CreativePanel =
  | "plantillas"
  | "identidad"
  | "hero"
  | "colores"
  | "secciones"
  | "tipografia"
  | "estilos"
  | "contacto"
  | "automatizacion"
  | "avanzado"
  | "historial";

// Orden de paneles para atajos Ctrl+1..9 (Lote H, Brandon 2026-06-27).
const PANEL_ORDER: CreativePanel[] = [
  "plantillas", "identidad", "hero", "colores", "secciones",
  "tipografia", "estilos", "contacto", "automatizacion", "avanzado", "historial",
];

// Onboarding guiado (Lote K #17, Brandon 2026-06-27): 5 pasos para el 1er uso.
const TOUR_STEPS: Array<{ panel: CreativePanel; title: string; desc: string }> = [
  { panel: "identidad", title: "1. Tu identidad", desc: "Subí tu logo y poné el nombre de tu tienda. Es lo primero que ve tu cliente." },
  { panel: "colores", title: "2. Tus colores", desc: "Elegí los colores de tu marca o aplicá una paleta lista en 1 clic." },
  { panel: "hero", title: "3. Tu portada", desc: "Poné una imagen o video de fondo y un título que enganche al visitante." },
  { panel: "contacto", title: "4. WhatsApp y horario", desc: "Cargá tu WhatsApp para recibir pedidos y tu horario de atención." },
  { panel: "plantillas", title: "5. ¡Listo para publicar!", desc: "Cuando te guste cómo quedó, tocá “Aplicar y guardar” arriba a la derecha." },
];

interface StoreCreativeModeProps {
  tenantSlug: string;
  initialTheme: StoreTheme;
  onClose: () => void;
  onApplyTheme: (theme: StoreTheme) => Promise<void>;
}

const INPUT_CLASS =
  "rounded-lg bg-white/[0.04] border border-white/10 text-white text-sm px-3 py-2.5 w-full focus:outline-none focus:border-[var(--data-success-500)]/40 transition-colors placeholder:text-[var(--text-secondary)]";
const LABEL_CLASS =
  "block text-[length:var(--ts-xs)] font-semibold text-[var(--text-tertiary)] mb-1";

const VIEWPORTS: { id: Viewport; icon: typeof Monitor; width: string; label: string }[] = [
  { id: "desktop", icon: Monitor, width: "100%", label: "Escritorio" },
  { id: "tablet", icon: Tablet, width: "768px", label: "Tablet" },
  { id: "mobile", icon: Smartphone, width: "390px", label: "Móvil" },
];

const FONT_OPTIONS = [
  { value: "sistema", label: "Sistema" },
  { value: "geist", label: "Geist" },
  { value: "inter", label: "Inter" },
  { value: "poppins", label: "Poppins" },
  { value: "montserrat", label: "Montserrat" },
  { value: "raleway", label: "Raleway" },
  { value: "nunito", label: "Nunito" },
  { value: "lato", label: "Lato" },
  { value: "roboto", label: "Roboto" },
  { value: "opensans", label: "Open Sans" },
] as const;

const COLOR_PRESETS = [
  "var(--color-primary)",
  "#059669",
  "#0EA5E9",
  "#9333EA",
  "#E11D48",
  "#f0503f",
  "#F59E0B",
  "#1F2937",
] as const;

// Paletas armónicas (Brandon 2026-06-25): 1 click aplica primario+secundario+acento.
const COLOR_PALETTES: Array<{ name: string; primary: string; secondary: string; accent: string }> = [
  { name: "Bodega",    primary: "#00A0A0", secondary: "#FF6B5B", accent: "#00A0A0" },
  { name: "Bosque",    primary: "#15803D", secondary: "#84CC16", accent: "#22C55E" },
  { name: "Océano",    primary: "#0369A1", secondary: "#06B6D4", accent: "#0EA5E9" },
  { name: "Atardecer", primary: "#D97706", secondary: "#DC2626", accent: "#F59E0B" },
  { name: "Dulce",     primary: "#DB2777", secondary: "#A855F7", accent: "#EC4899" },
  { name: "Noche",     primary: "#1E293B", secondary: "#F0503F", accent: "#334155" },
];

const SECTION_ITEMS: { key: SectionKey; label: string }[] = [
  { key: "announcement", label: "Banner anuncio" },
  { key: "hero", label: "Hero" },
  { key: "categories", label: "Categorias" },
  { key: "popular", label: "Populares" },
  { key: "deals", label: "Ofertas" },
  { key: "combos", label: "Combos" },
  { key: "recipes", label: "Recetas" },
  { key: "testimonials", label: "Testimonios" },
  { key: "faq", label: "FAQ" },
  { key: "contact", label: "Contacto" },
  { key: "delivery_map", label: "Mapa delivery" },
];

// Secciones REALES del cuerpo de la landing /t (page builder Fase 2). Estas SÍ
// se renderizan y se reordenan de verdad en la tienda pública (editorTheme.bodyOrder).
// announcement/hero quedan fijos (banner arriba + header); el cuerpo es reordenable.
const LANDING_BODY_ITEMS: { key: string; label: string; desc: string; icon: typeof Home }[] = [
  { key: "trust", label: "Confianza", desc: "Insignias de pago seguro, delivery y atención", icon: ShieldCheck },
  { key: "promos", label: "Promociones", desc: "Banner con tus ofertas activas", icon: Tag },
  { key: "featured", label: "Destacados", desc: "Carrusel de productos que recomendás", icon: Star },
  { key: "testimonials", label: "Testimonios", desc: "Reseñas reales de tus clientes", icon: Quote },
  { key: "info", label: "Información", desc: "Horario, dirección, contacto y mapa", icon: MapPin },
];
const LANDING_BODY_DEFAULT = ["trust", "promos", "featured", "testimonials", "info"];

// Iconos para las secciones del catálogo (/tienda) — solo presentación.
const TIENDA_SECTION_ICONS: Record<string, typeof Home> = {
  daily_special: Tag,
  seasonal_promo: Sparkles,
  countdown: Clock,
  flash_deals: Megaphone,
  popular_products: Star,
  featured_carousel: ShoppingBag,
  combos: Layout,
  last_units: Tag,
  recipes: Layout,
  favorites: Star,
  recently_viewed: Clock,
};

const DAYS: Array<keyof StoreTheme["schedules"]> = [
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
  "domingo",
];

// Plantillas COMPLETAS (Brandon 2026-06-25): cada una define un look cohesivo —
// los 3 colores + tipografía + modo + RADIO + estilo de BOTÓN (todo lo que el
// preview refleja en vivo). `vibe` describe el estilo en el card.
type QuickTemplate = {
  id: string;
  name: string;
  vibe: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: StoreTheme["fontFamily"];
  darkModeDefault: boolean;
  borderRadius: number;
  buttonStyle: StoreTheme["buttonStyle"];
};

const QUICK_TEMPLATES: QuickTemplate[] = [
  { id: "clasico",  name: "Clásico Bodega",   vibe: "Cálido y confiable",   primaryColor: "#00A0A0", secondaryColor: "#ff6b5b", accentColor: "#00A0A0", fontFamily: "geist",      darkModeDefault: false, borderRadius: 14, buttonStyle: "rounded" },
  { id: "fresco",   name: "Fresco Moderno",   vibe: "Limpio y verde",       primaryColor: "#059669", secondaryColor: "#E11D48", accentColor: "#10B981", fontFamily: "poppins",    darkModeDefault: false, borderRadius: 16, buttonStyle: "pill" },
  { id: "premium",  name: "Premium Nocturno", vibe: "Oscuro y elegante",    primaryColor: "#1E293B", secondaryColor: "#f0503f", accentColor: "#334155", fontFamily: "montserrat", darkModeDefault: true,  borderRadius: 8,  buttonStyle: "square" },
  { id: "minimal",  name: "Minimal Blanco",   vibe: "Editorial y sobrio",   primaryColor: "#111827", secondaryColor: "#6B7280", accentColor: "#111827", fontFamily: "inter",      darkModeDefault: false, borderRadius: 4,  buttonStyle: "square" },
  { id: "calido",   name: "Cálido Mercado",   vibe: "Ámbar acogedor",       primaryColor: "#D97706", secondaryColor: "#DC2626", accentColor: "#F59E0B", fontFamily: "nunito",     darkModeDefault: false, borderRadius: 18, buttonStyle: "rounded" },
  { id: "selva",    name: "Selva Tropical",   vibe: "Verde de Pucallpa",    primaryColor: "#15803D", secondaryColor: "#84CC16", accentColor: "#22C55E", fontFamily: "raleway",    darkModeDefault: false, borderRadius: 20, buttonStyle: "pill" },
  { id: "oceano",   name: "Océano Profundo",  vibe: "Azul fresco",          primaryColor: "#0369A1", secondaryColor: "#06B6D4", accentColor: "#0EA5E9", fontFamily: "lato",       darkModeDefault: true,  borderRadius: 12, buttonStyle: "rounded" },
  { id: "dulce",    name: "Dulce Pastel",     vibe: "Pastelería suave",     primaryColor: "#DB2777", secondaryColor: "#A855F7", accentColor: "#EC4899", fontFamily: "opensans",   darkModeDefault: false, borderRadius: 22, buttonStyle: "pill" },
];

// Plantillas POR RUBRO (Brandon 2026-06-26): además del look, traen copy del hero
// pensado para cada negocio. Un click deja la tienda con identidad del rubro.
// `industry` matchea lib/verticals/registry.ts para marcar "recomendado".
type RubroTemplate = QuickTemplate & {
  industry: string;
  heroTitle: string;
  heroSubtitle: string;
  slogan: string;
};

const RUBRO_TEMPLATES: RubroTemplate[] = [
  {
    id: "rubro-bodega", industry: "bodega", name: "Bodega / Minimarket", vibe: "Cálido y de barrio",
    primaryColor: "#00A0A0", secondaryColor: "#FF6B5B", accentColor: "#0F766E", fontFamily: "geist",
    darkModeDefault: false, borderRadius: 14, buttonStyle: "rounded",
    heroTitle: "Tu bodega de confianza, ahora online",
    heroSubtitle: "Abarrotes, bebidas y delivery rápido. Pagá con Yape o efectivo.",
    slogan: "Lo de siempre, a un clic",
  },
  {
    id: "rubro-restaurante", industry: "restaurante", name: "Restaurante / Cafetería", vibe: "Apetitoso y vivo",
    primaryColor: "#DC2626", secondaryColor: "#F59E0B", accentColor: "#EA580C", fontFamily: "poppins",
    darkModeDefault: false, borderRadius: 18, buttonStyle: "pill",
    heroTitle: "Pedí tu plato favorito sin moverte",
    heroSubtitle: "Comida recién hecha y delivery calentito a tu puerta.",
    slogan: "Sabor que llega a tu casa",
  },
  {
    id: "rubro-madereria", industry: "madereria", name: "Maderería / Construcción", vibe: "Sobrio y de oficio",
    primaryColor: "#92400E", secondaryColor: "#65A30D", accentColor: "#B45309", fontFamily: "montserrat",
    darkModeDefault: false, borderRadius: 6, buttonStyle: "square",
    heroTitle: "Madera y materiales para tu obra",
    heroSubtitle: "Stock real, medidas exactas y entrega a tu proyecto.",
    slogan: "Construí con lo mejor",
  },
  {
    id: "rubro-farmacia", industry: "farmacia", name: "Farmacia / Botica", vibe: "Limpio y confiable",
    primaryColor: "#0369A1", secondaryColor: "#10B981", accentColor: "#0EA5E9", fontFamily: "inter",
    darkModeDefault: false, borderRadius: 12, buttonStyle: "rounded",
    heroTitle: "Tu salud, atendida al instante",
    heroSubtitle: "Medicamentos y cuidado personal con delivery discreto.",
    slogan: "Cuidarte es fácil",
  },
  {
    id: "rubro-ferreteria", industry: "ferreteria", name: "Ferretería", vibe: "Industrial y directo",
    primaryColor: "#EA580C", secondaryColor: "#334155", accentColor: "#F97316", fontFamily: "roboto",
    darkModeDefault: false, borderRadius: 6, buttonStyle: "square",
    heroTitle: "Herramientas y todo para el hogar",
    heroSubtitle: "Lo que necesitás para arreglar y construir, al toque.",
    slogan: "La solución a la mano",
  },
  {
    id: "rubro-panaderia", industry: "panaderia", name: "Panadería / Pastelería", vibe: "Dulce y acogedor",
    primaryColor: "#DB2777", secondaryColor: "#F59E0B", accentColor: "#EC4899", fontFamily: "nunito",
    darkModeDefault: false, borderRadius: 20, buttonStyle: "pill",
    heroTitle: "Pan fresquito y postres del día",
    heroSubtitle: "Encargá tu torta o pan caliente con delivery a tu mesa.",
    slogan: "Recién salido del horno",
  },
];

// ── Plantillas de PÁGINA COMPLETA (Brandon 2026-06-27) ──────────────────
// Aplican de un saque: tema (colores/fuente/radio/botón/dark) + orden de
// secciones + estilo por sección. Un look integral en 1 clic.
type PageTemplate = {
  id: string;
  name: string;
  vibe: string;
  theme: {
    primaryColor: string; secondaryColor: string; accentColor: string;
    fontFamily: StoreTheme["fontFamily"]; darkModeDefault: boolean;
    borderRadius: number; buttonStyle: StoreTheme["buttonStyle"];
  };
  bodyOrder: string[];
  sectionStyles: Record<string, SectionStyle>;
};

const SERIF_STACK = 'Georgia, "Times New Roman", serif';

const PAGE_TEMPLATES: PageTemplate[] = [
  {
    id: "resto-elegante",
    name: "Restaurante elegante",
    vibe: "Oscuro · serif · premium",
    theme: { primaryColor: "#DC2626", secondaryColor: "#F59E0B", accentColor: "#EA580C", fontFamily: "montserrat", darkModeDefault: true, borderRadius: 12, buttonStyle: "pill" },
    bodyOrder: ["featured", "trust", "testimonials", "info", "promos"],
    sectionStyles: {
      featured: { bg: "#0F172A", text: "#F8FAFC", radius: 18, shadow: "deep", pad: "lg", font: SERIF_STACK },
      testimonials: { bg: "#1E293B", text: "#F8FAFC", pad: "lg" },
      info: { bg: "#F8FAFC", radius: 16, pad: "lg" },
    },
  },
  {
    id: "bodega-vibrante",
    name: "Bodega vibrante",
    vibe: "Teal + coral · redondeado",
    theme: { primaryColor: "#00A0A0", secondaryColor: "#FF6B5B", accentColor: "#00A0A0", fontFamily: "poppins", darkModeDefault: false, borderRadius: 20, buttonStyle: "rounded" },
    bodyOrder: ["trust", "featured", "promos", "testimonials", "info"],
    sectionStyles: {
      featured: { bg: "#FFFFFF", radius: 24, shadow: "soft", pad: "lg" },
      promos: { bg: "linear-gradient(135deg, #00A0A0, #FF6B5B)", text: "#FFFFFF", radius: 20, pad: "lg" },
      info: { bg: "#ECFEFF", radius: 16, pad: "md" },
    },
  },
  {
    id: "minimal-premium",
    name: "Minimal premium",
    vibe: "Blanco · aire · editorial",
    theme: { primaryColor: "#111827", secondaryColor: "#6B7280", accentColor: "#111827", fontFamily: "inter", darkModeDefault: false, borderRadius: 4, buttonStyle: "square" },
    bodyOrder: ["featured", "testimonials", "info", "trust", "promos"],
    sectionStyles: {
      featured: { pad: "lg", font: SERIF_STACK },
      testimonials: { bg: "#F8FAFC", pad: "lg" },
      info: { border: "#E2E8F0", borderW: 1, radius: 0, pad: "lg" },
    },
  },
  {
    id: "fresco-natural",
    name: "Fresco natural",
    vibe: "Verde · suave · cálido",
    theme: { primaryColor: "#15803D", secondaryColor: "#84CC16", accentColor: "#22C55E", fontFamily: "nunito", darkModeDefault: false, borderRadius: 18, buttonStyle: "pill" },
    bodyOrder: ["trust", "featured", "testimonials", "promos", "info"],
    sectionStyles: {
      featured: { bg: "#F0FDF4", radius: 20, pad: "lg" },
      testimonials: { bg: "#ECFDF5", radius: 16, pad: "lg" },
      info: { bg: "#FFFFFF", border: "#BBF7D0", borderW: 1, radius: 16, pad: "md" },
    },
  },
];

// Lote O #5: miniatura sintética de una versión del historial. Mock del "look"
// (hero + colores + tipografía + botón) — sin screenshot/dep, identifica la versión.
function VersionThumbnail({ theme }: { theme: StoreTheme }) {
  const dark = !!theme.darkModeDefault;
  const heroBg = theme.heroGradientFrom && theme.heroGradientTo
    ? `linear-gradient(${theme.heroGradientAngle ?? 135}deg, ${theme.heroGradientFrom}, ${theme.heroGradientTo})`
    : `linear-gradient(135deg, ${theme.primaryColor}, ${theme.accentColor})`;
  const btnRadius = theme.buttonStyle === "pill" ? 999 : theme.buttonStyle === "square" ? 2 : 7;
  return (
    <div className="overflow-hidden rounded-md border border-white/10" aria-hidden style={{ background: dark ? "#0f172a" : "#ffffff" }}>
      <div className="flex flex-col gap-1 px-2 py-1.5" style={{ background: heroBg }}>
        <span className="h-1.5 w-2/3 rounded-full bg-white/85" />
        <span className="h-1 w-1/2 rounded-full bg-white/55" />
        <span className="mt-0.5 h-2 w-9 bg-white" style={{ borderRadius: btnRadius }} />
      </div>
      <div className="flex gap-1 p-1.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-5 flex-1 rounded-sm border" style={{ background: dark ? "#1e293b" : "#f1f5f9", borderColor: dark ? "#334155" : "#e2e8f0" }} />
        ))}
      </div>
    </div>
  );
}

// Lote L #1: color picker visual HSL. Conversión hex↔HSL.
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const m = /^#?([0-9a-fA-F]{6})$/.exec((hex || "").trim());
  let r = 0, g = 0, b = 0;
  if (m) { const n = parseInt(m[1], 16); r = ((n >> 16) & 255) / 255; g = ((n >> 8) & 255) / 255; b = (n & 255) / 255; }
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}
function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100, ln = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

/** HslPopover — sliders Hue/Saturación/Luz + hex. Emite hex en cada cambio. */
function HslPopover({ value, onChange, onClose }: { value: string; onChange: (hex: string) => void; onClose: () => void }) {
  const init = hexToHsl(value);
  const [h, setH] = useState(init.h);
  const [s, setS] = useState(init.s);
  const [l, setL] = useState(init.l);
  const emit = (nh: number, ns: number, nl: number) => onChange(hslToHex(nh, ns, nl));
  const hex = hslToHex(h, s, l);
  const row = (lbl: string, val: number, max: number, set: (n: number) => void, grad: string, onSet: (n: number) => void) => (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[length:var(--ts-2xs)] text-gray-300"><span>{lbl}</span><span className="font-bold tabular-nums text-[var(--accent-soft)]">{val}{lbl === "Tono" ? "°" : "%"}</span></div>
      <input type="range" min={0} max={max} value={val} onChange={(e) => { const n = Number(e.target.value); set(n); onSet(n); }} className="h-3 w-full cursor-pointer appearance-none rounded-full" style={{ background: grad }} aria-label={lbl} />
    </div>
  );
  return (
    <div className="absolute left-0 top-full z-30 mt-1.5 w-56 rounded-xl border border-white/15 bg-[#1b1e25] p-3 shadow-2xl" onMouseLeave={onClose}>
      <div className="mb-2 flex items-center gap-2">
        <span className="h-7 w-7 rounded-md border border-white/20" style={{ background: hex }} />
        <input value={hex} onChange={(e) => { const v = e.target.value; if (/^#[0-9a-fA-F]{6}$/.test(v)) { const c = hexToHsl(v); setH(c.h); setS(c.s); setL(c.l); onChange(v); } }} className={cn(INPUT_CLASS, "flex-1")} maxLength={7} aria-label="Hex" />
      </div>
      <div className="space-y-2">
        {row("Tono", h, 360, setH, "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)", (n) => emit(n, s, l))}
        {row("Saturación", s, 100, setS, `linear-gradient(to right, ${hslToHex(h, 0, l)}, ${hslToHex(h, 100, l)})`, (n) => emit(h, n, l))}
        {row("Luz", l, 100, setL, `linear-gradient(to right, #000, ${hslToHex(h, s, 50)}, #fff)`, (n) => emit(h, s, n))}
      </div>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  // El <input type="color"> SOLO acepta hex; si el valor es una CSS var
  // (var(--color-primary) = teal de marca) caía a algo inválido → el picker
  // nativo mostraba negro. Fallback al hex real de la marca para que muestre bien.
  const safe = /^#[0-9A-Fa-f]{6}$/.test(value) ? value : "#00A0A0";
  const [hslOpen, setHslOpen] = useState(false);
  return (
    <div className="space-y-2">
      <Field label={label} labelClassName={LABEL_CLASS}>
        {(id) => (
          <div className="relative flex items-center gap-2">
            <input type="color" value={safe} onChange={(e) => onChange(e.target.value)} className="h-9 w-10 rounded-lg border border-white/10 bg-white/[0.04] p-0.5 cursor-pointer" aria-label={`Color picker ${label}`} />
            <input id={id} value={value} onChange={(e) => onChange(e.target.value)} maxLength={7} className={INPUT_CLASS} />
            {/* Lote L: picker visual HSL */}
            <button type="button" onClick={() => setHslOpen((o) => !o)} className={cn("inline-flex h-9 shrink-0 items-center justify-center rounded-lg border px-2 transition-colors", hslOpen ? "border-[var(--accent-soft)] text-[var(--accent-soft)]" : "border-white/10 text-gray-400 hover:text-white")} title="Ajuste fino HSL" aria-label="Abrir picker HSL">
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>
            {hslOpen && <HslPopover value={safe} onChange={onChange} onClose={() => setHslOpen(false)} />}
          </div>
        )}
      </Field>
      <div className="flex flex-wrap gap-1.5">
        {COLOR_PRESETS.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onChange(color)}
            className={cn("h-5 w-5 rounded-full border", value === color ? "border-white" : "border-transparent")}
            style={{ backgroundColor: color }}
            aria-label={`Usar color ${color}`}
          />
        ))}
      </div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn("relative h-6 w-11 rounded-full transition-colors", checked ? "bg-[var(--accent-soft)]" : "bg-gray-700")}
    >
      <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white dark:bg-[var(--color-card)] transition-transform", checked ? "left-5" : "left-0.5")} />
    </button>
  );
}

/** Badge "En vivo" — marca los controles que se reflejan en la tienda real. */
function LiveBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--data-success-500)]/15 px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--data-success-500)]">
      <span aria-hidden className="relative inline-flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--data-success-500)] opacity-70" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--data-success-500)]" />
      </span>
      En vivo
    </span>
  );
}

/**
 * SectionCard — tarjeta con encabezado (icono + título + hint + badge opcional)
 * para agrupar controles del panel. Da jerarquía y aire profesional al editor.
 */
function SectionCard({
  icon: Icon,
  title,
  hint,
  badge,
  children,
}: {
  icon: typeof Home;
  title: string;
  hint?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
      <div className="flex items-center gap-2.5 border-b border-white/5 bg-white/[0.02] px-3 py-2.5">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)]/15 text-[var(--accent-soft)]">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold leading-tight text-white">{title}</p>
          {hint && <p className="mt-0.5 text-[length:var(--ts-2xs)] leading-tight text-gray-400">{hint}</p>}
        </div>
        {badge}
      </div>
      <div className="space-y-2.5 p-3">{children}</div>
    </div>
  );
}

// Lote G (Brandon 2026-06-27): helpers de alpha/transparencia para colores.
function isSimpleColor(v?: string): boolean {
  return !!v && (/^#[0-9a-fA-F]{6}$/.test(v) || /^rgba?\(/.test(v.trim()));
}
function currentAlpha(v?: string): number {
  if (!v) return 1;
  const m = v.match(/rgba?\([^)]*,\s*([\d.]+)\s*\)/);
  return m ? Math.max(0, Math.min(1, parseFloat(m[1]))) : 1;
}
function colorWithAlpha(v: string | undefined, alpha: number): string | undefined {
  if (!v) return undefined;
  let r = 0, g = 0, b = 0;
  const hex = v.match(/^#([0-9a-fA-F]{6})$/);
  if (hex) { const n = parseInt(hex[1], 16); r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255; }
  else { const m = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/); if (!m) return v; r = +m[1]; g = +m[2]; b = +m[3]; }
  if (alpha >= 1) return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
}

/**
 * SectionColorPicker — fila de presets + color custom + limpiar, para el panel
 * lateral de estilo por sección. Devuelve `undefined` al limpiar (sin override).
 * enableAlpha (Lote G): agrega slider de opacidad → emite rgba().
 */
function SectionColorPicker({
  label,
  value,
  onChange,
  allowClear = true,
  clearLabel = "Sin color",
  enableAlpha = false,
}: {
  label: string;
  value?: string;
  onChange: (v: string | undefined) => void;
  allowClear?: boolean;
  clearLabel?: string;
  enableAlpha?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-[length:var(--ts-2xs)] font-bold text-gray-300">{label}</p>
        {allowClear && value && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="text-[length:var(--ts-2xs)] font-semibold text-gray-500 transition-colors hover:text-white"
          >
            {clearLabel}
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {SECTION_COLOR_PRESETS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            aria-label={`Color ${c}`}
            className={cn(
              "h-6 w-6 rounded-md border transition-transform hover:scale-110",
              value?.toLowerCase() === c.toLowerCase()
                ? "border-white ring-2 ring-[var(--accent-soft)]"
                : "border-white/15",
            )}
            style={{ backgroundColor: c }}
          />
        ))}
        <label
          className="relative inline-flex h-6 w-6 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-white/15"
          title="Color personalizado"
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)" }}
          />
          <input
            type="color"
            value={value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
            onChange={(e) => onChange(enableAlpha ? colorWithAlpha(e.target.value, currentAlpha(value)) : e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label={`${label} personalizado`}
          />
        </label>
      </div>
      {/* Lote G: slider de opacidad (transparencia) → rgba(). Solo para colores simples. */}
      {enableAlpha && (value === undefined || isSimpleColor(value)) && (
        <div className="flex items-center gap-2 pt-0.5">
          <span className="text-[length:var(--ts-2xs)] text-gray-400">Opacidad</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(currentAlpha(value) * 100)}
            onChange={(e) => onChange(colorWithAlpha(value ?? "#000000", Number(e.target.value) / 100))}
            className="w-full accent-[var(--accent-soft)]"
            aria-label={`Opacidad de ${label}`}
          />
          <span className="w-8 text-right text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--accent-soft)]">{Math.round(currentAlpha(value) * 100)}%</span>
        </div>
      )}
    </div>
  );
}

// Patrones de fondo (Brandon 2026-06-27 · #3) — strings CSS para el campo bg.
const BG_PATTERNS: Array<{ id: string; label: string; css: string }> = [
  { id: "puntos", label: "Puntos", css: "radial-gradient(rgba(15,23,42,0.10) 1.5px, transparent 1.5px) 0 0 / 18px 18px, #FFFFFF" },
  { id: "cuadricula", label: "Cuadrícula", css: "linear-gradient(rgba(15,23,42,0.06) 1px, transparent 1px) 0 0 / 22px 22px, linear-gradient(90deg, rgba(15,23,42,0.06) 1px, transparent 1px) 0 0 / 22px 22px, #FFFFFF" },
  { id: "rayas", label: "Rayas", css: "repeating-linear-gradient(45deg, rgba(15,23,42,0.05) 0 10px, #FFFFFF 10px 20px)" },
];

/**
 * AdvancedBackground — fondo avanzado por sección (Brandon 2026-06-27 · #3):
 * degradado personalizado (2 colores + ángulo), imagen con overlay, y patrones.
 * Todo se compone en un string CSS y se guarda en sectionStyle.bg vía onSetBg.
 */
function AdvancedBackground({ onSetBg }: { onSetBg: (bg: string) => void }) {
  const [gA, setGA] = useState("#00A0A0");
  const [gB, setGB] = useState("#FF6B5B");
  const [angle, setAngle] = useState(135);
  const [overlay, setOverlay] = useState(35);
  const [imgUrl, setImgUrl] = useState("");
  const composeImage = (url: string, ov: number) =>
    `linear-gradient(rgba(0,0,0,${(ov / 100).toFixed(2)}), rgba(0,0,0,${(ov / 100).toFixed(2)})), url("${url}") center/cover no-repeat`;
  const colorInput = (val: string, set: (v: string) => void, label: string) => (
    <label className="relative inline-flex h-7 w-7 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-white/15" title={label}>
      <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: val }} />
      <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(val) ? val : "#000000"} onChange={(e) => set(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={label} />
    </label>
  );
  return (
    <div className="space-y-3">
      {/* Degradado personalizado */}
      <div className="space-y-1.5">
        <p className="text-[length:var(--ts-2xs)] font-bold text-gray-300">Degradado personalizado</p>
        <div className="flex items-center gap-2">
          {colorInput(gA, setGA, "Color 1")}
          {colorInput(gB, setGB, "Color 2")}
          <div className="h-7 flex-1 rounded-md border border-white/10" style={{ background: `linear-gradient(${angle}deg, ${gA}, ${gB})` }} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[length:var(--ts-2xs)] text-gray-400">Ángulo</span>
          <input type="range" min={0} max={360} value={angle} onChange={(e) => setAngle(Number(e.target.value))} className="w-full accent-[var(--accent-soft)]" />
          <span className="w-9 text-right text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--accent-soft)]">{angle}°</span>
        </div>
        <button type="button" onClick={() => onSetBg(`linear-gradient(${angle}deg, ${gA}, ${gB})`)} className="w-full rounded-lg bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90">
          Aplicar degradado
        </button>
      </div>

      {/* Imagen de fondo + overlay */}
      <div className="space-y-1.5">
        <p className="text-[length:var(--ts-2xs)] font-bold text-gray-300">Imagen de fondo</p>
        <div className="dark">
          <ImageUpload value={imgUrl} onChange={(url) => { setImgUrl(url); if (url) onSetBg(composeImage(url, overlay)); }} onClear={() => { setImgUrl(""); }} folder="store-customizer" aspectRatio="banner" label="" />
        </div>
        {imgUrl && (
          <div className="flex items-center gap-2">
            <span className="text-[length:var(--ts-2xs)] text-gray-400">Oscurecer</span>
            <input type="range" min={0} max={80} value={overlay} onChange={(e) => { const ov = Number(e.target.value); setOverlay(ov); onSetBg(composeImage(imgUrl, ov)); }} className="w-full accent-[var(--accent-soft)]" />
            <span className="w-9 text-right text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--accent-soft)]">{overlay}%</span>
          </div>
        )}
      </div>

      {/* Patrones */}
      <div className="space-y-1.5">
        <p className="text-[length:var(--ts-2xs)] font-bold text-gray-300">Patrón</p>
        <div className="grid grid-cols-3 gap-1.5">
          {BG_PATTERNS.map((p) => (
            <button key={p.id} type="button" onClick={() => onSetBg(p.css)} className="rounded-lg border border-white/10 p-1 transition-colors hover:border-[var(--accent-soft)]">
              <span className="block h-8 w-full rounded" style={{ background: p.css }} />
              <span className="mt-1 block text-center text-[length:var(--ts-2xs)] font-semibold text-gray-300">{p.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * TextStyleControls — controles compactos de estilo de TEXTO para un nodo
 * [data-live] (tamaño, peso, itálica, mayúsculas, color). Escribe en textStyles
 * vía onChange(field, partial). Brandon 2026-06-27 — edición profunda por componente.
 */
function TextStyleControls({
  field,
  value,
  onChange,
}: {
  field: string;
  value: { size?: number; bold?: boolean; color?: string; italic?: boolean; upper?: boolean };
  onChange: (field: string, partial: Record<string, unknown>) => void;
}) {
  const SIZES: Array<[string, number]> = [["XS", 0.7], ["S", 0.85], ["M", 1], ["L", 1.25], ["XL", 1.6], ["2XL", 2]];
  const curSize = value.size ?? 1;
  const toggleBtn = (active: boolean) =>
    cn(
      "inline-flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-[length:var(--ts-2xs)] font-bold transition-colors",
      active ? "bg-[var(--accent-soft)] text-white" : "bg-white/[0.04] text-gray-300 hover:bg-white/10",
    );
  return (
    <div className="space-y-1.5 rounded-lg border border-white/10 bg-white/[0.02] p-2">
      <div className="flex flex-wrap items-center gap-1">
        {SIZES.map(([lbl, mult]) => (
          <button key={lbl} type="button" onClick={() => onChange(field, { size: mult })} className={toggleBtn(Math.abs(curSize - mult) < 0.001)}>
            {lbl}
          </button>
        ))}
        <span aria-hidden className="mx-0.5 h-4 w-px bg-white/15" />
        <button type="button" title="Negrita" onClick={() => onChange(field, { bold: !value.bold })} className={cn(toggleBtn(!!value.bold), "font-black")}>B</button>
        <button type="button" title="Itálica" onClick={() => onChange(field, { italic: !value.italic })} className={cn(toggleBtn(!!value.italic), "italic")}>I</button>
        <button type="button" title="Mayúsculas" onClick={() => onChange(field, { upper: !value.upper })} className={toggleBtn(!!value.upper)}>TT</button>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {SECTION_COLOR_PRESETS.slice(0, 8).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(field, { color: c })}
            aria-label={`Color de texto ${c}`}
            className={cn("h-5 w-5 rounded-md border transition-transform hover:scale-110", value.color?.toLowerCase() === c.toLowerCase() ? "border-white ring-2 ring-[var(--accent-soft)]" : "border-white/15")}
            style={{ backgroundColor: c }}
          />
        ))}
        <label className="relative inline-flex h-5 w-5 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-white/15" title="Color personalizado">
          <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)" }} />
          <input type="color" value={value.color && /^#[0-9a-fA-F]{6}$/.test(value.color) ? value.color : "#000000"} onChange={(e) => onChange(field, { color: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Color de texto personalizado" />
        </label>
        {value.color && (
          <button type="button" onClick={() => onChange(field, { color: undefined })} className="ml-auto text-[length:var(--ts-2xs)] font-semibold text-gray-500 hover:text-white">Auto</button>
        )}
      </div>
    </div>
  );
}

/**
 * SectionStyleEditor — panel lateral que aparece al seleccionar una sección en el
 * preview. Cambia fondo, texto, espaciado, forma, borde y sombra SOLO de esa
 * sección (Brandon 2026-06-27). Cada cambio se aplica en vivo + persiste.
 */
function SectionStyleEditor({
  label,
  sectionKey,
  value,
  onChange,
  onPreset,
  textFields,
  text,
  onText,
  textStyles,
  onTextStyle,
  image,
  onImage,
  hidden,
  onToggleHidden,
  onBack,
}: {
  label: string;
  sectionKey: string;
  value: SectionStyle;
  onChange: (change: Partial<SectionStyle> | "reset") => void;
  onPreset: (style: SectionStyle) => void;
  textFields?: { eyebrow: string; title: string };
  text: { eyebrow?: string; title?: string; align?: "left" | "center" | "right" };
  onText: (field: "eyebrow" | "title" | "align", value: string) => void;
  textStyles: Record<string, { size?: number; bold?: boolean; color?: string; italic?: boolean; upper?: boolean }>;
  onTextStyle: (field: string, partial: Record<string, unknown>) => void;
  image?: string;
  onImage: (url: string) => void;
  hidden: boolean;
  onToggleHidden: (hidden: boolean) => void;
  onBack: () => void;
}) {
  const hasBorder = !!value.border;
  const hasAnyStyle = Object.keys(value).length > 0;
  const presetKey = JSON.stringify(
    Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== null && v !== "")),
  );
  return (
    <div className="space-y-3">
      {/* Encabezado: volver + sección + scope */}
      <div className="flex items-center gap-2 rounded-xl border border-[var(--accent-soft)]/40 bg-[var(--accent-soft)]/10 px-2.5 py-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Volver al menú"
          className="shrink-0 rounded-md p-1 text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent-soft)]">Editando sección</p>
          <p className="truncate text-sm font-bold text-white">{label}</p>
        </div>
        <span className="inline-flex shrink-0 items-center rounded-full bg-[var(--data-success-500)]/15 px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-500)]">
          Solo esta
        </span>
      </div>

      {/* Mostrar / ocultar esta sección (Brandon 2026-06-27 · #1) */}
      <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-xs font-bold text-white">Mostrar en la tienda</p>
          <p className="text-[length:var(--ts-2xs)] text-gray-400">{hidden ? "Oculta para tus clientes" : "Visible para tus clientes"}</p>
        </div>
        <Toggle checked={!hidden} onChange={(on) => onToggleHidden(!on)} />
      </div>

      {/* Texto de la sección — etiqueta + título + alineación (Brandon 2026-06-27).
          También editable con doble-click sobre el texto en el preview. */}
      {textFields && (
        <SectionCard icon={Type} title="Texto de la sección" hint="Editá acá o doble-click sobre el texto en el preview">
          <div className="space-y-1.5">
            <p className="text-[length:var(--ts-2xs)] font-bold text-gray-300">Etiqueta</p>
            <input
              className={INPUT_CLASS}
              value={text.eyebrow ?? ""}
              onChange={(e) => onText("eyebrow", e.target.value)}
              placeholder={textFields.eyebrow}
              maxLength={60}
            />
            <TextStyleControls field={`sectionText:${sectionKey}:eyebrow`} value={textStyles[`sectionText:${sectionKey}:eyebrow`] ?? {}} onChange={onTextStyle} />
          </div>
          <div className="space-y-1.5">
            <p className="text-[length:var(--ts-2xs)] font-bold text-gray-300">Título</p>
            <input
              className={INPUT_CLASS}
              value={text.title ?? ""}
              onChange={(e) => onText("title", e.target.value)}
              placeholder={textFields.title}
              maxLength={80}
            />
            <TextStyleControls field={`sectionText:${sectionKey}:title`} value={textStyles[`sectionText:${sectionKey}:title`] ?? {}} onChange={onTextStyle} />
          </div>
          <div className="space-y-1.5">
            <p className="text-[length:var(--ts-2xs)] font-bold text-gray-300">Alineación</p>
            <div className="grid grid-cols-3 gap-1.5">
              {([["left", "Izquierda", AlignLeft], ["center", "Centro", AlignCenter], ["right", "Derecha", AlignRight]] as const).map(([val, lbl, Ico]) => {
                const active = (text.align ?? "left") === val;
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => onText("align", val)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-lg border py-2 transition-colors",
                      active ? "border-[var(--accent-soft)] bg-[var(--accent-soft)]/10 text-white" : "border-white/10 bg-white/[0.03] text-gray-400 hover:border-white/25",
                    )}
                  >
                    <Ico className="h-4 w-4" />
                    <span className="text-[length:var(--ts-2xs)] font-semibold">{lbl}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <p className="text-[length:var(--ts-2xs)] text-gray-500">Vacío = se usa el texto por defecto.</p>
        </SectionCard>
      )}

      {/* Imagen de la sección — banda full-width arriba de esta sección */}
      <SectionCard icon={ImageIcon} title="Imagen de la sección" hint="Banda full-width que aparece con esta sección">
        <div className="dark">
          <ImageUpload
            value={image ?? ""}
            onChange={(url) => onImage(url)}
            onClear={() => onImage("")}
            folder="store-customizer"
            aspectRatio="banner"
            label=""
          />
        </div>
        <p className="text-[length:var(--ts-2xs)] text-gray-500">Opcional · click o arrastrá · máx 5 MB</p>
      </SectionCard>

      {/* Diseños de 1 clic — formas y looks listos */}
      <SectionCard icon={WandSparkles} title="Diseño rápido" hint="Aplicá un look completo en 1 clic">
        <div className="grid grid-cols-2 gap-2">
          {SECTION_DESIGN_PRESETS.map((p) => {
            const cleaned = JSON.stringify(
              Object.fromEntries(Object.entries(p.style).filter(([, v]) => v !== undefined && v !== null && v !== "")),
            );
            const active = cleaned === presetKey;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onPreset(p.style)}
                className={cn(
                  "group rounded-lg border p-2 text-left transition-colors",
                  active ? "border-[var(--accent-soft)] bg-[var(--accent-soft)]/10" : "border-white/10 bg-white/[0.03] hover:border-white/25",
                )}
              >
                <span
                  className="mb-1.5 flex h-9 w-full items-center justify-center overflow-hidden"
                  style={{
                    background: p.style.bg || "rgba(255,255,255,0.04)",
                    color: p.style.text || "#94a3b8",
                    borderRadius: p.style.radius ?? 6,
                    border: p.style.border ? `${p.style.borderW ?? 2}px solid ${p.style.border}` : "1px solid rgba(255,255,255,0.1)",
                    boxShadow: p.style.shadow === "deep" ? "0 8px 20px rgba(0,0,0,0.35)" : p.style.shadow === "soft" ? "0 4px 12px rgba(0,0,0,0.25)" : "none",
                  }}
                >
                  <span className="text-[length:var(--ts-2xs)] font-bold">Aa</span>
                </span>
                <span className="block text-[length:var(--ts-2xs)] font-semibold text-gray-200">{p.name}</span>
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard icon={Palette} title="Colores">
        <SectionColorPicker label="Fondo" value={value.bg} onChange={(v) => onChange({ bg: v })} clearLabel="Sin fondo" enableAlpha />
        <SectionColorPicker label="Texto" value={value.text} onChange={(v) => onChange({ text: v })} clearLabel="Auto" />
      </SectionCard>

      {/* Fondo avanzado (Brandon 2026-06-27 · #3): degradado / imagen+overlay / patrón */}
      <details className="group overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
        <summary className="flex cursor-pointer list-none items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-white/[0.02]">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)]/15 text-[var(--accent-soft)]">
            <Palette className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold leading-tight text-white">Fondo avanzado</p>
            <p className="mt-0.5 text-[length:var(--ts-2xs)] leading-tight text-gray-400">Degradado · imagen con overlay · patrón</p>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="border-t border-white/5 p-3">
          <AdvancedBackground onSetBg={(bg) => onChange({ bg })} />
        </div>
      </details>

      <SectionCard icon={SlidersHorizontal} title="Forma y espaciado">
        <StylePicker
          label="Espaciado vertical"
          cols={3}
          value={value.pad ?? "md"}
          onChange={(v) => onChange({ pad: v === "md" ? undefined : (v as "sm" | "lg") })}
          options={[
            { value: "sm", label: "Compacto", preview: <span className="h-3 w-7 rounded bg-white/30" /> },
            { value: "md", label: "Normal", preview: <span className="h-4 w-7 rounded bg-white/40" /> },
            { value: "lg", label: "Amplio", preview: <span className="h-5 w-7 rounded bg-white/50" /> },
          ]}
        />
        <Field
          label={
            <div className="mb-1 flex w-full items-center justify-between">
              <span>Redondez de esquinas</span>
              <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--accent-soft)]">{value.radius ?? 0}px</span>
            </div>
          }
          labelClassName={LABEL_CLASS}
        >
          {(id) => (
            <input
              id={id}
              type="range"
              min={0}
              max={32}
              value={value.radius ?? 0}
              onChange={(e) => onChange({ radius: Number(e.target.value) })}
              className="w-full accent-[var(--accent-soft)]"
            />
          )}
        </Field>
        <StylePicker
          label="Sombra"
          cols={3}
          value={value.shadow ?? "none"}
          onChange={(v) => onChange({ shadow: v === "none" ? undefined : (v as "soft" | "deep") })}
          options={[
            { value: "none", label: "Ninguna", preview: <span className="h-5 w-7 rounded bg-white/20" /> },
            { value: "soft", label: "Suave", preview: <span className="h-5 w-7 rounded bg-white/30 shadow-md" /> },
            { value: "deep", label: "Profunda", preview: <span className="h-5 w-7 rounded bg-white/40 shadow-xl" /> },
          ]}
        />
        <StylePicker
          label="Tipografía de la sección"
          cols={4}
          value={value.font ?? ""}
          onChange={(v) => onChange({ font: v || undefined })}
          options={SECTION_FONT_OPTIONS.map((f) => ({
            value: f.stack, // guardar el STACK (no el id) → familia CSS real + carga del link
            label: f.label,
            preview: <span className="text-base font-bold text-white" style={f.stack ? { fontFamily: f.stack } : undefined}>Aa</span>,
          }))}
        />
      </SectionCard>

      {/* #4 Layout y movimiento (Brandon 2026-06-27) */}
      <SectionCard icon={SlidersHorizontal} title="Layout y movimiento">
        <StylePicker
          label="Ancho del contenido"
          cols={3}
          value={value.width ?? "normal"}
          onChange={(v) => onChange({ width: v === "normal" ? undefined : (v as "narrow" | "full") })}
          options={[
            { value: "narrow", label: "Angosto", preview: <span className="h-4 w-4 rounded bg-white/40" /> },
            { value: "normal", label: "Normal", preview: <span className="h-4 w-6 rounded bg-white/40" /> },
            { value: "full", label: "Full", preview: <span className="h-4 w-8 rounded bg-white/40" /> },
          ]}
        />
        <Field
          label={
            <div className="mb-1 flex w-full items-center justify-between">
              <span>Ajuste fino vertical</span>
              <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--accent-soft)]">{typeof value.padY === "number" ? `${value.padY}px` : "auto"}</span>
            </div>
          }
          labelClassName={LABEL_CLASS}
        >
          {(id) => (
            <input id={id} type="range" min={0} max={96} value={value.padY ?? 0} onChange={(e) => onChange({ padY: Number(e.target.value) || undefined })} className="w-full accent-[var(--accent-soft)]" />
          )}
        </Field>
        <StylePicker
          label="Separador (abajo)"
          cols={3}
          value={value.divider ?? "none"}
          onChange={(v) => onChange({ divider: v === "none" ? undefined : (v as "line" | "space") })}
          options={[
            { value: "none", label: "Ninguno", preview: <span className="h-4 w-6 rounded bg-white/20" /> },
            { value: "line", label: "Línea", preview: <span className="h-4 w-6 border-b-2 border-white/50" /> },
            { value: "space", label: "Espacio", preview: <span className="h-4 w-6 rounded bg-white/10" /> },
          ]}
        />
        <StylePicker
          label="Animación de entrada"
          cols={4}
          value={value.anim ?? "none"}
          onChange={(v) => onChange({ anim: v === "none" ? undefined : (v as "fade" | "up" | "zoom") })}
          options={[
            { value: "none", label: "Ninguna", preview: <X className="h-4 w-4 text-gray-400" /> },
            { value: "fade", label: "Aparecer", preview: <Sparkles className="h-4 w-4 text-gray-300" /> },
            { value: "up", label: "Subir", preview: <ChevronUp className="h-4 w-4 text-gray-300" /> },
            { value: "zoom", label: "Zoom", preview: <Plus className="h-4 w-4 text-gray-300" /> },
          ]}
        />
      </SectionCard>

      <SectionCard icon={Square} title="Borde">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-200">Mostrar borde</span>
          <Toggle
            checked={hasBorder}
            onChange={(on) =>
              onChange(on ? { border: value.border ?? "#E2E8F0", borderW: value.borderW ?? 2 } : { border: undefined, borderW: undefined })
            }
          />
        </div>
        {hasBorder && (
          <>
            <SectionColorPicker label="Color del borde" value={value.border} onChange={(v) => onChange({ border: v })} allowClear={false} />
            <Field
              label={
                <div className="mb-1 flex w-full items-center justify-between">
                  <span>Grosor</span>
                  <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--accent-soft)]">{value.borderW ?? 2}px</span>
                </div>
              }
              labelClassName={LABEL_CLASS}
            >
              {(id) => (
                <input
                  id={id}
                  type="range"
                  min={1}
                  max={6}
                  value={value.borderW ?? 2}
                  onChange={(e) => onChange({ borderW: Number(e.target.value) })}
                  className="w-full accent-[var(--accent-soft)]"
                />
              )}
            </Field>
          </>
        )}
      </SectionCard>

      {hasAnyStyle && (
        <button
          type="button"
          onClick={() => onChange("reset")}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-bold text-gray-300 transition-colors hover:border-[var(--data-error-500)]/40 hover:text-[var(--data-error-500)]"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Quitar estilos de esta sección
        </button>
      )}
    </div>
  );
}

/**
 * CustomSectionEditor — panel para las secciones del SectionsBuilder
 * (about/gallery/image-text/…). Edita texto e imágenes; persiste en footerHtml
 * vía /api/store-page/sections (ADR-301 Fase 4). Detecta los campos presentes en
 * section.data, así un solo componente sirve para todos los tipos.
 */
function CustomSectionEditor({
  section,
  onPatch,
  textStyles,
  onTextStyle,
  onBack,
  tenantSlug,
  storeName,
}: {
  section: Section;
  onPatch: (dataPatch: Record<string, unknown>) => void;
  textStyles: Record<string, { size?: number; bold?: boolean; color?: string; italic?: boolean; upper?: boolean }>;
  onTextStyle: (field: string, partial: Record<string, unknown>) => void;
  onBack: () => void;
  tenantSlug: string;
  storeName?: string;
}) {
  const d = section.data as Record<string, unknown>;
  const label = CUSTOM_SECTION_LABELS[section.type] ?? "Sección";
  // #11 Generar contenido con IA (about/faq/benefits/how-to-order).
  const AI_TYPES = new Set(["about", "faq", "benefits", "how-to-order"]);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const generateWithAi = async () => {
    setAiBusy(true);
    setAiErr(null);
    try {
      const res = await fetch("/api/store-page/ai-content", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json", "x-tenant-id": tenantSlug }),
        body: JSON.stringify({ sectionType: section.type, storeName, rubro: label }),
      });
      const json = await res.json().catch((err) => { console.warn("[ai-content] respuesta no-JSON", err); return null; });
      if (!res.ok || !json?.data) { setAiErr(json?.error ?? "No se pudo generar. Probá de nuevo."); return; }
      onPatch(json.data as Record<string, unknown>);
    } catch {
      setAiErr("Falló la conexión con la IA.");
    } finally {
      setAiBusy(false);
    }
  };
  const images = Array.isArray((d as { images?: unknown }).images)
    ? ((d as { images: Array<{ url: string; alt?: string; caption?: string }> }).images)
    : null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-xl border border-[var(--accent-soft)]/40 bg-[var(--accent-soft)]/10 px-2.5 py-2">
        <button type="button" onClick={onBack} aria-label="Volver al menú" className="shrink-0 rounded-md p-1 text-gray-300 transition-colors hover:bg-white/10 hover:text-white">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent-soft)]">Sección de tu página</p>
          <p className="truncate text-sm font-bold text-white">{label}</p>
        </div>
        <span className="inline-flex shrink-0 items-center rounded-full bg-[var(--data-success-500)]/15 px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-500)]">Solo esta</span>
      </div>

      {/* #11 Generar contenido con IA */}
      {AI_TYPES.has(section.type) && (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={generateWithAi}
            disabled={aiBusy}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--accent-soft)]/40 bg-[var(--accent-soft)]/10 px-3 py-2 text-xs font-bold text-[var(--accent-soft)] transition-colors hover:bg-[var(--accent-soft)]/20 disabled:opacity-50"
          >
            <Sparkles className={cn("h-3.5 w-3.5", aiBusy && "animate-pulse")} />
            {aiBusy ? "Generando…" : "Generar contenido con IA"}
          </button>
          {aiErr && <p className="text-[length:var(--ts-2xs)] font-semibold text-[var(--data-error-500)]">{aiErr}</p>}
        </div>
      )}

      <SectionCard icon={Type} title="Texto" hint="Editá acá o doble-click sobre el texto en el preview">
        {typeof d.eyebrow === "string" && (
          <div className="space-y-1.5">
            <p className="text-[length:var(--ts-2xs)] font-bold text-gray-300">Etiqueta</p>
            <input className={INPUT_CLASS} value={d.eyebrow as string} onChange={(e) => onPatch({ eyebrow: e.target.value })} maxLength={60} />
          </div>
        )}
        {typeof d.title === "string" && (
          <div className="space-y-1.5">
            <p className="text-[length:var(--ts-2xs)] font-bold text-gray-300">Título</p>
            <input className={INPUT_CLASS} value={d.title as string} onChange={(e) => onPatch({ title: e.target.value })} maxLength={100} />
            <TextStyleControls field={`customText:${section.id}:title`} value={textStyles[`customText:${section.id}:title`] ?? {}} onChange={onTextStyle} />
          </div>
        )}
        {typeof d.subtitle === "string" && (
          <div className="space-y-1.5">
            <p className="text-[length:var(--ts-2xs)] font-bold text-gray-300">Subtítulo</p>
            <input className={INPUT_CLASS} value={d.subtitle as string} onChange={(e) => onPatch({ subtitle: e.target.value })} maxLength={140} />
          </div>
        )}
        {typeof d.body === "string" && (
          <div className="space-y-1.5">
            <p className="text-[length:var(--ts-2xs)] font-bold text-gray-300">Texto</p>
            <textarea className={cn(INPUT_CLASS, "resize-none")} rows={5} value={d.body as string} onChange={(e) => onPatch({ body: e.target.value })} maxLength={1500} />
            {/* #4 Formato markdown-lite: listas, links, negrita */}
            <div className="flex flex-wrap items-center gap-1.5">
              {([["• Lista", "\n- "], ["1. Numerada", "\n1. "], ["Link", "[texto](https://)"], ["Negrita", "**texto**"]] as const).map(([lbl, ins]) => (
                <button key={lbl} type="button" onClick={() => onPatch({ body: `${(d.body as string) || ""}${ins}` })} className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[length:var(--ts-2xs)] font-semibold text-gray-300 transition-colors hover:border-[var(--accent-soft)] hover:text-white">
                  {lbl}
                </button>
              ))}
            </div>
            <p className="text-[length:var(--ts-2xs)] text-gray-500">Tip: <code>- </code> para viñetas, <code>[texto](link)</code> para enlaces, <code>**negrita**</code>.</p>
          </div>
        )}
      </SectionCard>

      {/* Campos específicos de bloques nuevos (Brandon 2026-06-27 · #2) */}
      {(typeof d.buttonLabel === "string" || typeof d.videoUrl === "string" || typeof d.address === "string" || typeof d.endsAt === "string") && (
        <SectionCard icon={SlidersHorizontal} title="Opciones del bloque">
          {typeof d.buttonLabel === "string" && (
            <div className="space-y-1.5">
              <p className="text-[length:var(--ts-2xs)] font-bold text-gray-300">Texto del botón</p>
              <input className={INPUT_CLASS} value={d.buttonLabel as string} onChange={(e) => onPatch({ buttonLabel: e.target.value })} maxLength={40} />
            </div>
          )}
          {typeof d.buttonUrl === "string" && (
            <div className="space-y-1.5">
              <p className="text-[length:var(--ts-2xs)] font-bold text-gray-300">Link del botón</p>
              <input className={INPUT_CLASS} value={d.buttonUrl as string} onChange={(e) => onPatch({ buttonUrl: e.target.value })} placeholder="https://wa.me/51… o /t/mi-tienda/tienda" />
            </div>
          )}
          {typeof d.videoUrl === "string" && (
            <div className="space-y-1.5">
              <p className="text-[length:var(--ts-2xs)] font-bold text-gray-300">Link del video</p>
              <input className={INPUT_CLASS} value={d.videoUrl as string} onChange={(e) => onPatch({ videoUrl: e.target.value })} placeholder="YouTube o .mp4" />
            </div>
          )}
          {typeof d.address === "string" && (
            <div className="space-y-1.5">
              <p className="text-[length:var(--ts-2xs)] font-bold text-gray-300">Dirección</p>
              <input className={INPUT_CLASS} value={d.address as string} onChange={(e) => onPatch({ address: e.target.value })} placeholder="Jr. Lima 123, Ciudad Constitución" />
            </div>
          )}
          {typeof d.endsAt === "string" && (
            <div className="space-y-1.5">
              <p className="text-[length:var(--ts-2xs)] font-bold text-gray-300">Termina el</p>
              <input type="datetime-local" className={INPUT_CLASS} value={(d.endsAt as string).slice(0, 16)} onChange={(e) => onPatch({ endsAt: e.target.value })} />
            </div>
          )}
        </SectionCard>
      )}

      {Array.isArray((d as { logos?: unknown }).logos) && (
        <SectionCard icon={ImageIcon} title="Logos / marcas" hint="Agregá, cambiá o quitá logos">
          {((d as { logos: Array<{ url: string; alt?: string }> }).logos).map((lg, i, arr) => (
            <div key={i} className="space-y-1.5 rounded-lg border border-white/10 p-2">
              <div className="flex items-center justify-between">
                <p className="text-[length:var(--ts-2xs)] font-bold text-gray-300">Logo {i + 1}</p>
                <button type="button" onClick={() => onPatch({ logos: arr.filter((_, j) => j !== i) })} aria-label="Quitar logo" className="text-gray-500 transition-colors hover:text-[var(--data-error-500)]">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="dark">
                <ImageUpload value={lg.url} onChange={(url) => onPatch({ logos: arr.map((x, j) => (j === i ? { ...x, url } : x)) })} onClear={() => onPatch({ logos: arr.filter((_, j) => j !== i) })} folder="store-customizer" aspectRatio="square" label="" />
              </div>
            </div>
          ))}
          <button type="button" onClick={() => onPatch({ logos: [...((d as { logos: Array<{ url: string; alt?: string }> }).logos), { url: "" }] })} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/15 bg-white/[0.03] px-3 py-2 text-xs font-bold text-gray-300 transition-colors hover:border-[var(--accent-soft)] hover:text-white">
            <Plus className="h-3.5 w-3.5" /> Agregar logo
          </button>
        </SectionCard>
      )}

      {/* Equipo (Lote A): miembros con foto/nombre/rol */}
      {Array.isArray((d as { members?: unknown }).members) && (
        <SectionCard icon={Users} title="Personas del equipo" hint="Foto, nombre y rol de cada uno">
          {((d as { members: Array<{ name: string; role?: string; photo?: string }> }).members).map((m, i, arr) => (
            <div key={i} className="space-y-1.5 rounded-lg border border-white/10 p-2">
              <div className="flex items-center justify-between">
                <p className="text-[length:var(--ts-2xs)] font-bold text-gray-300">Persona {i + 1}</p>
                <button type="button" onClick={() => onPatch({ members: arr.filter((_, j) => j !== i) })} aria-label="Quitar persona" className="text-gray-500 transition-colors hover:text-[var(--data-error-500)]">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="dark">
                <ImageUpload value={m.photo ?? ""} onChange={(url) => onPatch({ members: arr.map((x, j) => (j === i ? { ...x, photo: url } : x)) })} onClear={() => onPatch({ members: arr.map((x, j) => (j === i ? { ...x, photo: "" } : x)) })} folder="store-customizer" aspectRatio="square" label="" />
              </div>
              <input className={INPUT_CLASS} placeholder="Nombre" value={m.name} onChange={(e) => onPatch({ members: arr.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} maxLength={50} />
              <input className={INPUT_CLASS} placeholder="Rol (ej. Dueño/a)" value={m.role ?? ""} onChange={(e) => onPatch({ members: arr.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)) })} maxLength={40} />
            </div>
          ))}
          <button type="button" onClick={() => onPatch({ members: [...((d as { members: Array<{ name: string; role?: string; photo?: string }> }).members), { name: "", role: "" }] })} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/15 bg-white/[0.03] px-3 py-2 text-xs font-bold text-gray-300 transition-colors hover:border-[var(--accent-soft)] hover:text-white">
            <Plus className="h-3.5 w-3.5" /> Agregar persona
          </button>
        </SectionCard>
      )}

      {/* Redes (Lote A): plataforma + URL */}
      {Array.isArray((d as { links?: unknown }).links) && (
        <SectionCard icon={Share2} title="Links de redes" hint="Elegí la red y pegá el link">
          {((d as { links: Array<{ platform: string; url: string }> }).links).map((lk, i, arr) => (
            <div key={i} className="flex items-center gap-1.5 rounded-lg border border-white/10 p-2">
              <select value={lk.platform} onChange={(e) => onPatch({ links: arr.map((x, j) => (j === i ? { ...x, platform: e.target.value } : x)) })} className={cn(INPUT_CLASS, "w-28 shrink-0")} aria-label="Red social">
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
                <option value="tiktok">TikTok</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="web">Sitio web</option>
              </select>
              <input className={INPUT_CLASS} placeholder="https://..." value={lk.url} onChange={(e) => onPatch({ links: arr.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
              <button type="button" onClick={() => onPatch({ links: arr.filter((_, j) => j !== i) })} aria-label="Quitar red" className="shrink-0 text-gray-500 transition-colors hover:text-[var(--data-error-500)]">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button type="button" onClick={() => onPatch({ links: [...((d as { links: Array<{ platform: string; url: string }> }).links), { platform: "instagram", url: "" }] })} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/15 bg-white/[0.03] px-3 py-2 text-xs font-bold text-gray-300 transition-colors hover:border-[var(--accent-soft)] hover:text-white">
            <Plus className="h-3.5 w-3.5" /> Agregar red
          </button>
        </SectionCard>
      )}

      {/* Categorías (Lote B): nombre + imagen + link. Gated por tipo (benefits también usa items). */}
      {section.type === "categories" && Array.isArray((d as { items?: unknown }).items) && (
        <SectionCard icon={Layout} title="Categorías" hint="Nombre, imagen de fondo y a dónde lleva">
          {((d as { items: Array<{ name: string; image?: string; url?: string }> }).items).map((it, i, arr) => (
            <div key={i} className="space-y-1.5 rounded-lg border border-white/10 p-2">
              <div className="flex items-center justify-between">
                <p className="text-[length:var(--ts-2xs)] font-bold text-gray-300">Categoría {i + 1}</p>
                <button type="button" onClick={() => onPatch({ items: arr.filter((_, j) => j !== i) })} aria-label="Quitar categoría" className="text-gray-500 transition-colors hover:text-[var(--data-error-500)]">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="dark">
                <ImageUpload value={it.image ?? ""} onChange={(url) => onPatch({ items: arr.map((x, j) => (j === i ? { ...x, image: url } : x)) })} onClear={() => onPatch({ items: arr.map((x, j) => (j === i ? { ...x, image: "" } : x)) })} folder="store-customizer" aspectRatio="banner" label="" />
              </div>
              <input className={INPUT_CLASS} placeholder="Nombre" value={it.name} onChange={(e) => onPatch({ items: arr.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} maxLength={40} />
              <input className={INPUT_CLASS} placeholder="Link (ej. /t/mi-tienda/tienda?cat=bebidas)" value={it.url ?? ""} onChange={(e) => onPatch({ items: arr.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
            </div>
          ))}
          <button type="button" onClick={() => onPatch({ items: [...((d as { items: Array<{ name: string; image?: string; url?: string }> }).items), { name: "", image: "", url: "" }] })} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/15 bg-white/[0.03] px-3 py-2 text-xs font-bold text-gray-300 transition-colors hover:border-[var(--accent-soft)] hover:text-white">
            <Plus className="h-3.5 w-3.5" /> Agregar categoría
          </button>
        </SectionCard>
      )}

      {/* Lote I #10: disposición interna de la sección (galería / imagen+texto) */}
      {section.type === "gallery" && (
        <SectionCard icon={SlidersHorizontal} title="Disposición">
          <StylePicker
            label="Columnas"
            cols={4}
            value={String((d as { columns?: number }).columns ?? 0)}
            onChange={(v) => onPatch({ columns: Number(v) || undefined })}
            options={[
              { value: "0", label: "Auto", preview: <span className="text-[length:var(--ts-2xs)] text-gray-400">A</span> },
              { value: "2", label: "2", preview: <span className="text-xs font-bold text-gray-300">2</span> },
              { value: "3", label: "3", preview: <span className="text-xs font-bold text-gray-300">3</span> },
              { value: "4", label: "4", preview: <span className="text-xs font-bold text-gray-300">4</span> },
            ]}
          />
        </SectionCard>
      )}
      {section.type === "image-text" && typeof d.imagePosition === "string" && (
        <SectionCard icon={SlidersHorizontal} title="Disposición">
          <StylePicker
            label="Posición de la imagen"
            cols={4}
            value={d.imagePosition as string}
            onChange={(v) => onPatch({ imagePosition: v })}
            options={[
              { value: "left", label: "Izq.", preview: <AlignLeft className="h-4 w-4 text-gray-300" /> },
              { value: "right", label: "Der.", preview: <AlignRight className="h-4 w-4 text-gray-300" /> },
              { value: "top", label: "Arriba", preview: <span className="text-xs font-bold text-gray-300">↑</span> },
              { value: "bottom", label: "Abajo", preview: <span className="text-xs font-bold text-gray-300">↓</span> },
            ]}
          />
        </SectionCard>
      )}
      {section.type === "faq" && (
        <SectionCard icon={SlidersHorizontal} title="Disposición">
          <StylePicker
            label="Estilo de las preguntas"
            cols={2}
            value={((d as { layout?: string }).layout) ?? "accordion"}
            onChange={(v) => onPatch({ layout: v })}
            options={[
              { value: "accordion", label: "Acordeón", preview: <span className="text-[length:var(--ts-2xs)] text-gray-300">▸ ▾</span> },
              { value: "open", label: "Lista abierta", preview: <span className="flex flex-col gap-0.5"><span className="h-1 w-6 rounded-sm bg-white/40" /><span className="h-1 w-6 rounded-sm bg-white/40" /></span> },
            ]}
          />
        </SectionCard>
      )}

      {typeof d.imageUrl === "string" && (
        <SectionCard icon={ImageIcon} title="Imagen">
          <div className="dark">
            <ImageUpload value={d.imageUrl as string} onChange={(url) => onPatch({ imageUrl: url })} onClear={() => onPatch({ imageUrl: "" })} folder="store-customizer" aspectRatio="banner" label="" />
          </div>
        </SectionCard>
      )}

      {images && (
        <SectionCard icon={ImageIcon} title="Galería" hint="Agregá, cambiá o quitá fotos">
          {images.map((img, i) => (
            <div key={i} className="space-y-1.5 rounded-lg border border-white/10 p-2">
              <div className="flex items-center justify-between">
                <p className="text-[length:var(--ts-2xs)] font-bold text-gray-300">Foto {i + 1}</p>
                <button type="button" onClick={() => onPatch({ images: images.filter((_, j) => j !== i) })} aria-label="Quitar foto" className="text-gray-500 transition-colors hover:text-[var(--data-error-500)]">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="dark">
                <ImageUpload value={img.url} onChange={(url) => { const next = images.map((x, j) => (j === i ? { ...x, url } : x)); onPatch({ images: next }); }} onClear={() => onPatch({ images: images.filter((_, j) => j !== i) })} folder="store-customizer" aspectRatio="square" label="" />
              </div>
            </div>
          ))}
          <button type="button" onClick={() => onPatch({ images: [...images, { url: "" }] })} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/15 bg-white/[0.03] px-3 py-2 text-xs font-bold text-gray-300 transition-colors hover:border-[var(--accent-soft)] hover:text-white">
            <Plus className="h-3.5 w-3.5" /> Agregar foto
          </button>
        </SectionCard>
      )}
    </div>
  );
}

/**
 * CardDesignEditor — panel para el diseño de las TARJETAS de producto (Brandon
 * 2026-06-27). Cambia fondo/forma/borde/sombra + color de nombre y precio.
 * Aplica a TODAS las tarjetas de la vitrina.
 */
function CardDesignEditor({
  value,
  onChange,
  onBack,
}: {
  value: { bg?: string; radius?: number; border?: string; borderW?: number; shadow?: "none" | "soft" | "deep"; nameColor?: string; priceColor?: string };
  onChange: (change: Partial<{ bg?: string; radius?: number; border?: string; borderW?: number; shadow?: "none" | "soft" | "deep"; nameColor?: string; priceColor?: string }> | "reset") => void;
  onBack: () => void;
}) {
  const hasBorder = !!value.border;
  const hasAny = Object.keys(value).length > 0;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-xl border border-[var(--accent-soft)]/40 bg-[var(--accent-soft)]/10 px-2.5 py-2">
        <button type="button" onClick={onBack} aria-label="Volver al menú" className="shrink-0 rounded-md p-1 text-gray-300 transition-colors hover:bg-white/10 hover:text-white">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent-soft)]">Editando</p>
          <p className="truncate text-sm font-bold text-white">Tarjetas de producto</p>
        </div>
        <span className="inline-flex shrink-0 items-center rounded-full bg-[var(--data-success-500)]/15 px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-500)]">Todas</span>
      </div>

      <SectionCard icon={Palette} title="Colores">
        <SectionColorPicker label="Fondo de la tarjeta" value={value.bg} onChange={(v) => onChange({ bg: v })} clearLabel="Auto" />
        <SectionColorPicker label="Color del nombre" value={value.nameColor} onChange={(v) => onChange({ nameColor: v })} clearLabel="Auto" />
        <SectionColorPicker label="Color del precio" value={value.priceColor} onChange={(v) => onChange({ priceColor: v })} clearLabel="Auto" />
      </SectionCard>

      <SectionCard icon={SlidersHorizontal} title="Forma y sombra">
        <Field
          label={<div className="mb-1 flex w-full items-center justify-between"><span>Redondez</span><span className="text-[length:var(--ts-2xs)] font-bold text-[var(--accent-soft)]">{value.radius ?? 16}px</span></div>}
          labelClassName={LABEL_CLASS}
        >
          {(id) => (
            <input id={id} type="range" min={0} max={28} value={value.radius ?? 16} onChange={(e) => onChange({ radius: Number(e.target.value) })} className="w-full accent-[var(--accent-soft)]" />
          )}
        </Field>
        <StylePicker
          label="Sombra"
          cols={3}
          value={value.shadow ?? "none"}
          onChange={(v) => onChange({ shadow: v === "none" ? undefined : (v as "soft" | "deep") })}
          options={[
            { value: "none", label: "Ninguna", preview: <span className="h-5 w-7 rounded bg-white/20" /> },
            { value: "soft", label: "Suave", preview: <span className="h-5 w-7 rounded bg-white/30 shadow-md" /> },
            { value: "deep", label: "Profunda", preview: <span className="h-5 w-7 rounded bg-white/40 shadow-xl" /> },
          ]}
        />
      </SectionCard>

      <SectionCard icon={Square} title="Borde">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-200">Mostrar borde</span>
          <Toggle checked={hasBorder} onChange={(on) => onChange(on ? { border: value.border ?? "#E2E8F0", borderW: value.borderW ?? 2 } : { border: undefined, borderW: undefined })} />
        </div>
        {hasBorder && (
          <>
            <SectionColorPicker label="Color del borde" value={value.border} onChange={(v) => onChange({ border: v })} allowClear={false} />
            <Field
              label={<div className="mb-1 flex w-full items-center justify-between"><span>Grosor</span><span className="text-[length:var(--ts-2xs)] font-bold text-[var(--accent-soft)]">{value.borderW ?? 2}px</span></div>}
              labelClassName={LABEL_CLASS}
            >
              {(id) => (
                <input id={id} type="range" min={1} max={6} value={value.borderW ?? 2} onChange={(e) => onChange({ borderW: Number(e.target.value) })} className="w-full accent-[var(--accent-soft)]" />
              )}
            </Field>
          </>
        )}
      </SectionCard>

      {hasAny && (
        <button
          type="button"
          onClick={() => onChange("reset")}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-bold text-gray-300 transition-colors hover:border-[var(--data-error-500)]/40 hover:text-[var(--data-error-500)]"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Quitar diseño de tarjetas
        </button>
      )}
    </div>
  );
}

/**
 * PreviewBrowserFrame — chrome estilo Chrome con dots, URL bar y iframe.
 * Hace que la vista previa se sienta como una ventana de browser real,
 * no como un cuadrado flotante. Resuelve el problema visual de que el
 * preview "se veía como modo móvil" aunque estuviera en escritorio.
 */
function PreviewBrowserFrame({
  url,
  iframeKey,
  src,
  title,
}: {
  url: string;
  iframeKey: number;
  src: string;
  title: string;
}) {
  return (
    <div
      className="bg-white dark:bg-[var(--color-card)] rounded-xl overflow-hidden shadow-[var(--shadow-xl)] border border-gray-700/50 w-full"
      style={{ height: "calc(100vh - 130px)" }}
    >
      {/* Browser chrome */}
      <div className="bg-gray-100 dark:bg-gray-100 border-b border-gray-200 px-3 py-2 flex items-center gap-2">
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex-1 mx-2 px-3 py-1.5 rounded-lg bg-white dark:bg-[var(--color-card)] border border-gray-200 text-xs font-mono text-gray-600 truncate">
          {typeof window !== "undefined" ? window.location.origin : ""}{url}
        </div>
        <div className="flex items-center gap-1 shrink-0 text-gray-400">
          <RefreshCw className="h-3.5 w-3.5" />
        </div>
      </div>
      {/* Content iframe */}
      <iframe
        key={iframeKey}
        src={src}
        title={title}
        data-live-preview="1"
        className="w-full border-0"
        style={{ height: "calc(100% - 36px)" }}
      />
    </div>
  );
}

function PreviewCard({ title, price, primaryColor, borderRadius, styleVariant }: {
  title: string;
  price: string;
  primaryColor: string;
  borderRadius: number;
  styleVariant: StoreTheme["cardStyle"];
}) {
  const cardClass =
    styleVariant === "minimal"
      ? "border border-[var(--rule-base)] shadow-none"
      : styleVariant === "border"
        ? "border-2 border-[var(--rule-base)] "
        : styleVariant === "glass"
          ? "border border-white/40 bg-white/70 backdrop-blur-md"
          : "border border-[var(--rule-base)]";

  return (
    <div className={cn("p-3 bg-white dark:bg-[var(--color-card)]", cardClass)} style={{ borderRadius }}>
      <div className="aspect-square rounded-xl bg-[var(--surface-sunken)] flex items-center justify-center">
        <div className="h-12 w-12 rounded-xl bg-white/80 flex items-center justify-center ring-1 ring-white">
          <Store className="h-6 w-6 text-[var(--text-tertiary)]" />
        </div>
      </div>
      <p className="mt-2 text-sm font-bold text-[var(--text-primary)] line-clamp-2">{title}</p>
      <p className="text-sm font-extrabold mt-1" style={{ color: primaryColor }}>{price}</p>
      <button
        type="button"
        className="mt-2 w-full text-xs font-bold text-white py-2"
        style={{ backgroundColor: primaryColor, borderRadius: Math.max(borderRadius - 4, 6) }}
      >
        Agregar
      </button>
    </div>
  );
}

// Firma de los campos que NO se reflejan en vivo por postMessage (imagen, logo,
// secciones, etc.). Solo cuando ESTA firma cambia hace falta recargar el iframe.
// Los campos en vivo (colores, fuente, radio, modo oscuro, título/subtítulo del
// hero) quedan EXCLUIDOS → editar texto o color ya NO dispara el reload (sin flash).
function reloadSignature(t: StoreTheme): string {
  const {
    primaryColor: _p, secondaryColor: _s, accentColor: _a, borderRadius: _r,
    buttonStyle: _b, fontFamily: _f, darkModeDefault: _d, heroTitle: _ht,
    heroSubtitle: _hs,
    // Estilo/texto POR SECCIÓN ya se reflejan EN VIVO por postMessage
    // (pb-apply-section-style / pb-apply-section-text) o por contentEditable
    // (inlineText) → excluir del reload para que editar NO cause flash (Brandon 2026-06-27).
    sectionStyles: _ss, sectionText: _stx, inlineText: _itx, textStyles: _txs, cardDesign: _cdg,
    // brandSwatches es solo del editor (no cambia /t) → no recargar el iframe.
    brandSwatches: _bsw,
    ...rest
  } = t;
  return JSON.stringify(rest);
}

// Page builder Fase 1 (Brandon 2026-06-25): cada bloque [data-pb] del storefront
// abre su panel del editor al clickearlo. Mapa key del bloque → panel.
const PB_KEY_TO_PANEL: Record<string, CreativePanel> = {
  announcement: "secciones",
  hero: "hero",
  trust: "secciones",
  promos: "secciones",
  featured: "secciones",
  testimonials: "secciones",
  info: "contacto",
};
const PB_KEY_LABEL: Record<string, string> = {
  announcement: "Banner de anuncio",
  hero: "Hero",
  trust: "Confianza",
  promos: "Promociones",
  featured: "Productos destacados",
  testimonials: "Testimonios",
  info: "Información",
};

// Estilo POR SECCIÓN — el shape que persiste en sectionStyles[key] y que lee /t.
type SectionStyle = {
  bg?: string;
  text?: string;
  pad?: "sm" | "md" | "lg";
  radius?: number;
  border?: string;
  borderW?: number;
  shadow?: "none" | "soft" | "deep";
  font?: string; // family stack web-safe (serif/sans/mono) o vacío = tema
  // #4 Layout y animación (Brandon 2026-06-27)
  width?: "narrow" | "normal" | "full";
  padY?: number; // padding vertical fino en px (override de pad)
  divider?: "none" | "line" | "space";
  anim?: "none" | "fade" | "up" | "zoom";
};

// Tipografías por sección. Web-safe (serif/sans/mono) + Google reales (Brandon
// 2026-06-27 · #3). Las reales llevan la familia entre comillas como 1ª del stack
// → /t las detecta y carga el <link>, y el overlay las inyecta en vivo.
const SECTION_FONT_OPTIONS: Array<{ id: string; label: string; stack: string }> = [
  { id: "", label: "Tema", stack: "" },
  { id: "serif", label: "Serif", stack: 'Georgia, "Times New Roman", serif' },
  { id: "sans", label: "Sans", stack: 'ui-sans-serif, system-ui, -apple-system, sans-serif' },
  { id: "mono", label: "Mono", stack: 'ui-monospace, "Courier New", monospace' },
  { id: "playfair", label: "Playfair", stack: '"Playfair Display", Georgia, serif' },
  { id: "poppins", label: "Poppins", stack: '"Poppins", system-ui, sans-serif' },
  { id: "montserrat", label: "Montserrat", stack: '"Montserrat", system-ui, sans-serif' },
];

// Secciones del cuerpo a las que el panel lateral puede cambiarles el estilo.
// hero/announcement quedan fuera: tienen flujo propio (editor de hero / banda de
// imagen vía pb-image), y abrir el editor de estilo pisaría ese flujo.
const STYLABLE_SECTIONS = new Set(["trust", "promos", "featured", "testimonials", "info"]);

// Paleta rápida para fondos/bordes del panel lateral por sección.
const SECTION_COLOR_PRESETS = [
  "#FFFFFF", "#F8FAFC", "#F1F5F9", "#0F172A",
  "#00A0A0", "#FF6B5B", "#16A34A", "#2563EB",
  "#7C3AED", "#DB2777", "#EA580C", "#F59E0B",
];

// Diseños de 1 clic por sección (Brandon 2026-06-27): cada uno reemplaza el
// estilo de la sección con una combinación cohesiva (fondo + forma + sombra +
// borde + espaciado). Le da al dueño "formas y diseños" listos para elegir.
const SECTION_DESIGN_PRESETS: { id: string; name: string; style: SectionStyle }[] = [
  { id: "plano", name: "Plano", style: {} },
  { id: "tarjeta", name: "Tarjeta", style: { bg: "#FFFFFF", radius: 20, shadow: "soft", pad: "lg" } },
  { id: "flotante", name: "Flotante", style: { bg: "#FFFFFF", radius: 24, shadow: "deep", pad: "lg" } },
  { id: "suave", name: "Suave", style: { bg: "#F8FAFC", radius: 16, pad: "md" } },
  { id: "banda", name: "Banda", style: { bg: "#00A0A0", text: "#FFFFFF", pad: "lg" } },
  { id: "oscuro", name: "Oscuro", style: { bg: "#0F172A", text: "#F8FAFC", radius: 18, shadow: "deep", pad: "lg" } },
  { id: "contorno", name: "Contorno", style: { border: "#0F172A", borderW: 2, radius: 14, pad: "md" } },
  { id: "marcado", name: "Marcado", style: { bg: "#FFF7ED", border: "#FB923C", borderW: 2, radius: 16, pad: "md" } },
  // Degradados y looks nuevos (Brandon 2026-06-27)
  { id: "degradado-marca", name: "Degradado marca", style: { bg: "linear-gradient(135deg, #00A0A0, #FF6B5B)", text: "#FFFFFF", radius: 20, shadow: "soft", pad: "lg" } },
  { id: "degradado-noche", name: "Noche degradada", style: { bg: "linear-gradient(135deg, #0F172A, #334155)", text: "#F8FAFC", radius: 20, shadow: "deep", pad: "lg" } },
  { id: "atardecer", name: "Atardecer", style: { bg: "linear-gradient(135deg, #F59E0B, #DC2626)", text: "#FFFFFF", radius: 18, pad: "lg" } },
  { id: "menta", name: "Menta", style: { bg: "#ECFDF5", radius: 16, border: "#6EE7B7", borderW: 1, pad: "md" } },
  { id: "cielo", name: "Cielo", style: { bg: "#EFF6FF", radius: 16, border: "#93C5FD", borderW: 1, pad: "md" } },
  { id: "crema", name: "Crema", style: { bg: "#FEFCE8", radius: 18, shadow: "soft", pad: "lg" } },
  { id: "elevado", name: "Elevado", style: { bg: "#FFFFFF", radius: 28, shadow: "deep", border: "#F1F5F9", borderW: 1, pad: "lg" } },
  { id: "lavanda", name: "Lavanda", style: { bg: "linear-gradient(135deg, #EDE9FE, #FCE7F3)", radius: 20, pad: "lg" } },
  { id: "borde-acento", name: "Borde acento", style: { bg: "#FFFFFF", border: "#00A0A0", borderW: 3, radius: 16, pad: "md" } },
  { id: "compacto", name: "Compacto", style: { bg: "#F1F5F9", radius: 12, pad: "sm" } },
];

// Secciones cuyo texto (etiqueta + título) se puede editar desde el panel lateral.
// Los valores son los placeholders (texto por defecto que muestra /t si está vacío).
const SECTION_TEXT_FIELDS: Record<string, { eyebrow: string; title: string }> = {
  featured: { eyebrow: "Destacados · Nuestro catálogo", title: "Lo que recomendamos" },
  info: { eyebrow: "Información del negocio", title: "Lo que tienes que saber" },
  testimonials: { eyebrow: "Lo que dicen", title: "Reseñas de nuestros clientes" },
};

// Picker visual de estilo (Brandon 2026-06-25): en vez de un <select>, muestra
// tarjetas con una MINI VISTA PREVIA de cada opción. La activa se resalta.
function StylePicker<T extends string>({
  label, value, onChange, cols = 2, options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  cols?: 2 | 3 | 4;
  options: Array<{ value: T; label: string; preview: React.ReactNode }>;
}) {
  const colCls = cols === 4 ? "grid-cols-4" : cols === 3 ? "grid-cols-3" : "grid-cols-2";
  return (
    <div>
      <p className={LABEL_CLASS}>{label}</p>
      <div className={cn("grid gap-2", colCls)}>
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={cn(
                "rounded-lg border p-2 transition-colors",
                active
                  ? "border-[var(--data-success-500)] bg-[var(--data-success-500)]/10"
                  : "border-white/10 bg-white/[0.03] hover:border-white/25",
              )}
            >
              <div className="flex h-9 items-center justify-center overflow-hidden rounded bg-white/[0.04]">{o.preview}</div>
              <span className="mt-1 block text-center text-[length:var(--ts-2xs)] text-gray-300">{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function StoreCreativeMode({ tenantSlug, initialTheme, onClose, onApplyTheme }: StoreCreativeModeProps) {
  const [panel, setPanel] = useState<CreativePanel>("plantillas");
  // Bloque seleccionado desde el preview (page builder) → resalta el panel.
  const [pbSelected, setPbSelected] = useState<string | null>(null);
  // Drag del cuerpo REAL de la landing (trust/promos/featured/info → bodyOrder).
  const [bodyDragKey, setBodyDragKey] = useState<string | null>(null);
  const [bodyDragOverKey, setBodyDragOverKey] = useState<string | null>(null);
  const [viewport, setViewport] = useState<Viewport>("desktop");
  // #11 Ancho de preview personalizado (px). null = usar el viewport preset.
  const [customWidth, setCustomWidth] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<StoreTheme>(initialTheme);
  const [history, setHistory] = useState<StoreTheme[]>([]);
  const [future, setFuture] = useState<StoreTheme[]>([]);

  // Fetch real products from the store for preview
  const [storeProducts, setStoreProducts] = useState<{ name: string; price: number; image?: string }[]>([]);
  const [tiendaSectionsEnabled, setTiendaSectionsEnabled] = useState<string[]>([]);
  const [tiendaSectionOrder, setTiendaSectionOrder] = useState<string[]>(TIENDA_SECTION_KEYS);
  const [sectionContentCounts, setSectionContentCounts] = useState<Record<string, number>>({});
  // Secciones custom (SectionRenderer) — ADR-301 Fase 4. Persisten en footerHtml
  // vía /api/store-page/sections (separado de storeTheme).
  const [customSections, setCustomSections] = useState<Section[]>([]);
  const customSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [livePreview, setLivePreview] = useState(true);
  const [splitPreview, setSplitPreview] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  // Lote H #6: modo navegación — preview totalmente interactivo (sin overlay de edición).
  const [navMode, setNavMode] = useState(false);
  const navModeRef = useRef(false);
  useEffect(() => { navModeRef.current = navMode; }, [navMode]);
  const [savedSnapshots, setSavedSnapshots] = useState<Array<{ theme: StoreTheme; savedAt: string; name?: string }>>([]);
  // Lote E: nombre para guardar una versión etiquetada del historial.
  const [versionName, setVersionName] = useState("");
  // Lote G: comparar 2 versiones del historial (índices seleccionados, máx 2).
  const [compareIdx, setCompareIdx] = useState<number[]>([]);
  const toggleCompare = useCallback((idx: number) => {
    setCompareIdx((prev) => prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx].slice(-2));
  }, []);
  const saveNamedVersion = useCallback(() => {
    const nm = versionName.trim();
    if (!nm) return;
    setSavedSnapshots((prev) => [
      { theme: draftRef.current, savedAt: new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }), name: nm },
      ...prev.slice(0, 9),
    ]);
    setVersionName("");
  }, [versionName]);
  // #10 Indicador de autoguardado: timestamp del último guardado + tick para "hace X".
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setNowTick((t) => t + 1), 15000); return () => clearInterval(id); }, []);
  const savedLabel = useMemo(() => {
    void nowTick; // recomputar en cada tick para el "hace X"
    if (savedAt == null) return null;
    const diff = Math.max(0, Math.floor((Date.now() - savedAt) / 1000));
    if (diff < 5) return "Guardado";
    if (diff < 60) return `Guardado hace ${diff}s`;
    return `Guardado hace ${Math.floor(diff / 60)} min`;
  }, [savedAt, nowTick]);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutoSavedRef = useRef<string>("");
  // Última firma "no-en-vivo" reflejada en el iframe (ver reloadSignature).
  const reloadSigRef = useRef<string>(reloadSignature(initialTheme));
  useEffect(() => {
    fetch(`/api/products?limit=4`)
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const items = Array.isArray(data?.products ?? data) ? (data?.products ?? data) : [];
        setStoreProducts(items.slice(0, 4).map((p: Record<string, unknown>) => ({
          name: (p.name as string) ?? "Producto",
          price: Number(p.retailPrice ?? p.price ?? 0),
          image: (p.image as string) ?? undefined,
        })));
      })
      .catch((e) => { console.warn("[creative-mode] fetch de productos para preview falló", e); });
    // Fetch tienda section config for preview
    fetch(`/api/settings`, { headers: { "x-tenant-id": tenantSlug } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const st = data?.storeTheme as Record<string, unknown> | undefined;
        const visible = Array.isArray(st?.tiendaSections) ? (st.tiendaSections as string[]) : [];
        setTiendaSectionsEnabled(visible);
        const order = Array.isArray(st?.tiendaSectionOrder) ? (st.tiendaSectionOrder as string[]) : [];
        if (order.length > 0) setTiendaSectionOrder(order);
        // Count products per section
        const content = (st?.sectionContent ?? {}) as Record<string, { productIds?: string[] }>;
        const counts: Record<string, number> = {};
        for (const [k, v] of Object.entries(content)) {
          counts[k] = Array.isArray(v?.productIds) ? v.productIds.length : 0;
        }
        setSectionContentCounts(counts);
      })
      .catch((e) => { console.warn("[creative-mode] operación en background falló", e); });
    // Cargar secciones custom (about/gallery/image-text…) — ADR-301 Fase 4.
    fetch(`/api/store-page/sections`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (Array.isArray(data?.sections)) setCustomSections(data.sections as Section[]);
      })
      .catch((e) => { console.warn("[creative-mode] fetch de secciones custom falló", e); });
  }, [tenantSlug]);

  // Guardar secciones custom (debounce 1.2s) → PUT /api/store-page/sections +
  // recarga el preview para reflejar (no hay live DOM-patch para estructura).
  const saveCustomSections = useCallback((next: Section[]) => {
    if (customSaveTimer.current) clearTimeout(customSaveTimer.current);
    customSaveTimer.current = setTimeout(() => {
      fetch("/api/store-page/sections", {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ sections: next }),
      })
        .then((r) => { if (r.ok) setIframeKey((k) => k + 1); })
        .catch((e) => { console.warn("[creative-mode] guardar secciones custom falló", e); });
    }, 1200);
  }, []);

  // Editar un campo de data de una sección custom (title/body/subtitle/eyebrow…).
  const patchCustomSection = useCallback((id: string, dataPatch: Record<string, unknown>) => {
    setCustomSections((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, data: { ...s.data, ...dataPatch } } : s)) as Section[];
      saveCustomSections(next);
      return next;
    });
  }, [saveCustomSections]);

  // ── #6 Gestión de secciones custom (crear / reordenar / borrar / visibilidad) ──
  const addCustomSection = useCallback((tpl: SectionTemplate) => {
    setCustomSections((prev) => {
      const created = tpl.create() as Omit<Section, "id" | "order">;
      const id = `sec-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
      const section = { ...created, id, order: prev.length } as Section;
      const next = [...prev, section];
      saveCustomSections(next);
      return next;
    });
  }, [saveCustomSections]);

  const removeCustomSection = useCallback((id: string) => {
    setCustomSections((prev) => {
      const next = prev.filter((s) => s.id !== id).map((s, i) => ({ ...s, order: i })) as Section[];
      saveCustomSections(next);
      return next;
    });
    setPbSelected((cur) => (cur === `custom:${id}` ? null : cur));
  }, [saveCustomSections]);

  const moveCustomSection = useCallback((id: string, dir: "up" | "down") => {
    setCustomSections((prev) => {
      const i = prev.findIndex((s) => s.id === id);
      const j = dir === "up" ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const arr = [...prev];
      [arr[i], arr[j]] = [arr[j], arr[i]];
      const next = arr.map((s, k) => ({ ...s, order: k })) as Section[];
      saveCustomSections(next);
      return next;
    });
  }, [saveCustomSections]);

  const setCustomSectionVisible = useCallback((id: string, visible: boolean) => {
    setCustomSections((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, visible } : s)) as Section[];
      saveCustomSections(next);
      return next;
    });
  }, [saveCustomSections]);

  // Duplicar una sección custom (#1): copia su data justo debajo del original.
  const duplicateCustomSection = useCallback((id: string) => {
    setCustomSections((prev) => {
      const i = prev.findIndex((s) => s.id === id);
      if (i < 0) return prev;
      const src = prev[i];
      const copyId = `sec-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
      const copy = { ...src, id: copyId, data: structuredClone(src.data) } as Section;
      const arr = [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)];
      const next = arr.map((s, k) => ({ ...s, order: k })) as Section[];
      saveCustomSections(next);
      return next;
    });
  }, [saveCustomSections]);

  const pushChange = useCallback((next: StoreTheme) => {
    setHistory((prev) => [...prev.slice(-30), draft]);
    setFuture([]);
    setDraft(next);
  }, [draft]);

  // #10 Exportar / Importar tema (JSON) — para clonar el look entre sucursales.
  const exportTheme = useCallback(() => {
    const payload = { __buleje_theme__: 1, theme: draftRef.current, customSections };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tema-${tenantSlug}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [customSections, tenantSlug]);

  const [importError, setImportError] = useState<string | null>(null);
  const importTheme = useCallback((file: File) => {
    setImportError(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as { __buleje_theme__?: number; theme?: Partial<StoreTheme>; customSections?: Section[] };
        if (!parsed?.theme || typeof parsed.theme !== "object") { setImportError("El archivo no es un tema válido de Buleje."); return; }
        pushChange({ ...draftRef.current, ...parsed.theme });
        if (Array.isArray(parsed.customSections)) {
          setCustomSections(parsed.customSections);
          saveCustomSections(parsed.customSections);
        }
      } catch {
        setImportError("No se pudo leer el archivo. ¿Es un .json exportado desde acá?");
      }
    };
    reader.readAsText(file);
  }, [pushChange, saveCustomSections]);

  const patch = useCallback(<K extends keyof StoreTheme>(key: K, value: StoreTheme[K]) => {
    pushChange({ ...draft, [key]: value });
  }, [draft, pushChange]);

  const patchSchedule = useCallback((day: keyof StoreTheme["schedules"], field: "open" | "close", value: string) => {
    pushChange({
      ...draft,
      schedules: {
        ...draft.schedules,
        [day]: {
          ...draft.schedules[day],
          [field]: value,
        },
      },
    });
  }, [draft, pushChange]);

  // Reorder REAL del cuerpo de la landing (Brandon 2026-06-26): mueve `fromKey`
  // a la posición de `toKey` en bodyOrder → persiste en /t (data-driven) + refleja
  // en el iframe en vivo (pb-reorder usa las mismas keys data-pb del storefront).
  const reorderBody = useCallback((fromKey: string, toKey: string) => {
    if (fromKey === toKey) return;
    const current = draft.bodyOrder?.length ? draft.bodyOrder : LANDING_BODY_DEFAULT;
    // base = orden actual saneado a las 4 keys válidas (+ faltantes al final).
    const base = current.filter((k) => LANDING_BODY_DEFAULT.includes(k));
    for (const k of LANDING_BODY_DEFAULT) if (!base.includes(k)) base.push(k);
    const from = base.indexOf(fromKey);
    const to = base.indexOf(toKey);
    if (from < 0 || to < 0) return;
    base.splice(from, 1);
    base.splice(to, 0, fromKey);
    patch("bodyOrder", base);
    const frame = document.querySelector<HTMLIFrameElement>('iframe[data-live-preview="1"]');
    try {
      frame?.contentWindow?.postMessage(
        { source: "buleje-editor", type: "pb-reorder", order: base },
        window.location.origin,
      );
    } catch { /* cross-origin guard */ }
  }, [draft.bodyOrder, patch]);

  // Mover ↑↓ desde la barra flotante del iframe (Fase 4): intercambia con el vecino.
  const moveBodySection = useCallback((key: string, dir: "up" | "down") => {
    const current = draft.bodyOrder?.length ? draft.bodyOrder : LANDING_BODY_DEFAULT;
    const base = current.filter((k) => LANDING_BODY_DEFAULT.includes(k));
    for (const k of LANDING_BODY_DEFAULT) if (!base.includes(k)) base.push(k);
    const i = base.indexOf(key);
    const j = dir === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= base.length) return;
    reorderBody(key, base[j]);
  }, [draft.bodyOrder, reorderBody]);

  // Highlight de sección en el iframe (Fase 3): panel hover → outline ámbar en el iframe.
  const sendHighlight = useCallback((key: SectionKey | null) => {
    const frame = document.querySelector<HTMLIFrameElement>('iframe[data-live-preview="1"]');
    try {
      frame?.contentWindow?.postMessage(
        { source: "buleje-editor", type: "pb-highlight", key: key ?? null },
        window.location.origin,
      );
    } catch { /* cross-origin guard */ }
  }, []);

  // Imagen por sección (Brandon 2026-06-25): setea/borra la imagen de una sección.
  const setSectionImage = useCallback((key: string, url: string) => {
    const next = { ...(draft.sectionImages ?? {}) };
    if (url) next[key] = url; else delete next[key];
    patch("sectionImages", next);
  }, [draft.sectionImages, patch]);

  // Estilo POR SECCIÓN desde el panel lateral (Brandon 2026-06-27): cambia fondo,
  // texto, espaciado, forma, borde y sombra SOLO de la sección seleccionada.
  // Persiste en sectionStyles[key] (lo lee /t en TenantSectionStyles) y lo aplica
  // EN VIVO en el iframe (pb-apply-section-style → StorefrontEditOverlay).
  const patchSectionStyle = useCallback((key: string, change: Partial<SectionStyle> | "reset" | { __replace: SectionStyle }) => {
    const cur = (draftRef.current.sectionStyles ?? {}) as Record<string, SectionStyle>;
    const nextForKey: SectionStyle = {};
    if (change !== "reset") {
      // `__replace` = preset de diseño (reemplaza todo); si no, merge sobre lo actual.
      const source: SectionStyle = "__replace" in change ? change.__replace : { ...(cur[key] ?? {}), ...change };
      // Saca claves vacías/undefined para no persistir basura.
      for (const [k, v] of Object.entries(source)) {
        if (v !== undefined && v !== null && v !== "") {
          (nextForKey as Record<string, unknown>)[k] = v;
        }
      }
    }
    patch("sectionStyles", { ...cur, [key]: nextForKey });
    const frame = document.querySelector<HTMLIFrameElement>('iframe[data-live-preview="1"]');
    try {
      frame?.contentWindow?.postMessage(
        { source: "buleje-editor", type: "pb-apply-section-style", key, style: nextForKey },
        window.location.origin,
      );
    } catch { /* cross-origin guard */ }
  }, [patch]);

  // Texto POR SECCIÓN desde el panel lateral (Brandon 2026-06-27): cambia la
  // etiqueta/título de la sección seleccionada. Persiste en sectionText[key] (lo
  // lee /t con fallback al texto por defecto) + lo refleja EN VIVO en el iframe.
  const patchSectionText = useCallback((key: string, field: "eyebrow" | "title" | "align", value: string) => {
    type ST = { eyebrow?: string; title?: string; align?: "left" | "center" | "right" };
    const cur = (draftRef.current.sectionText ?? {}) as Record<string, ST>;
    const entry: ST = { ...(cur[key] ?? {}) };
    if (field === "align") {
      if (value) entry.align = value as "left" | "center" | "right"; else delete entry.align;
    } else if (value) entry[field] = value; else delete entry[field];
    patch("sectionText", { ...cur, [key]: entry });
    const frame = document.querySelector<HTMLIFrameElement>('iframe[data-live-preview="1"]');
    try {
      frame?.contentWindow?.postMessage(
        { source: "buleje-editor", type: "pb-apply-section-text", key, field, value },
        window.location.origin,
      );
    } catch { /* cross-origin guard */ }
  }, [patch]);

  // Texto inline GENÉRICO (Brandon 2026-06-27): cualquier nodo data-live="inlineText:key"
  // editado con doble-click en el preview → persiste en inlineText[key]. El DOM ya quedó
  // editado por contentEditable, así que sólo persistimos (sin echo en vivo).
  const patchInlineText = useCallback((key: string, value: string) => {
    const cur = (draftRef.current.inlineText ?? {}) as Record<string, string>;
    const next = { ...cur };
    if (value) next[key] = value; else delete next[key];
    patch("inlineText", next);
  }, [patch]);

  // Estilo de TEXTO por nodo [data-live] (Brandon 2026-06-27): tamaño/peso/color/
  // alineación/itálica/mayúsculas de cualquier texto editable. Persiste en
  // textStyles[field] (lo lee TenantTextStyles) + lo aplica EN VIVO en el iframe.
  const patchTextStyle = useCallback((field: string, partial: Record<string, unknown>) => {
    type TS = { size?: number; bold?: boolean; color?: string; align?: "left" | "center" | "right"; italic?: boolean; underline?: boolean; upper?: boolean; track?: number; tshadow?: boolean };
    const cur = (draftRef.current.textStyles ?? {}) as Record<string, TS>;
    const merged: TS = { ...(cur[field] ?? {}), ...partial };
    const clean: TS = {};
    for (const [k, v] of Object.entries(merged)) {
      if (v !== undefined && v !== null && v !== "") (clean as Record<string, unknown>)[k] = v;
    }
    patch("textStyles", { ...cur, [field]: clean });
    const frame = document.querySelector<HTMLIFrameElement>('iframe[data-live-preview="1"]');
    try {
      frame?.contentWindow?.postMessage(
        { source: "buleje-editor", type: "pb-apply-text-style", field, textStyle: clean },
        window.location.origin,
      );
    } catch { /* cross-origin guard */ }
  }, [patch]);

  // Mostrar/ocultar una sección del cuerpo (Brandon 2026-06-27 · #1): agrega/quita
  // la key de bodyHidden. En el preview la atenúa (pb-toggle-section); en /t real
  // no se renderiza. Persiste vía auto-save.
  const patchBodyHidden = useCallback((key: string, hidden: boolean) => {
    const cur = (draftRef.current.bodyHidden ?? []) as string[];
    const next = hidden ? Array.from(new Set([...cur, key])) : cur.filter((k) => k !== key);
    patch("bodyHidden", next);
    const frame = document.querySelector<HTMLIFrameElement>('iframe[data-live-preview="1"]');
    try {
      frame?.contentWindow?.postMessage(
        { source: "buleje-editor", type: "pb-toggle-section", key, hidden },
        window.location.origin,
      );
    } catch { /* cross-origin guard */ }
  }, [patch]);

  // Diseño de TARJETAS de producto (Brandon 2026-06-27): fondo/forma/borde/sombra
  // + color de nombre y precio. Aplica a todas las tarjetas (data-pb-card).
  const patchCardDesign = useCallback((change: Partial<StoreTheme["cardDesign"]> | "reset") => {
    const cur = (draftRef.current.cardDesign ?? {}) as StoreTheme["cardDesign"];
    const nextRaw = change === "reset" ? {} : { ...cur, ...change };
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(nextRaw)) {
      if (v !== undefined && v !== null && v !== "") next[k] = v;
    }
    patch("cardDesign", next as StoreTheme["cardDesign"]);
    const frame = document.querySelector<HTMLIFrameElement>('iframe[data-live-preview="1"]');
    try {
      frame?.contentWindow?.postMessage(
        { source: "buleje-editor", type: "pb-apply-card-style", cardStyle: next },
        window.location.origin,
      );
    } catch { /* cross-origin guard */ }
  }, [patch]);

  // Testimonios (Brandon 2026-06-26): alta/edición/baja del array de reseñas.
  const addTestimonial = useCallback(() => {
    patch("testimonials", [...(draft.testimonials ?? []), { name: "", stars: 5, comment: "" }]);
  }, [draft.testimonials, patch]);
  const updateTestimonial = useCallback((idx: number, field: "name" | "stars" | "comment", value: string | number) => {
    const next = [...(draft.testimonials ?? [])];
    next[idx] = { ...next[idx], [field]: value };
    patch("testimonials", next);
  }, [draft.testimonials, patch]);
  const removeTestimonial = useCallback((idx: number) => {
    patch("testimonials", (draft.testimonials ?? []).filter((_, i) => i !== idx));
  }, [draft.testimonials, patch]);

  const toggleTiendaSection = useCallback((key: string) => {
    setTiendaSectionsEnabled((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      // Auto-save tienda section changes to backend
      fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-tenant-id": tenantSlug },
        body: JSON.stringify({ storeTheme: { tiendaSections: next } }),
      }).catch((e) => { console.warn("[creative-mode] operación en background falló", e); });
      return next;
    });
  }, [tenantSlug]);

  const moveTiendaSection = useCallback((key: string, direction: "up" | "down") => {
    setTiendaSectionOrder((prev) => {
      const idx = prev.indexOf(key);
      if (idx < 0) return prev;
      const newIdx = direction === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      // Auto-save order
      fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-tenant-id": tenantSlug },
        body: JSON.stringify({ storeTheme: { tiendaSectionOrder: next } }),
      }).catch((e) => { console.warn("[creative-mode] operación en background falló", e); });
      return next;
    });
  }, [tenantSlug]);

  // Auto-save draft theme after 2s of idle changes
  useEffect(() => {
    const draftJson = JSON.stringify(draft);
    if (draftJson === JSON.stringify(initialTheme) || draftJson === lastAutoSavedRef.current) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      lastAutoSavedRef.current = draftJson;
      onApplyTheme(draft)
        .then(() => {
          setSavedAt(Date.now());
          // Recargar SOLO si cambió algo que el preview en vivo no cubre (imagen,
          // logo, secciones…). Color/fuente/dark/texto del hero ya están en vivo →
          // sin recarga = sin flash al escribir.
          const sig = reloadSignature(draft);
          if (sig !== reloadSigRef.current) {
            reloadSigRef.current = sig;
            setIframeKey((k) => k + 1);
          }
        })
        .catch((e) => { console.warn("[creative-mode] operación en background falló", e); });
    }, 2000);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [draft, initialTheme, onApplyTheme]);

  // ── Preview EN VIVO (Brandon 2026-06-08) ──────────────────────────────────
  // Empuja color/redondez al iframe (mismo origen) por postMessage → la tienda
  // cambia AL INSTANTE sin recargar. El auto-save (2s) persiste y recarga para
  // que el texto/secciones también se reflejen; los colores ya coinciden.
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const postLiveTheme = useCallback((theme: StoreTheme) => {
    const frame = document.querySelector<HTMLIFrameElement>('iframe[data-live-preview="1"]');
    const win = frame?.contentWindow;
    if (!win) return;
    const font = EDITOR_FONT_MAP[theme.fontFamily];
    // Par de fuentes (Lote A): título = font, cuerpo = bodyFont (o título si vacío).
    const bodyFont = theme.bodyFontFamily ? EDITOR_FONT_MAP[theme.bodyFontFamily] : undefined;
    const bodyStack = bodyFont?.stack ?? font?.stack;
    const vars: Record<string, string> = {
      "--tenant-primary": theme.primaryColor,
      "--tenant-secondary": theme.secondaryColor,
      "--tenant-accent": theme.accentColor,
      "--tenant-radius": `${theme.borderRadius}px`,
      ...(bodyStack ? { "--tenant-font": bodyStack } : {}),
      ...(font ? { "--font-display-family": font.stack } : {}),
      ...(EDITOR_BTN_RADIUS[theme.buttonStyle] ? { "--tenant-btn-radius": EDITOR_BTN_RADIUS[theme.buttonStyle] } : {}),
    };
    // Brandon 2026-06-25: además de las CSS vars, mandamos modo oscuro + textos
    // del hero/identidad → el receptor (PreviewLiveTheme) los refleja AL INSTANTE
    // (antes solo color/fuente eran en vivo; el texto/dark esperaban el reload 2s).
    const text: Record<string, string> = {
      heroTitle: theme.heroTitle ?? "",
      heroSubtitle: theme.heroSubtitle ?? "",
      heroCTA: theme.heroCTA ?? "",
      heroBadge: theme.heroBadge ?? "",
      storeName: theme.storeName ?? "",
      slogan: theme.slogan ?? "",
    };
    try {
      win.postMessage(
        {
          source: "buleje-editor",
          type: "live-theme",
          vars,
          fontLabel: font?.label ?? null,
          bodyFontLabel: bodyFont?.label ?? null,
          darkMode: theme.darkModeDefault,
          text,
        },
        window.location.origin,
      );
    } catch {
      /* no-op */
    }
  }, []);

  // Cada cambio del draft (debounce corto) → refleja color/redondez al instante.
  useEffect(() => {
    const t = setTimeout(() => postLiveTheme(draft), 80);
    return () => clearTimeout(t);
  }, [draft, postLiveTheme]);

  // Lote H #6: avisar al overlay del iframe el modo edición/navegación.
  useEffect(() => {
    const frame = document.querySelector<HTMLIFrameElement>('iframe[data-live-preview="1"]');
    try {
      frame?.contentWindow?.postMessage({ source: "buleje-editor", type: "pb-set-mode", mode: navMode ? "nav" : "edit" }, window.location.origin);
    } catch { /* cross-origin guard */ }
  }, [navMode, iframeKey]);

  // Cuando el preview (re)carga avisa "ready" → reenviar el tema actual.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const d = e.data as {
        source?: string;
        type?: string;
        key?: string;
        field?: string;
        value?: string;
        dir?: "up" | "down";
        color?: string;
        fromKey?: string;
        toKey?: string;
        style?: {
          size?: number; bold?: boolean; color?: string; align?: "left" | "center" | "right";
          italic?: boolean; underline?: boolean; upper?: boolean; track?: number; tshadow?: boolean;
          bg?: string; text?: string; pad?: "sm" | "md" | "lg";
          radius?: number; border?: string; borderW?: number; shadow?: "none" | "soft" | "deep";
        };
      } | null;
      if (d?.source !== "buleje-preview") return;
      if (d.type === "ready") {
        postLiveTheme(draftRef.current);
        // Reenviar el modo navegación tras recargar el iframe.
        try {
          (e.source as Window | null)?.postMessage({ source: "buleje-editor", type: "pb-set-mode", mode: navModeRef.current ? "nav" : "edit" }, window.location.origin);
        } catch { /* no-op */ }
        return;
      }
      // Fase 1: click en un bloque del preview → abrir su panel + resaltar.
      if (d.type === "pb-select" && d.key && PB_KEY_TO_PANEL[d.key]) {
        setPanel(PB_KEY_TO_PANEL[d.key]);
        setPbSelected(d.key);
        return;
      }
      // Fase 4: click en una sección custom (custom:<id>) → editor de sección custom.
      if (d.type === "pb-select" && d.key && d.key.startsWith("custom:")) {
        setPbSelected(d.key);
        return;
      }
      // Click en una tarjeta de producto → editor de diseño de tarjetas.
      if (d.type === "pb-select" && d.key === "cards") {
        setPbSelected("cards");
        return;
      }
      // Fase 4 (barra flotante): mover ↑↓ una sección del cuerpo.
      if (d.type === "pb-move" && d.key && (d.dir === "up" || d.dir === "down")) {
        moveBodySection(d.key, d.dir);
        return;
      }
      // Fase 4 (drag en canvas): soltar una sección sobre otra → reordena.
      if (d.type === "pb-drop" && d.fromKey && d.toKey) {
        reorderBody(d.fromKey, d.toKey);
        return;
      }
      // Fase 4 (barra de texto): estilo por campo → guarda en textStyles[field].
      if (d.type === "pb-text-style" && d.field && d.style && typeof d.style === "object") {
        const cur = draftRef.current.textStyles ?? {};
        patch("textStyles", { ...cur, [d.field]: d.style });
        return;
      }
      // Estilo POR SECCIÓN (editar componente individual) → sectionStyles[key].
      if (d.type === "pb-section-style" && d.key && d.style && typeof d.style === "object") {
        const cur = draftRef.current.sectionStyles ?? {};
        const { bg, text, pad, radius, border, borderW, shadow } = d.style;
        patch("sectionStyles", { ...cur, [d.key]: { bg, text, pad, radius, border, borderW, shadow } });
        return;
      }
      // Fase 4 (pintar): color inline → setea el color primario de la marca + live.
      if (d.type === "pb-color" && typeof d.color === "string" && /^#[0-9a-fA-F]{6}$/.test(d.color)) {
        patch("primaryColor", d.color);
        return;
      }
      // Fase 4 (imagen): click 🖼 → abre el panel con el subidor de esa sección.
      if (d.type === "pb-image" && d.key) {
        setPanel(d.key === "hero" ? "hero" : "secciones");
        setPbSelected(d.key);
        return;
      }
      // Fase 3: edición inline de texto en el iframe → patch en el draft.
      if (d.type === "pb-inline-edit" && d.field && typeof d.value === "string") {
        // Texto POR SECCIÓN editado inline (data-live="sectionText:key:field").
        if (d.field.startsWith("sectionText:")) {
          const [, secKey, sub] = d.field.split(":");
          if (secKey && (sub === "eyebrow" || sub === "title")) {
            patchSectionText(secKey, sub, d.value);
          }
          return;
        }
        // Texto inline genérico (data-live="inlineText:key") — botones, CTAs, etc.
        if (d.field.startsWith("inlineText:")) {
          const key = d.field.slice("inlineText:".length);
          if (key) patchInlineText(key, d.value);
          return;
        }
        // Texto de sección custom (data-live="customText:<id>:<campo>") — ADR-301 Fase 4.
        if (d.field.startsWith("customText:")) {
          const [, id, sub] = d.field.split(":");
          if (id && sub) patchCustomSection(id, { [sub]: d.value });
          return;
        }
        const INLINE_FIELDS = [
          "heroTitle", "heroSubtitle", "heroCTA", "heroBadge",
          "storeName", "slogan", "footerText",
          "welcomePopupTitle", "welcomePopupMessage",
        ] as const;
        type InlineField = typeof INLINE_FIELDS[number];
        if ((INLINE_FIELDS as readonly string[]).includes(d.field)) {
          patch(d.field as InlineField, d.value);
        }
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [postLiveTheme, patch, moveBodySection, reorderBody, patchSectionText, patchInlineText, patchCustomSection]);

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setFuture((f) => [draft, ...f.slice(0, 30)]);
    setDraft(prev);
  }, [history, draft]);

  const handleRedo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    setFuture((f) => f.slice(1));
    setHistory((h) => [...h.slice(-30), draft]);
    setDraft(next);
  }, [future, draft]);

  const applyTemplate = useCallback((tpl: typeof QUICK_TEMPLATES[number]) => {
    pushChange({
      ...draft,
      primaryColor: tpl.primaryColor,
      secondaryColor: tpl.secondaryColor,
      accentColor: tpl.accentColor,
      fontFamily: tpl.fontFamily,
      darkModeDefault: tpl.darkModeDefault,
      borderRadius: tpl.borderRadius,
      buttonStyle: tpl.buttonStyle,
    });
  }, [draft, pushChange]);

  // Plantilla por rubro: además del look, aplica el copy del hero (Brandon 2026-06-26).
  const applyRubroTemplate = useCallback((tpl: RubroTemplate) => {
    pushChange({
      ...draft,
      primaryColor: tpl.primaryColor,
      secondaryColor: tpl.secondaryColor,
      accentColor: tpl.accentColor,
      fontFamily: tpl.fontFamily,
      darkModeDefault: tpl.darkModeDefault,
      borderRadius: tpl.borderRadius,
      buttonStyle: tpl.buttonStyle,
      heroTitle: tpl.heroTitle,
      heroSubtitle: tpl.heroSubtitle,
      slogan: tpl.slogan,
    });
  }, [draft, pushChange]);

  // Plantilla de PÁGINA COMPLETA (Brandon 2026-06-27): tema + orden + estilos por
  // sección en un solo pushChange, y reflejo en vivo (colores via postLiveTheme;
  // estilos por sección + orden via postMessage).
  const applyPageTemplate = useCallback((tpl: PageTemplate) => {
    pushChange({
      ...draft,
      ...tpl.theme,
      bodyOrder: tpl.bodyOrder,
      sectionStyles: { ...tpl.sectionStyles } as StoreTheme["sectionStyles"],
      bodyHidden: [],
    });
    const frame = document.querySelector<HTMLIFrameElement>('iframe[data-live-preview="1"]');
    try {
      for (const [key, style] of Object.entries(tpl.sectionStyles)) {
        frame?.contentWindow?.postMessage({ source: "buleje-editor", type: "pb-apply-section-style", key, style }, window.location.origin);
      }
      frame?.contentWindow?.postMessage({ source: "buleje-editor", type: "pb-reorder", order: tpl.bodyOrder }, window.location.origin);
    } catch { /* cross-origin guard */ }
  }, [draft, pushChange]);

  // ── Tema con IA (Brandon 2026-06-26) ──────────────────────────────────────
  // El dueño describe su negocio → POST a /api/admin/store-customizer/ai-theme →
  // aplica colores + fuente + estilo + copy del hero en un solo pushChange.
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const generateAiTheme = useCallback(async () => {
    const description = aiPrompt.trim();
    if (description.length < 4 || aiLoading) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch("/api/admin/store-customizer/ai-theme", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json", "x-tenant-id": tenantSlug }),
        body: JSON.stringify({ description, storeName: draft.storeName }),
      });
      const data = await res.json().catch((err) => { console.warn("[creative-mode] ai-theme respuesta no-JSON", err); return null; });
      if (!res.ok || !data?.theme) {
        setAiError(data?.error ?? "No se pudo generar el tema. Probá de nuevo.");
        return;
      }
      const t = data.theme as Partial<StoreTheme>;
      pushChange({
        ...draft,
        primaryColor: t.primaryColor ?? draft.primaryColor,
        secondaryColor: t.secondaryColor ?? draft.secondaryColor,
        accentColor: t.accentColor ?? draft.accentColor,
        fontFamily: t.fontFamily ?? draft.fontFamily,
        darkModeDefault: t.darkModeDefault ?? draft.darkModeDefault,
        borderRadius: t.borderRadius ?? draft.borderRadius,
        buttonStyle: t.buttonStyle ?? draft.buttonStyle,
        heroTitle: t.heroTitle ?? draft.heroTitle,
        heroSubtitle: t.heroSubtitle ?? draft.heroSubtitle,
        slogan: t.slogan ?? draft.slogan,
      });
    } catch (err) {
      setAiError("Falló la conexión con la IA. Revisá tu internet e intentá de nuevo.");
      console.warn("[creative-mode] generateAiTheme falló", err);
    } finally {
      setAiLoading(false);
    }
  }, [aiPrompt, aiLoading, draft, pushChange, tenantSlug]);

  // Aplica una paleta armónica (3 colores) de un click (Brandon 2026-06-25).
  const applyPalette = useCallback((p: { primary: string; secondary: string; accent: string }) => {
    pushChange({ ...draft, primaryColor: p.primary, secondaryColor: p.secondary, accentColor: p.accent });
  }, [draft, pushChange]);

  // Carga las Google Fonts del editor para que el selector de tipografía muestre
  // cada fuente en su PROPIO tipo (Brandon 2026-06-25). Geist/sistema no van.
  useEffect(() => {
    const families = Object.values(EDITOR_FONT_MAP)
      .map((f) => f.label)
      .filter((l): l is string => !!l && l !== "Geist");
    if (families.length === 0) return;
    const href =
      "https://fonts.googleapis.com/css2?" +
      families.map((fam) => `family=${encodeURIComponent(fam).replace(/%20/g, "+")}:wght@400;600;700;800`).join("&") +
      "&display=swap";
    let link = document.getElementById("creative-editor-fonts") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = "creative-editor-fonts";
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    if (link.href !== href) link.href = href;
  }, []);

  const handleApply = useCallback(async () => {
    setSaving(true);
    try {
      await onApplyTheme(draft);
      lastAutoSavedRef.current = JSON.stringify(draft);
      setSavedAt(Date.now());
      setIframeKey((k) => k + 1);
      setSavedSnapshots((prev) => [
        { theme: draft, savedAt: new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }) },
        ...prev.slice(0, 4),
      ]);
    } finally {
      setSaving(false);
    }
  }, [draft, onApplyTheme]);

  // #17 Onboarding guiado (Lote K). Auto en el 1er uso (localStorage), reabrible.
  const [tourStep, setTourStep] = useState<number | null>(null);
  useEffect(() => {
    try {
      if (localStorage.getItem(`creative-tour-done-${tenantSlug}`) !== "1") {
        const t = setTimeout(() => setTourStep(0), 1200);
        return () => clearTimeout(t);
      }
    } catch { /* private browsing */ }
  }, [tenantSlug]);
  const closeTour = useCallback(() => {
    setTourStep(null);
    try { localStorage.setItem(`creative-tour-done-${tenantSlug}`, "1"); } catch { /* ignore */ }
  }, [tenantSlug]);
  const goTourStep = useCallback((i: number) => {
    if (i < 0 || i >= TOUR_STEPS.length) { closeTour(); return; }
    setTourStep(i);
    setPanel(TOUR_STEPS[i].panel);
    setPbSelected(null);
  }, [closeTour]);

  // #16 Atajos de teclado (Lote H, Brandon 2026-06-27). Capture + stopImmediate
  // para preempt el shell admin (que usa teclas sueltas para navegar tabs).
  const [showShortcuts, setShowShortcuts] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      const typing = !!tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.tagName === "SELECT" || tgt.isContentEditable);
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      const take = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      // Con modificador (Ctrl/⌘): guardar, deshacer/rehacer, preview, ir a panel.
      if (mod && k === "s") { take(); handleApply(); return; }
      if (mod && k === "z" && !e.shiftKey) { take(); handleUndo(); return; }
      if (mod && (k === "y" || (k === "z" && e.shiftKey))) { take(); handleRedo(); return; }
      if (mod && k === "p") { take(); window.open(`/t/${tenantSlug}?preview=true`, "_blank", "noopener"); return; }
      if (mod && /^[1-9]$/.test(e.key)) { take(); const id = PANEL_ORDER[Number(e.key) - 1]; if (id) { setPanel(id); setPbSelected(null); } return; }
      if (typing || mod) return; // teclas sueltas: no en inputs ni con otro modificador
      if (e.key === "Escape") { take(); setShowShortcuts(false); setPbSelected(null); return; }
      if (e.key === "?") { take(); setShowShortcuts((s) => !s); return; }
      if (k === "d") { take(); setViewport("desktop"); setCustomWidth(null); return; }
      if (k === "t") { take(); setViewport("tablet"); setCustomWidth(null); return; }
      if (k === "m") { take(); setViewport("mobile"); setCustomWidth(null); return; }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [handleApply, handleUndo, handleRedo, tenantSlug]);


  const fontFamily = useMemo(() => {
    const found = FONT_OPTIONS.find((f) => f.value === draft.fontFamily)?.value ?? "sistema";
    const map: Record<string, string> = {
      sistema: "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
      geist: "Geist, ui-sans-serif, sans-serif",
      inter: "Inter, ui-sans-serif, sans-serif",
      poppins: "Poppins, ui-sans-serif, sans-serif",
      montserrat: "Montserrat, ui-sans-serif, sans-serif",
      raleway: "Raleway, ui-sans-serif, sans-serif",
      nunito: "Nunito, ui-sans-serif, sans-serif",
      lato: "Lato, ui-sans-serif, sans-serif",
      roboto: "Roboto, ui-sans-serif, sans-serif",
      opensans: "Open Sans, ui-sans-serif, sans-serif",
    };
    return map[found] ?? map.sistema;
  }, [draft.fontFamily]);

  const panelItems: Array<{ id: CreativePanel; label: string; icon: typeof Palette }> = [
    { id: "plantillas", label: "Plantillas", icon: WandSparkles },
    { id: "identidad", label: "Identidad", icon: Store },
    { id: "hero", label: "Hero", icon: ImageIcon },
    { id: "colores", label: "Colores", icon: Palette },
    { id: "secciones", label: "Secciones", icon: Layout },
    { id: "tipografia", label: "Tipografia", icon: Type },
    { id: "estilos", label: "Estilos UI", icon: SlidersHorizontal },
    { id: "contacto", label: "Contacto y horario", icon: Phone },
    { id: "automatizacion", label: "Automatizacion", icon: Bot },
    { id: "avanzado", label: "Avanzado", icon: Code2 },
    { id: "historial", label: "Historial", icon: Clock },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#0c0d10] text-gray-200">
      {/* #17 Onboarding guiado (Lote K) — tarjeta de pasos, abajo a la derecha */}
      {tourStep !== null && TOUR_STEPS[tourStep] && (
        <div className="fixed bottom-5 right-5 z-[115] w-full max-w-xs rounded-2xl border border-[var(--accent-soft)]/40 bg-[#16181d] p-4 shadow-2xl">
          <div className="mb-1 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent-soft)]"><Sparkles className="h-3.5 w-3.5" /> Tour · {tourStep + 1}/{TOUR_STEPS.length}</span>
            <button type="button" onClick={closeTour} aria-label="Saltar tour" className="rounded-md p-1 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
          </div>
          <p className="text-sm font-bold text-white">{TOUR_STEPS[tourStep].title}</p>
          <p className="mt-1 text-[length:var(--ts-2xs)] leading-snug text-gray-300">{TOUR_STEPS[tourStep].desc}</p>
          {/* Progress */}
          <div className="mt-3 flex gap-1">
            {TOUR_STEPS.map((_, i) => (
              <span key={i} className={cn("h-1 flex-1 rounded-full", i <= tourStep ? "bg-[var(--accent-soft)]" : "bg-white/15")} />
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <button type="button" onClick={closeTour} className="text-[length:var(--ts-2xs)] font-semibold text-gray-400 transition-colors hover:text-white">Saltar</button>
            <div className="flex items-center gap-1.5">
              {tourStep > 0 && (
                <button type="button" onClick={() => goTourStep(tourStep - 1)} className="rounded-lg border border-white/10 px-3 py-1.5 text-[length:var(--ts-2xs)] font-bold text-gray-200 transition-colors hover:bg-white/5">Anterior</button>
              )}
              <button type="button" onClick={() => goTourStep(tourStep + 1)} className="rounded-lg bg-[var(--accent-soft)] px-3 py-1.5 text-[length:var(--ts-2xs)] font-bold text-white transition-opacity hover:opacity-90">
                {tourStep === TOUR_STEPS.length - 1 ? "Terminar" : "Siguiente"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* #16 Modal de atajos de teclado (Lote H) */}
      {showShortcuts && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <button type="button" aria-label="Cerrar" onClick={() => setShowShortcuts(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div role="dialog" aria-modal="true" aria-label="Atajos de teclado" className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-[#16181d] p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="inline-flex items-center gap-2 text-sm font-bold text-white"><Keyboard className="h-4 w-4" /> Atajos de teclado</p>
              <button type="button" onClick={() => setShowShortcuts(false)} aria-label="Cerrar" className="rounded-md p-1 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            <ul className="space-y-1.5">
              {([
                ["Ctrl/⌘ + S", "Aplicar y guardar"],
                ["Ctrl/⌘ + Z", "Deshacer"],
                ["Ctrl/⌘ + Y", "Rehacer"],
                ["Ctrl/⌘ + P", "Vista previa en nueva pestaña"],
                ["Ctrl/⌘ + 1…9", "Ir a un panel del sidebar"],
                ["D / T / M", "Escritorio / Tablet / Móvil"],
                ["Escape", "Cerrar panel / volver"],
                ["?", "Mostrar estos atajos"],
              ] as const).map(([keys, desc]) => (
                <li key={keys} className="flex items-center justify-between gap-3 text-[length:var(--ts-2xs)]">
                  <span className="text-gray-300">{desc}</span>
                  <kbd className="shrink-0 rounded-md border border-white/15 bg-white/[0.06] px-2 py-0.5 font-mono font-bold text-gray-100">{keys}</kbd>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {/* Header reorganizado: branding | viewport (center) | actions (right).
       * Cada grupo separado por hairline. Active states más obvios. */}
      <header className="grid grid-cols-3 items-center h-14 px-4 bg-[#0c0d10]/80 border-b border-white/5 shrink-0 backdrop-blur-xl">
        {/* LEFT — branding + exit */}
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 h-9 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800 transition-colors text-sm font-semibold"
          >
            <X className="h-4 w-4" />
            Salir
          </button>
          <div className="h-5 w-px bg-gray-700" />
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-[var(--data-success-500)]/15 flex items-center justify-center">
              <WandSparkles className="h-4 w-4 text-[var(--data-success-500)]" />
            </div>
            <div className="leading-tight">
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--data-success-500)]">Modo Creativo</p>
              <p className="text-xs font-semibold text-white truncate max-w-[200px]">{draft.storeName || tenantSlug}</p>
            </div>
          </div>
        </div>

        {/* CENTER — viewport switcher */}
        <div className="flex items-center justify-center">
          <div className="inline-flex items-center gap-0.5 bg-white/[0.04] rounded-lg p-0.5 border border-white/5">
            {VIEWPORTS.map((vp) => {
              const active = viewport === vp.id && customWidth === null;
              return (
                <button
                  key={vp.id}
                  onClick={() => { setViewport(vp.id); setCustomWidth(null); }}
                  title={vp.label}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-bold transition-all",
                    active
                      ? "bg-white/10 text-white"
                      : "text-gray-400 hover:text-white hover:bg-white/[0.04]",
                  )}
                >
                  <vp.icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{vp.label}</span>
                </button>
              );
            })}
            {/* #11 Ancho personalizado en px */}
            <label className={cn("inline-flex items-center gap-1 rounded-lg pl-2 pr-1 h-8 transition-all", customWidth !== null ? "bg-white/10" : "")} title="Ancho personalizado (px)">
              <Maximize2 className="h-3.5 w-3.5 text-gray-400" aria-hidden />
              <input
                type="number"
                min={280}
                max={1920}
                placeholder="px"
                value={customWidth ?? ""}
                onChange={(e) => { const n = Number(e.target.value); setCustomWidth(e.target.value === "" || Number.isNaN(n) ? null : Math.min(1920, Math.max(280, n))); }}
                aria-label="Ancho personalizado en píxeles"
                className="w-12 bg-transparent text-xs font-bold text-white outline-none placeholder:text-gray-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
            </label>
          </div>
        </div>

        {/* RIGHT — actions */}
        <div className="flex items-center justify-end gap-1.5">
          {/* Undo / Redo */}
          <div className="flex items-center gap-0.5 bg-white/[0.03] rounded-lg p-0.5 border border-white/5">
            <button
              onClick={handleUndo}
              disabled={history.length === 0}
              className="p-1.5 rounded-md text-gray-300 hover:text-white hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
              title={`Deshacer (${history.length} pasos)`}
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              onClick={handleRedo}
              disabled={future.length === 0}
              className="p-1.5 rounded-md text-gray-300 hover:text-white hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
              title={`Rehacer (${future.length} pasos)`}
            >
              <Redo2 className="h-4 w-4" />
            </button>
          </div>

          {/* Preview controls */}
          <div className="flex items-center gap-0.5 bg-white/[0.03] rounded-lg p-0.5 border border-white/5">
            <button
              onClick={() => setLivePreview((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 h-7 rounded-md text-xs font-bold transition-all",
                livePreview
                  ? "bg-[var(--data-success-500)]/15 text-[var(--data-success-500)]"
                  : "text-gray-300 hover:text-white hover:bg-gray-700",
              )}
              title={livePreview ? "Volver al mockup estático" : "Activar preview en vivo"}
            >
              <Monitor className="h-3.5 w-3.5" />
              {livePreview ? "En vivo" : "Preview"}
            </button>
            {livePreview && (
              <>
                <button
                  onClick={() => setIframeKey((k) => k + 1)}
                  className="p-1.5 rounded-md text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
                  title="Recargar vista previa"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setSplitPreview((v) => !v)}
                  className={cn(
                    "p-1.5 rounded-md transition-colors",
                    splitPreview ? "bg-gray-700 text-white" : "text-gray-300 hover:text-white hover:bg-gray-700",
                  )}
                  title={splitPreview ? "Vista simple" : "Comparar antes/después"}
                >
                  <Columns2 className="h-3.5 w-3.5" />
                </button>
                {/* Lote H #6: modo navegación (preview interactivo) */}
                <button
                  onClick={() => setNavMode((v) => !v)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md text-xs font-bold transition-colors",
                    navMode ? "bg-[var(--accent-soft)]/20 text-[var(--accent-soft)]" : "text-gray-300 hover:text-white hover:bg-gray-700",
                  )}
                  title={navMode ? "Volver a editar (click selecciona)" : "Probar la tienda: scroll y clicks reales"}
                >
                  <MousePointer className="h-3.5 w-3.5" />
                  {navMode ? "Navegando" : "Navegar"}
                </button>
              </>
            )}
          </div>

          {/* #10 Indicador de autoguardado */}
          {savedLabel && (
            <span data-testid="autosave-indicator" className="hidden items-center gap-1 px-2 text-[length:var(--ts-2xs)] font-semibold text-[var(--data-success-500)] lg:inline-flex" title="Tus cambios se guardan solos">
              <Check className="h-3.5 w-3.5" />
              {savedLabel}
            </span>
          )}

          {/* #17 Tour guiado */}
          <button
            type="button"
            onClick={() => goTourStep(0)}
            className="hidden p-1.5 rounded-md text-gray-300 hover:text-white hover:bg-gray-700 transition-colors lg:inline-flex"
            title="Tour guiado"
            aria-label="Iniciar tour guiado"
          >
            <Sparkles className="h-3.5 w-3.5" />
          </button>
          {/* #16 Atajos de teclado */}
          <button
            type="button"
            onClick={() => setShowShortcuts(true)}
            className="p-1.5 rounded-md text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
            title="Atajos de teclado (?)"
            aria-label="Ver atajos de teclado"
          >
            <Keyboard className="h-3.5 w-3.5" />
          </button>

          <a
            href={`/t/${tenantSlug}?preview=true`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800 transition-colors text-xs font-semibold"
            title="Abrir tienda en nueva pestaña"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">Ver tienda</span>
          </a>

          {/* Save — botón hero */}
          <button
            onClick={handleApply}
            disabled={saving}
            className="ml-1 flex items-center gap-2 px-4 h-9 rounded-lg bg-[var(--data-success-500)] text-white text-sm font-bold hover:bg-[var(--data-success-500)]/90 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {saving ? <Sparkles className="h-4 w-4 animate-pulse" /> : <Save className="h-4 w-4" />}
            {saving ? "Aplicando..." : "Aplicar y guardar"}
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Rail de navegación — solo la lista de secciones (delgado). */}
        <aside className="w-56 bg-[#0e0f13] border-r border-white/5 overflow-y-auto shrink-0">
          <nav className="p-3 space-y-1">
            <p className="px-2 pb-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-gray-500">Configuración</p>
            {panelItems.map((item) => {
              const active = panel === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => { setPanel(item.id); setPbSelected(null); }}
                  className={cn(
                    "relative w-full flex items-center gap-3 pl-3.5 pr-2.5 h-10 rounded-lg text-sm transition-colors text-left",
                    // Activo minimalista: barra fina + texto blanco, sin caja.
                    active
                      ? "font-semibold text-white before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-[3px] before:rounded-full before:bg-[var(--data-success-500)]"
                      : "font-medium text-gray-400 hover:text-white hover:bg-white/[0.03]",
                  )}
                >
                  <item.icon
                    className={cn(
                      "h-4 w-4 shrink-0 transition-colors",
                      active ? "text-[var(--data-success-500)]" : "text-gray-500",
                    )}
                  />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Panel LATERAL de opciones de la sección activa — abre al lado del rail,
            no debajo (Brandon 2026-06-08). */}
        <aside className="w-80 bg-[#0c0d10] border-r border-white/5 overflow-y-auto shrink-0">
          <div className="sticky top-0 z-10 border-b border-white/5 bg-[#0c0d10]/90 px-4 py-3 backdrop-blur">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-gray-500">Personalizar</p>
            <p className="text-sm font-semibold text-white">{panelItems.find((p) => p.id === panel)?.label ?? "Sección"}</p>
          </div>
          <div className="p-4 space-y-3">
            {pbSelected === "cards" ? (
              <CardDesignEditor
                value={(draft.cardDesign ?? {}) as { bg?: string; radius?: number; border?: string; borderW?: number; shadow?: "none" | "soft" | "deep"; nameColor?: string; priceColor?: string }}
                onChange={patchCardDesign}
                onBack={() => setPbSelected(null)}
              />
            ) : pbSelected?.startsWith("custom:") ? (
              (() => {
                const cid = pbSelected.slice("custom:".length);
                const sec = customSections.find((s) => s.id === cid);
                if (!sec) {
                  return (
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center">
                      <p className="text-sm text-gray-300">Cargando la sección…</p>
                      <button type="button" onClick={() => setPbSelected(null)} className="mt-2 text-[length:var(--ts-2xs)] font-semibold text-[var(--accent-soft)] hover:underline">← Volver</button>
                    </div>
                  );
                }
                return (
                  <CustomSectionEditor
                    section={sec}
                    onPatch={(dataPatch) => patchCustomSection(cid, dataPatch)}
                    textStyles={(draft.textStyles ?? {}) as Record<string, { size?: number; bold?: boolean; color?: string; italic?: boolean; upper?: boolean }>}
                    onTextStyle={patchTextStyle}
                    onBack={() => setPbSelected(null)}
                    tenantSlug={tenantSlug}
                    storeName={draft.storeName}
                  />
                );
              })()
            ) : pbSelected && STYLABLE_SECTIONS.has(pbSelected) ? (
              <SectionStyleEditor
                label={PB_KEY_LABEL[pbSelected] ?? "Sección"}
                sectionKey={pbSelected}
                value={(draft.sectionStyles?.[pbSelected] ?? {}) as SectionStyle}
                onChange={(change) => patchSectionStyle(pbSelected, change)}
                onPreset={(style) => patchSectionStyle(pbSelected, { __replace: style })}
                textFields={SECTION_TEXT_FIELDS[pbSelected]}
                text={(draft.sectionText?.[pbSelected] ?? {}) as { eyebrow?: string; title?: string; align?: "left" | "center" | "right" }}
                onText={(field, value) => patchSectionText(pbSelected, field, value)}
                textStyles={(draft.textStyles ?? {}) as Record<string, { size?: number; bold?: boolean; color?: string; italic?: boolean; upper?: boolean }>}
                onTextStyle={patchTextStyle}
                image={draft.sectionImages?.[pbSelected]}
                onImage={(url) => setSectionImage(pbSelected, url)}
                hidden={(draft.bodyHidden ?? []).includes(pbSelected)}
                onToggleHidden={(h) => patchBodyHidden(pbSelected, h)}
                onBack={() => setPbSelected(null)}
              />
            ) : (
            <>
            {pbSelected && PB_KEY_LABEL[pbSelected] && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--data-info-500)]/40 bg-[var(--data-info-500)]/10 px-3 py-2">
                <span className="text-[length:var(--ts-2xs)] font-semibold text-[var(--text-secondary)]">
                  ✎ Seleccionaste <b className="text-white">{PB_KEY_LABEL[pbSelected]}</b> en la tienda
                </span>
                <button type="button" onClick={() => setPbSelected(null)} aria-label="Quitar selección" className="text-[var(--text-tertiary)] hover:text-white">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            {panel === "plantillas" && (
              <>
                {/* Diseñá con IA (Brandon 2026-06-26): describí el negocio → tema completo */}
                <div className="rounded-xl border border-[var(--accent-soft)]/40 bg-linear-to-br from-[var(--accent-soft)]/15 to-transparent p-3 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <WandSparkles className="h-4 w-4 text-[var(--accent-soft)]" />
                    <p className="text-sm font-bold text-white">Diseñá con IA</p>
                  </div>
                  <p className="text-[length:var(--ts-2xs)] text-gray-400 leading-snug">Contá qué vendés y la IA arma colores, tipografía y textos por vos.</p>
                  <textarea
                    className={cn(INPUT_CLASS, "resize-none")}
                    rows={2}
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") generateAiTheme(); }}
                    placeholder="Ej: vendo pollo a la brasa, ambiente familiar y precios justos"
                    maxLength={500}
                    disabled={aiLoading}
                  />
                  {aiError && <p className="text-[length:var(--ts-2xs)] text-[var(--data-error-500)]">{aiError}</p>}
                  <button
                    type="button"
                    onClick={generateAiTheme}
                    disabled={aiLoading || aiPrompt.trim().length < 4}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--accent-soft)] px-3 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {aiLoading
                      ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Generando…</>
                      : <><Sparkles className="h-3.5 w-3.5" /> Generar mi tema</>}
                  </button>
                </div>

                <div>
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent-soft)] mb-1">Plantillas de página completas</p>
                  <p className="text-xs text-gray-400 leading-snug">Un look INTEGRAL en 1 clic — colores + tipografía + orden y estilo de cada sección.</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {PAGE_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => applyPageTemplate(tpl)}
                      className="group overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] text-left transition-colors hover:border-[var(--accent-soft)] hover:bg-white/[0.05]"
                    >
                      {/* Mini-mockup multi-banda: representa varias secciones */}
                      <div className="flex h-16 flex-col gap-0.5 p-1.5" style={{ background: tpl.theme.darkModeDefault ? "#0f172a" : "#ffffff" }}>
                        <div className="h-2 w-2/3 rounded-full" style={{ background: tpl.theme.primaryColor }} />
                        <div className="flex-1 rounded" style={{ background: `linear-gradient(135deg, ${tpl.theme.primaryColor}, ${tpl.theme.accentColor})` }} />
                        <div className="flex gap-0.5">
                          <div className="h-3 flex-1 rounded-sm" style={{ background: tpl.theme.secondaryColor, opacity: 0.5 }} />
                          <div className="h-3 flex-1 rounded-sm" style={{ background: tpl.theme.secondaryColor, opacity: 0.3 }} />
                        </div>
                      </div>
                      <div className="px-2 py-1.5">
                        <p className="truncate text-[length:var(--ts-2xs)] font-bold text-white">{tpl.name}</p>
                        <p className="truncate text-[length:var(--ts-2xs)] text-gray-400">{tpl.vibe}</p>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="pt-1">
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--data-success-500)] mb-1">Plantillas listas</p>
                  <p className="text-xs text-gray-400 leading-snug">Aplicá un look completo en 1 click — colores + tipografía + estilo.</p>
                </div>
                {QUICK_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => applyTemplate(tpl)}
                    className="group w-full text-left rounded-xl bg-white/[0.03] border border-white/10 hover:border-white/20 hover:bg-white/[0.05] transition-colors overflow-hidden"
                  >
                    {/* Mini-mockup: gradient banner con los 3 colores */}
                    <div
                      className="h-16 w-full relative overflow-hidden"
                      style={{
                        background: `linear-gradient(135deg, ${tpl.primaryColor}, ${tpl.accentColor})`,
                      }}
                    >
                      <div className="absolute inset-x-2 bottom-2 flex items-center gap-1.5">
                        <div className="h-1.5 w-12 rounded-full bg-white/40" />
                        <div className="h-3 w-8 rounded-md ml-auto" style={{ backgroundColor: tpl.secondaryColor }} />
                      </div>
                      {/* Sparkle decoration */}
                      <Sparkles className="absolute top-2 right-2 h-3.5 w-3.5 text-white/50" />
                    </div>
                    <div className="p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white truncate">{tpl.name}</p>
                          <p className="text-[length:var(--ts-2xs)] text-gray-400 truncate">{tpl.vibe}</p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <span className="h-3.5 w-3.5 rounded-full border border-gray-600" style={{ backgroundColor: tpl.primaryColor }} />
                          <span className="h-3.5 w-3.5 rounded-full border border-gray-600" style={{ backgroundColor: tpl.secondaryColor }} />
                          <span className="h-3.5 w-3.5 rounded-full border border-gray-600" style={{ backgroundColor: tpl.accentColor }} />
                        </div>
                      </div>
                      {/* Meta del look: fuente · botón · modo + "Aplicar" en hover */}
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[length:var(--ts-2xs)] font-semibold text-gray-300 capitalize">{tpl.fontFamily}</span>
                        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[length:var(--ts-2xs)] font-semibold text-gray-300 capitalize">{tpl.buttonStyle}</span>
                        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[length:var(--ts-2xs)] font-semibold text-gray-300">{tpl.darkModeDefault ? "Oscuro" : "Claro"}</span>
                        <span className="ml-auto text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-500)] opacity-0 group-hover:opacity-100 transition-opacity">Aplicar →</span>
                      </div>
                    </div>
                  </button>
                ))}

                {/* Plantillas POR RUBRO (Brandon 2026-06-26): traen también el copy del hero */}
                <div className="pt-2">
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--data-info-500)] mb-1">Según tu rubro</p>
                  <p className="text-xs text-gray-400 leading-snug">Look + textos pensados para tu negocio.</p>
                </div>
                {RUBRO_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => applyRubroTemplate(tpl)}
                    className="group w-full text-left rounded-xl bg-white/[0.03] border border-white/10 hover:border-white/20 hover:bg-white/[0.05] transition-colors overflow-hidden"
                  >
                    <div
                      className="h-14 w-full relative overflow-hidden"
                      style={{ background: `linear-gradient(135deg, ${tpl.primaryColor}, ${tpl.accentColor})` }}
                    >
                      <div className="absolute inset-x-2 bottom-2 flex items-center gap-1.5">
                        <div className="h-1.5 w-12 rounded-full bg-white/40" />
                        <div className="h-3 w-8 rounded-md ml-auto" style={{ backgroundColor: tpl.secondaryColor }} />
                      </div>
                    </div>
                    <div className="p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white truncate">{tpl.name}</p>
                          <p className="text-[length:var(--ts-2xs)] text-gray-400 truncate">{tpl.vibe}</p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <span className="h-3.5 w-3.5 rounded-full border border-gray-600" style={{ backgroundColor: tpl.primaryColor }} />
                          <span className="h-3.5 w-3.5 rounded-full border border-gray-600" style={{ backgroundColor: tpl.secondaryColor }} />
                          <span className="h-3.5 w-3.5 rounded-full border border-gray-600" style={{ backgroundColor: tpl.accentColor }} />
                        </div>
                      </div>
                      <p className="mt-1.5 text-[length:var(--ts-2xs)] text-gray-500 italic truncate">“{tpl.heroTitle}”</p>
                      <div className="mt-1.5 flex items-center">
                        <span className="ml-auto text-[length:var(--ts-2xs)] font-bold text-[var(--data-info-500)] opacity-0 group-hover:opacity-100 transition-opacity">Aplicar →</span>
                      </div>
                    </div>
                  </button>
                ))}
              </>
            )}

            {panel === "identidad" && (
              <>
                {/* Lote G: sugerencia contextual — sin logo se ve menos profesional. */}
                {!draft.logo && (
                  <div className="flex items-start gap-2 rounded-lg border border-[var(--data-warning-500)]/30 bg-[var(--data-warning-500)]/10 px-3 py-2.5">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning-500)]" aria-hidden />
                    <p className="text-[length:var(--ts-2xs)] leading-snug text-gray-200">Subí tu <strong className="text-white">logo</strong>: las tiendas con logo se ven más profesionales y se reconocen mejor.</p>
                  </div>
                )}
                {/* Logo — click o arrastrá para subir (Brandon 2026-06-25) */}
                <div className="space-y-1.5">
                  <p className={LABEL_CLASS}>Logo de la tienda</p>
                  <div className="dark max-w-[150px]">
                    <ImageUpload
                      value={draft.logo}
                      onChange={(url) => patch("logo", url)}
                      onClear={() => patch("logo", "")}
                      folder="store-customizer"
                      aspectRatio="square"
                      label=""
                    />
                  </div>
                  <p className="text-[length:var(--ts-2xs)] text-gray-500">Click o arrastrá · cuadrado · máx 5 MB</p>
                </div>

                <Field label="Nombre de la tienda" labelClassName={LABEL_CLASS}>
                  <input className={INPUT_CLASS} value={draft.storeName} onChange={(e) => patch("storeName", e.target.value)} placeholder="Mi Bodega" />
                </Field>
                <Field label="Slogan" labelClassName={LABEL_CLASS}>
                  <input className={INPUT_CLASS} value={draft.slogan} onChange={(e) => patch("slogan", e.target.value)} placeholder="Tu tienda de confianza" />
                </Field>
                <Field label="Descripción" labelClassName={LABEL_CLASS}>
                  <textarea className={cn(INPUT_CLASS, "resize-none")} rows={3} value={draft.description} onChange={(e) => patch("description", e.target.value)} placeholder="Qué vendés y qué te hace especial…" />
                </Field>
              </>
            )}

            {panel === "hero" && (
              <>
                {/* Lote E: sugerencia contextual — hero sin fondo visual convierte menos. */}
                {!draft.heroImage && !draft.heroVideoUrl && !(draft.heroGradientFrom && draft.heroGradientTo) && (
                  <div className="flex items-start gap-2 rounded-lg border border-[var(--data-warning-500)]/30 bg-[var(--data-warning-500)]/10 px-3 py-2.5">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning-500)]" aria-hidden />
                    <p className="text-[length:var(--ts-2xs)] leading-snug text-gray-200">
                      Tu hero no tiene imagen ni video de fondo. Las tiendas con fondo visual <strong className="text-white">captan más la atención</strong> — subí una imagen, pegá un video o aplicá un gradiente abajo.
                    </p>
                  </div>
                )}
                {/* Variantes de diseño del hero (Brandon 2026-06-26, Fase 4) */}
                <StylePicker
                  label="Diseño del hero"
                  value={draft.heroVariant ?? "editorial"}
                  onChange={(v) => patch("heroVariant", v)}
                  cols={2}
                  options={[
                    {
                      value: "editorial",
                      label: "Editorial",
                      preview: (
                        <div className="flex w-full items-center gap-1 px-1.5">
                          <div className="flex-1 space-y-0.5">
                            <div className="h-1 w-3/4 rounded bg-white/55" />
                            <div className="h-0.5 w-full rounded bg-white/25" />
                            <div className="h-1 w-1/2 rounded bg-[var(--data-success-500)]/60" />
                          </div>
                          <div className="grid w-1/3 grid-cols-2 gap-0.5">
                            <div className="h-1.5 rounded bg-white/30" />
                            <div className="h-1.5 rounded bg-white/30" />
                            <div className="h-1.5 rounded bg-white/30" />
                            <div className="h-1.5 rounded bg-white/30" />
                          </div>
                        </div>
                      ),
                    },
                    {
                      value: "centered",
                      label: "Centrado",
                      preview: (
                        <div className="flex w-full flex-col items-center gap-0.5 px-1.5">
                          <div className="h-1 w-1/2 rounded bg-white/55" />
                          <div className="h-0.5 w-2/3 rounded bg-white/25" />
                          <div className="h-1 w-1/3 rounded bg-[var(--data-success-500)]/60" />
                        </div>
                      ),
                    },
                    {
                      value: "split",
                      label: "Split (foto)",
                      preview: (
                        <div className="flex w-full items-center gap-1 px-1.5">
                          <div className="flex-1 space-y-0.5">
                            <div className="h-1 w-3/4 rounded bg-white/55" />
                            <div className="h-1 w-1/2 rounded bg-[var(--data-success-500)]/60" />
                          </div>
                          <div className="h-6 w-1/3 rounded bg-white/35" />
                        </div>
                      ),
                    },
                    {
                      value: "immersive",
                      label: "Inmersivo",
                      preview: (
                        <div className="relative flex h-7 w-full items-end overflow-hidden rounded bg-white/25 px-1.5 pb-0.5">
                          <div className="w-full space-y-0.5">
                            <div className="h-1 w-2/3 rounded bg-white/70" />
                            <div className="h-1 w-1/3 rounded bg-[var(--data-success-500)]/70" />
                          </div>
                        </div>
                      ),
                    },
                  ]}
                />

                {/* Controles "editar potencia" del hero */}
                <StylePicker
                  label="Altura"
                  value={draft.heroHeight ?? "normal"}
                  onChange={(v) => patch("heroHeight", v)}
                  cols={3}
                  options={[
                    { value: "compact", label: "Compacto", preview: <div className="h-3 w-6 rounded bg-white/30" /> },
                    { value: "normal", label: "Normal", preview: <div className="h-5 w-6 rounded bg-white/30" /> },
                    { value: "tall", label: "Alto", preview: <div className="h-7 w-6 rounded bg-white/30" /> },
                  ]}
                />
                <StylePicker
                  label="Alineación del texto"
                  value={draft.heroAlign ?? "left"}
                  onChange={(v) => patch("heroAlign", v)}
                  cols={2}
                  options={[
                    {
                      value: "left",
                      label: "Izquierda",
                      preview: (
                        <div className="w-full space-y-0.5 px-2">
                          <div className="h-1 w-3/4 rounded bg-white/45" />
                          <div className="h-1 w-1/2 rounded bg-white/30" />
                        </div>
                      ),
                    },
                    {
                      value: "center",
                      label: "Centrado",
                      preview: (
                        <div className="flex w-full flex-col items-center gap-0.5 px-2">
                          <div className="h-1 w-3/4 rounded bg-white/45" />
                          <div className="h-1 w-1/2 rounded bg-white/30" />
                        </div>
                      ),
                    },
                  ]}
                />
                <div className="space-y-1.5">
                  <label htmlFor="hero-overlay" className={LABEL_CLASS}>
                    Oscurecer foto · {draft.heroOverlay ?? 0}%
                  </label>
                  <input
                    id="hero-overlay"
                    type="range"
                    min={0}
                    max={100}
                    value={draft.heroOverlay ?? 0}
                    onChange={(e) => patch("heroOverlay", Number(e.target.value))}
                    className="w-full accent-[var(--data-success-500)]"
                  />
                  <p className="text-[length:var(--ts-2xs)] text-gray-500">Más oscuro = el texto se lee mejor sobre fotos claras.</p>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-white/[0.03] border border-white/10 px-2.5 py-2">
                  <span className="text-xs text-gray-200">Mostrar insignias (productos · pago · delivery)</span>
                  <Toggle checked={draft.heroShowBadges ?? true} onChange={(v) => patch("heroShowBadges", v)} />
                </div>

                <Field label="Titulo hero" labelClassName={LABEL_CLASS}>
                  <input className={INPUT_CLASS} value={draft.heroTitle} onChange={(e) => patch("heroTitle", e.target.value)} />
                </Field>
                <Field label="Subtitulo hero" labelClassName={LABEL_CLASS}>
                  <textarea className={cn(INPUT_CLASS, "resize-none")} rows={2} value={draft.heroSubtitle} onChange={(e) => patch("heroSubtitle", e.target.value)} />
                </Field>
                <Field label="Texto CTA" labelClassName={LABEL_CLASS}>
                  <input className={INPUT_CLASS} value={draft.heroCTA} onChange={(e) => patch("heroCTA", e.target.value)} />
                </Field>
                <Field label="URL CTA" labelClassName={LABEL_CLASS}>
                  <input className={INPUT_CLASS} value={draft.heroLink} onChange={(e) => patch("heroLink", e.target.value)} />
                </Field>
                <Field label="Badge hero" labelClassName={LABEL_CLASS}>
                  <input className={INPUT_CLASS} value={draft.heroBadge} onChange={(e) => patch("heroBadge", e.target.value)} />
                </Field>
                {/* Imagen de fondo del hero — click o arrastrá (Brandon 2026-06-25) */}
                <div className="space-y-1.5">
                  <p className={LABEL_CLASS}>Imagen del hero</p>
                  <div className="dark">
                    <ImageUpload
                      value={draft.heroImage}
                      onChange={(url) => patch("heroImage", url)}
                      onClear={() => patch("heroImage", "")}
                      folder="store-customizer"
                      aspectRatio="banner"
                      label=""
                    />
                  </div>
                  <p className="text-[length:var(--ts-2xs)] text-gray-500">Fondo del hero · click o arrastrá · máx 5 MB</p>
                </div>

                {/* #2 Gradiente del hero (si no hay foto) — 2 colores + ángulo */}
                <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
                  <p className={LABEL_CLASS}>Gradiente del hero {draft.heroImage ? "(quitá la foto para verlo)" : ""}</p>
                  <div className="flex items-center gap-2">
                    <label className="relative inline-flex h-8 w-8 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-white/15" title="Color 1">
                      <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: draft.heroGradientFrom || "#00A0A0" }} />
                      <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(draft.heroGradientFrom) ? draft.heroGradientFrom : "#00A0A0"} onChange={(e) => patch("heroGradientFrom", e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Color 1 del gradiente" />
                    </label>
                    <label className="relative inline-flex h-8 w-8 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-white/15" title="Color 2">
                      <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: draft.heroGradientTo || "#FF6B5B" }} />
                      <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(draft.heroGradientTo) ? draft.heroGradientTo : "#FF6B5B"} onChange={(e) => patch("heroGradientTo", e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Color 2 del gradiente" />
                    </label>
                    <div className="h-8 flex-1 rounded-md border border-white/10" style={{ background: `linear-gradient(${draft.heroGradientAngle ?? 135}deg, ${draft.heroGradientFrom || "#00A0A0"}, ${draft.heroGradientTo || "#FF6B5B"})` }} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[length:var(--ts-2xs)] text-gray-400">Ángulo</span>
                    <input type="range" min={0} max={360} value={draft.heroGradientAngle ?? 135} onChange={(e) => patch("heroGradientAngle", Number(e.target.value))} className="w-full accent-[var(--data-success-500)]" />
                    <span className="w-9 text-right text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--data-success-500)]">{draft.heroGradientAngle ?? 135}°</span>
                  </div>
                  {(draft.heroGradientFrom || draft.heroGradientTo) && (
                    <button type="button" onClick={() => { patch("heroGradientFrom", ""); patch("heroGradientTo", ""); }} className="text-[length:var(--ts-2xs)] font-semibold text-gray-400 transition-colors hover:text-[var(--data-error-500)]">
                      Quitar gradiente (volver a color de marca)
                    </button>
                  )}
                </div>

                {/* Lote D: video de fondo del hero (YouTube o .mp4) */}
                <Field label="Video de fondo (YouTube o .mp4)" labelClassName={LABEL_CLASS}>
                  <input className={INPUT_CLASS} value={draft.heroVideoUrl ?? ""} onChange={(e) => patch("heroVideoUrl", e.target.value)} placeholder="https://youtu.be/… (reemplaza la imagen)" />
                </Field>

                {/* Lote D: segundo botón CTA del hero */}
                <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
                  <p className={LABEL_CLASS}>Segundo botón (CTA)</p>
                  <input className={INPUT_CLASS} value={draft.heroCta2Label ?? ""} onChange={(e) => patch("heroCta2Label", e.target.value)} placeholder="Texto · ej. Ver el menú" maxLength={30} />
                  <input className={INPUT_CLASS} value={draft.heroCta2Url ?? ""} onChange={(e) => patch("heroCta2Url", e.target.value)} placeholder="Link · /t/mi-tienda/tienda o https://…" />
                </div>
              </>
            )}

            {panel === "colores" && (
              <>
                {/* Paletas armónicas — 1 click aplica los 3 colores (Brandon 2026-06-25) */}
                <div>
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--data-success-500)] mb-2">Paletas listas</p>
                  <div className="grid grid-cols-3 gap-2">
                    {COLOR_PALETTES.map((pal) => (
                      <button
                        key={pal.name}
                        type="button"
                        onClick={() => applyPalette(pal)}
                        className="group rounded-lg border border-white/10 bg-white/[0.03] p-1.5 hover:border-white/25 transition-colors"
                      >
                        <span className="flex h-7 w-full overflow-hidden rounded">
                          <span className="flex-1" style={{ backgroundColor: pal.primary }} />
                          <span className="flex-1" style={{ backgroundColor: pal.secondary }} />
                          <span className="flex-1" style={{ backgroundColor: pal.accent }} />
                        </span>
                        <span className="mt-1 block text-[length:var(--ts-2xs)] font-semibold text-gray-300 group-hover:text-white">{pal.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <ColorField label="Color primario" value={draft.primaryColor} onChange={(v) => patch("primaryColor", v)} />
                <ColorField label="Color secundario" value={draft.secondaryColor} onChange={(v) => patch("secondaryColor", v)} />
                <ColorField label="Color acento" value={draft.accentColor} onChange={(v) => patch("accentColor", v)} />

                {/* Lote D: color de fondo global de la página (vacío = por defecto) */}
                <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">Fondo de la página</p>
                    <p className="text-[length:var(--ts-2xs)] text-gray-500">Color de fondo de toda la tienda</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <label className="relative inline-flex h-8 w-8 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-white/15" title="Fondo de página">
                      <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: draft.pageBgColor || "#ffffff" }} />
                      <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(draft.pageBgColor) ? draft.pageBgColor : "#ffffff"} onChange={(e) => patch("pageBgColor", e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Color de fondo de la página" />
                    </label>
                    {draft.pageBgColor && (
                      <button type="button" onClick={() => patch("pageBgColor", "")} aria-label="Quitar fondo" className="text-gray-500 transition-colors hover:text-[var(--data-error-500)]">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Lote E: color de la barra de navegación (fondo + texto) */}
                <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
                  <p className={LABEL_CLASS}>Barra de navegación</p>
                  {([["navbarBgColor", "Fondo", "#ffffff"], ["navbarTextColor", "Texto", "#111827"]] as const).map(([field, lbl, fallback]) => (
                    <div key={field} className="flex items-center justify-between gap-2">
                      <span className="text-[length:var(--ts-2xs)] text-gray-300">{lbl}</span>
                      <div className="flex items-center gap-1.5">
                        <label className="relative inline-flex h-7 w-7 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-white/15" title={lbl}>
                          <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: draft[field] || fallback }} />
                          <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(draft[field]) ? draft[field] : fallback} onChange={(e) => patch(field, e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={`Color ${lbl} del navbar`} />
                        </label>
                        {draft[field] && (
                          <button type="button" onClick={() => patch(field, "")} aria-label={`Quitar ${lbl}`} className="text-gray-500 transition-colors hover:text-[var(--data-error-500)]">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {/* Lote I: renombrar "Catálogo" + links extra del navbar */}
                  <div className="space-y-1.5 border-t border-white/5 pt-2">
                    <span className="text-[length:var(--ts-2xs)] text-gray-300">Nombre de &quot;Catálogo&quot;</span>
                    <input className={INPUT_CLASS} value={draft.navCatalogLabel ?? ""} onChange={(e) => patch("navCatalogLabel", e.target.value)} placeholder="Catálogo (ej. Menú, Productos)" maxLength={24} />
                    <span className="text-[length:var(--ts-2xs)] text-gray-300">Links extra del menú</span>
                    {(draft.navExtraLinks ?? []).map((lk, i, arr) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <input className={cn(INPUT_CLASS, "w-24 shrink-0")} value={lk.label} onChange={(e) => patch("navExtraLinks", arr.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="Nombre" maxLength={20} />
                        <input className={INPUT_CLASS} value={lk.url} onChange={(e) => patch("navExtraLinks", arr.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} placeholder="https://instagram.com/…" />
                        <button type="button" onClick={() => patch("navExtraLinks", arr.filter((_, j) => j !== i))} aria-label="Quitar link" className="shrink-0 text-gray-500 transition-colors hover:text-[var(--data-error-500)]"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ))}
                    {(draft.navExtraLinks ?? []).length < 3 && (
                      <button type="button" onClick={() => patch("navExtraLinks", [...(draft.navExtraLinks ?? []), { label: "", url: "" }])} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/15 bg-white/[0.03] px-3 py-1.5 text-[length:var(--ts-2xs)] font-bold text-gray-300 transition-colors hover:border-[var(--accent-soft)] hover:text-white">
                        <Plus className="h-3 w-3" /> Agregar link
                      </button>
                    )}
                  </div>
                </div>

                {/* #2 Swatches de marca: guardá colores y reutilizalos en 1 click */}
                <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-gray-300">Colores de marca</p>
                    <button
                      type="button"
                      onClick={() => {
                        const cur = (draft.brandSwatches ?? []) as string[];
                        const add = [draft.primaryColor, draft.secondaryColor, draft.accentColor].filter((c) => /^#[0-9A-Fa-f]{6}$/.test(c));
                        const next = Array.from(new Set([...cur, ...add])).slice(0, 6);
                        patch("brandSwatches", next);
                      }}
                      className="inline-flex items-center gap-1 rounded-md bg-white/[0.06] px-2 py-1 text-[length:var(--ts-2xs)] font-bold text-gray-200 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <Plus className="h-3 w-3" /> Guardar actuales
                    </button>
                  </div>
                  {(draft.brandSwatches ?? []).length === 0 ? (
                    <p className="text-[length:var(--ts-2xs)] text-gray-500">Guardá tus colores para reusarlos. Click en un color → lo aplica al primario.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {(draft.brandSwatches ?? []).map((c, i) => (
                        <div key={`${c}-${i}`} className="group relative">
                          <button type="button" onClick={() => patch("primaryColor", c)} title={`Aplicar ${c} al primario`} className="h-7 w-7 rounded-md border border-white/20 transition-transform hover:scale-110" style={{ background: c }} aria-label={`Aplicar color ${c}`} />
                          <button type="button" onClick={() => patch("brandSwatches", (draft.brandSwatches ?? []).filter((_, j) => j !== i))} aria-label="Quitar color" className="absolute -right-1 -top-1 hidden h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--data-error-500)] text-white group-hover:flex">
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Vista previa de cómo combinan los colores en la tienda */}
                <div className="rounded-lg border border-white/10 overflow-hidden">
                  <div className="bg-white p-3">
                    <p className="text-sm font-black" style={{ color: draft.primaryColor }}>Tu tienda online</p>
                    <p className="text-xs text-gray-500 mt-0.5">Así combinan tus colores.</p>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      <span className="inline-block text-xs font-bold text-white px-3 py-1.5 rounded-lg" style={{ backgroundColor: draft.primaryColor }}>Comprar</span>
                      <span className="inline-block text-xs font-bold text-white px-3 py-1.5 rounded-lg" style={{ backgroundColor: draft.secondaryColor }}>Oferta</span>
                      <span className="inline-block text-xs font-bold px-3 py-1.5 rounded-lg border-2" style={{ color: draft.accentColor, borderColor: draft.accentColor }}>Ver más</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg bg-white/[0.03] border border-white/10 p-2.5">
                  <span className="text-xs font-semibold text-[var(--text-tertiary)]">Modo oscuro por defecto</span>
                  <Toggle checked={draft.darkModeDefault} onChange={(v) => patch("darkModeDefault", v)} />
                </div>
              </>
            )}

            {panel === "secciones" && (
              <div className="space-y-4">
                <p className="text-xs leading-snug text-gray-400">
                  Ordená y activá lo que ve tu cliente. Todo lo de acá se refleja en tu tienda real.
                </p>

                {/* ── Página de inicio (orden REAL via bodyOrder) ─────────────── */}
                <SectionCard
                  icon={Home}
                  title="Página de inicio"
                  hint="El orden de tu portada · arrastrá para reordenar"
                  badge={<LiveBadge />}
                >
                  {/* Banner superior (announcementImage) — banda full-width arriba */}
                  <div className="space-y-1.5">
                    <p className="text-[length:var(--ts-2xs)] font-bold text-gray-300">Banner superior</p>
                    <div className="dark">
                      <ImageUpload
                        value={draft.announcementImage}
                        onChange={(url) => patch("announcementImage", url)}
                        onClear={() => patch("announcementImage", "")}
                        folder="store-customizer"
                        aspectRatio="banner"
                        label=""
                      />
                    </div>
                    <p className="text-[length:var(--ts-2xs)] text-gray-500">Imagen full-width arriba de todo · click o arrastrá · máx 5 MB</p>
                  </div>

                  {/* Secciones reordenables del cuerpo */}
                  <div className="space-y-1.5 pt-1">
                    <p className="text-[length:var(--ts-2xs)] font-bold text-gray-300">Secciones del cuerpo</p>
                    {(() => {
                      // Orden visible = bodyOrder válido primero, faltantes al final.
                      const valid = (draft.bodyOrder ?? []).filter((k) => LANDING_BODY_DEFAULT.includes(k));
                      const finalOrder = [...valid, ...LANDING_BODY_DEFAULT.filter((k) => !valid.includes(k))];
                      return finalOrder.map((key, idx) => {
                        const item = LANDING_BODY_ITEMS.find((s) => s.key === key);
                        if (!item) return null;
                        const Icon = item.icon;
                        return (
                          <div
                            key={key}
                            onMouseEnter={() => sendHighlight(key as SectionKey)}
                            onMouseLeave={() => sendHighlight(null)}
                            onDragOver={(e) => {
                              if (bodyDragKey && bodyDragKey !== key) {
                                e.preventDefault();
                                setBodyDragOverKey(key);
                              }
                            }}
                            onDragLeave={() => setBodyDragOverKey((k) => (k === key ? null : k))}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (bodyDragKey) reorderBody(bodyDragKey, key);
                              setBodyDragKey(null);
                              setBodyDragOverKey(null);
                            }}
                            className={cn(
                              "group flex items-center gap-2 rounded-lg border bg-white/[0.03] px-2 py-2 transition-colors",
                              bodyDragOverKey === key ? "border-[var(--data-success-500)] bg-[var(--data-success-500)]/5" : "border-white/10 hover:border-white/20",
                              bodyDragKey === key && "opacity-40",
                            )}
                          >
                            <button
                              type="button"
                              draggable
                              onDragStart={() => setBodyDragKey(key)}
                              onDragEnd={() => {
                                setBodyDragKey(null);
                                setBodyDragOverKey(null);
                              }}
                              aria-label={`Arrastrar ${item.label} para reordenar`}
                              className="shrink-0 cursor-grab rounded p-0.5 text-gray-500 transition-colors hover:text-white active:cursor-grabbing"
                            >
                              <GripVertical className="h-4 w-4" aria-hidden />
                            </button>
                            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-[length:var(--ts-2xs)] font-bold tabular-nums text-gray-400">
                              {idx + 1}
                            </span>
                            <Icon className="h-4 w-4 shrink-0 text-[var(--accent-soft)]" aria-hidden />
                            <div className={cn("min-w-0 flex-1", (draft.bodyHidden ?? []).includes(key) && "opacity-50")}>
                              <p className="truncate text-xs font-semibold text-gray-100 leading-tight">{item.label}</p>
                              <p className="truncate text-[length:var(--ts-2xs)] text-gray-500 leading-tight">{item.desc}</p>
                            </div>
                            {/* Lote D: toggle de visibilidad por sección del cuerpo */}
                            <Toggle checked={!(draft.bodyHidden ?? []).includes(key)} onChange={(v) => patchBodyHidden(key, !v)} />
                          </div>
                        );
                      });
                    })()}
                    <p className="text-[length:var(--ts-2xs)] text-gray-500 leading-snug">
                      Cada sección aparece sola cuando tiene contenido (ej. promos activas o testimonios).
                    </p>
                  </div>
                </SectionCard>

                {/* ── Página de catálogo (tiendaSections REAL via /api/settings) ── */}
                <SectionCard
                  icon={ShoppingBag}
                  title="Página de catálogo"
                  hint="Secciones de descubrimiento en tu página de productos"
                >
                  {tiendaSectionOrder.map((key, idx) => {
                    const enabled = tiendaSectionsEnabled.includes(key);
                    const count = sectionContentCounts[key] ?? 0;
                    const Icon = TIENDA_SECTION_ICONS[key] ?? Layout;
                    return (
                      <div
                        key={key}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-2 transition-opacity",
                          !enabled && "opacity-55",
                        )}
                      >
                        <div className="flex shrink-0 flex-col">
                          <button
                            type="button"
                            onClick={() => moveTiendaSection(key, "up")}
                            disabled={idx === 0}
                            aria-label="Subir sección"
                            className="text-gray-500 transition-colors hover:text-white disabled:opacity-20"
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveTiendaSection(key, "down")}
                            disabled={idx === tiendaSectionOrder.length - 1}
                            aria-label="Bajar sección"
                            className="text-gray-500 transition-colors hover:text-white disabled:opacity-20"
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <Icon className="h-4 w-4 shrink-0 text-[var(--accent-soft)]" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold text-gray-100 leading-tight">{TIENDA_SECTION_LABELS[key]}</span>
                          <span className={cn("text-[length:var(--ts-2xs)] leading-tight", count > 0 ? "text-[var(--data-success-500)]" : "text-gray-500")}>
                            {count > 0 ? `${count} ${count === 1 ? "producto" : "productos"}` : "Sin productos"}
                          </span>
                        </div>
                        <Toggle checked={enabled} onChange={() => toggleTiendaSection(key)} />
                      </div>
                    );
                  })}
                </SectionCard>

                {/* #5 Grid configurable de productos destacados (columnas + cantidad) */}
                <SectionCard icon={ShoppingBag} title="Productos destacados" hint="Cómo se ve la grilla de productos en la home">
                  <StylePicker
                    label="Columnas"
                    cols={3}
                    value={String(draft.featuredCols ?? 4)}
                    onChange={(v) => patch("featuredCols", Number(v) as 2 | 3 | 4)}
                    options={[
                      { value: "2", label: "2", preview: <span className="h-4 w-4 rounded bg-white/40" /> },
                      { value: "3", label: "3", preview: <span className="h-4 w-6 rounded bg-white/40" /> },
                      { value: "4", label: "4", preview: <span className="h-4 w-8 rounded bg-white/40" /> },
                    ]}
                  />
                  <StylePicker
                    label="Cuántos mostrar"
                    cols={3}
                    value={String(draft.featuredCount ?? 8)}
                    onChange={(v) => patch("featuredCount", Number(v))}
                    options={[
                      { value: "4", label: "4", preview: <span className="text-xs font-bold text-gray-300">4</span> },
                      { value: "8", label: "8", preview: <span className="text-xs font-bold text-gray-300">8</span> },
                      { value: "12", label: "12", preview: <span className="text-xs font-bold text-gray-300">12</span> },
                    ]}
                  />
                  <StylePicker
                    label="Disposición"
                    cols={3}
                    value={draft.featuredLayout ?? "grid"}
                    onChange={(v) => patch("featuredLayout", v as "grid" | "list" | "carousel")}
                    options={[
                      { value: "grid", label: "Cuadrícula", preview: <span className="grid grid-cols-2 gap-0.5"><span className="h-2 w-2 rounded-sm bg-white/40" /><span className="h-2 w-2 rounded-sm bg-white/40" /><span className="h-2 w-2 rounded-sm bg-white/40" /><span className="h-2 w-2 rounded-sm bg-white/40" /></span> },
                      { value: "list", label: "Lista", preview: <span className="flex flex-col gap-0.5"><span className="h-1.5 w-7 rounded-sm bg-white/40" /><span className="h-1.5 w-7 rounded-sm bg-white/40" /></span> },
                      { value: "carousel", label: "Carrusel", preview: <span className="flex gap-0.5 overflow-hidden"><span className="h-4 w-2.5 shrink-0 rounded-sm bg-white/40" /><span className="h-4 w-2.5 shrink-0 rounded-sm bg-white/40" /><span className="h-4 w-2.5 shrink-0 rounded-sm bg-white/20" /></span> },
                    ]}
                  />
                </SectionCard>

                {/* ── #6 Secciones de tu página (custom): crear/ordenar/ocultar/borrar ── */}
                <SectionCard icon={Layout} title="Secciones de tu página" hint="Galería, sobre nosotros, horarios… crear, ordenar, ocultar o borrar">
                  {customSections.length === 0 && (
                    <p className="text-[length:var(--ts-2xs)] text-gray-500">Todavía no agregaste secciones. Usá “Agregar sección” abajo.</p>
                  )}
                  {customSections.map((s, idx) => (
                    <div key={s.id} className={cn("flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-2", !s.visible && "opacity-55")}>
                      <div className="flex shrink-0 flex-col">
                        <button type="button" onClick={() => moveCustomSection(s.id, "up")} disabled={idx === 0} aria-label="Subir" className="text-gray-500 transition-colors hover:text-white disabled:opacity-20">
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => moveCustomSection(s.id, "down")} disabled={idx === customSections.length - 1} aria-label="Bajar" className="text-gray-500 transition-colors hover:text-white disabled:opacity-20">
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <button type="button" onClick={() => setPbSelected(`custom:${s.id}`)} className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-xs font-semibold text-gray-100">{CUSTOM_SECTION_LABELS[s.type] ?? s.type}</span>
                        {customSectionEmpty(s) ? (
                          <span className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-500)]"><Sparkles className="h-3 w-3" /> Falta contenido · editar →</span>
                        ) : (
                          <span className="text-[length:var(--ts-2xs)] text-gray-500">{s.visible ? "Visible" : "Oculta"} · editar →</span>
                        )}
                      </button>
                      <Toggle checked={s.visible} onChange={(v) => setCustomSectionVisible(s.id, v)} />
                      <button type="button" onClick={() => duplicateCustomSection(s.id)} aria-label="Duplicar sección" className="shrink-0 rounded p-1 text-gray-500 transition-colors hover:text-white">
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => removeCustomSection(s.id)} aria-label="Borrar sección" className="shrink-0 rounded p-1 text-gray-500 transition-colors hover:text-[var(--data-error-500)]">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <details className="group rounded-lg border border-dashed border-white/15 bg-white/[0.02]">
                    <summary className="flex cursor-pointer list-none items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-gray-300 transition-colors hover:text-white">
                      <Plus className="h-3.5 w-3.5" /> Agregar sección
                    </summary>
                    <div className="grid grid-cols-2 gap-1.5 p-2">
                      {SECTION_TEMPLATES.map((t) => (
                        <button
                          key={t.type}
                          type="button"
                          onClick={() => addCustomSection(t)}
                          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-2 text-left text-[length:var(--ts-2xs)] font-semibold text-gray-200 transition-colors hover:border-[var(--accent-soft)] hover:text-white"
                        >
                          <span aria-hidden>{t.emoji}</span>
                          <span className="truncate">{t.label}</span>
                        </button>
                      ))}
                    </div>
                  </details>
                </SectionCard>

                {/* ── Bandas de imagen extra (sectionImages REAL) — secundario ── */}
                <details className="group overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
                  <summary className="flex cursor-pointer list-none items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-white/[0.02]">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)]/15 text-[var(--accent-soft)]">
                      <ImageIcon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold leading-tight text-white">Bandas de imagen</p>
                      <p className="mt-0.5 text-[length:var(--ts-2xs)] leading-tight text-gray-400">Imágenes full-width opcionales entre secciones</p>
                    </div>
                    <ChevronDown className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <div className="space-y-3 border-t border-white/5 p-3">
                    {SECTION_ITEMS.filter((s) => s.key !== "hero" && s.key !== "announcement").map((s) => (
                      <div key={s.key} className="space-y-1.5">
                        <p className="text-[length:var(--ts-2xs)] font-bold text-gray-300">{s.label}</p>
                        <div className="dark">
                          <ImageUpload
                            value={draft.sectionImages?.[s.key] ?? ""}
                            onChange={(url) => setSectionImage(s.key, url)}
                            onClear={() => setSectionImage(s.key, "")}
                            folder="store-customizer"
                            aspectRatio="banner"
                            label=""
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            )}

            {panel === "tipografia" && (
              <>
                {/* Fuente de TÍTULOS — tarjetas en su propia tipografía (Brandon 2026-06-25) */}
                <div>
                  <p className={LABEL_CLASS}>Fuente de títulos</p>
                  <div className="grid grid-cols-2 gap-2">
                    {FONT_OPTIONS.map((f) => {
                      const active = draft.fontFamily === f.value;
                      const stack = EDITOR_FONT_MAP[f.value]?.stack;
                      return (
                        <button
                          key={f.value}
                          type="button"
                          onClick={() => patch("fontFamily", f.value as StoreTheme["fontFamily"])}
                          className={cn(
                            "rounded-lg border p-2.5 text-left transition-colors",
                            active
                              ? "border-[var(--data-success-500)] bg-[var(--data-success-500)]/10"
                              : "border-white/10 bg-white/[0.03] hover:border-white/25",
                          )}
                        >
                          <span className="block text-xl leading-none text-white" style={{ fontFamily: stack }}>Aa</span>
                          <span className="mt-1 block text-[length:var(--ts-2xs)] text-gray-400">{f.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Fuente del CUERPO (Lote A): par de fuentes título + cuerpo */}
                <div>
                  <p className={LABEL_CLASS}>Fuente del cuerpo</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[{ value: "", label: "Igual que títulos" }, ...FONT_OPTIONS].map((f) => {
                      const active = (draft.bodyFontFamily ?? "") === f.value;
                      const stack = f.value ? EDITOR_FONT_MAP[f.value]?.stack : EDITOR_FONT_MAP[draft.fontFamily]?.stack;
                      return (
                        <button
                          key={f.value || "same"}
                          type="button"
                          onClick={() => patch("bodyFontFamily", f.value)}
                          className={cn(
                            "rounded-lg border p-2.5 text-left transition-colors",
                            active
                              ? "border-[var(--data-success-500)] bg-[var(--data-success-500)]/10"
                              : "border-white/10 bg-white/[0.03] hover:border-white/25",
                          )}
                        >
                          <span className="block text-xl leading-none text-white" style={{ fontFamily: stack }}>Aa</span>
                          <span className="mt-1 block text-[length:var(--ts-2xs)] text-gray-400">{f.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Vista previa: título + cuerpo en SUS fuentes + redondez del botón */}
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-lg font-black text-white leading-tight" style={{ fontFamily: EDITOR_FONT_MAP[draft.fontFamily]?.stack }}>Bodega Buleje</p>
                  <p className="text-xs text-gray-400 mt-1" style={{ fontFamily: EDITOR_FONT_MAP[draft.bodyFontFamily || draft.fontFamily]?.stack }}>Frutas frescas, abarrotes y delivery rápido a tu puerta.</p>
                  <span className="mt-2.5 inline-block bg-[var(--data-success-500)] text-white text-xs font-bold px-3 py-1.5" style={{ borderRadius: draft.borderRadius }}>Comprar ahora</span>
                </div>

                <Field
                  label={
                    <div className="flex items-center justify-between mb-1 w-full">
                      <span>Redondez</span>
                      <span className="text-[length:var(--ts-2xs)] text-[var(--data-success-500)] font-bold">{draft.borderRadius}px</span>
                    </div>
                  }
                  labelClassName={LABEL_CLASS}
                >
                  {(id) => (
                    <input id={id} type="range" min={0} max={24} value={draft.borderRadius} onChange={(e) => patch("borderRadius", Number(e.target.value))} className="w-full accent-[var(--data-success-500)]" />
                  )}
                </Field>

                {/* Lote F: fuente personalizada por URL (.woff2/.ttf hosteado) */}
                <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
                  <p className={LABEL_CLASS}>Fuente personalizada</p>
                  <p className="text-[length:var(--ts-2xs)] text-gray-500">Pegá la URL de tu fuente (.woff2 o .ttf hosteado) para usar tu tipografía de marca.</p>
                  <input className={INPUT_CLASS} value={draft.customFontUrl ?? ""} onChange={(e) => patch("customFontUrl", e.target.value)} placeholder="https://…/MiFuente.woff2" />
                  {draft.customFontUrl && (
                    <StylePicker
                      label="Aplicar a"
                      cols={4}
                      value={draft.customFontTarget ?? "none"}
                      onChange={(v) => patch("customFontTarget", v as "none" | "headings" | "body" | "all")}
                      options={[
                        { value: "none", label: "Off", preview: <span className="text-[length:var(--ts-2xs)] text-gray-400">—</span> },
                        { value: "headings", label: "Títulos", preview: <span className="text-sm font-black text-white">A</span> },
                        { value: "body", label: "Cuerpo", preview: <span className="text-xs text-gray-300">a</span> },
                        { value: "all", label: "Todo", preview: <span className="text-xs font-bold text-white">Aa</span> },
                      ]}
                    />
                  )}
                </div>

                {/* Lote H: tamaño base del texto (px) + interlineado global */}
                <Field
                  label={<div className="mb-1 flex w-full items-center justify-between"><span>Tamaño base del texto</span><span className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-500)]">{draft.baseFontSize ?? 16}px</span></div>}
                  labelClassName={LABEL_CLASS}
                >
                  {(id) => (
                    <input id={id} type="range" min={13} max={20} value={draft.baseFontSize ?? 16} onChange={(e) => patch("baseFontSize", Number(e.target.value))} className="w-full accent-[var(--data-success-500)]" />
                  )}
                </Field>
                <Field
                  label={<div className="mb-1 flex w-full items-center justify-between"><span>Interlineado</span><span className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-500)]">{(draft.lineHeight ?? 0) >= 1.2 ? (draft.lineHeight ?? 0).toFixed(1) : "Auto"}</span></div>}
                  labelClassName={LABEL_CLASS}
                >
                  {(id) => (
                    <input id={id} type="range" min={1.2} max={2.0} step={0.1} value={(draft.lineHeight ?? 0) >= 1.2 ? draft.lineHeight : 1.6} onChange={(e) => patch("lineHeight", Number(e.target.value))} className="w-full accent-[var(--data-success-500)]" />
                  )}
                </Field>
                {/* Lote J: peso de fuente de los títulos */}
                <StylePicker
                  label="Peso de los títulos"
                  cols={3}
                  value={String(draft.headingWeight ?? 0)}
                  onChange={(v) => patch("headingWeight", Number(v))}
                  options={[
                    { value: "0", label: "Auto", preview: <span className="text-[length:var(--ts-2xs)] text-gray-400">—</span> },
                    { value: "500", label: "Medium", preview: <span className="text-sm text-white" style={{ fontWeight: 500 }}>A</span> },
                    { value: "600", label: "Semi", preview: <span className="text-sm text-white" style={{ fontWeight: 600 }}>A</span> },
                    { value: "700", label: "Bold", preview: <span className="text-sm text-white" style={{ fontWeight: 700 }}>A</span> },
                    { value: "900", label: "Black", preview: <span className="text-sm text-white" style={{ fontWeight: 900 }}>A</span> },
                  ]}
                />

                <Field label="Espaciado general" labelClassName={LABEL_CLASS}>
                  <select className={INPUT_CLASS} value={draft.spacing} onChange={(e) => patch("spacing", e.target.value as StoreTheme["spacing"])}>
                    <option value="compact">Compacto</option>
                    <option value="normal">Normal</option>
                    <option value="spacious">Espacioso</option>
                  </select>
                </Field>
                {/* Escala tipográfica global (Brandon 2026-06-26) */}
                <StylePicker
                  label="Tamaño de toda la letra"
                  value={draft.fontScale ?? "normal"}
                  onChange={(v) => patch("fontScale", v)}
                  cols={3}
                  options={[
                    { value: "small", label: "Chico", preview: <span className="text-[length:var(--ts-2xs)] font-bold text-white/70">Aa</span> },
                    { value: "normal", label: "Normal", preview: <span className="text-[length:var(--ts-sm)] font-bold text-white/80">Aa</span> },
                    { value: "large", label: "Grande", preview: <span className="text-base font-bold text-white">Aa</span> },
                  ]}
                />
              </>
            )}

            {panel === "estilos" && (
              <>
                <StylePicker label="Estilo de cards" value={draft.cardStyle} onChange={(v) => patch("cardStyle", v)}
                  options={[
                    { value: "minimal", label: "Minimal", preview: <span className="h-6 w-9 rounded bg-white border border-gray-300" /> },
                    { value: "shadow", label: "Shadow", preview: <span className="h-6 w-9 rounded bg-white shadow-md" /> },
                    { value: "border", label: "Border", preview: <span className="h-6 w-9 rounded bg-white border-2 border-gray-500" /> },
                    { value: "glass", label: "Glass", preview: <span className="h-6 w-9 rounded bg-white/40 backdrop-blur-sm border border-white/70" /> },
                  ]} />
                <StylePicker label="Botones" value={draft.buttonStyle} onChange={(v) => patch("buttonStyle", v)} cols={3}
                  options={[
                    { value: "rounded", label: "Rounded", preview: <span className="h-5 w-10 rounded-lg bg-[var(--data-success-500)]" /> },
                    { value: "square", label: "Square", preview: <span className="h-5 w-10 rounded-none bg-[var(--data-success-500)]" /> },
                    { value: "pill", label: "Pill", preview: <span className="h-5 w-10 rounded-full bg-[var(--data-success-500)]" /> },
                  ]} />
                <StylePicker label="Navbar" value={draft.navbarStyle} onChange={(v) => patch("navbarStyle", v)}
                  options={[
                    { value: "solid", label: "Solid", preview: <span className="h-4 w-12 rounded bg-gray-700" /> },
                    { value: "transparent", label: "Transp.", preview: <span className="h-4 w-12 rounded border border-gray-500" /> },
                    { value: "blur", label: "Blur", preview: <span className="h-4 w-12 rounded bg-white/25 backdrop-blur" /> },
                    { value: "minimal", label: "Minimal", preview: <span className="h-4 w-12 border-b-2 border-gray-500" /> },
                  ]} />
                <StylePicker label="Sombras" value={draft.shadowLevel} onChange={(v) => patch("shadowLevel", v)} cols={3}
                  options={[
                    { value: "none", label: "Sin", preview: <span className="h-6 w-9 rounded bg-white" /> },
                    { value: "soft", label: "Suave", preview: <span className="h-6 w-9 rounded bg-white shadow-md" /> },
                    { value: "deep", label: "Profunda", preview: <span className="h-6 w-9 rounded bg-white shadow-2xl" /> },
                  ]} />
                <StylePicker label="Animaciones" value={draft.animations} onChange={(v) => patch("animations", v)} cols={3}
                  options={[
                    { value: "none", label: "Ninguna", preview: <X className="h-4 w-4 text-gray-400" /> },
                    { value: "subtle", label: "Sutil", preview: <Sparkles className="h-4 w-4 text-gray-300" /> },
                    { value: "dynamic", label: "Dinámica", preview: <Sparkles className="h-5 w-5 text-[var(--data-success-500)]" /> },
                  ]} />
                <StylePicker label="Fondo" value={draft.backgroundPattern} onChange={(v) => patch("backgroundPattern", v)}
                  options={[
                    { value: "none", label: "Plano", preview: <span className="h-6 w-9 rounded bg-gray-100" /> },
                    { value: "dots", label: "Dots", preview: <span className="h-6 w-9 rounded bg-gray-100" style={{ backgroundImage: "radial-gradient(circle, #9ca3af 1px, transparent 1px)", backgroundSize: "5px 5px" }} /> },
                    { value: "waves", label: "Waves", preview: <span className="h-6 w-9 rounded bg-linear-to-r from-gray-200 via-gray-100 to-gray-200" /> },
                    { value: "gradient", label: "Gradient", preview: <span className="h-6 w-9 rounded bg-linear-to-br from-gray-200 to-gray-500" /> },
                  ]} />
                {/* Animaciones de entrada al scrollear (Brandon 2026-06-26) */}
                <div className="flex items-center justify-between rounded-lg bg-white/[0.03] border border-white/10 px-2.5 py-2">
                  <span className="text-xs text-gray-200">Animar secciones al scrollear (fade + slide)</span>
                  <Toggle checked={draft.animateOnScroll ?? false} onChange={(v) => patch("animateOnScroll", v)} />
                </div>
              </>
            )}

            {panel === "contacto" && (
              <>
                <Field label="WhatsApp" labelClassName={LABEL_CLASS}>
                  <input className={INPUT_CLASS} value={draft.whatsapp} onChange={(e) => patch("whatsapp", e.target.value)} placeholder="+51 999 999 999" />
                </Field>
                <Field label="Mensaje WhatsApp" labelClassName={LABEL_CLASS}>
                  <textarea className={cn(INPUT_CLASS, "resize-none")} rows={2} value={draft.whatsappMessage} onChange={(e) => patch("whatsappMessage", e.target.value)} />
                </Field>
                {/* Botón flotante de WhatsApp (Brandon 2026-06-26) */}
                <div className="flex items-center justify-between rounded-lg bg-white/[0.03] border border-white/10 px-2.5 py-2">
                  <span className="text-xs text-gray-200">Burbuja flotante de WhatsApp en la tienda</span>
                  <Toggle checked={draft.whatsappFloatEnabled ?? false} onChange={(v) => patch("whatsappFloatEnabled", v)} />
                </div>
                <Field label="Email" labelClassName={LABEL_CLASS}>
                  <input className={INPUT_CLASS} value={draft.email} onChange={(e) => patch("email", e.target.value)} />
                </Field>
                <Field label="Teléfono" labelClassName={LABEL_CLASS}>
                  <input className={INPUT_CLASS} value={draft.phone} onChange={(e) => patch("phone", e.target.value)} />
                </Field>
                <Field label="Direccion" labelClassName={LABEL_CLASS}>
                  <input className={INPUT_CLASS} value={draft.address} onChange={(e) => patch("address", e.target.value)} />
                </Field>
                <div className="space-y-2">
                  <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]">Horario</p>
                  {DAYS.map((day) => (
                    <div key={day} className="grid grid-cols-3 gap-2 items-center rounded-lg bg-white/[0.03] border border-white/10 p-2">
                      <span className="text-[length:var(--ts-xs)] font-semibold text-[var(--text-tertiary)] capitalize">{day}</span>
                      <input className={cn(INPUT_CLASS, "px-2 py-1.5 text-xs")} value={draft.schedules[day].open} onChange={(e) => patchSchedule(day, "open", e.target.value)} />
                      <input className={cn(INPUT_CLASS, "px-2 py-1.5 text-xs")} value={draft.schedules[day].close} onChange={(e) => patchSchedule(day, "close", e.target.value)} />
                    </div>
                  ))}
                </div>
              </>
            )}

            {panel === "automatizacion" && (
              <>
                {/* Lote G: sugerencia contextual — sin herramientas de conversión activas. */}
                {!draft.freeShipEnabled && !draft.welcomePopupEnabled && !draft.exitIntentEnabled && (draft.announcements ?? []).length === 0 && !draft.openStatusEnabled && (
                  <div className="flex items-start gap-2 rounded-lg border border-[var(--data-warning-500)]/30 bg-[var(--data-warning-500)]/10 px-3 py-2.5">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning-500)]" aria-hidden />
                    <p className="text-[length:var(--ts-2xs)] leading-snug text-gray-200">No tenés ninguna <strong className="text-white">herramienta de conversión</strong> activa. Probá una barra de envío gratis, un popup de bienvenida o anuncios — ayudan a vender más.</p>
                  </div>
                )}
                {/* Conversión (Brandon 2026-06-26): envío gratis, prueba social,
                    abierto/cerrado, tema estacional. */}
                <div className="flex items-center justify-between rounded-lg bg-white/[0.03] border border-white/10 p-2.5">
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-[var(--text-tertiary)]">Barra de envío gratis</span>
                    <p className="text-[length:var(--ts-2xs)] text-gray-500">&quot;Te faltan S/ X para envío gratis&quot; · sube con el carrito</p>
                  </div>
                  <Toggle checked={draft.freeShipEnabled ?? false} onChange={(v) => patch("freeShipEnabled", v)} />
                </div>
                {draft.freeShipEnabled && (
                  <>
                    <Field label="Monto para envío gratis (S/)" labelClassName={LABEL_CLASS}>
                      <input type="number" min={0} step={1} className={INPUT_CLASS} value={draft.freeShipThreshold ?? 50} onChange={(e) => patch("freeShipThreshold", Number(e.target.value) || 0)} placeholder="50" />
                    </Field>
                    <Field label="Texto (opcional · usá {falta})" labelClassName={LABEL_CLASS}>
                      <input className={INPUT_CLASS} value={draft.freeShipText ?? ""} onChange={(e) => patch("freeShipText", e.target.value)} placeholder="Te faltan {falta} para envío gratis" />
                    </Field>
                  </>
                )}

                <div className="flex items-center justify-between rounded-lg bg-white/[0.03] border border-white/10 p-2.5">
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-[var(--text-tertiary)]">Prueba social en vivo</span>
                    <p className="text-[length:var(--ts-2xs)] text-gray-500">Avisos &quot;Alguien pidió X hace 5 min&quot; desde tus pedidos reales</p>
                  </div>
                  <Toggle checked={draft.socialProofEnabled ?? false} onChange={(v) => patch("socialProofEnabled", v)} />
                </div>

                <div className="flex items-center justify-between rounded-lg bg-white/[0.03] border border-white/10 p-2.5">
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-[var(--text-tertiary)]">Estado Abierto / Cerrado</span>
                    <p className="text-[length:var(--ts-2xs)] text-gray-500">Badge &quot;Abierto · cierra 10pm&quot; con tus horarios de Contacto</p>
                  </div>
                  <Toggle checked={draft.openStatusEnabled ?? false} onChange={(v) => patch("openStatusEnabled", v)} />
                </div>

                {/* #8 Excepciones de horario (feriados) */}
                {draft.openStatusEnabled && (
                  <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
                    <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-gray-300">Excepciones de horario</p>
                    <p className="text-[length:var(--ts-2xs)] text-gray-500">Feriados o días especiales que pisan tu horario normal.</p>
                    {(draft.scheduleExceptions ?? []).map((ex, i, arr) => (
                      <div key={i} className="flex items-center gap-1.5 rounded-lg border border-white/10 p-2">
                        <input type="date" value={ex.date} onChange={(e) => patch("scheduleExceptions", arr.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} className={cn(INPUT_CLASS, "w-36 shrink-0")} aria-label="Fecha" />
                        <input value={ex.label} onChange={(e) => patch("scheduleExceptions", arr.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="Ej. Navidad: Cerrado" className={INPUT_CLASS} />
                        <label className="flex shrink-0 items-center gap-1 text-[length:var(--ts-2xs)] text-gray-300" title="Cerrado ese día">
                          <input type="checkbox" checked={ex.closed} onChange={(e) => patch("scheduleExceptions", arr.map((x, j) => (j === i ? { ...x, closed: e.target.checked } : x)))} className="accent-[var(--data-error-500)]" /> Cerrado
                        </label>
                        <button type="button" onClick={() => patch("scheduleExceptions", arr.filter((_, j) => j !== i))} aria-label="Quitar excepción" className="shrink-0 text-gray-500 transition-colors hover:text-[var(--data-error-500)]">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    <button type="button" onClick={() => patch("scheduleExceptions", [...(draft.scheduleExceptions ?? []), { date: "", label: "", closed: true }])} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/15 bg-white/[0.03] px-3 py-2 text-xs font-bold text-gray-300 transition-colors hover:border-[var(--accent-soft)] hover:text-white">
                      <Plus className="h-3.5 w-3.5" /> Agregar excepción
                    </button>
                  </div>
                )}

                {/* #8 Anuncios rotativos (barra superior) */}
                <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-gray-300">Anuncios rotativos</p>
                  <p className="text-[length:var(--ts-2xs)] text-gray-500">Barra arriba de la tienda; varios mensajes rotan cada 4s.</p>
                  {(draft.announcements ?? []).map((msg, i, arr) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <input value={msg} onChange={(e) => patch("announcements", arr.map((x, j) => (j === i ? e.target.value : x)))} placeholder="Ej. Envío gratis hoy en toda la tienda" className={INPUT_CLASS} maxLength={90} />
                      <button type="button" onClick={() => patch("announcements", arr.filter((_, j) => j !== i))} aria-label="Quitar anuncio" className="shrink-0 text-gray-500 transition-colors hover:text-[var(--data-error-500)]">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => patch("announcements", [...(draft.announcements ?? []), ""])} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/15 bg-white/[0.03] px-3 py-2 text-xs font-bold text-gray-300 transition-colors hover:border-[var(--accent-soft)] hover:text-white">
                    <Plus className="h-3.5 w-3.5" /> Agregar anuncio
                  </button>
                  {(draft.announcements ?? []).length > 1 && (
                    <StylePicker
                      label="Velocidad de rotación"
                      cols={4}
                      value={String(draft.announcementInterval ?? 4)}
                      onChange={(v) => patch("announcementInterval", Number(v))}
                      options={[
                        { value: "2", label: "2s", preview: <span className="text-xs font-bold text-gray-300">2s</span> },
                        { value: "4", label: "4s", preview: <span className="text-xs font-bold text-gray-300">4s</span> },
                        { value: "8", label: "8s", preview: <span className="text-xs font-bold text-gray-300">8s</span> },
                        { value: "0", label: "Manual", preview: <span className="text-[length:var(--ts-2xs)] font-bold text-gray-300">‹ ›</span> },
                      ]}
                    />
                  )}
                </div>

                {/* #8 Exit-intent popup */}
                <div className="flex items-center justify-between rounded-lg bg-white/[0.03] border border-white/10 p-2.5">
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-[var(--text-tertiary)]">Popup al intentar salir</span>
                    <p className="text-[length:var(--ts-2xs)] text-gray-500">Aparece al ir a cerrar la pestaña · ofrece un cupón</p>
                  </div>
                  <Toggle checked={draft.exitIntentEnabled ?? false} onChange={(v) => patch("exitIntentEnabled", v)} />
                </div>
                {draft.exitIntentEnabled && (
                  <>
                    <Field label="Título" labelClassName={LABEL_CLASS}>
                      <input className={INPUT_CLASS} value={draft.exitIntentTitle ?? ""} onChange={(e) => patch("exitIntentTitle", e.target.value)} maxLength={60} />
                    </Field>
                    <Field label="Mensaje" labelClassName={LABEL_CLASS}>
                      <input className={INPUT_CLASS} value={draft.exitIntentMessage ?? ""} onChange={(e) => patch("exitIntentMessage", e.target.value)} maxLength={120} />
                    </Field>
                    <Field label="Cupón (opcional)" labelClassName={LABEL_CLASS}>
                      <input className={INPUT_CLASS} value={draft.exitIntentCoupon ?? ""} onChange={(e) => patch("exitIntentCoupon", e.target.value)} maxLength={20} />
                    </Field>
                  </>
                )}

                {/* #8 Widget de chat flotante (posición + burbuja) */}
                <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-gray-300">Botón de chat (WhatsApp)</p>
                  <StylePicker
                    label="Posición"
                    cols={2}
                    value={draft.chatPosition ?? "right"}
                    onChange={(v) => patch("chatPosition", v as "right" | "left")}
                    options={[
                      { value: "right", label: "Derecha", preview: <span className="ml-auto block h-3 w-3 rounded-full bg-white/40" /> },
                      { value: "left", label: "Izquierda", preview: <span className="mr-auto block h-3 w-3 rounded-full bg-white/40" /> },
                    ]}
                  />
                  <Field label="Texto de la burbuja" labelClassName={LABEL_CLASS}>
                    <input className={INPUT_CLASS} value={draft.chatBubbleText ?? ""} onChange={(e) => patch("chatBubbleText", e.target.value)} maxLength={80} placeholder="¿Necesitas ayuda? Escribenos" />
                  </Field>
                </div>

                <Field label="Tema estacional (1 clic)" labelClassName={LABEL_CLASS}>
                  <select className={INPUT_CLASS} value={draft.seasonalTheme ?? "none"} onChange={(e) => patch("seasonalTheme", e.target.value as StoreTheme["seasonalTheme"])}>
                    <option value="none">Ninguno</option>
                    <option value="navidad">Navidad</option>
                    <option value="fiestas_patrias">Fiestas Patrias</option>
                    <option value="halloween">Halloween</option>
                  </select>
                </Field>
                <p className="-mt-1 text-[length:var(--ts-2xs)] text-gray-500">Agrega un detalle de temporada (cinta + efecto) sin tocar tus colores.</p>

                <div className="my-1.5 border-t border-white/10" />

                {/* Contador de oferta (Brandon 2026-06-26) */}
                <div className="flex items-center justify-between rounded-lg bg-white/[0.03] border border-white/10 p-2.5">
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-[var(--text-tertiary)]">Contador de oferta</span>
                    <p className="text-[length:var(--ts-2xs)] text-gray-500">Banda con cuenta regresiva arriba de la tienda · urgencia</p>
                  </div>
                  <Toggle checked={draft.countdownEnabled ?? false} onChange={(v) => patch("countdownEnabled", v)} />
                </div>
                {draft.countdownEnabled && (
                  <>
                    <Field label="Texto del contador" labelClassName={LABEL_CLASS}>
                      <input className={INPUT_CLASS} value={draft.countdownTitle ?? ""} onChange={(e) => patch("countdownTitle", e.target.value)} placeholder="¡Oferta por tiempo limitado!" />
                    </Field>
                    <Field label="Termina el" labelClassName={LABEL_CLASS}>
                      <input type="datetime-local" className={INPUT_CLASS} value={draft.countdownEndsAt ?? ""} onChange={(e) => patch("countdownEndsAt", e.target.value)} />
                    </Field>
                  </>
                )}

                {/* Testimonios (Brandon 2026-06-26) */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[var(--text-tertiary)]">Testimonios</span>
                    <button type="button" onClick={addTestimonial} className="inline-flex items-center gap-1 rounded-md bg-[var(--data-success-500)]/15 px-2 py-1 text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-500)] hover:bg-[var(--data-success-500)]/25 transition-colors">
                      <Plus className="h-3 w-3" strokeWidth={2.5} aria-hidden /> Agregar
                    </button>
                  </div>
                  {(draft.testimonials ?? []).length === 0 && (
                    <p className="text-[length:var(--ts-2xs)] text-gray-500">Sin reseñas. Agregá las opiniones de tus clientes.</p>
                  )}
                  {(draft.testimonials ?? []).map((t, idx) => (
                    <div key={idx} className="space-y-1.5 rounded-lg bg-white/[0.03] border border-white/10 p-2.5">
                      <div className="flex items-center gap-2">
                        <input className={cn(INPUT_CLASS, "flex-1")} value={t.name} onChange={(e) => updateTestimonial(idx, "name", e.target.value)} placeholder="Nombre del cliente" />
                        <button type="button" onClick={() => removeTestimonial(idx)} aria-label="Quitar reseña" className="shrink-0 text-[var(--data-error-500)] hover:opacity-80 transition-opacity">
                          <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden />
                        </button>
                      </div>
                      <select className={INPUT_CLASS} value={t.stars} onChange={(e) => updateTestimonial(idx, "stars", Number(e.target.value))}>
                        {[5, 4, 3, 2, 1].map((s) => <option key={s} value={s}>{"★".repeat(s)} ({s})</option>)}
                      </select>
                      <textarea className={cn(INPUT_CLASS, "resize-none")} rows={2} value={t.comment} onChange={(e) => updateTestimonial(idx, "comment", e.target.value)} placeholder="Comentario de la reseña…" />
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between rounded-lg bg-white/[0.03] border border-white/10 p-2.5">
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-[var(--text-tertiary)]">Popup de bienvenida</span>
                    <p className="text-[length:var(--ts-2xs)] text-gray-500">Aparece al entrar a tu tienda · con cupón opcional</p>
                  </div>
                  <Toggle checked={draft.welcomePopupEnabled} onChange={(v) => patch("welcomePopupEnabled", v)} />
                </div>

                {draft.welcomePopupEnabled && (
                  <>
                    <Field label="Título del popup" labelClassName={LABEL_CLASS}>
                      <input className={INPUT_CLASS} value={draft.welcomePopupTitle} onChange={(e) => patch("welcomePopupTitle", e.target.value)} placeholder="¡Bienvenido!" />
                    </Field>
                    <Field label="Mensaje" labelClassName={LABEL_CLASS}>
                      <textarea className={cn(INPUT_CLASS, "resize-none")} rows={3} value={draft.welcomePopupMessage} onChange={(e) => patch("welcomePopupMessage", e.target.value)} placeholder="10% de descuento en tu primera compra" />
                    </Field>
                    <Field label="Cupón (opcional)" labelClassName={LABEL_CLASS}>
                      <input className={INPUT_CLASS} value={draft.welcomePopupCoupon} onChange={(e) => patch("welcomePopupCoupon", e.target.value)} placeholder="BIENVENIDO10" />
                    </Field>

                    {/* Vista previa del popup tal cual lo verá el cliente */}
                    <div>
                      <p className={LABEL_CLASS}>Vista previa</p>
                      <div className="rounded-xl border border-white/10 bg-white p-4 shadow-xl">
                        <p className="text-base font-black" style={{ color: draft.primaryColor }}>{draft.welcomePopupTitle || "¡Bienvenido!"}</p>
                        <p className="mt-1 text-xs text-gray-600">{draft.welcomePopupMessage || "10% de descuento en tu primera compra"}</p>
                        {draft.welcomePopupCoupon && (
                          <span className="mt-2 inline-block rounded-md border-2 border-dashed px-3 py-1 font-mono text-sm font-bold" style={{ borderColor: draft.primaryColor, color: draft.primaryColor }}>{draft.welcomePopupCoupon}</span>
                        )}
                        <span className="mt-3 block w-full rounded-lg py-2 text-center text-xs font-bold text-white" style={{ backgroundColor: draft.primaryColor }}>Empezar a comprar</span>
                      </div>
                    </div>
                  </>
                )}

                <Field label="Texto del footer" labelClassName={LABEL_CLASS}>
                  <input className={INPUT_CLASS} value={draft.footerText} onChange={(e) => patch("footerText", e.target.value)} placeholder="© Tu tienda · Hecho con cariño" />
                </Field>
              </>
            )}

            {panel === "avanzado" && (
              <>
                <Field label="Google Analytics ID" labelClassName={LABEL_CLASS}>
                  <input className={INPUT_CLASS} value={draft.analyticsId} onChange={(e) => patch("analyticsId", e.target.value)} placeholder="G-XXXXXXXXXX" />
                </Field>
                <Field label="Facebook Pixel ID" labelClassName={LABEL_CLASS}>
                  <input className={INPUT_CLASS} value={draft.pixelId} onChange={(e) => patch("pixelId", e.target.value)} />
                </Field>
                <div className="space-y-1.5">
                  <p className={LABEL_CLASS}>Favicon</p>
                  <div className="dark max-w-[110px]">
                    <ImageUpload
                      value={draft.favicon}
                      onChange={(url) => patch("favicon", url)}
                      onClear={() => patch("favicon", "")}
                      folder="store-customizer"
                      aspectRatio="square"
                      label=""
                    />
                  </div>
                  <p className="text-[length:var(--ts-2xs)] text-gray-500">Ícono de la pestaña · cuadrado · PNG/SVG</p>
                </div>
                <Field label="Custom CSS" labelClassName={LABEL_CLASS}>
                  <textarea className={cn(INPUT_CLASS, "resize-none font-mono text-xs")} rows={6} value={draft.customCSS} onChange={(e) => patch("customCSS", e.target.value)} />
                </Field>

                {/* #10 Exportar / Importar tema (clonar look entre sucursales) */}
                <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <p className="text-sm font-bold text-white">Exportar / Importar tema</p>
                  <p className="text-[length:var(--ts-2xs)] leading-snug text-gray-400">Guardá toda la personalización como archivo y aplicala en otra de tus tiendas.</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={exportTheme} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-gray-200 transition-colors hover:border-[var(--accent-soft)] hover:text-white">
                      <Download className="h-3.5 w-3.5" /> Exportar
                    </button>
                    <label className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-gray-200 transition-colors hover:border-[var(--accent-soft)] hover:text-white">
                      <Upload className="h-3.5 w-3.5" /> Importar
                      <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importTheme(f); e.target.value = ""; }} />
                    </label>
                  </div>
                  {importError && <p className="text-[length:var(--ts-2xs)] font-semibold text-[var(--data-error-500)]">{importError}</p>}
                </div>
              </>
            )}

            {panel === "historial" && (
              <div className="space-y-3">
                {/* Lote E: guardar una versión con nombre (ej. "Versión Navidad") */}
                <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
                  <p className={LABEL_CLASS}>Guardar versión con nombre</p>
                  <div className="flex items-center gap-1.5">
                    <input className={INPUT_CLASS} value={versionName} onChange={(e) => setVersionName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") saveNamedVersion(); }} placeholder="Ej. Versión Navidad" maxLength={40} />
                    <button type="button" onClick={saveNamedVersion} disabled={!versionName.trim()} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[var(--data-success-500)] px-3 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40">
                      <Save className="h-3.5 w-3.5" /> Guardar
                    </button>
                  </div>
                </div>
                <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]">Versiones guardadas</p>

                {/* Lote G: comparación side-by-side de 2 versiones seleccionadas. */}
                {compareIdx.length === 2 && (
                  <div className="rounded-lg border border-[var(--accent-soft)]/40 bg-[var(--accent-soft)]/10 p-2.5">
                    <p className="mb-2 text-[length:var(--ts-2xs)] font-bold text-[var(--accent-soft)]">Comparando 2 versiones</p>
                    <div className="grid grid-cols-2 gap-2">
                      {compareIdx.map((ci) => {
                        const sn = savedSnapshots[ci];
                        if (!sn) return null;
                        return (
                          <div key={ci} className="rounded-md border border-white/10 bg-white/[0.03] p-2">
                            <p className="truncate text-[length:var(--ts-2xs)] font-bold text-white">{sn.name || "Sin nombre"}</p>
                            <p className="mb-1.5 text-[length:var(--ts-2xs)] text-gray-500">{sn.savedAt}</p>
                            <div className="flex gap-1">
                              <span className="h-4 w-4 rounded-full border border-gray-600" style={{ backgroundColor: sn.theme.primaryColor }} />
                              <span className="h-4 w-4 rounded-full border border-gray-600" style={{ backgroundColor: sn.theme.secondaryColor }} />
                              <span className="h-4 w-4 rounded-full border border-gray-600" style={{ backgroundColor: sn.theme.accentColor }} />
                            </div>
                            <p className="mt-1.5 text-[length:var(--ts-2xs)] text-gray-400">{sn.theme.fontFamily}{sn.theme.darkModeDefault ? " · Dark" : ""}</p>
                            <button type="button" onClick={() => pushChange(sn.theme)} className="mt-1.5 w-full rounded bg-[var(--data-success-500)]/15 py-1 text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-500)] transition-colors hover:bg-[var(--data-success-500)]/25">Usar esta</button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {savedSnapshots.length === 0 ? (
                  <p className="text-xs text-[var(--text-secondary)]">Aún no hay versiones. Guarda cambios para crear una.</p>
                ) : (
                  savedSnapshots.map((snap, idx) => (
                    <div key={idx} className={cn("rounded-lg bg-white/[0.03] border p-2.5 space-y-2", compareIdx.includes(idx) ? "border-[var(--accent-soft)]" : "border-white/10")}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate text-[length:var(--ts-2xs)] font-bold text-white">
                          {snap.name || <span className="font-normal text-[var(--text-tertiary)]">Sin nombre</span>}
                          <span className="ml-1.5 font-normal text-[var(--text-tertiary)]">· {snap.savedAt}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleCompare(idx)}
                          className={cn("shrink-0 text-[length:var(--ts-2xs)] font-bold transition-colors", compareIdx.includes(idx) ? "text-[var(--accent-soft)]" : "text-gray-500 hover:text-white")}
                        >
                          Comparar
                        </button>
                        <button
                          type="button"
                          onClick={() => pushChange(snap.theme)}
                          className="shrink-0 text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-500)] hover:text-[var(--data-success-500)] transition-colors"
                        >
                          Restaurar
                        </button>
                      </div>
                      {/* #5 Miniatura sintética de la versión */}
                      <VersionThumbnail theme={snap.theme} />
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                          <span className="h-4 w-4 rounded-full border border-gray-600" style={{ backgroundColor: snap.theme.primaryColor }} />
                          <span className="h-4 w-4 rounded-full border border-gray-600" style={{ backgroundColor: snap.theme.secondaryColor }} />
                          <span className="h-4 w-4 rounded-full border border-gray-600" style={{ backgroundColor: snap.theme.accentColor }} />
                        </div>
                        <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{snap.theme.fontFamily}</span>
                        {snap.theme.darkModeDefault && (
                          <span className="text-[length:var(--ts-2xs)] px-1.5 py-0.5 rounded bg-gray-700 text-[var(--text-tertiary)]">Dark</span>
                        )}
                      </div>
                      <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] font-semibold truncate">{snap.theme.storeName}</p>
                    </div>
                  ))
                )}
              </div>
            )}
            </>
            )}
          </div>
        </aside>

        <main className="flex-1 bg-linear-to-br from-gray-950 to-gray-900 flex items-start justify-center p-6 overflow-auto">
          {livePreview ? (
            <div className={cn("flex gap-6 w-full justify-center items-start", !splitPreview && "h-full")}>
              {splitPreview && (
                <div className="flex flex-col items-center gap-2 shrink-0" style={{ width: "48%", maxWidth: "640px" }}>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-800 text-xs font-bold text-gray-400 uppercase tracking-wider">
                    <Clock className="h-3 w-3" />
                    Guardado
                  </span>
                  <PreviewBrowserFrame
                    url={`/t/${tenantSlug}`}
                    iframeKey={0}
                    src={`/t/${tenantSlug}`}
                    title="Versión actual"
                  />
                </div>
              )}
              <div
                className={cn("flex flex-col items-center gap-2", splitPreview && "shrink-0")}
                style={
                  splitPreview
                    ? { width: "48%", maxWidth: "640px" }
                    : customWidth !== null
                    ? { width: `${customWidth}px` }
                    : viewport === "mobile"
                    ? { width: "390px" }
                    : viewport === "tablet"
                    ? { width: "768px" }
                    : { width: "100%", maxWidth: "1280px" }
                }
              >
                {splitPreview && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--data-success-500)]/15 text-xs font-bold text-[var(--data-success-500)] uppercase tracking-wider">
                    <Sparkles className="h-3 w-3" />
                    Borrador
                  </span>
                )}
                <PreviewBrowserFrame
                  url={`/t/${tenantSlug}?preview=true`}
                  iframeKey={iframeKey}
                  src={`/t/${tenantSlug}?preview=true`}
                  title="Vista previa en vivo"
                />
              </div>
            </div>
          ) : (
          <div
            className="bg-white dark:bg-[var(--color-card)] rounded-xl overflow-hidden shadow-[var(--shadow-xl)] border border-gray-700/50 transition-all duration-[var(--dur-base)] w-full"
            style={{
              ...(viewport === "mobile"
                ? { width: "390px" }
                : viewport === "tablet"
                ? { width: "768px" }
                : { width: "100%", maxWidth: "1280px" }),
              minHeight: "calc(100vh - 130px)",
              fontFamily,
            }}
          >
            <div className={cn("min-h-full", draft.darkModeDefault ? "bg-gray-950 text-white" : "bg-gray-50 text-[var(--text-primary)]")}>
              <div className="px-4 py-3 border-b" style={{ borderColor: draft.darkModeDefault ? "#1f2937" : "#e5e7eb", background: draft.navbarStyle === "transparent" ? "transparent" : draft.primaryColor }}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="relative h-9 w-9 rounded-xl bg-white/20 flex items-center justify-center overflow-hidden">
                      {draft.logo ? (
                        <Image src={draft.logo} alt={`Logo de ${draft.storeName || "la tienda"}`} fill sizes="36px" className="object-cover" unoptimized={draft.logo.startsWith("data:")} />
                      ) : (
                        <span className="text-sm font-extrabold text-white">{draft.storeName.slice(0, 2).toUpperCase()}</span>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-extrabold text-white">{draft.storeName || "Mi tienda"}</p>
                      <p className="text-[length:var(--ts-2xs)] text-white/80 line-clamp-1">{draft.slogan || "Tu tienda de confianza"}</p>
                    </div>
                  </div>
                  <span className="text-[length:var(--ts-2xs)] font-bold text-white/80">Preview</span>
                </div>
              </div>

              {draft.sections.includes("hero") && (
                <div
                  className="px-4 py-6"
                  style={{
                    background: draft.heroImage
                      ? `linear-gradient(135deg, ${draft.primaryColor}cc, ${draft.accentColor}cc), url(${draft.heroImage}) center/cover`
                      : `linear-gradient(135deg, ${draft.primaryColor}, ${draft.accentColor})`,
                  }}
                >
                  <div className="max-w-xl">
                    <p className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold bg-white/25 text-white px-2 py-1 rounded-full">
                      <Sparkles className="h-3 w-3" />
                      {draft.heroBadge || "Oferta"}
                    </p>
                    <SectionTitle className="mt-3 text-2xl font-extrabold text-white leading-tight">{draft.heroTitle || "Todo lo que necesitas"}</SectionTitle>
                    <p className="mt-2 text-sm text-white/90 line-clamp-2">{draft.heroSubtitle || "Delivery rápido en tu zona"}</p>
                    <button
                      type="button"
                      className="mt-4 text-sm font-bold text-white px-4 py-2"
                      style={{
                        backgroundColor: draft.secondaryColor,
                        borderRadius: draft.buttonStyle === "pill" ? 999 : draft.buttonStyle === "square" ? 4 : draft.borderRadius,
                      }}
                    >
                      {draft.heroCTA || "Ver productos"}
                    </button>
                  </div>
                </div>
              )}

              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-extrabold">Productos destacados</CardTitle>
                  <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{draft.sections.length} secciones activas</span>
                </div>

                <div className={cn("grid grid-cols-2 gap-3", viewport === "desktop" && "sm:grid-cols-3 lg:grid-cols-4")}
                >
                  {(storeProducts.length > 0 ? storeProducts : [
                    { name: "Arroz premium 5kg", price: 23.90 },
                    { name: "Aceite vegetal 1L", price: 9.50 },
                    { name: "Leche entera 400g", price: 4.80 },
                    { name: "Azucar rubia 1kg", price: 5.20 },
                  ]).map((p, i) => (
                    <PreviewCard key={i} title={p.name} price={`S/ ${Number(p.price).toFixed(2)}`} primaryColor={draft.primaryColor} borderRadius={draft.borderRadius} styleVariant={draft.cardStyle} />
                  ))}
                </div>

                {/* Tienda sections preview */}
                {tiendaSectionsEnabled.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]">Secciones de tienda</p>
                    {tiendaSectionsEnabled.map((key) => (
                      <div
                        key={key}
                        className="flex items-center gap-2 rounded-lg px-3 py-2 border"
                        style={{
                          borderColor: draft.darkModeDefault ? "#374151" : "#e5e7eb",
                          backgroundColor: draft.darkModeDefault ? "#111827" : "#f9fafb",
                        }}
                      >
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: draft.primaryColor }}
                        />
                        <span className="text-xs font-semibold" style={{ color: draft.darkModeDefault ? "#e5e7eb" : "#374151" }}>
                          {TIENDA_SECTION_LABELS[key] ?? key}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="rounded-xl p-3 border" style={{ borderColor: draft.darkModeDefault ? "#374151" : "#e5e7eb" }}>
                  <p className="text-xs font-bold mb-2">Herramientas activas</p>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-[length:var(--ts-2xs)] px-2 py-1 rounded-full bg-[var(--accent-soft)] text-[var(--data-success-500)]">{draft.cartStyle}</span>
                    <span className="text-[length:var(--ts-2xs)] px-2 py-1 rounded-full bg-[var(--accent-soft)] text-[var(--data-success-500)]">{draft.buttonStyle}</span>
                    <span className="text-[length:var(--ts-2xs)] px-2 py-1 rounded-full bg-[var(--surface-sunken)] text-[var(--text-primary)]">{draft.animations}</span>
                    <span className="text-[length:var(--ts-2xs)] px-2 py-1 rounded-full bg-[var(--data-warning-100)] text-[var(--data-warning-500)]">{draft.backgroundPattern}</span>
                    <span className="text-[length:var(--ts-2xs)] px-2 py-1 rounded-full bg-slate-100 text-slate-700">{draft.fontFamily}</span>
                  </div>
                </div>

                {draft.welcomePopupEnabled && (
                  <div className="rounded-xl border p-3 bg-white dark:bg-[var(--color-card)]" style={{ borderColor: draft.secondaryColor }}>
                    <p className="text-xs font-extrabold" style={{ color: draft.primaryColor }}>{draft.welcomePopupTitle || "Bienvenido"}</p>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">{draft.welcomePopupMessage || "Usa este cupon en tu primera compra"}</p>
                    <div className="mt-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[length:var(--ts-2xs)] font-bold bg-gray-100 text-[var(--text-primary)]">
                      <Check className="h-3 w-3" />
                      {draft.welcomePopupCoupon || "BIENVENIDO10"}
                    </div>
                  </div>
                )}
              </div>

              <div className="px-4 py-3 border-t text-[length:var(--ts-2xs)] text-center" style={{ borderColor: draft.darkModeDefault ? "#1f2937" : "#e5e7eb" }}>
                {draft.footerText || draft.slogan || "Tu bodega de confianza"}
              </div>
            </div>
          </div>
          )}
        </main>
      </div>
    </div>
  );
}
