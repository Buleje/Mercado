"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import {
  Palette, Store, Layout, Phone, Settings2, Image as ImageIcon,
  Save, Loader2, Check, Eye, EyeOff,
  Megaphone, Grid3x3, ShoppingBag, Tag, Package, BookOpen,
  MessageSquare, HelpCircle, Map, ToggleLeft, ToggleRight, Sun, Moon, Type, Sliders,
  Paintbrush, FileText } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { LoadingState, PageTitle, PrimaryButton, SectionTitle } from "@buleje/design-system";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import { resolveActiveTenantSlug } from "@/lib/tenant-fetch";
import dynamic from "next/dynamic";
import StorefrontEditor from "./StorefrontEditor";

const StoreCreativeMode = dynamic(() => import("./StoreCreativeMode"), { ssr: false });
const CatalogoTiendaTab = dynamic(() => import("./store-page/CatalogoTiendaTab"), { ssr: false });
import type { SectionKey } from "./StorefrontEditor";
import ImageUpload from "./ImageUpload";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type Tab = "identidad" | "colores" | "secciones" | "hero" | "contacto" | "estilos" | "contenido" | "catalogo" | "avanzado";

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
  heroBadge: string;
  heroImage: string;
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
  // Estilos avanzados
  cardStyle: "minimal" | "shadow" | "border" | "glass";
  cartStyle: "sidebar" | "modal" | "drawer";
  buttonStyle: "rounded" | "square" | "pill";
  navbarStyle: "solid" | "transparent" | "blur" | "minimal";
  shadowLevel: "none" | "soft" | "deep";
  animations: "none" | "subtle" | "dynamic";
  backgroundPattern: "none" | "dots" | "waves" | "gradient";
  // Contenido
  footerText: string;
  welcomePopupEnabled: boolean;
  welcomePopupTitle: string;
  welcomePopupMessage: string;
  welcomePopupCoupon: string;
  customCSS: string;
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
  heroBadge: "Delivery gratis +S/50",
  heroImage: "",
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
  cardStyle: "shadow",
  cartStyle: "sidebar",
  buttonStyle: "rounded",
  navbarStyle: "solid",
  shadowLevel: "soft",
  animations: "subtle",
  backgroundPattern: "none",
  footerText: "",
  welcomePopupEnabled: false,
  welcomePopupTitle: "Bienvenido a nuestra tienda!",
  welcomePopupMessage: "Usa este cupon en tu primera compra",
  welcomePopupCoupon: "BIENVENIDO10",
  customCSS: "",
};

// ── Paleta de colores predefinidos ────────────────────────────────────────────

const COLOR_PRESETS = [
  { label: "Teal",    value: "var(--color-primary)" },
  { label: "Verde",   value: "#16a34a" },
  { label: "Azul",    value: "#2563eb" },
  { label: "Emerald", value: "#059669" },
  { label: "Rosa",    value: "#e11d48" },
  { label: "Amber",   value: "#d97706" },
  { label: "Gris",    value: "#475569" },
  { label: "Naranja", value: "#ea580c" },
];

const FONT_OPTIONS = [
  { value: "sistema", label: "Sistema (por defecto)" },
  { value: "geist",   label: "Geist" },
  { value: "inter",   label: "Inter" },
  { value: "poppins", label: "Poppins" },
  { value: "montserrat", label: "Montserrat" },
  { value: "raleway", label: "Raleway" },
  { value: "nunito",  label: "Nunito" },
  { value: "lato",    label: "Lato" },
  { value: "roboto",  label: "Roboto" },
  { value: "opensans", label: "Open Sans" },
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
    colors: { primaryColor: "var(--color-primary)", secondaryColor: "#f97316", accentColor: "var(--color-primary)" },
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
    colors: { primaryColor: "#1e293b", secondaryColor: "#d97706", accentColor: "#334155" },
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
    <div className="space-y-2">
      <label className="text-xs font-semibold text-muted">{label}</label>
      <div className="flex flex-wrap gap-2">
        {COLOR_PRESETS.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => onChange(c.value)}
            title={c.label}
            className={cn(
              "h-8 w-8 rounded-full border-2 transition-all shrink-0",
              value === c.value
                ? "border-foreground scale-110"
                : "border-transparent hover:scale-105"
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
            className="h-8 w-8 rounded-full cursor-pointer border-2 border-[var(--rule-base)] overflow-hidden p-0"
            title="Color personalizado"
          />
        </div>
      </div>
      <p className="text-xs text-muted font-mono">{value}</p>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-muted">{label}</label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all min-h-[44px]";

// ── Tabs del panel ─────────────────────────────────────────────────────────────

const TAB_GROUPS: { group: string; icon: React.ReactNode; tabs: { id: Tab; label: string; icon: React.ReactNode }[] }[] = [
  {
    group: "Apariencia",
    icon: <Palette className="h-3.5 w-3.5" />,
    tabs: [
      { id: "identidad", label: "Identidad", icon: <Store className="h-4 w-4" /> },
      { id: "colores", label: "Colores", icon: <Palette className="h-4 w-4" /> },
      { id: "estilos", label: "Estilos", icon: <Paintbrush className="h-4 w-4" /> },
    ],
  },
  {
    group: "Contenido",
    icon: <FileText className="h-3.5 w-3.5" />,
    tabs: [
      { id: "hero", label: "Hero", icon: <ImageIcon className="h-4 w-4" /> },
      { id: "secciones", label: "Secciones", icon: <Layout className="h-4 w-4" /> },
      { id: "catalogo", label: "Catálogo", icon: <Package className="h-4 w-4" /> },
      { id: "contenido", label: "Textos y Popup", icon: <FileText className="h-4 w-4" /> },
    ],
  },
  {
    group: "Negocio",
    icon: <Phone className="h-3.5 w-3.5" />,
    tabs: [
      { id: "contacto", label: "Contacto", icon: <Phone className="h-4 w-4" /> },
    ],
  },
  {
    group: "Avanzado",
    icon: <Settings2 className="h-3.5 w-3.5" />,
    tabs: [
      { id: "avanzado", label: "Avanzado", icon: <Settings2 className="h-4 w-4" /> },
    ],
  },
];

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = TAB_GROUPS.flatMap((g) => g.tabs);

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
        "w-full h-full rounded-xl overflow-hidden border border-[var(--rule-base)] dark:border-card-border flex flex-col text-sm shadow-inner",
        theme.darkModeDefault ? "bg-gray-900 text-white" : "bg-white text-[var(--text-primary)]"
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
  const [activeTenantSlug, setActiveTenantSlug] = useState("main");

  // Detecta si hay cambios pendientes comparando con la última versión guardada
  const hasUnsavedChanges = JSON.stringify(theme) !== JSON.stringify(savedTheme);

  const _logoInputRef = useRef<HTMLInputElement>(null);
  const _heroImageInputRef = useRef<HTMLInputElement>(null);
  const _faviconInputRef = useRef<HTMLInputElement>(null);

  // ── Cargar settings existentes ─────────────────────────────────────────────

  useEffect(() => {
    void load();
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
        headers: { "Content-Type": "application/json", "x-tenant-id": tenantSlug },
        body: JSON.stringify({ storeTheme: themeToSave }),
      });
      if (!res.ok) throw new Error("Error al guardar");
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
  }, [activeTenantSlug]);

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
          <Check className="h-4 w-4 shrink-0 text-[var(--data-success)]" />
          {toastMsg}
        </div>
      )}

      {/* ── Header editorial estandarizado ─────────────────────────── */}
      <AdminModuleHeader
        icon={Palette}
        eyebrow="Mi tienda · Personalización visual"
        title="Mi tienda personal"
        description={
          hasUnsavedChanges
            ? "Tienes cambios sin guardar. Cambia el aspecto, colores y contenido de tu tienda online."
            : "Cambia el aspecto, colores y contenido de tu tienda online. Lo que ve el cliente cuando entra."
        }
      >
        <div className="flex items-center gap-2">
          <a
            href={`/t/${activeTenantSlug}?preview=true`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-[var(--text-primary)] dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors"
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

      {/* ── Layout: sidebar tabs + contenido ──────────────────────── */}
      <div className="flex flex-col lg:flex-row flex-1 gap-5 min-h-0">

        {/* ── Sidebar de tabs (desktop: vertical, mobile: horizontal scroll) ── */}
        <div className="lg:w-52 shrink-0">
          {/* Mobile: horizontal tabs — patrón estándar admin (bg-primary cuando activo) */}
          <div className="flex lg:hidden gap-1 overflow-x-auto pb-1 scrollbar-hide">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors shrink-0",
                  activeTab === t.id
                    ? "bg-primary text-white"
                    : "bg-[var(--surface-sunken)] dark:bg-surface text-[var(--text-secondary)] dark:text-muted hover:bg-gray-100 dark:hover:bg-accent hover:text-[var(--text-primary)]",
                )}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          {/* Desktop: grouped vertical sidebar */}
          <nav className="hidden lg:flex flex-col gap-1 bg-gray-50/50 dark:bg-surface/50 rounded-xl p-2.5 border border-[var(--rule-soft)] dark:border-card-border">
            {TAB_GROUPS.map((group, gi) => (
              <div key={group.group}>
                {gi > 0 && <div className="border-t border-[var(--rule-soft)] dark:border-card-border my-1.5" />}
                <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] px-2.5 pt-1.5 pb-1 flex items-center gap-1.5">
                  {group.icon}
                  {group.group}
                </p>
                {group.tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTab(t.id)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-semibold transition-colors text-left",
                      activeTab === t.id
                        ? "bg-primary text-white"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-gray-100 dark:hover:bg-accent",
                    )}
                  >
                    {t.icon}
                    {t.label}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </div>

        {/* ── Panel de contenido ────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-card rounded-xl border border-[var(--rule-soft)] dark:border-card-border  overflow-hidden">

          {/* Tab header with active tab info — usa SectionTitle del DS */}
          <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-[var(--rule-soft)] dark:border-card-border bg-[var(--surface-sunken)]/40 shrink-0">
            <span className="text-primary">{activeTabMeta?.icon}</span>
            <SectionTitle className="text-sm">{activeTabMeta?.label}</SectionTitle>
          </div>

          {/* Contenido del tab activo */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">

            {/* ── TAB: IDENTIDAD ─────────────────────────────────────── */}
            {activeTab === "identidad" && (
              <div className="space-y-6">
                {/* Logo + Nombre en fila */}
                <div className="flex items-start gap-4">
                  <div className="shrink-0 w-20">
                    <p className="text-xs font-semibold text-muted mb-1.5">Logo</p>
                    <div className="w-20 h-20 rounded-lg border-2 border-dashed border-[var(--rule-base)] dark:border-card-border bg-gray-50 dark:bg-surface flex items-center justify-center overflow-hidden cursor-pointer hover:border-primary transition-colors relative group">
                      {theme.logo ? (
                        <>
                          <Image src={theme.logo} alt="Logo" fill className="object-cover" sizes="80px" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button type="button" onClick={() => update("logo", "")} className="text-xs font-bold text-white bg-[var(--data-error)]/80 px-2 py-0.5 rounded">Quitar</button>
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
                  </div>
                  <div className="flex-1 space-y-3">
                    <FieldRow label="Nombre de la tienda">
                      <input type="text" value={theme.storeName} onChange={(e) => update("storeName", e.target.value)}
                        placeholder="Mi Bodega" className={inputCls} maxLength={60} />
                    </FieldRow>
                    <FieldRow label={`Eslogan (${theme.slogan.length}/100)`}>
                      <input type="text" value={theme.slogan} onChange={(e) => update("slogan", e.target.value.slice(0, 100))}
                        placeholder="Tu bodega de confianza..." className={inputCls} maxLength={100} />
                    </FieldRow>
                  </div>
                </div>

                {/* Descripción */}
                <FieldRow label={`Descripción (${theme.description.length}/200)`}>
                  <textarea
                    value={theme.description}
                    onChange={(e) => update("description", e.target.value.slice(0, 200))}
                    placeholder="Describe tu tienda en pocas palabras..."
                    className={cn(inputCls, "resize-none min-h-[80px]")}
                    maxLength={200}
                  />
                </FieldRow>
              </div>
            )}

            {/* ── TAB: COLORES ───────────────────────────────────────── */}
            {activeTab === "colores" && (
              <div className="space-y-6">
                {/* Plantillas rápidas */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted">Plantillas</p>
                  <div className="grid grid-cols-2 gap-2">
                    {THEME_TEMPLATES.map((t) => (
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
                        className={cn(
                          "flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all hover:shadow-sm",
                          theme.primaryColor === t.colors.primaryColor &&
                          theme.secondaryColor === t.colors.secondaryColor
                            ? "border-primary bg-primary/5 dark:bg-primary/10"
                            : "border-[var(--rule-base)] dark:border-card-border hover:border-gray-300"
                        )}
                      >
                        {/* Color dots */}
                        <div className="flex -space-x-1 shrink-0">
                          <div className="w-5 h-5 rounded-full border-2 border-white dark:border-card shadow" style={{ backgroundColor: t.colors.primaryColor }} />
                          <div className="w-5 h-5 rounded-full border-2 border-white dark:border-card shadow" style={{ backgroundColor: t.colors.secondaryColor }} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-foreground truncate">{t.name}</p>
                          <p className="text-xs text-muted truncate">{t.description}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-[var(--rule-soft)] dark:border-card-border" />

                <ColorPicker
                  label="Color primario"
                  value={theme.primaryColor}
                  onChange={(v) => update("primaryColor", v)}
                />
                <ColorPicker
                  label="Color secundario"
                  value={theme.secondaryColor}
                  onChange={(v) => update("secondaryColor", v)}
                />
                <ColorPicker
                  label="Color de acento"
                  value={theme.accentColor}
                  onChange={(v) => update("accentColor", v)}
                />

                {/* Preview de botón CTA */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted">Preview botón CTA</p>
                  <div className="flex gap-3 items-center flex-wrap">
                    <button
                      type="button"
                      className="px-5 py-2.5 rounded-lg text-sm font-bold text-white shadow transition-all hover:opacity-90"
                      style={{ backgroundColor: theme.primaryColor, borderRadius: `${theme.borderRadius}px` }}
                    >
                      {theme.heroCTA || "Ver productos"}
                    </button>
                    <button
                      type="button"
                      className="px-5 py-2.5 rounded-lg text-sm font-bold text-white shadow transition-all hover:opacity-90"
                      style={{ backgroundColor: theme.secondaryColor, borderRadius: `${theme.borderRadius}px` }}
                    >
                      Secundario
                    </button>
                  </div>
                </div>

                {/* Modo oscuro por defecto */}
                <div className="flex items-center justify-between p-3.5 rounded-xl border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface">
                  <div className="flex items-center gap-2.5">
                    {theme.darkModeDefault ? (
                      <Moon className="h-4 w-4 text-[var(--data-success)]" />
                    ) : (
                      <Sun className="h-4 w-4 text-[var(--data-warning)]" />
                    )}
                    <div>
                      <p className="text-sm font-semibold text-foreground">Modo oscuro por defecto</p>
                      <p className="text-xs text-muted">La tienda abre en modo {theme.darkModeDefault ? "oscuro" : "claro"}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => update("darkModeDefault", !theme.darkModeDefault)}
                    className="shrink-0 transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"
                    aria-label="Toggle modo oscuro"
                  >
                    {theme.darkModeDefault ? (
                      <ToggleRight className="h-7 w-7 text-[var(--data-success)]" />
                    ) : (
                      <ToggleLeft className="h-7 w-7 text-[var(--text-tertiary)]" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* ── TAB: SECCIONES — delegado a StorefrontEditor ──────── */}
            {activeTab === "secciones" && (
              <div className="space-y-6">
                <div className="bg-primary/5 dark:bg-primary/10 border border-primary/15 rounded-xl p-4 space-y-3">
                  <p className="text-sm font-semibold text-foreground">
                    Editor de secciones
                  </p>
                  <p className="text-xs text-muted">
                    Las secciones de la tienda se gestionan desde el editor dedicado con drag &amp; drop.
                    Puedes reordenar, activar y desactivar secciones desde ahí.
                  </p>
                  <StorefrontEditor />
                </div>
              </div>
            )}

            {/* ── TAB: HERO ──────────────────────────────────────────── */}
            {activeTab === "hero" && (
              <div className="space-y-5">
                <FieldRow label="Título principal">
                  <input
                    type="text"
                    value={theme.heroTitle}
                    onChange={(e) => update("heroTitle", e.target.value)}
                    placeholder="Todo lo que necesitas, en tu puerta"
                    className={inputCls}
                  />
                </FieldRow>
                <FieldRow label="Subtítulo">
                  <input
                    type="text"
                    value={theme.heroSubtitle}
                    onChange={(e) => update("heroSubtitle", e.target.value)}
                    placeholder="Delivery rápido en Pucallpa..."
                    className={inputCls}
                  />
                </FieldRow>
                <FieldRow label="Texto del botón CTA">
                  <input
                    type="text"
                    value={theme.heroCTA}
                    onChange={(e) => update("heroCTA", e.target.value)}
                    placeholder="Ver productos"
                    className={inputCls}
                  />
                </FieldRow>
                <FieldRow label="Enlace del botón">
                  <select
                    value={theme.heroLink}
                    onChange={(e) => update("heroLink", e.target.value)}
                    className={inputCls}
                  >
                    <option value="tienda">Tienda (catálogo de productos)</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="categorias">Categorías</option>
                    <option value="custom">URL personalizada</option>
                  </select>
                </FieldRow>

                {/* Imagen de fondo */}
                <FieldRow label="Imagen de fondo del hero">
                  <ImageUpload
                    value={theme.heroImage}
                    onChange={(url) => update("heroImage", url)}
                    onClear={() => update("heroImage", "")}
                    folder="hero"
                    label=""
                    aspectRatio="banner"
                    hint="Imagen de fondo del banner principal. Se recomienda 1200x400px."
                  />
                </FieldRow>
              </div>
            )}

            {/* ── TAB: CONTACTO ──────────────────────────────────────── */}
            {activeTab === "contacto" && (
              <div className="space-y-5">
                <FieldRow label="WhatsApp">
                  <input
                    type="tel"
                    value={theme.whatsapp}
                    onChange={(e) => update("whatsapp", e.target.value)}
                    placeholder="+51 900 000 000"
                    className={inputCls}
                  />
                </FieldRow>
                <FieldRow label="Email">
                  <input
                    type="email"
                    value={theme.email}
                    onChange={(e) => update("email", e.target.value)}
                    placeholder="contacto@tibodega.pe"
                    className={inputCls}
                  />
                </FieldRow>
                <FieldRow label="Teléfono">
                  <input
                    type="tel"
                    value={theme.phone}
                    onChange={(e) => update("phone", e.target.value)}
                    placeholder="+51 061 000 000"
                    className={inputCls}
                  />
                </FieldRow>
                <FieldRow label="Dirección">
                  <textarea
                    value={theme.address}
                    onChange={(e) => update("address", e.target.value)}
                    placeholder="Jr. Ucayali 123, Pucallpa, Perú"
                    className={cn(inputCls, "resize-none min-h-[72px]")}
                  />
                </FieldRow>

                {/* Horarios */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted">Horarios de atención</p>
                  <div className="space-y-2">
                    {DAYS.map(({ key, label }) => (
                      <div key={key} className="flex items-center gap-2">
                        <span className="text-xs font-bold text-muted w-8 shrink-0">{label}</span>
                        <input
                          type="time"
                          value={theme.schedules[key]?.open ?? "07:00"}
                          onChange={(e) =>
                            update("schedules", {
                              ...theme.schedules,
                              [key]: { ...theme.schedules[key], open: e.target.value },
                            })
                          }
                          className="flex-1 px-2 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--data-success)]/40 min-h-[44px]"
                        />
                        <span className="text-xs text-muted">a</span>
                        <input
                          type="time"
                          value={theme.schedules[key]?.close ?? "22:00"}
                          onChange={(e) =>
                            update("schedules", {
                              ...theme.schedules,
                              [key]: { ...theme.schedules[key], close: e.target.value },
                            })
                          }
                          className="flex-1 px-2 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--data-success)]/40 min-h-[44px]"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB: ESTILOS ───────────────────────────────────────── */}
            {activeTab === "estilos" && (
              <div className="space-y-5">
                {/* Estilo de cards */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted">Estilo de productos</p>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { value: "minimal", label: "Minimal", desc: "Sin bordes ni sombra" },
                      { value: "shadow", label: "Con sombra", desc: "Sombra suave elegante" },
                      { value: "border", label: "Con borde", desc: "Borde de color" },
                      { value: "glass", label: "Glassmorphism", desc: "Efecto cristal blur" },
                    ] as const).map((s) => (
                      <button key={s.value} type="button" onClick={() => update("cardStyle", s.value)}
                        className={cn("p-3 rounded-xl border text-left transition-all", theme.cardStyle === s.value ? "border-primary bg-primary/5" : "border-[var(--rule-base)] dark:border-card-border hover:border-primary/40")}>
                        <p className="text-xs font-bold text-foreground">{s.label}</p>
                        <p className="text-xs text-muted">{s.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Estilo de botones */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted">Estilo de botones</p>
                  <div className="flex gap-2">
                    {([{ value: "rounded", label: "Redondeado" }, { value: "square", label: "Cuadrado" }, { value: "pill", label: "Pill" }] as const).map((s) => (
                      <button key={s.value} type="button" onClick={() => update("buttonStyle", s.value)}
                        className={cn("flex-1 py-2.5 rounded-lg text-xs font-bold border transition-all min-h-[44px]", theme.buttonStyle === s.value ? "bg-primary text-white border-primary" : "border-[var(--rule-base)] dark:border-card-border text-muted hover:border-primary")}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Estilo de navbar */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted">Estilo del navbar</p>
                  <div className="grid grid-cols-2 gap-2">
                    {([{ value: "solid", label: "Sólido" }, { value: "transparent", label: "Transparente" }, { value: "blur", label: "Con blur" }, { value: "minimal", label: "Minimalista" }] as const).map((s) => (
                      <button key={s.value} type="button" onClick={() => update("navbarStyle", s.value)}
                        className={cn("py-2 rounded-lg text-xs font-bold border transition-all", theme.navbarStyle === s.value ? "bg-primary text-white border-primary" : "border-[var(--rule-base)] dark:border-card-border text-muted hover:border-primary")}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sombras */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted">Sombras</p>
                  <div className="flex gap-2">
                    {([{ value: "none", label: "Sin sombra" }, { value: "soft", label: "Suave" }, { value: "deep", label: "Profunda" }] as const).map((s) => (
                      <button key={s.value} type="button" onClick={() => update("shadowLevel", s.value)}
                        className={cn("flex-1 py-2.5 rounded-lg text-xs font-bold border transition-all min-h-[44px]", theme.shadowLevel === s.value ? "bg-primary text-white border-primary" : "border-[var(--rule-base)] dark:border-card-border text-muted hover:border-primary")}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Animaciones */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted">Animaciones</p>
                  <div className="flex gap-2">
                    {([{ value: "none", label: "Ninguna" }, { value: "subtle", label: "Suaves" }, { value: "dynamic", label: "Dinámicas" }] as const).map((s) => (
                      <button key={s.value} type="button" onClick={() => update("animations", s.value)}
                        className={cn("flex-1 py-2.5 rounded-lg text-xs font-bold border transition-all min-h-[44px]", theme.animations === s.value ? "bg-primary text-white border-primary" : "border-[var(--rule-base)] dark:border-card-border text-muted hover:border-primary")}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Fondo */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted">Fondo de la tienda</p>
                  <div className="grid grid-cols-2 gap-2">
                    {([{ value: "none", label: "Liso" }, { value: "dots", label: "Puntos" }, { value: "waves", label: "Ondas" }, { value: "gradient", label: "Gradiente" }] as const).map((s) => (
                      <button key={s.value} type="button" onClick={() => update("backgroundPattern", s.value)}
                        className={cn("py-2 rounded-lg text-xs font-bold border transition-all", theme.backgroundPattern === s.value ? "bg-primary text-white border-primary" : "border-[var(--rule-base)] dark:border-card-border text-muted hover:border-primary")}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB: CONTENIDO ────────────────────────────────────── */}
            {activeTab === "contenido" && (
              <div className="space-y-5">
                {/* Mensaje WhatsApp */}
                <FieldRow label="Mensaje de WhatsApp">
                  <input type="text" value={theme.whatsappMessage} onChange={(e) => update("whatsappMessage", e.target.value)}
                    placeholder="Hola! Quiero hacer un pedido" className={inputCls} maxLength={200} />
                  <p className="text-xs text-muted mt-1">Texto predeterminado cuando el cliente toca WhatsApp</p>
                </FieldRow>

                {/* Hero badge */}
                <FieldRow label="Badge del Hero">
                  <input type="text" value={theme.heroBadge} onChange={(e) => update("heroBadge", e.target.value)}
                    placeholder="Delivery gratis +S/50" className={inputCls} maxLength={50} />
                </FieldRow>

                {/* Footer text */}
                <FieldRow label="Texto del footer">
                  <textarea value={theme.footerText} onChange={(e) => update("footerText", e.target.value)}
                    placeholder="Tu bodega de confianza desde 2020..." className={cn(inputCls, "resize-none min-h-[72px]")} maxLength={300} />
                </FieldRow>

                {/* Popup de bienvenida */}
                <div className="bg-gray-50 dark:bg-surface rounded-xl p-4 space-y-3 border border-[var(--rule-soft)] dark:border-card-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-foreground">Popup de bienvenida</p>
                      <p className="text-xs text-muted">Se muestra una vez al visitante nuevo</p>
                    </div>
                    <button type="button" onClick={() => update("welcomePopupEnabled", !theme.welcomePopupEnabled)}
                      className="shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center">
                      {theme.welcomePopupEnabled ? <ToggleRight className="h-6 w-6 text-[var(--data-success)]" /> : <ToggleLeft className="h-6 w-6 text-[var(--text-tertiary)]" />}
                    </button>
                  </div>
                  {theme.welcomePopupEnabled && (
                    <div className="space-y-2">
                      <input type="text" value={theme.welcomePopupTitle} onChange={(e) => update("welcomePopupTitle", e.target.value)} placeholder="Bienvenido!" className={inputCls} />
                      <input type="text" value={theme.welcomePopupMessage} onChange={(e) => update("welcomePopupMessage", e.target.value)} placeholder="Usa este cupon en tu primera compra" className={inputCls} />
                      <input type="text" value={theme.welcomePopupCoupon} onChange={(e) => update("welcomePopupCoupon", e.target.value)} placeholder="BIENVENIDO10" className={cn(inputCls, "font-mono uppercase")} />
                    </div>
                  )}
                </div>

                {/* QR de la tienda */}
                <div className="bg-gray-50 dark:bg-surface rounded-xl p-4 space-y-3 border border-[var(--rule-soft)] dark:border-card-border">
                  <p className="text-xs font-bold text-foreground">QR de tu tienda</p>
                  <p className="text-xs text-muted">Codigo QR para pegar en tu local fisico. Los clientes escanean y entran a tu tienda.</p>
                  <div className="flex items-center gap-4">
                    <div className="bg-white p-2 rounded-xl border border-[var(--rule-base)] dark:border-card-border">
                      {/* QR usando API publica */}
                      <Image
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(typeof window !== "undefined" ? `${window.location.origin}/t/${activeTenantSlug}` : "https://tu-tienda.buleje.pe")}`}
                        alt="QR de la tienda"
                        width={112}
                        height={112}
                      />
                    </div>
                    <div className="space-y-2">
                      <a
                        href={`https://api.qrserver.com/v1/create-qr-code/?size=400x400&format=png&data=${encodeURIComponent(typeof window !== "undefined" ? `${window.location.origin}/t/${activeTenantSlug}` : "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-[length:var(--ts-xs)] font-bold hover:opacity-90"
                      >
                        Descargar QR grande
                      </a>
                      <p className="text-xs text-muted">Imprimelo y pegalo en tu puerta o mostrador</p>
                    </div>
                  </div>
                </div>

                {/* CSS personalizado */}
                <div className="space-y-2">
                  <p className="text-xs font-bold text-foreground">CSS personalizado</p>
                  <p className="text-xs text-muted">CSS inyectado directamente en tu tienda. Para usuarios avanzados.</p>
                  <textarea value={theme.customCSS} onChange={(e) => update("customCSS", e.target.value)}
                    placeholder=".product-card { border: 2px solid gold; }" rows={4}
                    className={cn(inputCls, "font-mono text-[length:var(--ts-xs)] resize-y min-h-[80px]")} />
                </div>
              </div>
            )}

            {/* ── TAB: CATÁLOGO (visibilidad de productos) ─────────── */}
            {activeTab === "catalogo" && (
              <CatalogoTiendaTab />
            )}

            {/* ── TAB: AVANZADO ──────────────────────────────────────── */}
            {activeTab === "avanzado" && (
              <div className="space-y-6">
                {/* Tipografía */}
                <FieldRow label="Tipografía">
                  <div className="relative">
                    <Type className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
                    <select
                      value={theme.fontFamily}
                      onChange={(e) => update("fontFamily", e.target.value)}
                      className={cn(inputCls, "pl-9")}
                    >
                      {FONT_OPTIONS.map((f) => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>
                  </div>
                </FieldRow>

                {/* Bordes redondeados */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted">Bordes redondeados</p>
                    <span className="text-xs font-bold text-foreground">{theme.borderRadius}px</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={24}
                    value={theme.borderRadius}
                    onChange={(e) => update("borderRadius", Number(e.target.value))}
                    className="w-full accent-teal-600 h-2 rounded-full cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-muted">
                    <span>Cuadrado</span>
                    <span>Muy redondo</span>
                  </div>
                </div>

                {/* Espaciado */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted">Espaciado</p>
                  <div className="flex gap-2">
                    {(["compact", "normal", "spacious"] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => update("spacing", s)}
                        className={cn(
                          "flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all min-h-[44px]",
                          theme.spacing === s
                            ? "bg-[var(--accent-soft)] text-white border-[var(--data-success)]/30"
                            : "border-[var(--rule-base)] dark:border-card-border text-muted hover:border-[var(--data-success)]/30 hover:text-foreground"
                        )}
                      >
                        {s === "compact" ? "Compacto" : s === "normal" ? "Normal" : "Espacioso"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Favicon */}
                <FieldRow label="Favicon">
                  <ImageUpload
                    value={theme.favicon}
                    onChange={(url) => update("favicon", url)}
                    onClear={() => update("favicon", "")}
                    folder="branding"
                    label=""
                    aspectRatio="square"
                    hint="Icono de la pestana del navegador. Se recomienda 32x32px o 180x180px."
                  />
                </FieldRow>

                {/* Reset a valores por defecto */}
                <div className="pt-2 border-t border-[var(--rule-soft)] dark:border-card-border">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-[var(--data-error)] dark:border-[var(--data-error)]/50 text-sm font-semibold text-[var(--data-error)] dark:text-[var(--data-error)] hover:bg-[var(--data-error-50)] dark:hover:bg-[var(--data-error)]/20 transition-colors min-h-[44px]"
                  >
                    Restaurar valores por defecto
                  </button>
                  <p className="text-xs text-muted text-center mt-1.5">Esta acción borra los cambios no guardados</p>
                </div>

                {/* Tracking */}
                <div className="space-y-3 pt-2 border-t border-[var(--rule-soft)] dark:border-card-border">
                  <p className="text-xs font-semibold text-muted flex items-center gap-1.5">
                    <Sliders className="h-3.5 w-3.5" />
                    Seguimiento y analítica
                  </p>
                  <FieldRow label="Google Analytics ID (G-XXXXXXXX)">
                    <input
                      type="text"
                      value={theme.analyticsId}
                      onChange={(e) => update("analyticsId", e.target.value)}
                      placeholder="G-XXXXXXXXXX"
                      className={inputCls}
                    />
                  </FieldRow>
                  <FieldRow label="Facebook Pixel ID">
                    <input
                      type="text"
                      value={theme.pixelId}
                      onChange={(e) => update("pixelId", e.target.value)}
                      placeholder="1234567890"
                      className={inputCls}
                    />
                  </FieldRow>
                </div>
              </div>
            )}
          </div>

          {/* Botón guardar — fijo abajo del panel */}
          <div className="shrink-0 px-5 py-3 border-t border-[var(--rule-soft)] dark:border-card-border space-y-2 bg-white dark:bg-card">
            {error && (
              <p className="text-xs text-[var(--data-error)] font-semibold text-center">{error}</p>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className={cn(
                "w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all min-h-[48px] relative",
                saved
                  ? "bg-[var(--accent-soft)] text-white"
                  : "bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)] text-white hover:shadow-lg active:scale-[0.98]",
                saving && "opacity-60 cursor-not-allowed"
              )}
            >
              {saving ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Guardando...</>
              ) : saved ? (
                <><Check className="h-4 w-4" /> Cambios guardados</>
              ) : (
                <><Save className="h-4 w-4" /> Guardar cambios</>
              )}
              {hasUnsavedChanges && !saving && !saved && (
                <span className="absolute -top-1.5 -right-1.5 h-5 px-1.5 rounded-full bg-[var(--data-warning)] text-xs font-bold text-[var(--text-primary)] flex items-center">
                  Sin guardar
                </span>
              )}
            </button>
          </div>
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
                      previewWidth === v.w ? "bg-white text-[var(--text-primary)] shadow" : "text-[var(--text-tertiary)] hover:text-white")}>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setPreviewKey((k) => k + 1)} className="text-xs text-[var(--data-success)] font-semibold hover:text-[var(--data-success)]">
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
              className="bg-white rounded-xl overflow-hidden transition-all duration-[var(--dur-base)]"
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
