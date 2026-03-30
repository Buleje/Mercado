"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Palette, Store, Layout, Phone, Settings2, Image as ImageIcon,
  Save, Loader2, Check, GripVertical, Eye, EyeOff,
  Megaphone, Grid3x3, ShoppingBag, Tag, Package, BookOpen,
  MessageSquare, HelpCircle, Map, ToggleLeft, ToggleRight,
  ChevronUp, ChevronDown, Sun, Moon, Type, Sliders,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SectionKey } from "./StorefrontEditor";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type Tab = "identidad" | "colores" | "secciones" | "hero" | "contacto" | "avanzado";

interface StoreTheme {
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
  heroImage: string;
  fontFamily: string;
  borderRadius: number;
  spacing: "compact" | "normal" | "spacious";
  whatsapp: string;
  email: string;
  phone: string;
  address: string;
  schedules: Record<string, { open: string; close: string }>;
  analyticsId: string;
  pixelId: string;
  favicon: string;
  sections: SectionKey[];
}

const DEFAULT_THEME: StoreTheme = {
  logo: "",
  storeName: "Bodega San Martín",
  slogan: "Tu bodega de confianza en Pucallpa",
  description: "Abarrotes, bebidas y productos de primera necesidad con delivery a domicilio.",
  primaryColor: "#0f766e",
  secondaryColor: "#f4a261",
  accentColor: "#2d6a4f",
  darkModeDefault: false,
  heroTitle: "Todo lo que necesitas, en tu puerta",
  heroSubtitle: "Delivery rápido en Pucallpa. Paga con Yape o efectivo.",
  heroCTA: "Ver productos",
  heroLink: "tienda",
  heroImage: "",
  fontFamily: "sistema",
  borderRadius: 12,
  spacing: "normal",
  whatsapp: "",
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
};

// ── Paleta de colores predefinidos ────────────────────────────────────────────

const COLOR_PRESETS = [
  { label: "Teal",    value: "#0f766e" },
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
      <label className="text-xs font-semibold text-muted uppercase tracking-wide">{label}</label>
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
                ? "border-foreground scale-110 shadow-md"
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
            className="h-8 w-8 rounded-full cursor-pointer border-2 border-gray-200 dark:border-gray-700 overflow-hidden p-0"
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
      <label className="text-xs font-semibold text-muted uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all min-h-[44px]";

// ── Tabs del panel ─────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "identidad",  label: "Identidad",  icon: <Store className="h-4 w-4" /> },
  { id: "colores",    label: "Colores",    icon: <Palette className="h-4 w-4" /> },
  { id: "secciones",  label: "Secciones",  icon: <Layout className="h-4 w-4" /> },
  { id: "hero",       label: "Hero",       icon: <ImageIcon className="h-4 w-4" /> },
  { id: "contacto",   label: "Contacto",   icon: <Phone className="h-4 w-4" /> },
  { id: "avanzado",   label: "Avanzado",   icon: <Settings2 className="h-4 w-4" /> },
];

// ── Preview en vivo ───────────────────────────────────────────────────────────

function StorePreview({ theme }: { theme: StoreTheme }) {
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
        "w-full h-full rounded-2xl overflow-hidden border border-gray-200 dark:border-card-border flex flex-col text-sm shadow-inner",
        theme.darkModeDefault ? "bg-gray-900 text-white" : "bg-white text-gray-900"
      )}
      style={{ fontFamily: fontMap[theme.fontFamily] ?? fontMap.sistema }}
    >
      {/* Badge */}
      <div className="absolute top-3 right-3 z-10 bg-black/40 text-white text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-sm pointer-events-none">
        Vista previa
      </div>

      {/* Header mockup */}
      <div
        className="flex items-center justify-between shrink-0"
        style={{ backgroundColor: theme.primaryColor, padding: spacingPad }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {theme.logo ? (
            <img src={theme.logo} alt="logo" className="h-7 w-7 rounded-lg object-cover shrink-0" />
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
              <span className="text-white/60 text-[9px] leading-tight truncate block max-w-[110px]">
                {theme.slogan}
              </span>
            )}
          </div>
        </div>
        <div
          className="h-7 px-3 rounded-full text-[11px] font-bold flex items-center shrink-0"
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
        <h1 className="text-white font-extrabold text-base leading-tight max-w-[220px]">
          {theme.heroTitle || "Título principal"}
        </h1>
        <p className="text-white/80 text-[11px] mt-1 max-w-[200px] line-clamp-2">
          {theme.heroSubtitle || "Subtítulo del hero"}
        </p>
        <button
          className="mt-3 px-4 py-1.5 text-[11px] font-bold text-white shadow"
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
          <p className="text-[10px] font-bold text-muted mb-2 uppercase tracking-wider">Categorías</p>
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
                  className="text-[9px] font-semibold"
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
          <p className="text-[10px] font-bold text-muted mb-2 uppercase tracking-wider">Populares</p>
          <div className="grid grid-cols-2 gap-2">
            {["Aceite 1L", "Arroz 5kg"].map((prod) => (
              <div
                key={prod}
                className={cn(
                  "rounded-xl p-2 border",
                  theme.darkModeDefault
                    ? "bg-gray-800 border-gray-700"
                    : "bg-gray-50 border-gray-100"
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
                <p className="text-[10px] font-bold leading-tight">{prod}</p>
                <p className="text-[10px] font-extrabold mt-0.5" style={{ color: theme.primaryColor }}>
                  S/ 8.50
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer mockup */}
      <div
        className="shrink-0 px-3 py-2 text-[9px] text-center"
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
  const [showPreview, setShowPreview] = useState(true);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Detecta si hay cambios pendientes comparando con la última versión guardada
  const hasUnsavedChanges = JSON.stringify(theme) !== JSON.stringify(savedTheme);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const heroImageInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  // ── Cargar settings existentes ─────────────────────────────────────────────

  useEffect(() => {
    setLoading(true);
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.storeTheme) {
          const loaded = { ...DEFAULT_THEME, ...data.storeTheme };
          setTheme(loaded);
          setSavedTheme(loaded);
        } else {
          // Rellenar con datos básicos que ya existan en settings
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
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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

  const handleImageUpload = (
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

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeTheme: theme }),
      });
      if (!res.ok) throw new Error("Error al guardar");
      setSaved(true);
      setSavedTheme(theme);
      setToastMsg("Cambios guardados correctamente");
      setTimeout(() => setSaved(false), 3000);
      setTimeout(() => setToastMsg(null), 3000);
    } catch {
      setError("No se pudo guardar. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  // ── Drag & drop de secciones ───────────────────────────────────────────────

  const handleDragEnd = (overIdx: number) => {
    if (dragIdx === null || dragIdx === overIdx) return;
    const next = [...theme.sections];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(overIdx, 0, moved);
    update("sections", next);
    setDragIdx(null);
  };

  const moveSectionUp = (idx: number) => {
    if (idx === 0) return;
    const next = [...theme.sections];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    update("sections", next);
  };

  const moveSectionDown = (idx: number) => {
    if (idx === theme.sections.length - 1) return;
    const next = [...theme.sections];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    update("sections", next);
  };

  const toggleSection = (key: SectionKey) => {
    const has = theme.sections.includes(key);
    if (has) {
      update("sections", theme.sections.filter((k) => k !== key));
    } else {
      update("sections", [...theme.sections, key]);
    }
  };

  // Ordenar SECTION_LIST según el orden actual de theme.sections
  const orderedSections = [
    ...theme.sections
      .map((k) => SECTION_LIST.find((s) => s.key === k))
      .filter(Boolean) as SectionMeta[],
    ...SECTION_LIST.filter((s) => !theme.sections.includes(s.key)),
  ];

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Toast de éxito */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-emerald-600 text-white text-sm font-bold shadow-xl animate-[fadeDown_0.35s_ease-out_both] pointer-events-none">
          <Check className="h-4 w-4 shrink-0" />
          {toastMsg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-teal-600/10 dark:bg-teal-500/20 flex items-center justify-center">
            <Palette className="h-5 w-5 text-teal-600 dark:text-teal-400" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-foreground">Personalizar tienda</h1>
            <p className="text-xs text-muted">Cambia el aspecto y contenido de tu tienda online</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowPreview((p) => !p)}
          className="lg:hidden flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 dark:bg-surface text-xs font-semibold text-muted hover:text-foreground transition-colors min-h-[44px]"
        >
          {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {showPreview ? "Ocultar preview" : "Ver preview"}
        </button>
      </div>

      {/* Layout 2 columnas */}
      <div className="flex flex-1 gap-6 min-h-0">

        {/* ── Panel izquierdo ────────────────────────────────────────────── */}
        <div className="w-full lg:w-[42%] flex flex-col gap-4 min-h-0">

          {/* Tabs de navegación */}
          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide shrink-0">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all min-h-[44px] shrink-0",
                  activeTab === t.id
                    ? "bg-teal-600 text-white shadow-sm"
                    : "bg-gray-100 dark:bg-surface text-muted hover:text-foreground hover:bg-gray-200 dark:hover:bg-accent"
                )}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          {/* Contenido del tab activo */}
          <div className="flex-1 overflow-y-auto space-y-5 pr-1">

            {/* ── TAB: IDENTIDAD ─────────────────────────────────────── */}
            {activeTab === "identidad" && (
              <div className="space-y-5">
                {/* Logo */}
                <FieldRow label="Logo">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-16 w-16 rounded-xl border-2 border-dashed border-gray-200 dark:border-card-border flex items-center justify-center bg-gray-50 dark:bg-surface cursor-pointer hover:border-teal-500 transition-colors shrink-0 overflow-hidden"
                      onClick={() => logoInputRef.current?.click()}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === "Enter" && logoInputRef.current?.click()}
                    >
                      {theme.logo ? (
                        <img src={theme.logo} alt="Logo" className="h-full w-full object-cover" />
                      ) : (
                        <ImageIcon className="h-6 w-6 text-muted" />
                      )}
                    </div>
                    <div className="flex-1 space-y-1">
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        className="w-full px-3 py-2 rounded-xl bg-gray-100 dark:bg-surface text-xs font-semibold text-muted hover:text-foreground hover:bg-gray-200 dark:hover:bg-accent transition-colors min-h-[44px]"
                      >
                        Subir logo
                      </button>
                      {theme.logo && (
                        <button
                          type="button"
                          onClick={() => update("logo", "")}
                          className="w-full px-3 py-1.5 rounded-xl text-xs font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                          Quitar logo
                        </button>
                      )}
                    </div>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleImageUpload(e, "logo")}
                    />
                  </div>
                </FieldRow>

                {/* Nombre */}
                <FieldRow label="Nombre de la tienda">
                  <input
                    type="text"
                    value={theme.storeName}
                    onChange={(e) => update("storeName", e.target.value)}
                    placeholder="Bodega San Martín"
                    className={inputCls}
                    maxLength={60}
                  />
                </FieldRow>

                {/* Eslogan */}
                <FieldRow label={`Eslogan (${theme.slogan.length}/100)`}>
                  <input
                    type="text"
                    value={theme.slogan}
                    onChange={(e) => update("slogan", e.target.value.slice(0, 100))}
                    placeholder="Tu bodega de confianza..."
                    className={inputCls}
                    maxLength={100}
                  />
                </FieldRow>

                {/* Descripción */}
                <FieldRow label={`Descripción corta (${theme.description.length}/200)`}>
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
                  <p className="text-xs font-semibold text-muted uppercase tracking-wide">Preview botón CTA</p>
                  <div className="flex gap-3 items-center flex-wrap">
                    <button
                      type="button"
                      className="px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow transition-all hover:opacity-90"
                      style={{ backgroundColor: theme.primaryColor, borderRadius: `${theme.borderRadius}px` }}
                    >
                      {theme.heroCTA || "Ver productos"}
                    </button>
                    <button
                      type="button"
                      className="px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow transition-all hover:opacity-90"
                      style={{ backgroundColor: theme.secondaryColor, borderRadius: `${theme.borderRadius}px` }}
                    >
                      Secundario
                    </button>
                  </div>
                </div>

                {/* Modo oscuro por defecto */}
                <div className="flex items-center justify-between p-3.5 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface">
                  <div className="flex items-center gap-2.5">
                    {theme.darkModeDefault ? (
                      <Moon className="h-4 w-4 text-teal-500" />
                    ) : (
                      <Sun className="h-4 w-4 text-amber-500" />
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
                      <ToggleRight className="h-7 w-7 text-teal-600" />
                    ) : (
                      <ToggleLeft className="h-7 w-7 text-gray-400" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* ── TAB: SECCIONES ─────────────────────────────────────── */}
            {activeTab === "secciones" && (
              <div className="space-y-2">
                <p className="text-xs text-muted">Activa o desactiva secciones. Arrastra para reordenar.</p>
                {orderedSections.map((section, idx) => {
                  const enabled = theme.sections.includes(section.key);
                  return (
                    <div
                      key={section.key}
                      draggable={enabled}
                      onDragStart={() => setDragIdx(idx)}
                      onDragEnter={() => { if (dragIdx !== null) handleDragEnd(idx); }}
                      onDragOver={(e) => e.preventDefault()}
                      onDragEnd={() => setDragIdx(null)}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-xl border transition-all select-none",
                        enabled
                          ? "bg-white dark:bg-card border-gray-200 dark:border-card-border shadow-sm"
                          : "bg-gray-50 dark:bg-surface border-gray-100 dark:border-card-border opacity-60",
                        dragIdx === idx && "ring-2 ring-teal-500/40 bg-teal-50 dark:bg-teal-900/10"
                      )}
                    >
                      <GripVertical
                        className={cn(
                          "h-4 w-4 shrink-0",
                          enabled ? "text-gray-300 dark:text-gray-600 cursor-grab active:cursor-grabbing" : "text-gray-200 dark:text-gray-700"
                        )}
                      />
                      <div className="h-7 w-7 rounded-lg bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
                        {section.icon}
                      </div>
                      <span className="flex-1 text-sm font-semibold text-foreground truncate">
                        {section.label}
                      </span>

                      {/* Flechas para mobile */}
                      <div className="flex flex-col gap-0.5 sm:hidden shrink-0">
                        <button
                          type="button"
                          onClick={() => moveSectionUp(idx)}
                          disabled={idx === 0 || !enabled}
                          className="h-5 w-5 flex items-center justify-center rounded text-muted hover:text-foreground disabled:opacity-30 transition-colors"
                          aria-label="Subir"
                        >
                          <ChevronUp className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSectionDown(idx)}
                          disabled={idx >= theme.sections.length - 1 || !enabled}
                          className="h-5 w-5 flex items-center justify-center rounded text-muted hover:text-foreground disabled:opacity-30 transition-colors"
                          aria-label="Bajar"
                        >
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </div>

                      {/* Toggle */}
                      <button
                        type="button"
                        onClick={() => toggleSection(section.key)}
                        className="shrink-0 transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"
                        aria-label={enabled ? "Desactivar" : "Activar"}
                      >
                        {enabled ? (
                          <ToggleRight className="h-6 w-6 text-teal-600" />
                        ) : (
                          <ToggleLeft className="h-6 w-6 text-gray-400" />
                        )}
                      </button>
                    </div>
                  );
                })}
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
                  <div
                    className="relative h-28 rounded-xl border-2 border-dashed border-gray-200 dark:border-card-border bg-gray-50 dark:bg-surface flex items-center justify-center cursor-pointer hover:border-teal-500 transition-colors overflow-hidden"
                    onClick={() => heroImageInputRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && heroImageInputRef.current?.click()}
                  >
                    {theme.heroImage ? (
                      <>
                        <img src={theme.heroImage} alt="Hero" className="absolute inset-0 w-full h-full object-cover" />
                        <div className="relative z-10 bg-black/50 text-white text-xs font-semibold px-3 py-1.5 rounded-lg backdrop-blur-sm">
                          Cambiar imagen
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-muted">
                        <ImageIcon className="h-8 w-8" />
                        <span className="text-xs font-semibold">Subir imagen de fondo</span>
                      </div>
                    )}
                  </div>
                  {theme.heroImage && (
                    <button
                      type="button"
                      onClick={() => update("heroImage", "")}
                      className="text-xs text-red-500 hover:underline mt-1"
                    >
                      Quitar imagen
                    </button>
                  )}
                  <input
                    ref={heroImageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleImageUpload(e, "heroImage")}
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
                  <p className="text-xs font-semibold text-muted uppercase tracking-wide">Horarios de atención</p>
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
                          className="flex-1 px-2 py-2 rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-teal-500/40 min-h-[44px]"
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
                          className="flex-1 px-2 py-2 rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-teal-500/40 min-h-[44px]"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
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
                    <p className="text-xs font-semibold text-muted uppercase tracking-wide">Bordes redondeados</p>
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
                  <div className="flex justify-between text-[10px] text-muted">
                    <span>Cuadrado</span>
                    <span>Muy redondo</span>
                  </div>
                </div>

                {/* Espaciado */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted uppercase tracking-wide">Espaciado</p>
                  <div className="flex gap-2">
                    {(["compact", "normal", "spacious"] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => update("spacing", s)}
                        className={cn(
                          "flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all min-h-[44px]",
                          theme.spacing === s
                            ? "bg-teal-600 text-white border-teal-600"
                            : "border-gray-200 dark:border-card-border text-muted hover:border-teal-500 hover:text-foreground"
                        )}
                      >
                        {s === "compact" ? "Compacto" : s === "normal" ? "Normal" : "Espacioso"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Favicon */}
                <FieldRow label="Favicon">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-10 w-10 rounded-lg border border-gray-200 dark:border-card-border bg-gray-50 dark:bg-surface flex items-center justify-center cursor-pointer hover:border-teal-500 transition-colors shrink-0 overflow-hidden"
                      onClick={() => faviconInputRef.current?.click()}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === "Enter" && faviconInputRef.current?.click()}
                    >
                      {theme.favicon ? (
                        <img src={theme.favicon} alt="Favicon" className="h-full w-full object-cover" />
                      ) : (
                        <ImageIcon className="h-4 w-4 text-muted" />
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => faviconInputRef.current?.click()}
                      className="flex-1 px-3 py-2 rounded-xl bg-gray-100 dark:bg-surface text-xs font-semibold text-muted hover:text-foreground hover:bg-gray-200 dark:hover:bg-accent transition-colors min-h-[44px]"
                    >
                      {theme.favicon ? "Cambiar favicon" : "Subir favicon (32x32)"}
                    </button>
                    <input
                      ref={faviconInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleImageUpload(e, "favicon")}
                    />
                  </div>
                </FieldRow>

                {/* Reset a valores por defecto */}
                <div className="pt-2 border-t border-gray-100 dark:border-card-border">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-red-200 dark:border-red-800/50 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors min-h-[44px]"
                  >
                    Restaurar valores por defecto
                  </button>
                  <p className="text-[10px] text-muted text-center mt-1.5">Esta acción borra los cambios no guardados</p>
                </div>

                {/* Tracking */}
                <div className="space-y-3 pt-2 border-t border-gray-100 dark:border-card-border">
                  <p className="text-xs font-semibold text-muted uppercase tracking-wide flex items-center gap-1.5">
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
          <div className="shrink-0 pt-3 border-t border-gray-100 dark:border-card-border space-y-2">
            {error && (
              <p className="text-xs text-red-500 font-semibold text-center">{error}</p>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className={cn(
                "w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all min-h-[48px] relative",
                saved
                  ? "bg-emerald-600 text-white"
                  : "bg-teal-600 hover:bg-teal-700 text-white shadow-md hover:shadow-lg active:scale-[0.98]",
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
                <span className="absolute -top-1.5 -right-1.5 h-5 px-1.5 rounded-full bg-amber-400 text-[9px] font-bold text-gray-900 flex items-center">
                  Sin guardar
                </span>
              )}
            </button>
          </div>
        </div>

        {/* ── Panel derecho: Preview ────────────────────────────────────── */}
        <div
          className={cn(
            "flex-1 min-h-0 relative",
            showPreview ? "flex flex-col" : "hidden lg:flex lg:flex-col"
          )}
        >
          <div className="flex items-center justify-between mb-3 shrink-0">
            <p className="text-xs font-bold text-muted uppercase tracking-wider">Vista previa en vivo</p>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] text-muted font-semibold">Se actualiza en tiempo real</span>
            </div>
          </div>
          <div className="flex-1 relative overflow-hidden rounded-2xl">
            <StorePreview theme={theme} />
          </div>
          <p className="text-[10px] text-muted text-center mt-2 shrink-0">
            Esta es una vista simplificada. Los colores y fuentes se aplican al guardar.
          </p>
        </div>
      </div>
    </div>
  );
}
