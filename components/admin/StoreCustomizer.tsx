"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Palette, Store, Layout, Phone, Settings2, Image as ImageIcon,
  Save, Loader2, Check, Eye, EyeOff,
  Megaphone, Grid3x3, ShoppingBag, Tag, Package, BookOpen,
  MessageSquare, HelpCircle, Map, Sun, Moon, Type, Sliders,
  Paintbrush, FileText, Sparkles, Square, LayoutGrid,
  Smartphone, Monitor, Zap, Truck, Star, Clock, ExternalLink } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { LoadingState, PageTitle, PrimaryButton, SectionTitle } from "@buleje/design-system";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import { resolveActiveTenantSlug } from "@/lib/tenant-fetch";
import { csrfHeaders } from "@/lib/csrf-client";
import dynamic from "next/dynamic";
import StorefrontEditor from "./StorefrontEditor";

const StoreCreativeMode = dynamic(() => import("./StoreCreativeMode"), { ssr: false });
const CatalogoTiendaTab = dynamic(() => import("./store-page/CatalogoTiendaTab"), { ssr: false });
const BrandConceptTab = dynamic(() => import("./BrandConceptTab"), { ssr: false });
const CategoryBannersTab = dynamic(() => import("./CategoryBannersTab"), { ssr: false });
// Métricas del storefront — absorbidas de "Mi tienda pública" (ADR-299 fase 2).
const AnalyticsTab = dynamic(() => import("@/app/admin/store-page/_components/AnalyticsTab"), { ssr: false });
import type { SectionKey } from "./StorefrontEditor";
import ImageUpload from "./ImageUpload";
import { Field } from "@/components/admin/shared/Field";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type Tab = "identidad" | "marca" | "colores" | "secciones" | "hero" | "promos" | "contacto" | "estilos" | "contenido" | "catalogo" | "avanzado";

export interface StoreTheme {
  logo: string;
  storeName: string;
  slogan: string;
  description: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  darkModeDefault: boolean;
  heroTitle: string;
  heroSubtitle: string;
  heroCTA: string;
  heroLink: string;
  heroCtaUrl: string;
  heroBadge: string;
  // FIX 2026-05-07 (audit storefront-admin): badge debajo del avatar circular.
  // Antes "Hecho en Pucallpa" era texto fijo en el código.
  heroOriginBadge: string;
  heroImage: string;
  // Variantes de diseño del hero (Brandon 2026-06-26, page builder Fase 4):
  // editorial (default) | centered | split | immersive. Controles "editar potencia".
  heroVariant: "editorial" | "centered" | "split" | "immersive";
  heroOverlay: number; // 0-100 oscurecimiento de la foto
  heroAlign: "left" | "center";
  heroHeight: "compact" | "normal" | "tall";
  heroShowBadges: boolean;
  // Banner de anuncio (Brandon 2026-06-25): imagen full-width arriba de la página
  // de la tienda. Vacío = sin banner. Editable desde Modo Creativo > Secciones.
  announcementImage: string;
  // Imagen por sección (Brandon 2026-06-25): map clave-de-sección → URL de imagen.
  // Cada sección de la página puede tener su propia imagen. Se renderiza como
  // banda full-width en la tienda. Editable desde Modo Creativo > Secciones.
  sectionImages: Record<string, string>;
  // FIX 2026-05-07 (audit storefront-admin): chips de confianza configurables
  // de la TrustBar (la barra que scrollea con beneficios). Antes 6 chips fijas.
  trustChips: string[];
  fontFamily: string;
  borderRadius: number;
  spacing: "compact" | "normal" | "spacious";
  whatsapp: string;
  whatsappMessage: string;
  email: string;
  phone: string;
  address: string;
  schedules: Record<string, { open: string; close: string }>;
  analyticsId: string;
  pixelId: string;
  favicon: string;
  sections: SectionKey[];
  // Orden del cuerpo de la landing /t (page builder Fase 2): keys reordenables
  // del landing = trust|promos|featured|info. Default = orden histórico.
  bodyOrder: string[];
  // Estilos avanzados
  cardStyle: "minimal" | "shadow" | "border" | "glass";
  cartStyle: "sidebar" | "modal" | "drawer";
  buttonStyle: "rounded" | "square" | "pill";
  navbarStyle: "solid" | "transparent" | "blur" | "minimal";
  shadowLevel: "none" | "soft" | "deep";
  animations: "none" | "subtle" | "dynamic";
  backgroundPattern: "none" | "dots" | "waves" | "gradient";
  // Mejoras Modo Creativo (Brandon 2026-06-26): escala tipográfica global,
  // botón flotante de WhatsApp, animaciones de entrada al scrollear.
  fontScale: "small" | "normal" | "large";
  whatsappFloatEnabled: boolean;
  animateOnScroll: boolean;
  // Estilos por texto (Brandon 2026-06-26): la barra de texto flotante guarda
  // tamaño/negrita/color/alineación por campo data-live (heroTitle, heroSubtitle…).
  textStyles: Record<string, { size?: number; bold?: boolean; color?: string; align?: "left" | "center" | "right"; italic?: boolean; underline?: boolean; upper?: boolean; track?: number; tshadow?: boolean }>;
  // Contador de oferta (Brandon 2026-06-26): banda con cuenta regresiva.
  countdownEnabled: boolean;
  countdownTitle: string;
  countdownEndsAt: string; // ISO datetime
  // Testimonios (Brandon 2026-06-26): reseñas que el dueño carga.
  testimonials: Array<{ name: string; stars: number; comment: string }>;
  // Estilos POR SECCIÓN (Brandon 2026-06-26): editar un componente individual —
  // fondo/texto/espaciado aplicados SOLO a esa sección (data-pb). Edición libre.
  sectionStyles: Record<string, { bg?: string; text?: string; pad?: "sm" | "md" | "lg"; radius?: number; border?: string; borderW?: number; shadow?: "none" | "soft" | "deep" }>;
  // Contenido
  footerText: string;
  welcomePopupEnabled: boolean;
  welcomePopupTitle: string;
  welcomePopupMessage: string;
  welcomePopupCoupon: string;
  // Conversión (Brandon 2026-06-26, Modo Creativo): barra de envío gratis,
  // prueba social en vivo, estado abierto/cerrado, tema estacional 1-clic.
  freeShipEnabled: boolean;
  freeShipThreshold: number; // S/ — meta para envío gratis
  freeShipText: string; // texto opcional; "{falta}" se reemplaza por el monto
  socialProofEnabled: boolean;
  openStatusEnabled: boolean;
  seasonalTheme: "none" | "navidad" | "fiestas_patrias" | "halloween";
  customCSS: string;
  // Banners promocionales por categoría — controla "Oferta de Temporada".
  // El admin sube una imagen + textos; al click va a la categoría o producto vinculado.
  categoryBanners?: Record<string, {
    image?: string;
    title?: string;
    subtitle?: string;
    ctaText?: string;
    /** Si se setea, el CTA navega al producto en vez de filtrar la categoría. */
    productSlug?: string;
    /** Toggle para desactivar este banner sin perder los datos. */
    enabled?: boolean;
  }>;
}

const DEFAULT_THEME: StoreTheme = {
  logo: "",
  storeName: "Mi Tienda",
  slogan: "Tu tienda de confianza",
  description: "Abarrotes, bebidas y productos de primera necesidad con delivery a domicilio.",
  primaryColor: "var(--color-primary)",
  secondaryColor: "#f4a261",
  accentColor: "var(--color-primary)",
  darkModeDefault: false,
  heroTitle: "Todo lo que necesitas, en tu puerta",
  heroSubtitle: "Delivery rápido en Pucallpa. Paga con Yape o efectivo.",
  heroCTA: "Ver productos",
  heroLink: "tienda",
  heroCtaUrl: "",
  heroBadge: "Delivery gratis +S/50",
  heroOriginBadge: "Hecho en Pucallpa",
  heroImage: "",
  heroVariant: "editorial",
  heroOverlay: 0,
  heroAlign: "left",
  heroHeight: "normal",
  heroShowBadges: true,
  announcementImage: "",
  sectionImages: {},
  trustChips: [
    "Delivery gratis desde S/50",
    "Entrega en menos de 45 min",
    "Productos frescos garantizados",
    "Paga con Yape o efectivo",
    "Productos locales de Ucayali",
    "Atención personalizada",
  ],
  fontFamily: "sistema",
  borderRadius: 12,
  spacing: "normal",
  whatsapp: "",
  whatsappMessage: "Hola! Quiero hacer un pedido",
  email: "",
  phone: "",
  address: "",
  schedules: {
    lunes: { open: "07:00", close: "22:00" },
    martes: { open: "07:00", close: "22:00" },
    miercoles: { open: "07:00", close: "22:00" },
    jueves: { open: "07:00", close: "22:00" },
    viernes: { open: "07:00", close: "22:00" },
    sabado: { open: "07:00", close: "22:00" },
    domingo: { open: "08:00", close: "20:00" },
  },
  analyticsId: "",
  pixelId: "",
  favicon: "",
  sections: ["announcement", "hero", "categories", "popular", "deals", "combos", "recipes", "testimonials", "faq", "contact", "delivery_map"],
  bodyOrder: ["trust", "promos", "featured", "info"],
  cardStyle: "shadow",
  cartStyle: "sidebar",
  buttonStyle: "rounded",
  navbarStyle: "solid",
  shadowLevel: "soft",
  animations: "subtle",
  backgroundPattern: "none",
  fontScale: "normal",
  whatsappFloatEnabled: false,
  animateOnScroll: false,
  textStyles: {},
  countdownEnabled: false,
  countdownTitle: "¡Oferta por tiempo limitado!",
  countdownEndsAt: "",
  testimonials: [],
  sectionStyles: {},
  footerText: "",
  welcomePopupEnabled: false,
  welcomePopupTitle: "Bienvenido a nuestra tienda!",
  welcomePopupMessage: "Usa este cupon en tu primera compra",
  welcomePopupCoupon: "BIENVENIDO10",
  freeShipEnabled: false,
  freeShipThreshold: 50,
  freeShipText: "",
  socialProofEnabled: false,
  openStatusEnabled: false,
  seasonalTheme: "none",
  customCSS: "",
};

// ── Paleta de colores predefinidos ────────────────────────────────────────────

const COLOR_PRESETS = [
  { label: "Teal",    value: "var(--color-primary)" },
  { label: "Verde",   value: "#16a34a" },
  { label: "Azul",    value: "#2563eb" },
  { label: "Emerald", value: "#059669" },
  { label: "Rosa",    value: "#e11d48" },
  { label: "Amber",   value: "#f59e0b" },
  { label: "Gris",    value: "#475569" },
  { label: "Naranja", value: "#f0503f" },
];

const FONT_OPTIONS = [
  { value: "sistema",    label: "Sistema",      stack: "system-ui, -apple-system, sans-serif", vibe: "Neutra del SO" },
  { value: "geist",      label: "Geist",        stack: "'Geist', sans-serif",       vibe: "Moderna y técnica" },
  { value: "inter",      label: "Inter",        stack: "'Inter', sans-serif",       vibe: "Limpia y versátil" },
  { value: "poppins",    label: "Poppins",      stack: "'Poppins', sans-serif",     vibe: "Friendly y redonda" },
  { value: "montserrat", label: "Montserrat",   stack: "'Montserrat', sans-serif",  vibe: "Elegante geométrica" },
  { value: "raleway",    label: "Raleway",      stack: "'Raleway', sans-serif",     vibe: "Sofisticada delgada" },
  { value: "nunito",     label: "Nunito",       stack: "'Nunito', sans-serif",      vibe: "Calidez redondeada" },
  { value: "lato",       label: "Lato",         stack: "'Lato', sans-serif",        vibe: "Profesional cálida" },
  { value: "roboto",     label: "Roboto",       stack: "'Roboto', sans-serif",      vibe: "Estándar Android" },
  { value: "opensans",   label: "Open Sans",    stack: "'Open Sans', sans-serif",   vibe: "Legible universal" },
];

const CSS_SNIPPETS: { label: string; description: string; css: string }[] = [
  {
    label: "Borde dorado en cards",
    description: "Resalta cada producto con borde dorado",
    css: ".product-card { border: 2px solid gold; }",
  },
  {
    label: "Header con blur fuerte",
    description: "Efecto cristal esmerilado en el navbar",
    css: ".store-header { backdrop-filter: blur(24px) saturate(1.6); }",
  },
  {
    label: "Sombra azul al hover",
    description: "Las cards levantan con tinte azul al pasar el mouse",
    css: ".product-card:hover { box-shadow: 0 12px 32px rgba(37,99,235,0.25); transform: translateY(-2px); }",
  },
  {
    label: "Animación pulse en CTAs",
    description: "Los botones llaman la atención con latido suave",
    css: "button[type=submit] { animation: pulse 2s infinite; }\n@keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.04)} }",
  },
];

// ── Plantillas de tienda ────────────────────────────────────────────────────

type ThemeTemplate = {
  id: string;
  name: string;
  description: string;
  colors: Pick<StoreTheme, "primaryColor" | "secondaryColor" | "accentColor">;
  fontFamily: string;
  darkModeDefault: boolean;
};

const THEME_TEMPLATES: ThemeTemplate[] = [
  {
    id: "clasico",
    name: "Clásico",
    description: "Verde bodega + naranja. El look original.",
    colors: { primaryColor: "var(--color-primary)", secondaryColor: "#ff6b5b", accentColor: "var(--color-primary)" },
    fontFamily: "geist",
    darkModeDefault: false,
  },
  {
    id: "moderno",
    name: "Moderno",
    description: "Azul profesional + violeta. Para tiendas tech.",
    colors: { primaryColor: "var(--color-primary)", secondaryColor: "#7c3aed", accentColor: "var(--color-primary-dark)" },
    fontFamily: "inter",
    darkModeDefault: false,
  },
  {
    id: "elegante",
    name: "Elegante",
    description: "Gris oscuro + dorado. Estilo premium.",
    colors: { primaryColor: "#1e293b", secondaryColor: "#f0503f", accentColor: "#334155" },
    fontFamily: "montserrat",
    darkModeDefault: true,
  },
  {
    id: "fresco",
    name: "Fresco",
    description: "Esmeralda + rosa. Colorido y amigable.",
    colors: { primaryColor: "#059669", secondaryColor: "#e11d48", accentColor: "#10b981" },
    fontFamily: "poppins",
    darkModeDefault: false,
  },
];

const DAYS = [
  { key: "lunes",     label: "Lun" },
  { key: "martes",    label: "Mar" },
  { key: "miercoles", label: "Mié" },
  { key: "jueves",    label: "Jue" },
  { key: "viernes",   label: "Vie" },
  { key: "sabado",    label: "Sáb" },
  { key: "domingo",   label: "Dom" },
];

// ── Secciones disponibles ─────────────────────────────────────────────────────

type SectionMeta = {
  key: SectionKey;
  label: string;
  icon: React.ReactNode;
};

const SECTION_LIST: SectionMeta[] = [
  { key: "announcement", label: "Banner de anuncio",    icon: <Megaphone className="h-3.5 w-3.5" /> },
  { key: "hero",         label: "Hero principal",        icon: <Layout className="h-3.5 w-3.5" /> },
  { key: "categories",   label: "Categorías",            icon: <Grid3x3 className="h-3.5 w-3.5" /> },
  { key: "popular",      label: "Productos populares",   icon: <ShoppingBag className="h-3.5 w-3.5" /> },
  { key: "deals",        label: "Ofertas del día",       icon: <Tag className="h-3.5 w-3.5" /> },
  { key: "combos",       label: "Combos",                icon: <Package className="h-3.5 w-3.5" /> },
  { key: "recipes",      label: "Recetas",               icon: <BookOpen className="h-3.5 w-3.5" /> },
  { key: "testimonials", label: "Testimonios",           icon: <MessageSquare className="h-3.5 w-3.5" /> },
  { key: "faq",          label: "Preguntas frecuentes",  icon: <HelpCircle className="h-3.5 w-3.5" /> },
  { key: "contact",      label: "Contacto",              icon: <Phone className="h-3.5 w-3.5" /> },
  { key: "delivery_map", label: "Mapa de delivery",      icon: <Map className="h-3.5 w-3.5" /> },
];

// ── Sub-componentes de UI ─────────────────────────────────────────────────────

function ColorPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      <span className="text-sm font-semibold text-[var(--text-primary)]">{label}</span>
      <div className="flex flex-wrap gap-2.5 items-center">
        {COLOR_PRESETS.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => onChange(c.value)}
            title={c.label}
            className={cn(
              "h-11 w-11 rounded-2xl border-2 transition-all shrink-0 shadow-[var(--shadow-sm)]",
              value === c.value
                ? "border-foreground scale-110 ring-2 ring-primary/30"
                : "border-white dark:border-card hover:scale-105 hover:border-foreground/40"
            )}
            style={{ backgroundColor: c.value }}
            aria-label={c.label}
          />
        ))}
        <div className="relative">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-11 w-11 rounded-2xl cursor-pointer border-2 border-[var(--rule-base)] overflow-hidden p-0"
            title="Color personalizado"
          />
        </div>
      </div>
      <p className="text-xs text-muted font-mono tracking-wide">{value}</p>
    </div>
  );
}

function StyleSection({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <header className="flex items-start gap-3">
        <div className="shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-[var(--text-primary)] leading-tight">{title}</h3>
          <p className="text-sm text-muted leading-snug mt-0.5">{description}</p>
        </div>
      </header>
      <div>{children}</div>
    </section>
  );
}

const inputCls =
  "w-full px-4 h-12 rounded-xl border-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-base text-[var(--text-primary)] placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all";

// ── Sugerencias rápidas para Hero (chips para auto-completar) ───────────────

const TITLE_SUGGESTIONS = [
  "Todo lo que necesitas, en 25 minutos",
  "Tu bodega de confianza, ahora online",
  "Frescos a tu puerta — Pucallpa",
  "La despensa completa en 1 click",
  "Pedí lo que falta, llega rapidito",
];

const SUBTITLE_SUGGESTIONS = [
  "Delivery rápido en Pucallpa. Yape, Plin o efectivo.",
  "Productos frescos, calidad de barrio y atención personal.",
  "Más de 500 productos con entrega el mismo día.",
  "Lo que tu vecino te lleva, pero con un click.",
  "Pagás cuando llega. Confiable, rápido, cercano.",
];

const BADGE_SUGGESTIONS = [
  "Delivery gratis +S/50",
  "Entrega en 25 min",
  "Yape · Plin · Efectivo",
  "Pucallpa al instante",
  "Atención 7am–10pm",
];

const CTA_SUGGESTIONS = [
  { text: "Ver productos", icon: ShoppingBag },
  { text: "Pedir ahora", icon: Zap },
  { text: "Hablar por WhatsApp", icon: MessageSquare },
  { text: "Explorar catálogo", icon: Grid3x3 },
];

// ── Hero Tab ────────────────────────────────────────────────────────────────

function HeroTab({
  theme,
  update,
  inputCls: inputClassName,
}: {
  theme: StoreTheme;
  update: <K extends keyof StoreTheme>(key: K, value: StoreTheme[K]) => void;
  inputCls: string;
}) {
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("mobile");

  const storefrontUrl = (() => {
    if (typeof window === "undefined") return "/tienda";
    const path = window.location.pathname;
    const match = path.match(/^\/t\/([^/]+)\//);
    return match ? `/t/${match[1]}/tienda` : "/tienda";
  })();

  const heroBg = theme.heroImage?.trim();
  const accent = theme.accentColor || theme.primaryColor;

  return (
    <div className="space-y-6">
      {/* Banner explicativo */}
      <div className="bg-primary/5 dark:bg-primary/10 border-2 border-primary/15 rounded-2xl p-5 flex items-start gap-3">
        <div className="shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <ImageIcon className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-base font-bold text-[var(--text-primary)]">El primer mensaje que ve tu cliente</p>
          <p className="text-sm text-muted mt-0.5">
            El hero es el banner grande arriba de tu tienda. Vendé el por qué — qué problema resolves,
            en cuánto tiempo, con qué garantía. Cambiá los textos abajo y mirá el preview en vivo.
          </p>
        </div>
      </div>

      {/* ── Layout 2-col (Brandon 2026-06-24): preview STICKY a la derecha
          (siempre visible mientras editás), form a la izquierda. Mismo patrón
          que el tab Identidad. En mobile apila: preview arriba, form abajo. ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8 items-start">
      {/* ── Columna preview ── */}
      <aside className="min-w-0 space-y-3 lg:col-start-2 lg:row-start-1 lg:sticky lg:top-4">
      {/* ── LIVE PREVIEW (fiel al hero real) ────────────────── */}
      <StyleSection
        icon={<Eye className="h-5 w-5 text-primary" />}
        title="Vista previa en vivo"
        description="Idéntico al hero real de tu tienda. Cambiá entre desktop y mobile para ver ambos."
      >
        <div className="space-y-3">
          {/* Device toggle + abrir tienda */}
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-gray-100 dark:bg-surface border-2 border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
              {[
                { value: "desktop" as const, label: "Desktop", icon: Monitor },
                { value: "mobile" as const, label: "Mobile", icon: Smartphone },
              ].map((d) => {
                const Icon = d.icon;
                const active = previewDevice === d.value;
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => setPreviewDevice(d.value)}
                    aria-pressed={active}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-sm font-bold transition-all",
                      active
                        ? "bg-[var(--surface-raised)] text-primary shadow"
                        : "text-muted hover:text-[var(--text-primary)]"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {d.label}
                  </button>
                );
              })}
            </div>
            <a
              href={storefrontUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-xl border-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm font-bold text-[var(--text-primary)] hover:border-primary/40 hover:bg-gray-50 dark:hover:bg-surface"
            >
              <ExternalLink className="h-4 w-4" />
              Ver en tienda
            </a>
          </div>

          {/* Preview frame — replicating the actual TiendaHero dark editorial */}
          <div className="flex justify-center">
            <div
              className={cn(
                "relative overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] transition-all",
                previewDevice === "desktop" ? "w-full" : "w-[390px] max-w-full"
              )}
              style={
                heroBg
                  ? {
                      backgroundImage: `linear-gradient(to bottom, rgba(6,10,13,0.78), rgba(6,10,13,0.92)), url(${heroBg})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }
                  : { background: "#060a0d" }
              }
            >
              {/* Ambient glows when no background image */}
              {!heroBg && (
                <div className="pointer-events-none absolute inset-0">
                  <div
                    className="absolute -top-24 -right-24 h-72 w-72 rounded-full blur-[80px]"
                    style={{ backgroundColor: `${accent}30` }}
                  />
                  <div className="absolute -bottom-24 -left-24 h-60 w-60 rounded-full bg-white/5 blur-[80px]" />
                </div>
              )}

              <div
                className={cn(
                  "relative z-10",
                  previewDevice === "desktop"
                    ? "px-8 sm:px-12 py-10 sm:py-14 grid grid-cols-1 md:grid-cols-5 gap-8 items-center"
                    : "px-5 py-8 text-center"
                )}
              >
                {/* Copy column */}
                <div className={cn(previewDevice === "desktop" ? "md:col-span-3 text-left" : "")}>
                  {theme.heroBadge && (
                    <span
                      className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider mb-4"
                      style={{ color: accent }}
                    >
                      {theme.heroBadge}
                    </span>
                  )}
                  <h1
                    className={cn(
                      "font-extrabold text-white leading-[1.08] tracking-tight",
                      previewDevice === "desktop" ? "text-3xl sm:text-4xl" : "text-2xl"
                    )}
                  >
                    {theme.heroTitle || "Todo lo que necesitas, en tu puerta"}
                  </h1>
                  <p
                    className={cn(
                      "text-white/70 leading-relaxed",
                      previewDevice === "desktop" ? "mt-4 text-base max-w-xl" : "mt-3 text-sm"
                    )}
                  >
                    {theme.heroSubtitle || "Delivery rápido en Pucallpa. Paga con Yape o efectivo."}
                  </p>
                  <div
                    className={cn(
                      "flex gap-2.5 mt-6",
                      previewDevice === "desktop" ? "flex-row" : "flex-col"
                    )}
                  >
                    <button
                      type="button"
                      className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-bold text-white shadow-[var(--shadow-lg)] pointer-events-none"
                      style={{ backgroundColor: accent, boxShadow: `0 10px 25px ${accent}40` }}
                    >
                      <ShoppingBag className="h-4 w-4" />
                      {theme.heroCTA || "Ver productos"}
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-white/20 bg-white/5 text-white font-semibold text-sm pointer-events-none"
                    >
                      <ShoppingBag className="h-4 w-4" />
                      Mi carrito
                    </button>
                  </div>

                  {/* Stats line */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-6 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-white/50">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" /> 25 min
                    </span>
                    <span className="h-1 w-1 rounded-full bg-white/25" />
                    <span className="inline-flex items-center gap-1">
                      <Truck className="h-3 w-3" /> Delivery
                    </span>
                    <span className="h-1 w-1 rounded-full bg-white/25" />
                    <span>Yape · Plin · Efectivo</span>
                  </div>
                </div>

                {/* Illustration column (desktop only, no bg image) */}
                {previewDevice === "desktop" && !heroBg && (
                  <div className="md:col-span-2 flex justify-end">
                    <div className="relative">
                      <div
                        className="absolute inset-0 rounded-full blur-[40px] scale-90"
                        style={{ backgroundColor: `${accent}25` }}
                      />
                      <div className="relative rounded-3xl bg-white/[0.04] border border-white/10 p-6 backdrop-blur-sm w-44 h-44 flex items-center justify-center">
                        <div
                          className="h-24 w-24 rounded-full"
                          style={{
                            background: `linear-gradient(135deg, ${theme.primaryColor}, ${accent})`,
                          }}
                        />
                      </div>
                      <div
                        className="absolute -bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-white shadow-[var(--shadow-lg)] whitespace-nowrap"
                        style={{
                          backgroundColor: accent,
                          boxShadow: `0 10px 25px ${accent}50`,
                        }}
                      >
                        {theme.heroOriginBadge || "Hecho en Pucallpa"}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </StyleSection>
      </aside>

      {/* ── Columna form (izquierda) ── */}
      <div className="min-w-0 space-y-8 lg:col-start-1 lg:row-start-1">
      {/* ── 1. TÍTULO PRINCIPAL ─────────────────────────────── */}
      <StyleSection
        icon={<Type className="h-5 w-5 text-primary" />}
        title="Título principal"
        description="El gancho — la primera frase que va a leer un cliente nuevo. Corto, directo, máximo 8 palabras."
      >
        <div className="space-y-3">
          <input
            type="text"
            value={theme.heroTitle}
            onChange={(e) => update("heroTitle", e.target.value)}
            placeholder="Todo lo que necesitas, en tu puerta"
            className={inputClassName}
            maxLength={80}
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted">Tip: incluí el resultado o el tiempo. Ej: &ldquo;en 25 min&rdquo;, &ldquo;a tu puerta&rdquo;.</p>
            <span className={cn(
              "text-xs font-mono shrink-0",
              (theme.heroTitle || "").length > 70 ? "text-amber-600 dark:text-amber-400" : "text-muted"
            )}>
              {(theme.heroTitle || "").length}/80
            </span>
          </div>

          {/* Sugerencias chips */}
          <div className="space-y-2 pt-1">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Sugerencias rápidas</p>
            <div className="flex flex-wrap gap-2">
              {TITLE_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => update("heroTitle", s)}
                  className={cn(
                    "px-3 h-9 rounded-xl text-sm font-semibold border-2 transition-all",
                    theme.heroTitle === s
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-primary)] hover:border-primary/40 hover:bg-primary/5"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </StyleSection>

      {/* ── 2. SUBTÍTULO ────────────────────────────────────── */}
      <StyleSection
        icon={<FileText className="h-5 w-5 text-primary" />}
        title="Subtítulo"
        description="Refuerza el título — el por qué deberían comprarte a vos. Máximo 2 líneas."
      >
        <div className="space-y-3">
          <input
            type="text"
            value={theme.heroSubtitle}
            onChange={(e) => update("heroSubtitle", e.target.value)}
            placeholder="Delivery rápido en Pucallpa. Paga con Yape o efectivo."
            className={inputClassName}
            maxLength={140}
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted">Mencioná tus 2 ventajas concretas: pagos, garantías, atención.</p>
            <span className={cn(
              "text-xs font-mono shrink-0",
              (theme.heroSubtitle || "").length > 120 ? "text-amber-600 dark:text-amber-400" : "text-muted"
            )}>
              {(theme.heroSubtitle || "").length}/140
            </span>
          </div>

          <div className="space-y-2 pt-1">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Sugerencias rápidas</p>
            <div className="flex flex-wrap gap-2">
              {SUBTITLE_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => update("heroSubtitle", s)}
                  className={cn(
                    "px-3 py-2 rounded-xl text-sm font-semibold border-2 text-left transition-all max-w-md",
                    theme.heroSubtitle === s
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-primary)] hover:border-primary/40 hover:bg-primary/5"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </StyleSection>

      {/* ── 3. BADGE SUPERIOR ───────────────────────────────── */}
      <StyleSection
        icon={<Sparkles className="h-5 w-5 text-primary" />}
        title="Badge superior"
        description="Etiqueta destacada arriba del título — promociones, garantías o urgencia. Opcional pero potente."
      >
        <div className="space-y-3">
          <input
            type="text"
            value={theme.heroBadge}
            onChange={(e) => update("heroBadge", e.target.value)}
            placeholder="Delivery gratis +S/50"
            className={inputClassName}
            maxLength={40}
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted">Aparece en el color de acento — destaca sobre el resto.</p>
            <span className="text-xs font-mono text-muted shrink-0">{(theme.heroBadge || "").length}/40</span>
          </div>

          <div className="space-y-2 pt-1">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Sugerencias rápidas</p>
            <div className="flex flex-wrap gap-2">
              {BADGE_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => update("heroBadge", s)}
                  className={cn(
                    "px-3 h-9 rounded-xl text-sm font-semibold border-2 transition-all",
                    theme.heroBadge === s
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-primary)] hover:border-primary/40 hover:bg-primary/5"
                  )}
                >
                  {s}
                </button>
              ))}
              <button
                type="button"
                onClick={() => update("heroBadge", "")}
                className="px-3 h-9 rounded-xl text-sm font-semibold border-2 border-dashed border-[var(--rule-base)] dark:border-[var(--rule-base)] text-muted hover:border-[var(--data-error-500)] hover:text-[var(--data-error-500)]"
              >
                Sin badge
              </button>
            </div>
          </div>
        </div>
      </StyleSection>

      {/* ── 3.5 BADGE DE ORIGEN (debajo del avatar) ───────── */}
      <StyleSection
        icon={<Sparkles className="h-5 w-5 text-primary" />}
        title="Badge de origen"
        description="Etiqueta debajo del logo circular en el hero — comunica de dónde es tu negocio."
      >
        <div className="space-y-3">
          <input
            type="text"
            value={theme.heroOriginBadge}
            onChange={(e) => update("heroOriginBadge", e.target.value)}
            placeholder="Hecho en Pucallpa"
            className={inputClassName}
            maxLength={40}
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted">Aparece en mayúsculas, color de acento, debajo del avatar circular.</p>
            <span className="text-xs font-mono text-muted shrink-0">{(theme.heroOriginBadge || "").length}/40</span>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {["Hecho en Pucallpa", "Hecho en Lima", "Hecho en Iquitos", "100% peruano", "Tradición familiar"].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => update("heroOriginBadge", s)}
                className={cn(
                  "px-3 h-9 rounded-xl text-sm font-semibold border-2 transition-all",
                  theme.heroOriginBadge === s
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-primary)] hover:border-primary/40 hover:bg-primary/5"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </StyleSection>

      {/* ── 3.6 CHIPS DE CONFIANZA (TrustBar) ──────────────── */}
      <StyleSection
        icon={<Sparkles className="h-5 w-5 text-primary" />}
        title="Chips de confianza"
        description="Barra que scrollea con tus garantías y beneficios. Una chip por línea — sin íconos (los asignamos automático)."
      >
        <div className="space-y-3">
          <textarea
            value={(theme.trustChips ?? []).join("\n")}
            onChange={(e) => {
              const lines = e.target.value
                .split("\n")
                .map((l) => l.trim())
                .filter((l) => l.length > 0 && l.length <= 60);
              update("trustChips", lines);
            }}
            placeholder={"Delivery gratis desde S/50\nEntrega en menos de 45 min\nProductos frescos garantizados\nPaga con Yape o efectivo"}
            rows={6}
            className={cn(inputClassName, "font-mono text-sm leading-relaxed resize-y")}
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted">Mín 1, máx 60 caracteres por chip. Recomendado 4–6 chips.</p>
            <span className="text-xs font-mono text-muted shrink-0">
              {(theme.trustChips ?? []).length} chip{(theme.trustChips ?? []).length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      </StyleSection>

      {/* ── 4. BOTÓN DE ACCIÓN (CTA) ────────────────────────── */}
      <StyleSection
        icon={<MessageSquare className="h-5 w-5 text-primary" />}
        title="Botón de acción (CTA)"
        description="El click más importante de toda la tienda. Texto + destino al que lleva."
      >
        <div className="space-y-5">
          {/* Texto del CTA */}
          <div className="space-y-3">
            <Field label="Texto del botón" labelClassName="text-sm font-semibold text-[var(--text-primary)]">
              <input
                type="text"
                value={theme.heroCTA}
                onChange={(e) => update("heroCTA", e.target.value)}
                placeholder="Ver productos"
                className={inputClassName}
                maxLength={30}
              />
            </Field>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted">Verbo en infinitivo — qué hace el cliente cuando hace click.</p>
              <span className="text-xs font-mono text-muted shrink-0">{(theme.heroCTA || "").length}/30</span>
            </div>

            {/* Sugerencias CTA con icono */}
            <div className="flex flex-wrap gap-2 pt-1">
              {CTA_SUGGESTIONS.map((s) => {
                const Icon = s.icon;
                const active = theme.heroCTA === s.text;
                return (
                  <button
                    key={s.text}
                    type="button"
                    onClick={() => update("heroCTA", s.text)}
                    className={cn(
                      "inline-flex items-center gap-2 px-3 h-9 rounded-xl text-sm font-semibold border-2 transition-all",
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-primary)] hover:border-primary/40 hover:bg-primary/5"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {s.text}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Destino del botón */}
          <div className="space-y-3">
            <span className="text-sm font-semibold text-[var(--text-primary)]">Destino del botón</span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {([
                { value: "tienda",     label: "Tienda",     desc: "Lleva al catálogo de productos",  icon: <ShoppingBag className="h-5 w-5" /> },
                { value: "whatsapp",   label: "WhatsApp",   desc: "Abre el chat con tu número",       icon: <MessageSquare className="h-5 w-5" /> },
                { value: "categorias", label: "Categorías", desc: "Sección de categorías",            icon: <Grid3x3 className="h-5 w-5" /> },
                { value: "custom",     label: "URL custom", desc: "Otro link específico",             icon: <Map className="h-5 w-5" /> },
              ] as const).map((s) => {
                const active = theme.heroLink === s.value;
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => update("heroLink", s.value)}
                    aria-pressed={active}
                    className={cn(
                      "p-4 rounded-2xl border-2 text-left transition-all flex items-start gap-3",
                      active
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                        : "border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:border-primary/40 hover:shadow-[var(--shadow-md)]"
                    )}
                  >
                    <div className={cn(
                      "shrink-0 w-10 h-10 rounded-xl flex items-center justify-center",
                      active ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-[var(--text-primary)]"
                    )}>
                      {s.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-[var(--text-primary)] leading-tight">{s.label}</p>
                      <p className="text-xs text-muted leading-snug mt-0.5">{s.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            {theme.heroLink === "custom" && (
              <div className="space-y-1.5">
                <label htmlFor="hero-cta-url" className="text-sm font-semibold text-[var(--text-primary)]">
                  URL del botón
                </label>
                <input
                  id="hero-cta-url"
                  type="url"
                  value={theme.heroCtaUrl}
                  onChange={(e) => update("heroCtaUrl", e.target.value)}
                  placeholder="https://… o /ruta-interna"
                  maxLength={500}
                  className={inputCls}
                />
                <p className="text-xs text-muted">
                  Link externo (https://…) o interno (/recetas). Solo se usa cuando el destino es URL custom.
                </p>
              </div>
            )}
          </div>
        </div>
      </StyleSection>

      {/* ── 5. IMAGEN DE FONDO ──────────────────────────────── */}
      <StyleSection
        icon={<ImageIcon className="h-5 w-5 text-primary" />}
        title="Imagen de fondo"
        description="Opcional. Si dejás vacío, se usa el fondo oscuro editorial con tu color de acento."
      >
        <ImageUpload
          value={theme.heroImage}
          onChange={(url) => update("heroImage", url)}
          onClear={() => update("heroImage", "")}
          folder="hero"
          label=""
          aspectRatio="banner"
          hint="Recomendado 1200×400 px. La imagen se oscurece automáticamente para que el texto blanco se lea."
        />
      </StyleSection>

      {/* Tips finales */}
      <div className="rounded-2xl border-2 border-[var(--data-success-500)]/20 bg-[var(--data-success-500)]/5 p-5">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-10 h-10 rounded-xl bg-[var(--data-success-500)]/15 flex items-center justify-center">
            <Star className="h-5 w-5 text-[var(--data-success-500)]" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-[var(--text-primary)]">Checklist del hero perfecto</p>
            <ul className="text-xs text-muted mt-2 space-y-1.5">
              <li className="flex items-start gap-1.5">
                <Check className="h-3.5 w-3.5 mt-0.5 text-[var(--data-success-500)] shrink-0" />
                Título corto que dice <span className="font-bold">qué resolves</span> y <span className="font-bold">en cuánto tiempo</span>.
              </li>
              <li className="flex items-start gap-1.5">
                <Check className="h-3.5 w-3.5 mt-0.5 text-[var(--data-success-500)] shrink-0" />
                Subtítulo que menciona <span className="font-bold">2 ventajas concretas</span> (precio, pago, atención).
              </li>
              <li className="flex items-start gap-1.5">
                <Check className="h-3.5 w-3.5 mt-0.5 text-[var(--data-success-500)] shrink-0" />
                Badge con <span className="font-bold">ofertas o urgencia</span> que llame la atención.
              </li>
              <li className="flex items-start gap-1.5">
                <Check className="h-3.5 w-3.5 mt-0.5 text-[var(--data-success-500)] shrink-0" />
                CTA con <span className="font-bold">verbo de acción claro</span> y destino lógico.
              </li>
            </ul>
          </div>
        </div>
      </div>
      </div>
      </div>
    </div>
  );
}

// ── Tabs del panel — formato AdminTabBar (horizontal, draggable como otros módulos) ──

const MODULE_ID = "store-customizer";

// Fusión ADR-299 fase 2: 11 → 6 tabs. Marca→Colores; Promos/Secciones/Catálogo
// + Contacto → "Página"; Textos → Avanzado. Se consolidan por condición de
// render (sin mover bloques) — los ids viejos quedan en el type pero sin botón.
const TABS = [
  { id: "identidad" as Tab, label: "Identidad", shortLabel: "Identidad", icon: Store },
  { id: "hero" as Tab, label: "Hero", icon: ImageIcon },
  { id: "colores" as Tab, label: "Colores & Tipografía", shortLabel: "Colores", icon: Palette },
  { id: "estilos" as Tab, label: "Estilos", icon: Paintbrush },
  { id: "contacto" as Tab, label: "Página", shortLabel: "Página", icon: Layout },
  { id: "avanzado" as Tab, label: "Avanzado", icon: Settings2 },
] as const;

// ── Preview en vivo ───────────────────────────────────────────────────────────

function _StorePreview({ theme }: { theme: StoreTheme }) {
  const fontMap: Record<string, string> = {
    sistema: "system-ui, sans-serif",
    geist: "'Geist', sans-serif",
    inter: "'Inter', sans-serif",
    poppins: "'Poppins', sans-serif",
    montserrat: "'Montserrat', sans-serif",
  };
  const spacingPad = theme.spacing === "compact" ? "8px" : theme.spacing === "spacious" ? "24px" : "16px";

  return (
    <div
      className={cn(
        "w-full h-full rounded-xl overflow-hidden border border-[var(--rule-base)] dark:border-[var(--rule-base)] flex flex-col text-sm shadow-inner",
        theme.darkModeDefault ? "bg-gray-900 text-white" : "bg-white dark:bg-[var(--color-card)] text-[var(--text-primary)]"
      )}
      style={{ fontFamily: fontMap[theme.fontFamily] ?? fontMap.sistema }}
    >
      {/* Badge */}
      <div className="absolute top-3 right-3 z-10 bg-black/40 text-white text-xs font-bold px-2 py-0.5 rounded-full backdrop-blur-sm pointer-events-none">
        Vista previa
      </div>

      {/* Header mockup */}
      <div
        className="flex items-center justify-between shrink-0"
        style={{ backgroundColor: theme.primaryColor, padding: spacingPad }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {theme.logo ? (
            <Image src={theme.logo} alt="logo" width={28} height={28} className="rounded-lg object-cover shrink-0" />
          ) : (
            <div className="h-7 w-7 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
              <Store className="h-4 w-4 text-white" />
            </div>
          )}
          <div className="min-w-0">
            <span className="text-white font-extrabold text-sm leading-tight truncate block max-w-[110px]">
              {theme.storeName || "Mi Tienda"}
            </span>
            {theme.slogan && (
              <span className="text-white/60 text-xs leading-tight truncate block max-w-[110px]">
                {theme.slogan}
              </span>
            )}
          </div>
        </div>
        <div
          className="h-7 px-3 rounded-full text-[length:var(--ts-xs)] font-bold flex items-center shrink-0"
          style={{ backgroundColor: theme.secondaryColor, color: "#fff" }}
        >
          Ver todo
        </div>
      </div>

      {/* Hero mockup */}
      <div
        className="relative flex flex-col items-start justify-end px-4 pt-8 pb-4 shrink-0"
        style={{
          background: theme.heroImage
            ? `linear-gradient(to top, ${theme.primaryColor}cc, transparent), url(${theme.heroImage}) center/cover`
            : `linear-gradient(135deg, ${theme.primaryColor}, ${theme.accentColor})`,
          minHeight: "120px",
        }}
      >
        <PageTitle className="text-white font-extrabold text-base leading-tight max-w-[220px]">
          {theme.heroTitle || "Título principal"}
        </PageTitle>
        <p className="text-white/80 text-[length:var(--ts-xs)] mt-1 max-w-[200px] line-clamp-2">
          {theme.heroSubtitle || "Subtítulo del hero"}
        </p>
        <button
          className="mt-3 px-4 py-1.5 text-[length:var(--ts-xs)] font-bold text-white shadow"
          style={{
            backgroundColor: theme.primaryColor,
            borderRadius: `${theme.borderRadius}px`,
          }}
        >
          {theme.heroCTA || "Ver productos"}
        </button>
      </div>

      {/* Categories mockup */}
      {theme.sections.includes("categories") && (
        <div className="px-3 pt-3 pb-1 shrink-0">
          <p className="text-xs font-bold text-muted mb-2">Categorías</p>
          <div className="flex gap-2 overflow-hidden">
            {["Abarrotes", "Bebidas", "Lácteos", "Snacks"].map((cat) => (
              <div
                key={cat}
                className="flex flex-col items-center gap-1 shrink-0"
              >
                <div
                  className="h-9 w-9 rounded-full flex items-center justify-center text-white text-xs font-bold"
                  style={{ backgroundColor: theme.primaryColor, borderRadius: "50%" }}
                >
                  {cat[0]}
                </div>
                <span
                  className="text-xs font-semibold"
                  style={{ color: theme.darkModeDefault ? "#d1d5db" : "#374151" }}
                >
                  {cat}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Products mockup */}
      {theme.sections.includes("popular") && (
        <div className="px-3 pt-3 flex-1">
          <p className="text-xs font-bold text-muted mb-2">Populares</p>
          <div className="grid grid-cols-2 gap-2">
            {["Aceite 1L", "Arroz 5kg"].map((prod) => (
              <div
                key={prod}
                className={cn(
                  "rounded-xl p-2 border",
                  theme.darkModeDefault
                    ? "bg-gray-800 border-gray-700"
                    : "bg-gray-50 border-[var(--rule-soft)]"
                )}
                style={{ borderRadius: `${Math.min(theme.borderRadius, 16)}px` }}
              >
                <div
                  className="h-14 rounded-lg mb-1.5"
                  style={{
                    backgroundColor: `${theme.primaryColor}20`,
                    borderRadius: `${Math.min(theme.borderRadius, 12)}px`,
                  }}
                />
                <p className="text-xs font-bold leading-tight">{prod}</p>
                <p className="text-xs font-extrabold mt-0.5" style={{ color: theme.primaryColor }}>
                  S/ 8.50
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer mockup */}
      <div
        className="shrink-0 px-3 py-2 text-xs text-center"
        style={{
          color: theme.darkModeDefault ? "#6b7280" : "#9ca3af",
          borderTop: `1px solid ${theme.darkModeDefault ? "#374151" : "#f3f4f6"}`,
        }}
      >
        {theme.slogan || "Tu bodega de confianza"}
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function StoreCustomizer() {
  const [activeTab, setActiveTab] = useState<Tab>("identidad");
  const [theme, setTheme] = useState<StoreTheme>(DEFAULT_THEME);
  const [savedTheme, setSavedTheme] = useState<StoreTheme>(DEFAULT_THEME);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showCreativeMode, setShowCreativeMode] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [previewWidth, setPreviewWidth] = useState(0); // 0 = full width (desktop)
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  // Inicializamos con el slug de la URL (si está) para evitar el flash de "/t/main"
  // que aparece antes de que useEffect cargue el slug real desde resolveActiveTenantSlug.
  const [activeTenantSlug, setActiveTenantSlug] = useState(() => {
    if (typeof window === "undefined") return "main";
    const m = window.location.pathname.match(/^\/t\/([^/]+)/);
    return m ? m[1] : "main";
  });

  // Campos que viven en TenantStorePage (no en storeTheme) — absorbidos al
  // editor unificado (ADR-299 fase 2): SEO + publicado + about. Carga/guardado
  // vía /api/store-page/customization (store distinto → save cross-store).
  const [pageFields, setPageFields] = useState({
    metaTitle: "",
    metaDescription: "",
    ogImageUrl: "",
    published: true,
    aboutTitle: "",
    aboutBody: "",
  });
  const updatePage = useCallback(
    (patch: Partial<typeof pageFields>) => {
      setPageFields((prev) => ({ ...prev, ...patch }));
      setSaved(false);
    },
    [],
  );

  // Detecta si hay cambios pendientes comparando con la última versión guardada
  const hasUnsavedChanges = JSON.stringify(theme) !== JSON.stringify(savedTheme);

  const _logoInputRef = useRef<HTMLInputElement>(null);
  const _heroImageInputRef = useRef<HTMLInputElement>(null);
  const _faviconInputRef = useRef<HTMLInputElement>(null);

  // ── Cargar settings existentes ─────────────────────────────────────────────

  useEffect(() => {
    void load();
  }, []);

  // Carga SEO/publicado/about desde TenantStorePage (store distinto a storeTheme).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/store-page/customization");
        if (!res.ok || cancelled) return;
        const p = (await res.json()) as Record<string, unknown>;
        if (cancelled) return;
        setPageFields({
          metaTitle: typeof p.metaTitle === "string" ? p.metaTitle : "",
          metaDescription: typeof p.metaDescription === "string" ? p.metaDescription : "",
          ogImageUrl: typeof p.ogImageUrl === "string" ? p.ogImageUrl : "",
          published: p.published !== false,
          aboutTitle: typeof p.aboutTitle === "string" ? p.aboutTitle : "",
          aboutBody: typeof p.aboutBody === "string" ? p.aboutBody : "",
        });
      } catch {
        /* fallback: campos vacíos */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function load() {
    setLoading(true);
    try {
      const tenantSlug = await resolveActiveTenantSlug();
      setActiveTenantSlug(tenantSlug);

      const res = await fetch("/api/settings", { headers: { "x-tenant-id": tenantSlug } });
      const data = res.ok ? await res.json() : null;

      if (data?.storeTheme) {
        const loaded = { ...DEFAULT_THEME, ...data.storeTheme };
        setTheme(loaded);
        setSavedTheme(loaded);
        return;
      }

      const loaded = {
        ...DEFAULT_THEME,
        storeName: data?.businessName || DEFAULT_THEME.storeName,
        whatsapp: data?.whatsappNumber || DEFAULT_THEME.whatsapp,
        phone: data?.contactPhone || DEFAULT_THEME.phone,
        email: data?.contactEmail || DEFAULT_THEME.email,
        address: data?.businessAddress || DEFAULT_THEME.address,
      };
      setTheme(loaded);
      setSavedTheme(loaded);
    } catch {
      // Ignore load failures here; the component already has visual fallbacks.
    } finally {
      setLoading(false);
    }
  }

  // ── Helpers de actualización ───────────────────────────────────────────────

  const update = useCallback(<K extends keyof StoreTheme>(key: K, value: StoreTheme[K]) => {
    setTheme((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }, []);

  const handleReset = useCallback(() => {
    if (!confirm("¿Restaurar todos los valores por defecto? Se perderán los cambios no guardados.")) return;
    setTheme(DEFAULT_THEME);
    setSaved(false);
  }, []);

  const _handleImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    field: "logo" | "heroImage" | "favicon"
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      update(field, result);
    };
    reader.readAsDataURL(file);
  };

  // ── Guardar ────────────────────────────────────────────────────────────────

  const saveTheme = useCallback(async (themeToSave: StoreTheme, options?: { silent?: boolean }) => {
    setSaving(true);
    setError(null);
    try {
      const tenantSlug = activeTenantSlug || await resolveActiveTenantSlug();
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json", "x-tenant-id": tenantSlug }),
        body: JSON.stringify({ storeTheme: themeToSave }),
      });
      if (!res.ok) throw new Error("Error al guardar");
      // Cross-store: guardar también SEO/publicado/about en TenantStorePage
      // (ADR-299 fase 2). Secundario — si falla, el theme ya quedó guardado.
      try {
        await fetch("/api/store-page/customization", {
          method: "PUT",
          headers: csrfHeaders({ "Content-Type": "application/json", "x-tenant-id": tenantSlug }),
          body: JSON.stringify(pageFields),
        });
      } catch {
        /* el theme ya se guardó; estos campos son secundarios */
      }
      setSaved(true);
      setSavedTheme(themeToSave);
      if (!options?.silent) {
        setToastMsg("Cambios guardados correctamente");
      }
      // Recargar iframe de vista previa
      setPreviewKey((k) => k + 1);
      setTimeout(() => setSaved(false), 3000);
      if (!options?.silent) {
        setTimeout(() => setToastMsg(null), 3000);
      }
    } catch {
      setError("No se pudo guardar. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  }, [activeTenantSlug, pageFields]);

  const handleSave = useCallback(async () => {
    await saveTheme(theme);
  }, [saveTheme, theme]);

  const handleApplyFromCreative = useCallback(async (nextTheme: StoreTheme) => {
    setTheme(nextTheme);
    await saveTheme(nextTheme);
  }, [saveTheme]);

  // ── Drag & drop de secciones ───────────────────────────────────────────────

  const _handleDragEnd = (overIdx: number) => {
    if (dragIdx === null || dragIdx === overIdx) return;
    const next = [...theme.sections];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(overIdx, 0, moved);
    update("sections", next);
    setDragIdx(null);
  };

  const _moveSectionUp = (idx: number) => {
    if (idx === 0) return;
    const next = [...theme.sections];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    update("sections", next);
  };

  const _moveSectionDown = (idx: number) => {
    if (idx === theme.sections.length - 1) return;
    const next = [...theme.sections];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    update("sections", next);
  };

  const _toggleSection = (key: SectionKey) => {
    const has = theme.sections.includes(key);
    if (has) {
      update("sections", theme.sections.filter((k) => k !== key));
    } else {
      update("sections", [...theme.sections, key]);
    }
  };

  // Ordenar SECTION_LIST según el orden actual de theme.sections
  const _orderedSections = [
    ...theme.sections
      .map((k) => SECTION_LIST.find((s) => s.key === k))
      .filter(Boolean) as SectionMeta[],
    ...SECTION_LIST.filter((s) => !theme.sections.includes(s.key)),
  ];

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return <LoadingState message="" />;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const activeTabMeta = TABS.find((t) => t.id === activeTab);

  return (
    <div className="flex flex-col h-full">
      {/* Toast de éxito — patrón estándar admin (mismo estilo que plantilla/notificaciones) */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-5 py-3 rounded-xl bg-[var(--text-primary)] text-[var(--surface-canvas)] text-sm font-bold shadow-[var(--shadow-xl)] animate-[fadeDown_0.35s_ease-out_both] pointer-events-none">
          <Check className="h-4 w-4 shrink-0 text-[var(--data-success-500)]" />
          {toastMsg}
        </div>
      )}

      {/* ── Header editorial estandarizado ─────────────────────────── */}
      <AdminModuleHeader
        icon={Palette}
        eyebrow="Mi tienda · Identidad y tema"
        title="Cómo se ve tu tienda"
        description={
          hasUnsavedChanges ? (
            <>
              <strong>Tienes cambios sin guardar.</strong> Logo, colores, tipografía y CSS de tu tienda — la <strong>piel</strong>.
            </>
          ) : (
            <>
              Logo, colores, tipografía y CSS de tu tienda. Define la <strong>piel</strong> — no qué productos mostrar. Para eso, andá a{" "}
              <Link
                href="?tab=pagina-inicio"
                className="font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
              >
                Página de inicio →
              </Link>
            </>
          )
        }
      >
        <div className="flex items-center gap-2">
          <a
            href={`/t/${activeTenantSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] hover:bg-gray-50 dark:hover:bg-accent transition-colors"
          >
            <Store className="h-4 w-4" />
            Ver tienda
          </a>
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/20 transition-colors"
          >
            <Eye className="h-4 w-4" />
            Vista previa
          </button>
          <PrimaryButton
            type="button"
            onClick={() => setShowCreativeMode(true)}
            size="lg"
            leftIcon={<Paintbrush className="h-4 w-4" />}
          >
            Modo Creativo
          </PrimaryButton>
        </div>
      </AdminModuleHeader>

      {/* ── AdminTabBar (horizontal arriba, draggable, mismo patrón que POSCajaModule/Compras) ── */}
      <AdminTabBar
        tabs={TABS.map((t) => ({
          id: t.id,
          label: t.label,
          shortLabel: "shortLabel" in t ? t.shortLabel : undefined,
          icon: t.icon,
        }))}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as Tab)}
        moduleId={MODULE_ID}
      />

      {/* ── Panel de contenido ──────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-h-0 bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-soft)] dark:border-[var(--rule-base)] overflow-hidden">

        {/* Tab header with active tab info — usa SectionTitle del DS */}
        <div className="flex items-center gap-3 px-6 py-4 border-b-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-sunken)]/40 shrink-0">
          {activeTabMeta && <activeTabMeta.icon className="h-5 w-5 text-primary" />}
          <SectionTitle className="text-base">{activeTabMeta?.label}</SectionTitle>
        </div>

        {/* Contenido del tab activo */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

            {/* ── TAB: IDENTIDAD ───────────────────────────────────────
                Rediseño 2026-06-05 (Brandon): minimalista, 2 columnas.
                Izquierda = los 4 campos sin cajas gigantes ni helpers
                redundantes. Derecha = VISTA PREVIA EN VIVO: el dueño ve
                exactamente dónde aparece cada campo (cabecera de su
                tienda + resultado de Google) mientras tipea. */}
            {activeTab === "identidad" && (
              <div className="space-y-8">
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8 items-start">
                {/* ── Columna form ── */}
                <div className="space-y-6 min-w-0">
                  {/* Logo + Nombre — misma fila, sin caja contenedora */}
                  <div className="flex items-start gap-4">
                    <div className="shrink-0 space-y-1.5">
                      <span className="block text-sm font-semibold text-[var(--text-primary)]">Logo</span>
                      <div className="relative group w-[88px] h-[88px] rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)] overflow-hidden cursor-pointer hover:border-primary transition-colors">
                        {theme.logo ? (
                          <>
                            <Image src={theme.logo} alt="Logo" fill className="object-cover" sizes="88px" />
                            <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <button
                                type="button"
                                onClick={() => update("logo", "")}
                                className="text-xs font-bold text-white bg-[var(--data-error-500)] px-2.5 py-1 rounded-lg hover:opacity-90"
                              >
                                Quitar
                              </button>
                            </div>
                          </>
                        ) : (
                          <ImageUpload
                            value=""
                            onChange={(url) => update("logo", url)}
                            folder="branding"
                            label=""
                            aspectRatio="square"
                            className="w-full h-full"
                          />
                        )}
                      </div>
                      <span className="block text-xs text-muted text-center leading-tight">
                        cuadrado · 5 MB
                      </span>
                    </div>
                    <div className="flex-1 min-w-0 space-y-1.5 pt-px">
                      <label htmlFor="sc-store-name" className="block text-sm font-semibold text-[var(--text-primary)]">
                        Nombre de la tienda
                      </label>
                      <input
                        id="sc-store-name"
                        type="text"
                        value={theme.storeName}
                        onChange={(e) => update("storeName", e.target.value)}
                        placeholder="Mi Bodega"
                        className={inputCls}
                        maxLength={60}
                      />
                      <p className="text-xs text-muted">Cabecera, pie y pestaña del navegador.</p>
                    </div>
                  </div>

                  {/* Eslogan — counter integrado en el label row */}
                  <div className="space-y-1.5">
                    <div className="flex items-baseline justify-between">
                      <label htmlFor="sc-slogan" className="text-sm font-semibold text-[var(--text-primary)]">
                        Eslogan
                      </label>
                      <span className={cn(
                        "text-xs font-mono tabular-nums",
                        theme.slogan.length > 90 ? "text-[var(--data-warning-500)]" : "text-muted",
                      )}>
                        {theme.slogan.length}/100
                      </span>
                    </div>
                    <input
                      id="sc-slogan"
                      type="text"
                      value={theme.slogan}
                      onChange={(e) => update("slogan", e.target.value.slice(0, 100))}
                      placeholder="Tu bodega de confianza…"
                      className={inputCls}
                      maxLength={100}
                    />
                    <p className="text-xs text-muted">Frase corta debajo del nombre.</p>
                  </div>

                  {/* Descripción SEO */}
                  <div className="space-y-1.5">
                    <div className="flex items-baseline justify-between">
                      <label htmlFor="sc-description" className="text-sm font-semibold text-[var(--text-primary)]">
                        Descripción
                      </label>
                      <span className={cn(
                        "text-xs font-mono tabular-nums",
                        theme.description.length > 180 ? "text-[var(--data-warning-500)]" : "text-muted",
                      )}>
                        {theme.description.length}/200
                      </span>
                    </div>
                    <textarea
                      id="sc-description"
                      value={theme.description}
                      onChange={(e) => update("description", e.target.value.slice(0, 200))}
                      placeholder="Abarrotes, bebidas y productos de primera necesidad con delivery a domicilio…"
                      className={cn(inputCls, "resize-none min-h-[96px] py-3 leading-relaxed")}
                      maxLength={200}
                    />
                    <p className="text-xs text-muted">Lo que Google y las redes muestran de tu tienda.</p>
                  </div>
                </div>

                {/* ── Columna preview en vivo (sticky en desktop) ── */}
                <aside className="space-y-4 lg:sticky lg:top-4">
                  {/* Mockup: cabecera de la tienda */}
                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">
                      Así se ve en tu tienda
                    </p>
                    <div className="rounded-2xl border-2 border-[var(--rule-base)] overflow-hidden shadow-[var(--shadow-sm)]">
                      {/* Barra de navegador fake — refuerza "esto es tu web" */}
                      <div className="flex items-center gap-1.5 px-3 py-2 bg-[var(--surface-sunken)] border-b border-[var(--rule-soft)]">
                        <span className="h-2.5 w-2.5 rounded-full bg-[var(--data-error-500)]/60" aria-hidden />
                        <span className="h-2.5 w-2.5 rounded-full bg-[var(--data-warning-500)]/60" aria-hidden />
                        <span className="h-2.5 w-2.5 rounded-full bg-[var(--data-success-500)]/60" aria-hidden />
                        <span className="ml-2 flex-1 truncate rounded-md bg-[var(--surface-raised)] px-2 py-0.5 text-[length:var(--ts-2xs)] text-muted font-mono">
                          {typeof window !== "undefined" ? window.location.host : "buleje.com"}/t/{activeTenantSlug}
                        </span>
                      </div>
                      {/* Header de la tienda con los datos reales */}
                      <div className="flex items-center gap-3 px-4 py-3.5 bg-[var(--surface-raised)]">
                        <div className="relative h-11 w-11 shrink-0 rounded-xl overflow-hidden border border-[var(--rule-soft)] bg-[var(--surface-sunken)] flex items-center justify-center">
                          {theme.logo ? (
                            <Image src={theme.logo} alt="" fill className="object-cover" sizes="44px" />
                          ) : (
                            <Store className="h-5 w-5 text-muted" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-base font-bold leading-tight" style={{ color: theme.primaryColor || "var(--text-primary)" }}>
                            {theme.storeName || "Mi Bodega"}
                          </p>
                          <p className="truncate text-xs text-muted">
                            {theme.slogan || "Tu eslogan aparece acá"}
                          </p>
                        </div>
                        <span
                          className="shrink-0 rounded-lg px-2.5 py-1.5 text-[length:var(--ts-2xs)] font-bold text-white"
                          style={{ background: theme.primaryColor || "#00A0A0" }}
                          aria-hidden
                        >
                          Pedir
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Mockup: resultado de Google (SERP) */}
                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">
                      Así se ve en Google
                    </p>
                    <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3.5 shadow-[var(--shadow-sm)]">
                      <div className="flex items-center gap-2">
                        <div className="relative h-6 w-6 shrink-0 rounded-full overflow-hidden border border-[var(--rule-soft)] bg-[var(--surface-sunken)] flex items-center justify-center">
                          {theme.logo ? (
                            <Image src={theme.logo} alt="" fill className="object-cover" sizes="24px" />
                          ) : (
                            <Store className="h-3 w-3 text-muted" />
                          )}
                        </div>
                        <div className="min-w-0 leading-tight">
                          <p className="truncate text-xs font-medium text-[var(--text-secondary)]">
                            {theme.storeName || "Mi Bodega"}
                          </p>
                          <p className="truncate text-xs text-[var(--data-success-700,#047857)] dark:text-emerald-400">
                            buleje.com › t › {activeTenantSlug}
                          </p>
                        </div>
                      </div>
                      <p className="mt-1.5 truncate text-base leading-snug text-[#1a0dab] dark:text-sky-400">
                        {theme.storeName || "Mi Bodega"}{theme.slogan ? ` — ${theme.slogan}` : ""}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-sm leading-snug text-[var(--text-secondary)]">
                        {theme.description || "Tu descripción aparece acá. Escribila pensando en qué buscaría tu cliente."}
                      </p>
                    </div>
                  </div>

                  {/* Tip mínimo — 1 línea, sin banner gigante */}
                  <p className="text-xs text-muted leading-relaxed px-1">
                    El color del nombre y el botón se configuran en la pestaña <strong>Colores</strong>.
                  </p>
                </aside>
              </div>

              {/* SEO, visibilidad y "Acerca de" — absorbidos de "Mi tienda
                  pública" (ADR-299 fase 2). Guardan en TenantStorePage. */}
              <StyleSection
                icon={<Settings2 className="h-5 w-5 text-primary" />}
                title="SEO y visibilidad"
                description="Cómo aparece tu tienda en Google y si está publicada (antes vivía en 'Mi tienda pública')."
              >
                <div className="space-y-4">
                  <Field label="Título SEO (meta title)" labelClassName="text-sm font-semibold text-[var(--text-primary)]">
                    <input type="text" value={pageFields.metaTitle} onChange={(e) => updatePage({ metaTitle: e.target.value })} placeholder={theme.storeName || "Mi tienda"} maxLength={200} className={inputCls} />
                  </Field>
                  <Field label="Descripción SEO (meta description)" labelClassName="text-sm font-semibold text-[var(--text-primary)]">
                    <textarea rows={2} value={pageFields.metaDescription} onChange={(e) => updatePage({ metaDescription: e.target.value })} placeholder="Lo que se lee bajo el título en Google." maxLength={400} className={inputCls} />
                  </Field>
                  <Field label="Imagen para compartir (OG image · URL)" labelClassName="text-sm font-semibold text-[var(--text-primary)]">
                    <input type="url" value={pageFields.ogImageUrl} onChange={(e) => updatePage({ ogImageUrl: e.target.value })} placeholder="https://..." maxLength={500} className={inputCls} />
                  </Field>
                  <label className="flex items-center gap-3 cursor-pointer pt-1">
                    <input type="checkbox" checked={pageFields.published} onChange={(e) => updatePage({ published: e.target.checked })} className="h-5 w-5 rounded accent-[var(--accent)]" />
                    <span className="text-sm font-semibold text-[var(--text-primary)]">Tienda publicada (visible al público)</span>
                  </label>
                </div>
              </StyleSection>

              <StyleSection
                icon={<FileText className="h-5 w-5 text-primary" />}
                title="Acerca de tu tienda"
                description="Sección 'sobre nosotros' del storefront. Opcional."
              >
                <div className="space-y-4">
                  <Field label="Título" labelClassName="text-sm font-semibold text-[var(--text-primary)]">
                    <input type="text" value={pageFields.aboutTitle} onChange={(e) => updatePage({ aboutTitle: e.target.value })} placeholder="Sobre nosotros" maxLength={200} className={inputCls} />
                  </Field>
                  <Field label="Texto" labelClassName="text-sm font-semibold text-[var(--text-primary)]">
                    <textarea rows={4} value={pageFields.aboutBody} onChange={(e) => updatePage({ aboutBody: e.target.value })} placeholder="Contá la historia de tu negocio…" maxLength={4000} className={inputCls} />
                  </Field>
                </div>
              </StyleSection>
              </div>
            )}

            {/* ── TAB: MARCA — análisis de logo + conceptos ─────────── */}
            {/* Marca → fusionado en "Colores & Tipografía" (ADR-299) */}
            {activeTab === "colores" && (
              <BrandConceptTab
                theme={theme}
                onApplyConcept={(patches) => {
                  // Aplicar todos los patches en cascada usando el helper update
                  Object.entries(patches).forEach(([key, value]) => {
                    if (value !== undefined) {
                      update(key as keyof StoreTheme, value as never);
                    }
                  });
                }}
              />
            )}

            {/* ── TAB: PROMOS POR CATEGORÍA ─────────────────────────── */}
            {/* Promos → fusionado en "Página" (ADR-299) */}
            {activeTab === "contacto" && (
              <CategoryBannersTab theme={theme} update={update} inputCls={inputCls} />
            )}

            {/* ── TAB: COLORES ───────────────────────────────────────── */}
            {activeTab === "colores" && (
              <div className="space-y-6">
                {/* Banner explicativo */}
                <div className="bg-primary/5 dark:bg-primary/10 border-2 border-primary/15 rounded-2xl p-5 flex items-start gap-3">
                  <div className="shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Palette className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-bold text-[var(--text-primary)]">La paleta de tu marca</p>
                    <p className="text-sm text-muted mt-0.5">
                      Empezá con una plantilla ya curada o ajustá cada color manual. Cada cambio se previsualiza en vivo abajo y se aplica a botones, links, badges y CTAs en toda tu tienda.
                    </p>
                  </div>
                </div>

                {/* ── Layout 2-col (Brandon 2026-06-24): preview STICKY a la
                    derecha (siempre visible mientras elegís colores), form a la
                    izquierda. Mismo patrón que Hero/Identidad. ── */}
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8 items-start">
                {/* ── Columna form (izquierda) ── */}
                <div className="min-w-0 space-y-8 lg:col-start-1 lg:row-start-1">
                {/* ── 1. PLANTILLAS LISTAS ──────────────────────────── */}
                <StyleSection
                  icon={<Sparkles className="h-5 w-5 text-primary" />}
                  title="Plantillas listas"
                  description="Sets curados de colores + tipografía + modo. Click para aplicar todo en bloque."
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {THEME_TEMPLATES.map((t) => {
                      const active = theme.primaryColor === t.colors.primaryColor &&
                                     theme.secondaryColor === t.colors.secondaryColor;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            update("primaryColor", t.colors.primaryColor);
                            update("secondaryColor", t.colors.secondaryColor);
                            update("accentColor", t.colors.accentColor);
                            update("fontFamily", t.fontFamily);
                            update("darkModeDefault", t.darkModeDefault);
                          }}
                          aria-pressed={active}
                          className={cn(
                            "rounded-2xl border-2 text-left transition-all overflow-hidden hover:shadow-[var(--shadow-md)]",
                            active
                              ? "border-primary ring-2 ring-primary/20"
                              : "border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:border-primary/40"
                          )}
                        >
                          {/* Mini-mockup banner — gradient con los 3 colores reales */}
                          <div
                            className="h-16 w-full relative overflow-hidden"
                            style={{
                              background: `linear-gradient(135deg, ${t.colors.primaryColor}, ${t.colors.accentColor || t.colors.primaryColor})`,
                            }}
                          >
                            <div className="absolute inset-x-3 bottom-2 flex items-center gap-2">
                              <div className="h-1.5 w-12 rounded-full bg-white/40" />
                              <div className="h-3 w-10 rounded-md ml-auto" style={{ backgroundColor: t.colors.secondaryColor }} />
                            </div>
                            {active && (
                              <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-white dark:bg-[var(--color-card)] flex items-center justify-center shadow">
                                <Check className="h-3 w-3 text-primary" />
                              </div>
                            )}
                            {t.darkModeDefault && (
                              <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-black/40 text-white text-[length:var(--ts-2xs)] font-bold">
                                <Moon className="h-2.5 w-2.5" />
                                Dark
                              </span>
                            )}
                          </div>
                          {/* Body con color dots + título + descripción */}
                          <div className="p-3.5 flex items-start gap-3">
                            <div className="flex -space-x-1.5 shrink-0 mt-0.5">
                              <div className="w-7 h-7 rounded-full border-2 border-white dark:border-card shadow-[var(--shadow-md)]" style={{ backgroundColor: t.colors.primaryColor }} />
                              <div className="w-7 h-7 rounded-full border-2 border-white dark:border-card shadow-[var(--shadow-md)]" style={{ backgroundColor: t.colors.secondaryColor }} />
                              <div className="w-7 h-7 rounded-full border-2 border-white dark:border-card shadow-[var(--shadow-md)]" style={{ backgroundColor: t.colors.accentColor || t.colors.primaryColor }} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-base font-bold text-[var(--text-primary)] leading-tight">{t.name}</p>
                              <p className="text-sm text-muted line-clamp-2 mt-0.5">{t.description}</p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </StyleSection>

                {/* ── 2. COLORES PERSONALIZADOS — grid 3-col en xl ────── */}
                <StyleSection
                  icon={<Paintbrush className="h-5 w-5 text-primary" />}
                  title="Colores personalizados"
                  description="Ajustá cada color por separado. Tip: el primario manda en CTAs y links, el secundario en badges de oferta."
                >
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    <div className="rounded-2xl border-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] p-4 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-lg border-2 border-white dark:border-card shadow-[var(--shadow-sm)]" style={{ backgroundColor: theme.primaryColor }} />
                          <p className="text-sm font-bold text-[var(--text-primary)]">Primario</p>
                        </div>
                        <span
                          className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded text-white"
                          style={{ backgroundColor: theme.primaryColor }}
                        >
                          CTA
                        </span>
                      </div>
                      <ColorPicker
                        label=""
                        value={theme.primaryColor}
                        onChange={(v) => update("primaryColor", v)}
                      />
                      <p className="text-xs text-muted leading-snug">Botones de compra, links, badges activos y acentos del header.</p>
                    </div>

                    <div className="rounded-2xl border-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] p-4 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-lg border-2 border-white dark:border-card shadow-[var(--shadow-sm)]" style={{ backgroundColor: theme.secondaryColor }} />
                          <p className="text-sm font-bold text-[var(--text-primary)]">Secundario</p>
                        </div>
                        <span
                          className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded text-white"
                          style={{ backgroundColor: theme.secondaryColor }}
                        >
                          Oferta
                        </span>
                      </div>
                      <ColorPicker
                        label=""
                        value={theme.secondaryColor}
                        onChange={(v) => update("secondaryColor", v)}
                      />
                      <p className="text-xs text-muted leading-snug">CTAs alternos, badges de descuento, ofertas y temporada.</p>
                    </div>

                    <div className="rounded-2xl border-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] p-4 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-lg border-2 border-white dark:border-card shadow-[var(--shadow-sm)]" style={{ backgroundColor: theme.accentColor }} />
                          <p className="text-sm font-bold text-[var(--text-primary)]">Acento</p>
                        </div>
                        <span
                          className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded text-white"
                          style={{ backgroundColor: theme.accentColor }}
                        >
                          Hover
                        </span>
                      </div>
                      <ColorPicker
                        label=""
                        value={theme.accentColor}
                        onChange={(v) => update("accentColor", v)}
                      />
                      <p className="text-xs text-muted leading-snug">Hover states, fondos suaves y resaltados sutiles.</p>
                    </div>
                  </div>

                  {/* Pista de contraste WCAG */}
                  <div className="mt-4 rounded-xl bg-gray-50 dark:bg-surface border border-[var(--rule-base)] dark:border-[var(--rule-base)] p-3 flex items-start gap-2.5">
                    <div className="shrink-0 mt-0.5">
                      <Sliders className="h-4 w-4 text-muted" />
                    </div>
                    <div className="text-xs text-muted leading-snug">
                      <span className="font-bold text-[var(--text-primary)]">Contraste:</span> los colores primario y secundario se usan con texto blanco en botones — asegurate de que sean lo suficientemente oscuros para que el texto se lea bien (target hex con luminosidad &lt; 60%).
                    </div>
                  </div>
                </StyleSection>

                {/* ── 3. MODO OSCURO ─────────────────────────────────── */}
                <StyleSection
                  icon={<Moon className="h-5 w-5 text-primary" />}
                  title="Modo oscuro por defecto"
                  description="Cuando un cliente nuevo entra a tu tienda, ¿en qué modo abre? Igual cada usuario puede cambiar después."
                >
                  <div className="grid grid-cols-2 gap-3">
                    {/* Light mode card */}
                    <button
                      type="button"
                      onClick={() => update("darkModeDefault", false)}
                      aria-pressed={!theme.darkModeDefault}
                      className={cn(
                        "p-4 rounded-2xl border-2 transition-all",
                        !theme.darkModeDefault
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                          : "border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:border-primary/40"
                      )}
                    >
                      <div className="aspect-[4/3] mb-3 rounded-xl bg-white dark:bg-[var(--color-card)] border border-gray-200 overflow-hidden flex flex-col">
                        <div className="h-3 w-full" style={{ backgroundColor: theme.primaryColor }} />
                        <div className="flex-1 p-2 space-y-1">
                          <div className="h-1.5 rounded-full bg-gray-300 w-3/4" />
                          <div className="h-1 rounded-full bg-gray-200 w-1/2" />
                          <div className="h-2 w-10 rounded mt-1" style={{ backgroundColor: theme.primaryColor }} />
                        </div>
                      </div>
                      <div className="flex items-center justify-center gap-2">
                        <Sun className="h-4 w-4 text-[var(--data-warning-500)]" />
                        <p className="text-sm font-bold text-[var(--text-primary)]">Modo claro</p>
                      </div>
                    </button>

                    {/* Dark mode card */}
                    <button
                      type="button"
                      onClick={() => update("darkModeDefault", true)}
                      aria-pressed={theme.darkModeDefault}
                      className={cn(
                        "p-4 rounded-2xl border-2 transition-all",
                        theme.darkModeDefault
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                          : "border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:border-primary/40"
                      )}
                    >
                      <div className="aspect-[4/3] mb-3 rounded-xl bg-gray-950 border border-gray-800 overflow-hidden flex flex-col">
                        <div className="h-3 w-full" style={{ backgroundColor: theme.primaryColor }} />
                        <div className="flex-1 p-2 space-y-1">
                          <div className="h-1.5 rounded-full bg-gray-700 w-3/4" />
                          <div className="h-1 rounded-full bg-gray-800 w-1/2" />
                          <div className="h-2 w-10 rounded mt-1" style={{ backgroundColor: theme.primaryColor }} />
                        </div>
                      </div>
                      <div className="flex items-center justify-center gap-2">
                        <Moon className="h-4 w-4 text-[var(--data-success-500)]" />
                        <p className="text-sm font-bold text-[var(--text-primary)]">Modo oscuro</p>
                      </div>
                    </button>
                  </div>
                </StyleSection>
                </div>

                {/* ── Columna preview (sticky derecha) ── */}
                <aside className="min-w-0 lg:col-start-2 lg:row-start-1 lg:sticky lg:top-4">
                {/* ── VISTA PREVIA EN VIVO ─────────────────────── */}
                <StyleSection
                  icon={<Eye className="h-5 w-5 text-primary" />}
                  title="Vista previa en vivo"
                  description="Cómo se aplican tus colores a un componente real de tu tienda."
                >
                  <div className="rounded-2xl border-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] overflow-hidden">
                    {/* Mini header con primary */}
                    <div
                      className="px-5 py-3 flex items-center justify-between"
                      style={{ backgroundColor: theme.primaryColor, borderRadius: 0 }}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-lg bg-white/20 flex items-center justify-center text-white font-bold text-xs">
                          {(theme.storeName || "B").slice(0, 2).toUpperCase()}
                        </div>
                        <span className="text-white font-bold text-sm truncate">{theme.storeName || "Tu tienda"}</span>
                      </div>
                      <span className="text-xs text-white/80 font-medium">Header</span>
                    </div>

                    {/* Body con cards y CTAs */}
                    <div className="p-5 bg-[var(--surface-raised)] space-y-4">
                      {/* Hero stripe con gradient */}
                      <div
                        className="rounded-xl p-4 relative overflow-hidden"
                        style={{
                          background: `linear-gradient(135deg, ${theme.primaryColor}, ${theme.accentColor})`,
                          borderRadius: `${theme.borderRadius}px`,
                        }}
                      >
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold text-white"
                          style={{ backgroundColor: theme.secondaryColor }}
                        >
                          {theme.heroBadge || "Oferta"}
                        </span>
                        <h4 className="text-white text-lg font-extrabold mt-2 leading-tight">{theme.heroTitle || "Todo lo que necesitas"}</h4>
                        <p className="text-white/80 text-xs mt-1 line-clamp-1">{theme.heroSubtitle || "Tu tienda online lista en minutos"}</p>
                      </div>

                      {/* Buttons row */}
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="px-5 py-2.5 text-sm font-bold text-white shadow-[var(--shadow-md)] hover:opacity-90 transition-all pointer-events-none"
                          style={{ backgroundColor: theme.primaryColor, borderRadius: `${theme.borderRadius}px` }}
                        >
                          {theme.heroCTA || "Comprar ahora"}
                        </button>
                        <button
                          type="button"
                          className="px-5 py-2.5 text-sm font-bold text-white shadow-[var(--shadow-md)] hover:opacity-90 transition-all pointer-events-none"
                          style={{ backgroundColor: theme.secondaryColor, borderRadius: `${theme.borderRadius}px` }}
                        >
                          Ver oferta
                        </button>
                        <button
                          type="button"
                          className="px-5 py-2.5 text-sm font-bold border-2 hover:opacity-90 transition-all pointer-events-none"
                          style={{
                            borderColor: theme.primaryColor,
                            color: theme.primaryColor,
                            borderRadius: `${theme.borderRadius}px`,
                          }}
                        >
                          Outline
                        </button>
                      </div>

                      {/* Link + badge inline */}
                      <div className="flex items-center gap-3 text-xs">
                        <span
                          className="font-bold underline-offset-2 hover:underline"
                          style={{ color: theme.primaryColor }}
                        >
                          Link primary
                        </span>
                        <span
                          className="px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold text-white"
                          style={{ backgroundColor: theme.secondaryColor }}
                        >
                          -25% OFF
                        </span>
                        <span
                          className="px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold"
                          style={{ backgroundColor: `${theme.accentColor}25`, color: theme.accentColor }}
                        >
                          Hover state
                        </span>
                      </div>
                    </div>
                  </div>
                </StyleSection>
                </aside>
                </div>
              </div>
            )}

            {/* ── TAB: SECCIONES — delegado a StorefrontEditor ──────── */}
            {/* Secciones → fusionado en "Página" (ADR-299) */}
            {activeTab === "contacto" && (
              <div className="space-y-8">
                {/* Banner explicativo coherente con Estilos / Hero */}
                <div className="bg-primary/5 dark:bg-primary/10 border-2 border-primary/15 rounded-2xl p-5 flex items-start gap-3">
                  <div className="shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Layout className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-bold text-[var(--text-primary)]">Las secciones que ve tu cliente</p>
                    <p className="text-sm text-muted mt-0.5">
                      Activá, desactivá y reordená los bloques de tu tienda con drag &amp; drop.
                      Las secciones desactivadas no se renderizan — la página se compacta automáticamente.
                    </p>
                  </div>
                </div>
                <StorefrontEditor />
              </div>
            )}

            {/* ── TAB: HERO ──────────────────────────────────────────── */}
            {activeTab === "hero" && (
              <HeroTab
                theme={theme}
                update={update}
                inputCls={inputCls}
              />
            )}

            {/* ── TAB: CONTACTO ──────────────────────────────────────── */}
            {activeTab === "contacto" && (
              <div className="space-y-8">
                {/* Banner explicativo */}
                <div className="bg-primary/5 dark:bg-primary/10 border-2 border-primary/15 rounded-2xl p-5 flex items-start gap-3">
                  <div className="shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Phone className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-bold text-[var(--text-primary)]">Cómo te puede contactar el cliente</p>
                    <p className="text-sm text-muted mt-0.5">
                      Aparecen en el footer, mapa, sección de contacto y JSON-LD para Google. WhatsApp es el canal #1 — asegurate de que esté activo.
                    </p>
                  </div>
                </div>

                {/* ── 1. CANALES DE CONTACTO ──────────────────────── */}
                <StyleSection
                  icon={<MessageSquare className="h-5 w-5 text-primary" />}
                  title="Canales de contacto"
                  description="Los datos por los que el cliente te encuentra y escribe."
                >
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <Field
                        label={<><Phone className="h-4 w-4 text-[var(--data-success-500)]" /> WhatsApp <span className="text-xs font-normal text-muted ml-1">recomendado</span></>}
                        labelClassName="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2"
                      >
                        <input
                          type="tel"
                          value={theme.whatsapp}
                          onChange={(e) => update("whatsapp", e.target.value)}
                          placeholder="+51 900 000 000"
                          className={inputCls}
                        />
                      </Field>
                      <p className="text-xs text-muted">Con código de país. Aparece en el footer y como botón flotante.</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Field label="Email" labelClassName="text-sm font-semibold text-[var(--text-primary)]">
                          <input
                            type="email"
                            value={theme.email}
                            onChange={(e) => update("email", e.target.value)}
                            placeholder="contacto@tibodega.pe"
                            className={inputCls}
                          />
                        </Field>
                      </div>
                      <div className="space-y-2">
                        <Field label="Teléfono fijo" labelClassName="text-sm font-semibold text-[var(--text-primary)]">
                          <input
                            type="tel"
                            value={theme.phone}
                            onChange={(e) => update("phone", e.target.value)}
                            placeholder="+51 061 000 000"
                            className={inputCls}
                          />
                        </Field>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Field
                        label={<><Map className="h-4 w-4 text-primary" /> Dirección física</>}
                        labelClassName="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2"
                      >
                        <textarea
                          value={theme.address}
                          onChange={(e) => update("address", e.target.value)}
                          placeholder="Jr. Ucayali 123, Pucallpa, Perú"
                          className={cn(inputCls, "resize-none min-h-[72px] py-3")}
                          maxLength={200}
                        />
                      </Field>
                      <p className="text-xs text-muted">Si tenés local físico — se muestra en el mapa de delivery y JSON-LD para Google Maps.</p>
                    </div>
                  </div>
                </StyleSection>

                {/* ── 2. HORARIOS DE ATENCIÓN ──────────────────────── */}
                <StyleSection
                  icon={<Sliders className="h-5 w-5 text-primary" />}
                  title="Horarios de atención"
                  description="Aparecen en el footer y validan si tu tienda está 'Abierta' o 'Cerrada' al cliente."
                >
                  <div className="rounded-2xl border-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
                    {DAYS.map(({ key, label }, idx) => (
                      <div
                        key={key}
                        className={cn(
                          "flex items-center gap-3 px-4 py-3",
                          idx > 0 && "border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)]"
                        )}
                      >
                        <span className="text-sm font-bold text-[var(--text-primary)] w-20 shrink-0">{label}</span>
                        <div className="flex-1 grid grid-cols-2 gap-2 items-center">
                          <input
                            type="time"
                            value={theme.schedules[key]?.open ?? "07:00"}
                            onChange={(e) =>
                              update("schedules", {
                                ...theme.schedules,
                                [key]: { ...theme.schedules[key], open: e.target.value },
                              })
                            }
                            className="px-3 h-11 rounded-xl border-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-base text-[var(--text-primary)] tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                            aria-label={`Apertura ${label}`}
                          />
                          <input
                            type="time"
                            value={theme.schedules[key]?.close ?? "22:00"}
                            onChange={(e) =>
                              update("schedules", {
                                ...theme.schedules,
                                [key]: { ...theme.schedules[key], close: e.target.value },
                              })
                            }
                            className="px-3 h-11 rounded-xl border-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-base text-[var(--text-primary)] tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                            aria-label={`Cierre ${label}`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted mt-2.5 px-1">
                    Tip: si abrís y cerrás a la misma hora, ese día queda como cerrado en el storefront.
                  </p>
                </StyleSection>
              </div>
            )}

            {/* ── TAB: ESTILOS ───────────────────────────────────────── */}
            {activeTab === "estilos" && (
              <div className="space-y-8">
                {/* Banner explicativo */}
                <div className="bg-primary/5 dark:bg-primary/10 border-2 border-primary/15 rounded-2xl p-5 flex items-start gap-3">
                  <div className="shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Sparkles className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-bold text-[var(--text-primary)]">Cómo se ven los elementos</p>
                    <p className="text-sm text-muted mt-0.5">
                      Cada opción muestra una vista previa real. Tus cambios se aplican al guardar y se ven inmediatamente en tu tienda online.
                    </p>
                  </div>
                </div>

                {/* ── 1. CARDS DE PRODUCTOS ─────────────────────────── */}
                <StyleSection
                  icon={<Package className="h-5 w-5 text-primary" />}
                  title="Cards de productos"
                  description="Cómo se ven las cards en /tienda y resultados de búsqueda."
                >
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {([
                      { value: "minimal", label: "Minimal", desc: "Plano, sin bordes" },
                      { value: "shadow",  label: "Con sombra", desc: "Sombra suave" },
                      { value: "border",  label: "Con borde", desc: "Borde de color" },
                      { value: "glass",   label: "Glassmorphism", desc: "Cristal con blur" },
                    ] as const).map((s) => {
                      const active = theme.cardStyle === s.value;
                      return (
                        <button
                          key={s.value}
                          type="button"
                          onClick={() => update("cardStyle", s.value)}
                          aria-pressed={active}
                          className={cn(
                            "group p-3 rounded-2xl border-2 text-left transition-all",
                            active
                              ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                              : "border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:border-primary/40 hover:shadow-[var(--shadow-md)]"
                          )}
                        >
                          {/* Mini-card preview */}
                          <div className={cn(
                            "aspect-[4/3] mb-3 rounded-xl overflow-hidden flex flex-col bg-white dark:bg-surface relative",
                            s.value === "minimal" && "border-0",
                            s.value === "shadow"  && "shadow-[var(--shadow-md)]",
                            s.value === "border"  && "border-2",
                            s.value === "glass"   && "backdrop-blur-md bg-white/60 dark:bg-surface/60 border border-white/40 dark:border-[var(--rule-base)]"
                          )}
                          style={s.value === "border" ? { borderColor: theme.primaryColor } : undefined}>
                            {/* Imagen placeholder */}
                            <div className="flex-1 bg-linear-to-br from-[var(--surface-sunken)] to-[var(--rule-soft)] dark:from-[var(--surface-sunken)] dark:to-[var(--surface-canvas)] flex items-center justify-center">
                              <ShoppingBag className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                            </div>
                            {/* Texto + precio */}
                            <div className="px-2 py-1.5 space-y-0.5">
                              <div className="h-1.5 w-3/4 rounded-full bg-gray-300 dark:bg-gray-600" />
                              <div className="h-2 w-1/3 rounded-full" style={{ backgroundColor: theme.primaryColor }} />
                            </div>
                          </div>
                          <p className="text-sm font-bold text-[var(--text-primary)] leading-tight">{s.label}</p>
                          <p className="text-xs text-muted leading-tight mt-0.5">{s.desc}</p>
                        </button>
                      );
                    })}
                  </div>
                </StyleSection>

                {/* ── 2. BOTONES ────────────────────────────────────── */}
                <StyleSection
                  icon={<Square className="h-5 w-5 text-primary" />}
                  title="Botones primarios"
                  description="Forma de los botones de acción (Comprar, Agregar al carrito)."
                >
                  <div className="grid grid-cols-3 gap-3">
                    {([
                      { value: "rounded", label: "Redondeado", radius: "rounded-xl" },
                      { value: "square",  label: "Cuadrado",   radius: "rounded-md" },
                      { value: "pill",    label: "Pill",       radius: "rounded-full" },
                    ] as const).map((s) => {
                      const active = theme.buttonStyle === s.value;
                      return (
                        <button
                          key={s.value}
                          type="button"
                          onClick={() => update("buttonStyle", s.value)}
                          aria-pressed={active}
                          className={cn(
                            "p-4 rounded-2xl border-2 transition-all",
                            active
                              ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                              : "border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:border-primary/40 hover:shadow-[var(--shadow-md)]"
                          )}
                        >
                          {/* Preview real del botón */}
                          <div
                            className={cn(
                              "w-full h-10 mb-3 flex items-center justify-center text-sm font-bold text-white shadow-[var(--shadow-sm)]",
                              s.radius
                            )}
                            style={{ backgroundColor: theme.primaryColor }}
                          >
                            Comprar
                          </div>
                          <p className="text-sm font-bold text-[var(--text-primary)] text-center">{s.label}</p>
                        </button>
                      );
                    })}
                  </div>
                </StyleSection>

                {/* ── 3. NAVBAR ─────────────────────────────────────── */}
                <StyleSection
                  icon={<LayoutGrid className="h-5 w-5 text-primary" />}
                  title="Barra superior (navbar)"
                  description="Cabecera fija con el logo, búsqueda y carrito."
                >
                  <div className="grid grid-cols-2 gap-3">
                    {([
                      { value: "solid",       label: "Sólido",      desc: "Fondo color completo" },
                      { value: "transparent", label: "Transparente",desc: "Sin fondo, solo borde" },
                      { value: "blur",        label: "Con blur",    desc: "Cristal esmerilado" },
                      { value: "minimal",     label: "Minimalista", desc: "Linea fina inferior" },
                    ] as const).map((s) => {
                      const active = theme.navbarStyle === s.value;
                      return (
                        <button
                          key={s.value}
                          type="button"
                          onClick={() => update("navbarStyle", s.value)}
                          aria-pressed={active}
                          className={cn(
                            "p-3 rounded-2xl border-2 text-left transition-all",
                            active
                              ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                              : "border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:border-primary/40 hover:shadow-[var(--shadow-md)]"
                          )}
                        >
                          {/* Mini-mockup del navbar */}
                          <div className="relative h-16 mb-3 rounded-xl overflow-hidden bg-linear-to-b from-[var(--surface-alt)] to-[var(--surface-sunken)] dark:from-[var(--surface-sunken)] dark:to-[var(--surface-canvas)]">
                            <div
                              className={cn(
                                "absolute top-0 inset-x-0 h-7 flex items-center px-2 gap-1.5",
                                s.value === "solid"       && "shadow-[var(--shadow-sm)]",
                                s.value === "transparent" && "border-b border-gray-300 dark:border-gray-700",
                                s.value === "blur"        && "backdrop-blur-md border-b border-white/30",
                                s.value === "minimal"     && "border-b-2"
                              )}
                              style={
                                s.value === "solid" ? { backgroundColor: theme.primaryColor } :
                                s.value === "blur"  ? { backgroundColor: `${theme.primaryColor}cc` } :
                                s.value === "minimal" ? { borderBottomColor: theme.primaryColor, backgroundColor: "transparent" } :
                                { backgroundColor: "transparent" }
                              }
                            >
                              <div className={cn(
                                "h-2 w-6 rounded-full",
                                s.value === "solid" || s.value === "blur" ? "bg-white/80" : ""
                              )}
                              style={s.value === "transparent" || s.value === "minimal" ? { backgroundColor: theme.primaryColor } : undefined} />
                              <div className="flex-1 h-2 rounded-full bg-white/30 dark:bg-white/10" />
                              <div className={cn(
                                "h-2 w-2 rounded-full",
                                s.value === "solid" || s.value === "blur" ? "bg-white/80" : "bg-gray-400"
                              )} />
                            </div>
                            {/* Body placeholder */}
                            <div className="absolute inset-x-2 bottom-2 space-y-1">
                              <div className="h-1.5 w-1/2 rounded-full bg-gray-300 dark:bg-gray-700" />
                              <div className="h-1.5 w-3/4 rounded-full bg-gray-200 dark:bg-gray-700" />
                            </div>
                          </div>
                          <p className="text-sm font-bold text-[var(--text-primary)]">{s.label}</p>
                          <p className="text-xs text-muted">{s.desc}</p>
                        </button>
                      );
                    })}
                  </div>
                </StyleSection>

                {/* ── 4. DETALLES (sombras + animaciones + fondo) ───── */}
                <StyleSection
                  icon={<Sliders className="h-5 w-5 text-primary" />}
                  title="Detalles de estilo"
                  description="Sombras, movimiento y patrón decorativo del fondo."
                >
                  <div className="space-y-6">
                    {/* Sombras con preview de cajas */}
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)] mb-3">Intensidad de sombras</p>
                      <div className="grid grid-cols-3 gap-3">
                        {([
                          { value: "none", label: "Sin sombra", cls: "" },
                          { value: "soft", label: "Suave",      cls: "shadow-[var(--shadow-md)]" },
                          { value: "deep", label: "Profunda",   cls: "shadow-[var(--shadow-xl)]" },
                        ] as const).map((s) => {
                          const active = theme.shadowLevel === s.value;
                          return (
                            <button
                              key={s.value}
                              type="button"
                              onClick={() => update("shadowLevel", s.value)}
                              aria-pressed={active}
                              className={cn(
                                "p-3 rounded-2xl border-2 transition-all flex flex-col items-center gap-2.5",
                                active
                                  ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                                  : "border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:border-primary/40"
                              )}
                            >
                              <div className={cn("w-10 h-10 rounded-xl bg-white dark:bg-surface border border-[var(--rule-base)] dark:border-[var(--rule-base)]", s.cls)} />
                              <p className="text-sm font-bold text-[var(--text-primary)]">{s.label}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Animaciones */}
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)] mb-3">Animaciones de la interfaz</p>
                      <div className="grid grid-cols-3 gap-3">
                        {([
                          { value: "none",    label: "Ninguna",   desc: "Estática" },
                          { value: "subtle",  label: "Suaves",    desc: "Recomendado" },
                          { value: "dynamic", label: "Dinámicas", desc: "Llaman la atención" },
                        ] as const).map((s) => {
                          const active = theme.animations === s.value;
                          return (
                            <button
                              key={s.value}
                              type="button"
                              onClick={() => update("animations", s.value)}
                              aria-pressed={active}
                              className={cn(
                                "p-3 rounded-2xl border-2 transition-all text-center",
                                active
                                  ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                                  : "border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:border-primary/40"
                              )}
                            >
                              <Sparkles
                                className={cn(
                                  "h-6 w-6 mx-auto mb-1.5 transition-transform",
                                  s.value === "none"    && "text-gray-400",
                                  s.value === "subtle"  && "text-primary",
                                  s.value === "dynamic" && "text-primary animate-pulse"
                                )}
                              />
                              <p className="text-sm font-bold text-[var(--text-primary)]">{s.label}</p>
                              <p className="text-xs text-muted mt-0.5">{s.desc}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Fondo con preview de patrón */}
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)] mb-3">Patrón de fondo</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {([
                          { value: "none",     label: "Liso" },
                          { value: "dots",     label: "Puntos" },
                          { value: "waves",    label: "Ondas" },
                          { value: "gradient", label: "Gradiente" },
                        ] as const).map((s) => {
                          const active = theme.backgroundPattern === s.value;
                          return (
                            <button
                              key={s.value}
                              type="button"
                              onClick={() => update("backgroundPattern", s.value)}
                              aria-pressed={active}
                              className={cn(
                                "p-3 rounded-2xl border-2 transition-all",
                                active
                                  ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                                  : "border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:border-primary/40"
                              )}
                            >
                              <div
                                className={cn(
                                  "aspect-[5/3] rounded-xl mb-2 overflow-hidden",
                                  s.value === "none" && "bg-gray-50 dark:bg-surface",
                                )}
                                style={
                                  s.value === "dots"
                                    ? { backgroundImage: `radial-gradient(${theme.primaryColor}33 1px, transparent 1px)`, backgroundSize: "10px 10px", backgroundColor: "var(--surface-canvas, #fff)" }
                                    : s.value === "waves"
                                    ? { backgroundImage: `linear-gradient(45deg, ${theme.primaryColor}11 25%, transparent 25%), linear-gradient(-45deg, ${theme.primaryColor}11 25%, transparent 25%)`, backgroundSize: "12px 12px" }
                                    : s.value === "gradient"
                                    ? { background: `linear-gradient(135deg, ${theme.primaryColor}22, ${theme.secondaryColor}22)` }
                                    : undefined
                                }
                              />
                              <p className="text-sm font-bold text-[var(--text-primary)] text-center">{s.label}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </StyleSection>
              </div>
            )}

            {/* ── TAB: CONTENIDO ────────────────────────────────────── */}
            {/* Textos y popup → fusionado en "Avanzado" (ADR-299) */}
            {activeTab === "avanzado" && (
              <div className="space-y-8">
                {/* Banner explicativo */}
                <div className="bg-primary/5 dark:bg-primary/10 border-2 border-primary/15 rounded-2xl p-5 flex items-start gap-3">
                  <div className="shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-bold text-[var(--text-primary)]">Textos y mensajes de tu tienda</p>
                    <p className="text-sm text-muted mt-0.5">
                      Configurá los mensajes que aparecen automáticamente al cliente: el saludo de WhatsApp, el footer con tu storytelling y el popup de bienvenida con cupón.
                    </p>
                  </div>
                </div>

                {/* ── 1. MENSAJES AUTOMÁTICOS ──────────────────────── */}
                <StyleSection
                  icon={<MessageSquare className="h-5 w-5 text-primary" />}
                  title="Mensajes automáticos"
                  description="Textos que el cliente ve sin que vos los escribas en cada interacción."
                >
                  <div className="space-y-5">
                    {/* WhatsApp */}
                    <div className="space-y-2">
                      <Field label="Saludo de WhatsApp" labelClassName="text-sm font-semibold text-[var(--text-primary)]">
                        <input
                          type="text"
                          value={theme.whatsappMessage}
                          onChange={(e) => update("whatsappMessage", e.target.value)}
                          placeholder="Hola! Quiero hacer un pedido"
                          className={inputCls}
                          maxLength={200}
                        />
                      </Field>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted">Pre-llena el chat cuando el cliente toca el botón de WhatsApp.</p>
                        <span className="text-xs font-mono text-muted shrink-0">{(theme.whatsappMessage || "").length}/200</span>
                      </div>
                    </div>

                    {/* Footer text */}
                    <div className="space-y-2">
                      <Field label="Texto del footer" labelClassName="text-sm font-semibold text-[var(--text-primary)]">
                        <textarea
                          value={theme.footerText}
                          onChange={(e) => update("footerText", e.target.value)}
                          placeholder="Tu bodega de confianza desde 2020..."
                          className={cn(inputCls, "resize-none min-h-[88px] py-3")}
                          maxLength={300}
                        />
                      </Field>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted">Aparece al pie de cada página. Buen lugar para tu historia, valores o años de servicio.</p>
                        <span className="text-xs font-mono text-muted shrink-0">{(theme.footerText || "").length}/300</span>
                      </div>
                    </div>
                  </div>
                </StyleSection>

                {/* ── 2. POPUP DE BIENVENIDA ───────────────────────── */}
                <StyleSection
                  icon={<Sparkles className="h-5 w-5 text-primary" />}
                  title="Popup de bienvenida"
                  description="Aparece una sola vez al visitante nuevo con un cupón de descuento. Aumenta conversión en primeras compras."
                >
                  <div className={cn(
                    "rounded-2xl border-2 p-5 transition-colors",
                    theme.welcomePopupEnabled
                      ? "bg-primary/5 dark:bg-primary/10 border-primary/30"
                      : "bg-gray-50 dark:bg-surface border-[var(--rule-base)] dark:border-[var(--rule-base)]"
                  )}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-bold text-[var(--text-primary)]">
                          {theme.welcomePopupEnabled ? "Popup activo" : "Popup desactivado"}
                        </p>
                        <p className="text-sm text-muted mt-0.5">
                          {theme.welcomePopupEnabled
                            ? "Se muestra al visitante nuevo (una sola vez)"
                            : "Activalo para incentivar la primera compra"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => update("welcomePopupEnabled", !theme.welcomePopupEnabled)}
                        className={cn(
                          "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 transition-colors duration-[var(--dur-base)]",
                          theme.welcomePopupEnabled
                            ? "bg-primary border-primary"
                            : "bg-gray-200 dark:bg-gray-700 border-transparent"
                        )}
                        aria-label="Toggle popup"
                        aria-pressed={theme.welcomePopupEnabled}
                      >
                        <span className={cn(
                          "inline-block h-4 w-4 rounded-full bg-white dark:bg-[var(--color-card)] shadow transition-transform duration-[var(--dur-base)]",
                          theme.welcomePopupEnabled ? "translate-x-6" : "translate-x-1"
                        )} />
                      </button>
                    </div>
                    {theme.welcomePopupEnabled && (
                      <div className="space-y-3 mt-5 pt-5 border-t-2 border-primary/20">
                        <div className="space-y-1.5">
                          <Field label="Título" labelClassName="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                            <input
                              type="text"
                              value={theme.welcomePopupTitle}
                              onChange={(e) => update("welcomePopupTitle", e.target.value)}
                              placeholder="Bienvenido!"
                              className={inputCls}
                              maxLength={50}
                            />
                          </Field>
                        </div>
                        <div className="space-y-1.5">
                          <Field label="Mensaje" labelClassName="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                            <input
                              type="text"
                              value={theme.welcomePopupMessage}
                              onChange={(e) => update("welcomePopupMessage", e.target.value)}
                              placeholder="Usa este cupón en tu primera compra"
                              className={inputCls}
                              maxLength={120}
                            />
                          </Field>
                        </div>
                        <div className="space-y-1.5">
                          <Field label="Código del cupón" labelClassName="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                            <input
                              type="text"
                              value={theme.welcomePopupCoupon}
                              onChange={(e) => update("welcomePopupCoupon", e.target.value)}
                              placeholder="BIENVENIDO10"
                              className={cn(inputCls, "font-mono uppercase tracking-wider")}
                              maxLength={20}
                            />
                          </Field>
                          <p className="text-xs text-muted">Asegurate de que este código exista en la sección de cupones.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </StyleSection>

                {/* ── 3. QR DE LA TIENDA ───────────────────────────── */}
                <StyleSection
                  icon={<Grid3x3 className="h-5 w-5 text-primary" />}
                  title="QR de tu tienda"
                  description="Imprímelo y pégalo en tu local físico. Los clientes lo escanean y entran a tu tienda online."
                >
                  <div className="rounded-2xl border-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-gray-50 dark:bg-surface p-5 flex flex-col sm:flex-row items-center sm:items-stretch gap-5">
                    <div className="bg-white dark:bg-[var(--color-card)] p-3 rounded-2xl border-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] shrink-0">
                      <Image
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(typeof window !== "undefined" ? `${window.location.origin}/t/${activeTenantSlug}` : "https://tu-tienda.buleje.pe")}`}
                        alt="QR de la tienda"
                        width={160}
                        height={160}
                      />
                    </div>
                    <div className="flex-1 flex flex-col justify-center gap-3 text-center sm:text-left">
                      <div>
                        <p className="text-base font-bold text-[var(--text-primary)]">Tu QR ya está listo</p>
                        <p className="text-sm text-muted mt-0.5">
                          Apunta a <span className="font-mono text-[var(--text-primary)]">/t/{activeTenantSlug}</span>
                        </p>
                      </div>
                      <a
                        href={`https://api.qrserver.com/v1/create-qr-code/?size=512x512&format=png&data=${encodeURIComponent(typeof window !== "undefined" ? `${window.location.origin}/t/${activeTenantSlug}` : "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-2 px-5 h-11 rounded-xl bg-primary text-white text-sm font-bold hover:opacity-90 shadow-[var(--shadow-md)] self-center sm:self-start"
                      >
                        Descargar QR (512px)
                      </a>
                    </div>
                  </div>
                </StyleSection>
              </div>
            )}

            {/* ── TAB: CATÁLOGO (visibilidad de productos) ─────────── */}
            {/* Catálogo → fusionado en "Página" (ADR-299) */}
            {activeTab === "contacto" && (
              <div className="space-y-8">
                <div className="bg-primary/5 dark:bg-primary/10 border-2 border-primary/15 rounded-2xl p-5 flex items-start gap-3">
                  <div className="shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Package className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-bold text-[var(--text-primary)]">Qué productos ve el cliente</p>
                    <p className="text-sm text-muted mt-0.5">
                      Activá o pausá productos del inventario en tu tienda online sin borrarlos. Útil para retirar items de temporada o stockout temporario.
                    </p>
                  </div>
                </div>
                <CatalogoTiendaTab />
              </div>
            )}

            {/* ── TAB: AVANZADO ──────────────────────────────────────── */}
            {activeTab === "avanzado" && (
              <div className="space-y-8">
                {/* Banner explicativo */}
                <div className="bg-primary/5 dark:bg-primary/10 border-2 border-primary/15 rounded-2xl p-5 flex items-start gap-3">
                  <div className="shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Settings2 className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-bold text-[var(--text-primary)]">Configuración fina y SEO</p>
                    <p className="text-sm text-muted mt-0.5">
                      Tipografía con preview real, densidad, favicon, tracking con validación, CSS custom con snippets y vista previa de cómo aparece tu tienda en Google.
                    </p>
                  </div>
                </div>

                {/* Métricas del storefront — absorbidas de "Mi tienda pública"
                    (ADR-299 fase 2). Read-only, componente self-contained. */}
                <AnalyticsTab />

                {/* ── 1. TIPOGRAFÍA — visual font picker ─────────────── */}
                <StyleSection
                  icon={<Type className="h-5 w-5 text-primary" />}
                  title="Tipografía"
                  description="Elegí la fuente que más matchea con tu marca. La preview muestra cómo se verá realmente en tu tienda."
                >
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {FONT_OPTIONS.map((f) => {
                      const active = theme.fontFamily === f.value;
                      return (
                        <button
                          key={f.value}
                          type="button"
                          onClick={() => update("fontFamily", f.value)}
                          aria-pressed={active}
                          className={cn(
                            "p-3 rounded-2xl border-2 text-center transition-all",
                            active
                              ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                              : "border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:border-primary/40 hover:shadow-[var(--shadow-md)]"
                          )}
                        >
                          <div
                            className="h-12 mb-2 rounded-xl bg-gray-50 dark:bg-surface flex items-center justify-center text-2xl font-extrabold text-[var(--text-primary)]"
                            style={{ fontFamily: f.stack }}
                          >
                            Aa
                          </div>
                          <p className="text-sm font-bold text-[var(--text-primary)] leading-tight" style={{ fontFamily: f.stack }}>
                            {f.label}
                          </p>
                          <p className="text-[length:var(--ts-xs)] text-muted leading-snug mt-0.5">{f.vibe}</p>
                        </button>
                      );
                    })}
                  </div>
                </StyleSection>

                {/* ── 2. BORDES Y DENSIDAD ─────────────────────────── */}
                <StyleSection
                  icon={<Sliders className="h-5 w-5 text-primary" />}
                  title="Bordes y densidad"
                  description="Cuánto se redondean tus cards y botones, y cuánto aire respira la página."
                >
                  <div className="space-y-6">
                    {/* Border radius slider */}
                    <div className="space-y-3">
                      <Field
                        label={<><span>Bordes redondeados</span><span className="text-base font-bold text-primary bg-primary/10 px-3 py-1 rounded-full tabular-nums ml-auto">{theme.borderRadius}px</span></>}
                        labelClassName="text-sm font-semibold text-[var(--text-primary)] flex items-center justify-between"
                      >
                        <input
                          type="range"
                          min={0}
                          max={24}
                          value={theme.borderRadius}
                          onChange={(e) => update("borderRadius", Number(e.target.value))}
                          className="w-full accent-teal-600 h-2 rounded-full cursor-pointer"
                        />
                      </Field>
                      {/* Preview multi-elemento: input, badge, card, botón */}
                      <div className="rounded-2xl bg-gray-50 dark:bg-surface p-4 border border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
                        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-muted mb-3">Vista previa en vivo</p>
                        <div className="flex items-center gap-3 flex-wrap">
                          <div
                            className="h-10 w-32 bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] flex items-center px-3 text-xs text-muted transition-all"
                            style={{ borderRadius: `${theme.borderRadius}px` }}
                          >
                            Input
                          </div>
                          <span
                            className="px-2.5 py-1 text-xs font-bold text-white transition-all"
                            style={{ backgroundColor: theme.primaryColor, borderRadius: `${theme.borderRadius}px` }}
                          >
                            BADGE
                          </span>
                          <div
                            className="h-12 w-20 bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] shadow-[var(--shadow-sm)] transition-all"
                            style={{ borderRadius: `${theme.borderRadius}px` }}
                          />
                          <button
                            type="button"
                            className="h-10 px-5 text-sm font-bold text-white shadow-[var(--shadow-md)] transition-all pointer-events-none"
                            style={{ backgroundColor: theme.primaryColor, borderRadius: `${theme.borderRadius}px` }}
                          >
                            Comprar
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Espaciado — cards con mockup más rico */}
                    <div className="space-y-3">
                      <span className="text-sm font-semibold text-[var(--text-primary)]">Densidad de espaciado</span>
                      <div className="grid grid-cols-3 gap-3">
                        {([
                          { value: "compact",  label: "Compacto",  desc: "Más en menos espacio", pad: "py-1.5", gap: "gap-1" },
                          { value: "normal",   label: "Normal",    desc: "Balance recomendado",  pad: "py-3",   gap: "gap-1.5" },
                          { value: "spacious", label: "Espacioso", desc: "Aire y respiración",    pad: "py-5",   gap: "gap-2.5" },
                        ] as const).map((s) => {
                          const active = theme.spacing === s.value;
                          return (
                            <button
                              key={s.value}
                              type="button"
                              onClick={() => update("spacing", s.value)}
                              aria-pressed={active}
                              className={cn(
                                "p-3 rounded-2xl border-2 transition-all text-center",
                                active
                                  ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                                  : "border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:border-primary/40"
                              )}
                            >
                              <div className={cn("rounded-xl bg-gray-50 dark:bg-surface mb-2 flex flex-col justify-center px-2", s.pad, s.gap)}>
                                <div className="h-1.5 rounded-full bg-primary/30 w-1/2 mx-auto" />
                                <div className="h-0.5 rounded-full bg-gray-300 dark:bg-gray-600 w-3/4" />
                                <div className="h-0.5 rounded-full bg-gray-300 dark:bg-gray-600 w-2/3" />
                                <div className="h-2 rounded-md mt-1 mx-auto w-12" style={{ backgroundColor: theme.primaryColor }} />
                              </div>
                              <p className="text-sm font-bold text-[var(--text-primary)]">{s.label}</p>
                              <p className="text-xs text-muted mt-0.5">{s.desc}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </StyleSection>

                {/* ── 3. FAVICON con preview de pestaña ──────────────── */}
                <StyleSection
                  icon={<ImageIcon className="h-5 w-5 text-primary" />}
                  title="Favicon"
                  description="El ícono que aparece en la pestaña del navegador y al guardar como marcador."
                >
                  <div className="space-y-4">
                    {/* Browser tab preview */}
                    <div>
                      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-muted mb-2">Cómo se verá la pestaña del navegador</p>
                      <div className="rounded-t-xl bg-gray-200 dark:bg-gray-800 px-2 pt-2 border border-b-0 border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
                        <div className="inline-flex items-center gap-2 max-w-[260px] bg-[var(--surface-raised)] rounded-t-lg border-t border-x border-[var(--rule-soft)] dark:border-[var(--rule-base)] px-3 py-2">
                          {theme.favicon ? (
                            <Image src={theme.favicon} alt="favicon" width={16} height={16} className="h-4 w-4 rounded shrink-0 object-cover" />
                          ) : theme.logo ? (
                            <Image src={theme.logo} alt="logo fallback" width={16} height={16} className="h-4 w-4 rounded shrink-0 object-cover" />
                          ) : (
                            <div className="h-4 w-4 rounded shrink-0 bg-primary" />
                          )}
                          <span className="text-xs text-[var(--text-primary)] truncate">{theme.storeName || "Tu tienda"}</span>
                        </div>
                      </div>
                      <div className="rounded-b-xl bg-gray-100 dark:bg-surface px-3 py-2 border border-t-0 border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
                        <span className="text-xs font-mono text-muted">localhost:3000/t/{activeTenantSlug}</span>
                      </div>
                    </div>
                    {/* Dropzone compacto + hint en columna derecha */}
                    <div className="flex flex-col sm:flex-row items-start gap-4">
                      <div className="w-full sm:w-40 shrink-0">
                        <ImageUpload
                          value={theme.favicon}
                          onChange={(url) => update("favicon", url)}
                          onClear={() => update("favicon", "")}
                          folder="branding"
                          label=""
                          aspectRatio="square"
                          hint=""
                        />
                      </div>
                      <div className="flex-1 space-y-2 pt-1">
                        <p className="text-sm font-semibold text-[var(--text-primary)]">Subí tu favicon</p>
                        <ul className="text-xs text-muted space-y-1 list-disc pl-4">
                          <li>Formato cuadrado — 32×32, 180×180 o 512×512 px</li>
                          <li>JPG, PNG, WebP o SVG (recomendado)</li>
                          <li>Si lo dejás vacío, se usa el logo de tu tienda</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </StyleSection>

                {/* ── 4. SEO PREVIEW (Google) ────────────────────────── */}
                <StyleSection
                  icon={<Eye className="h-5 w-5 text-primary" />}
                  title="Cómo aparece en Google"
                  description="Vista previa del resultado en buscador. Se calcula desde el Nombre, Descripción y URL de tu tienda."
                >
                  <div className="rounded-2xl bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] p-5 space-y-1.5">
                    <p className="text-xs text-muted truncate">
                      {typeof window !== "undefined" ? window.location.origin : "tu-dominio.com"}
                      <span className="mx-1">›</span>t<span className="mx-1">›</span>{activeTenantSlug}
                    </p>
                    <p className="text-xl font-medium leading-snug" style={{ color: "#1a0dab" }}>
                      {theme.storeName || "Tu tienda"}
                      {theme.slogan && <span className="text-[var(--text-primary)]"> — {theme.slogan}</span>}
                    </p>
                    <p className="text-sm text-[var(--text-secondary)] leading-snug line-clamp-2">
                      {theme.description || "Configurá tu descripción en la pestaña Identidad para que Google sepa de qué trata tu tienda."}
                    </p>
                  </div>
                  <p className="text-xs text-muted mt-2">
                    Tip: una buena descripción menciona tu zona, qué vendés y diferencial (ej: &ldquo;Bodega en Pucallpa con delivery en 25 min, pago Yape&rdquo;).
                  </p>
                </StyleSection>

                {/* ── 5. TRACKING Y ANALÍTICA con badges de estado ──── */}
                <StyleSection
                  icon={<Sliders className="h-5 w-5 text-primary" />}
                  title="Tracking y analítica"
                  description="Pegá tus IDs para medir tráfico y conversiones. Se inyectan en todas las páginas del storefront."
                >
                  <div className="space-y-5">
                    {/* Google Analytics */}
                    <div className="space-y-2">
                      <Field
                        label={
                          <>
                            <span>Google Analytics (GA4)</span>
                            {theme.analyticsId?.trim().startsWith("G-") ? (
                              <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--data-success-500)]/15 text-[var(--data-success-500)]">
                                <Check className="h-3 w-3" /> Configurado
                              </span>
                            ) : theme.analyticsId?.trim() ? (
                              <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--data-warning-500)]/15 text-[var(--data-warning-500)]">
                                ⚠ Formato inválido
                              </span>
                            ) : (
                              <span className="text-xs font-medium text-muted">Sin configurar</span>
                            )}
                          </>
                        }
                        labelClassName="text-sm font-semibold text-[var(--text-primary)] flex items-center justify-between gap-2"
                      >
                        <input
                          type="text"
                          value={theme.analyticsId}
                          onChange={(e) => update("analyticsId", e.target.value)}
                          placeholder="G-XXXXXXXXXX"
                          className={cn(inputCls, "font-mono")}
                        />
                      </Field>
                      <p className="text-xs text-muted">
                        Empieza con <span className="font-mono">G-</span>. Lo obtenés en{" "}
                        <a href="https://analytics.google.com/analytics/web/#/p/admin/streams" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          Google Analytics → Admin → Data Streams ↗
                        </a>
                      </p>
                    </div>

                    {/* Meta Pixel */}
                    <div className="space-y-2">
                      <Field
                        label={
                          <>
                            <span>Meta Pixel (Facebook / Instagram)</span>
                            {theme.pixelId && /^\d{14,17}$/.test(theme.pixelId.trim()) ? (
                              <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--data-success-500)]/15 text-[var(--data-success-500)]">
                                <Check className="h-3 w-3" /> Configurado
                              </span>
                            ) : theme.pixelId?.trim() ? (
                              <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--data-warning-500)]/15 text-[var(--data-warning-500)]">
                                ⚠ Formato inválido
                              </span>
                            ) : (
                              <span className="text-xs font-medium text-muted">Sin configurar</span>
                            )}
                          </>
                        }
                        labelClassName="text-sm font-semibold text-[var(--text-primary)] flex items-center justify-between gap-2"
                      >
                        <input
                          type="text"
                          value={theme.pixelId}
                          onChange={(e) => update("pixelId", e.target.value)}
                          placeholder="1234567890123456"
                          className={cn(inputCls, "font-mono")}
                        />
                      </Field>
                      <p className="text-xs text-muted">
                        14-17 dígitos. Lo encontrás en{" "}
                        <a href="https://business.facebook.com/events_manager2/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          Facebook Events Manager ↗
                        </a>
                      </p>
                    </div>
                  </div>
                </StyleSection>

                {/* ── 6. CSS PERSONALIZADO con snippets ──────────────── */}
                <StyleSection
                  icon={<Paintbrush className="h-5 w-5 text-primary" />}
                  title="CSS personalizado"
                  description="Reglas CSS inyectadas en tu storefront. Solo si sabés CSS — un error puede romper tu tienda."
                >
                  <div className="space-y-4">
                    {/* Snippets clickables */}
                    <div>
                      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-muted mb-2">Snippets para empezar</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {CSS_SNIPPETS.map((s) => (
                          <button
                            key={s.label}
                            type="button"
                            onClick={() => update("customCSS", ((theme.customCSS || "").trimEnd() + "\n\n" + s.css).trimStart())}
                            className="text-left p-3 rounded-xl border-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:border-primary/40 hover:bg-primary/5 transition-all"
                          >
                            <p className="text-sm font-bold text-[var(--text-primary)]">{s.label}</p>
                            <p className="text-xs text-muted leading-snug mt-0.5">{s.description}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Editor */}
                    <div className="space-y-2">
                      <Field
                        label={<><span>Editor CSS</span><span className="text-xs font-mono text-muted">{(theme.customCSS || "").length} chars</span></>}
                        labelClassName="text-sm font-semibold text-[var(--text-primary)] flex items-center justify-between gap-2"
                      >
                        <textarea
                          value={theme.customCSS}
                          onChange={(e) => update("customCSS", e.target.value)}
                          placeholder=".product-card { border: 2px solid gold; }
.store-header { backdrop-filter: blur(20px); }"
                          rows={8}
                          spellCheck={false}
                          className={cn(inputCls, "font-mono text-sm resize-y min-h-[180px] py-3")}
                        />
                      </Field>
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <p className="text-xs text-muted">
                          Selectores útiles:
                          <span className="font-mono mx-1 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-surface">.product-card</span>
                          <span className="font-mono mx-1 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-surface">.store-card</span>
                          <span className="font-mono mx-1 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-surface">.store-header</span>
                        </p>
                        {theme.customCSS && (
                          <button
                            type="button"
                            onClick={() => update("customCSS", "")}
                            className="text-xs font-semibold text-[var(--data-error-500)] hover:underline"
                          >
                            Limpiar editor
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </StyleSection>

                {/* ── ZONA DE PELIGRO ─────────────────────────────── */}
                <div className="rounded-2xl border-2 border-dashed border-[var(--data-error-500)]/40 bg-[var(--data-error-50)]/40 dark:bg-[var(--data-error-500)]/5 p-5 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 w-10 h-10 rounded-xl bg-[var(--data-error-500)]/10 flex items-center justify-center">
                      <Settings2 className="h-5 w-5 text-[var(--data-error-500)]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-base font-bold text-[var(--text-primary)]">Zona de peligro</p>
                      <p className="text-sm text-muted mt-0.5">Restaurar borra todos los cambios no guardados de esta sesión y vuelve al theme inicial.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="w-full flex items-center justify-center gap-2 h-12 rounded-xl border-2 border-[var(--data-error-500)] text-base font-bold text-[var(--data-error-500)] hover:bg-[var(--data-error-500)]/10 transition-colors"
                  >
                    Restaurar valores por defecto
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Botón guardar — fijo abajo del panel */}
          <div className="shrink-0 px-6 py-4 border-t-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] space-y-2 bg-[var(--surface-raised)]">
            {error && (
              <p className="text-sm text-[var(--data-error-500)] font-semibold text-center">{error}</p>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className={cn(
                "w-full flex items-center justify-center gap-2.5 h-14 rounded-2xl text-base font-bold transition-all relative shadow-[var(--shadow-md)]",
                saved
                  ? "bg-[var(--data-success-500)] text-white"
                  : "bg-primary hover:bg-primary-dark text-white hover:shadow-[var(--shadow-lg)] active:scale-[0.98]",
                saving && "opacity-60 cursor-not-allowed"
              )}
            >
              {saving ? (
                <><Loader2 className="h-5 w-5 animate-spin" /> Guardando...</>
              ) : saved ? (
                <><Check className="h-5 w-5" /> Cambios guardados</>
              ) : (
                <><Save className="h-5 w-5" /> Guardar cambios</>
              )}
              {hasUnsavedChanges && !saving && !saved && (
                <span className="absolute -top-2 -right-2 h-6 px-2 rounded-full bg-[var(--data-warning-500)] text-xs font-bold text-[var(--text-primary)] flex items-center shadow">
                  Sin guardar
                </span>
              )}
            </button>
          </div>
        </div>

      {/* ── Modal fullscreen de preview ──────────────────────────── */}
      {showPreview && (
        <div className="fixed inset-0 z-50 bg-black/80 flex flex-col">
          {/* Header del modal */}
          <div className="flex items-center justify-between px-4 py-3 bg-gray-900 shrink-0">
            <div className="flex items-center gap-3">
              <p className="text-sm font-bold text-white">Vista previa en vivo</p>
              {/* Toggle responsive */}
              <div className="flex gap-0.5 bg-gray-800 rounded-lg p-0.5">
                {([
                  { label: "Móvil", w: 375 },
                  { label: "Tablet", w: 768 },
                  { label: "Desktop", w: 0 },
                ]).map((v) => (
                  <button key={v.label} type="button" onClick={() => setPreviewWidth(v.w)}
                    className={cn("px-3 py-1.5 rounded-md text-xs font-bold transition-all",
                      previewWidth === v.w ? "bg-white dark:bg-[var(--color-card)] text-[var(--text-primary)] shadow" : "text-[var(--text-tertiary)] hover:text-white")}>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setPreviewKey((k) => k + 1)} className="text-xs text-[var(--data-success-500)] font-semibold hover:text-[var(--data-success-500)]">
                Recargar
              </button>
              <a href={`/t/${activeTenantSlug}?preview=true`} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--text-tertiary)] hover:text-white">
                Abrir en nueva pestaña
              </a>
              <button type="button" onClick={() => setShowPreview(false)}
                className="h-8 w-8 rounded-lg bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-white transition-colors">
                <EyeOff className="h-4 w-4" />
              </button>
            </div>
          </div>
          {/* Iframe */}
          <div className="flex-1 flex justify-center items-start p-4 overflow-auto bg-[var(--surface-sunken)]">
            <div
              className="bg-white dark:bg-[var(--color-card)] rounded-xl overflow-hidden transition-all duration-[var(--dur-base)]"
              style={{ width: previewWidth > 0 ? `${previewWidth}px` : "100%", maxWidth: "100%", height: "calc(100vh - 80px)" }}
            >
              <iframe key={previewKey} src={`/t/${activeTenantSlug}?preview=true`} title="Vista previa" className="w-full h-full border-0" />
            </div>
          </div>
        </div>
      )}

      {/* ── Modo Creativo fullscreen ──────────────────────────────── */}
      {showCreativeMode && (
        <StoreCreativeMode
          tenantSlug={activeTenantSlug}
          initialTheme={theme}
          onClose={() => setShowCreativeMode(false)}
          onApplyTheme={handleApplyFromCreative}
        />
      )}
    </div>
  );
}
