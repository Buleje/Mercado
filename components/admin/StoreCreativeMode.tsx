"use client";

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
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { StoreTheme } from "./StoreCustomizer";
import type { SectionKey } from "./StorefrontEditor";

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

interface StoreCreativeModeProps {
  tenantSlug: string;
  initialTheme: StoreTheme;
  onClose: () => void;
  onApplyTheme: (theme: StoreTheme) => Promise<void>;
}

const INPUT_CLASS =
  "rounded-lg bg-gray-800 border border-gray-700 text-white text-sm px-3 py-2.5 w-full focus:outline-none focus:border-blue-500 transition-colors placeholder:text-gray-600";
const LABEL_CLASS =
  "block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1";

const VIEWPORTS: { id: Viewport; icon: typeof Monitor; width: string; label: string }[] = [
  { id: "desktop", icon: Monitor, width: "100%", label: "Escritorio" },
  { id: "tablet", icon: Tablet, width: "768px", label: "Tablet" },
  { id: "mobile", icon: Smartphone, width: "390px", label: "Movil" },
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
  "#EA580C",
  "#D97706",
  "#1F2937",
] as const;

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

const DAYS: Array<keyof StoreTheme["schedules"]> = [
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
  "domingo",
];

const QUICK_TEMPLATES: Array<{
  id: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: StoreTheme["fontFamily"];
  darkModeDefault: boolean;
}> = [
  {
    id: "clasico",
    name: "Clasico Bodega",
    primaryColor: "var(--color-primary)",
    secondaryColor: "#F97316",
    accentColor: "var(--color-primary)",
    fontFamily: "geist",
    darkModeDefault: false,
  },
  {
    id: "fresco",
    name: "Fresco Moderno",
    primaryColor: "#059669",
    secondaryColor: "#E11D48",
    accentColor: "#10B981",
    fontFamily: "poppins",
    darkModeDefault: false,
  },
  {
    id: "premium",
    name: "Premium Nocturno",
    primaryColor: "#1E293B",
    secondaryColor: "#D97706",
    accentColor: "#334155",
    fontFamily: "montserrat",
    darkModeDefault: true,
  },
];

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(value) ? value : "var(--color-primary)";
  return (
    <div className="space-y-2">
      <label className={LABEL_CLASS}>{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" value={safe} onChange={(e) => onChange(e.target.value)} className="h-9 w-10 rounded-lg border border-gray-700 bg-gray-800 p-0.5 cursor-pointer" />
        <input value={value} onChange={(e) => onChange(e.target.value)} maxLength={7} className={INPUT_CLASS} />
      </div>
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
      className={cn("relative h-6 w-11 rounded-full transition-colors", checked ? "bg-blue-600" : "bg-gray-700")}
    >
      <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform", checked ? "left-5" : "left-0.5")} />
    </button>
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
      ? "border border-gray-200 shadow-none"
      : styleVariant === "border"
        ? "border-2 border-gray-300 shadow-sm"
        : styleVariant === "glass"
          ? "border border-white/40 bg-white/70 backdrop-blur-md shadow-lg"
          : "border border-gray-200 shadow-lg";

  return (
    <div className={cn("p-3 bg-white", cardClass)} style={{ borderRadius }}>
      <div className="aspect-square rounded-xl bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="h-12 w-12 rounded-xl bg-white/80 flex items-center justify-center ring-1 ring-white">
          <Store className="h-6 w-6 text-gray-400" />
        </div>
      </div>
      <p className="mt-2 text-sm font-bold text-gray-900 line-clamp-2">{title}</p>
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

export default function StoreCreativeMode({ tenantSlug, initialTheme, onClose, onApplyTheme }: StoreCreativeModeProps) {
  const [panel, setPanel] = useState<CreativePanel>("plantillas");
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<StoreTheme>(initialTheme);
  const [history, setHistory] = useState<StoreTheme[]>([]);
  const [future, setFuture] = useState<StoreTheme[]>([]);

  // Fetch real products from the store for preview
  const [storeProducts, setStoreProducts] = useState<{ name: string; price: number; image?: string }[]>([]);
  const [tiendaSectionsEnabled, setTiendaSectionsEnabled] = useState<string[]>([]);
  const [tiendaSectionOrder, setTiendaSectionOrder] = useState<string[]>(TIENDA_SECTION_KEYS);
  const [sectionContentCounts, setSectionContentCounts] = useState<Record<string, number>>({});
  const [livePreview, setLivePreview] = useState(true);
  const [splitPreview, setSplitPreview] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [savedSnapshots, setSavedSnapshots] = useState<Array<{ theme: StoreTheme; savedAt: string }>>([]);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutoSavedRef = useRef<string>("");
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
      .catch(() => { /* fallback to hardcoded */ });
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
      .catch(() => { /* ignore */ });
  }, [tenantSlug]);

  const pushChange = useCallback((next: StoreTheme) => {
    setHistory((prev) => [...prev.slice(-30), draft]);
    setFuture([]);
    setDraft(next);
  }, [draft]);

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

  const toggleSection = useCallback((key: SectionKey) => {
    const has = draft.sections.includes(key);
    const sections = has
      ? draft.sections.filter((s) => s !== key)
      : [...draft.sections, key];
    patch("sections", sections);
  }, [draft.sections, patch]);

  const toggleTiendaSection = useCallback((key: string) => {
    setTiendaSectionsEnabled((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      // Auto-save tienda section changes to backend
      fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-tenant-id": tenantSlug },
        body: JSON.stringify({ storeTheme: { tiendaSections: next } }),
      }).catch(() => { /* ignore */ });
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
      }).catch(() => { /* ignore */ });
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
      onApplyTheme(draft).then(() => setIframeKey((k) => k + 1)).catch(() => { /* ignore */ });
    }, 2000);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [draft, initialTheme, onApplyTheme]);

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
    });
  }, [draft, pushChange]);

  const handleApply = useCallback(async () => {
    setSaving(true);
    try {
      await onApplyTheme(draft);
      lastAutoSavedRef.current = JSON.stringify(draft);
      setIframeKey((k) => k + 1);
      setSavedSnapshots((prev) => [
        { theme: draft, savedAt: new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }) },
        ...prev.slice(0, 4),
      ]);
    } finally {
      setSaving(false);
    }
  }, [draft, onApplyTheme]);

  const activeViewport = VIEWPORTS.find((v) => v.id === viewport)!;

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
    <div className="fixed inset-0 z-[100] flex flex-col bg-gray-950">
      <header className="flex items-center justify-between h-12 px-4 bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors text-xs font-medium">
            <X className="h-4 w-4" />
            Salir
          </button>
          <div className="h-4 w-px bg-gray-700" />
          <span className="text-xs font-bold text-blue-400">Modo Creativo · {draft.storeName || tenantSlug}</span>
        </div>

        <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-0.5">
          {VIEWPORTS.map((vp) => (
            <button
              key={vp.id}
              onClick={() => setViewport(vp.id)}
              title={vp.label}
              className={cn("p-1.5 rounded-md transition-colors", viewport === vp.id ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-700")}
            >
              <vp.icon className="h-4 w-4" />
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={handleUndo} disabled={history.length === 0} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors text-xs disabled:opacity-40">
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button onClick={handleRedo} disabled={future.length === 0} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors text-xs disabled:opacity-40">
            <Redo2 className="h-3.5 w-3.5" />
          </button>
          <div className="h-4 w-px bg-gray-700" />
          <button
            onClick={() => setLivePreview((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
              livePreview ? "bg-emerald-600/20 text-emerald-400" : "text-gray-400 hover:text-white hover:bg-gray-800",
            )}
            title={livePreview ? "Volver al mockup" : "Vista previa en vivo"}
          >
            <Monitor className="h-3.5 w-3.5" />
            {livePreview ? "En vivo" : "Preview"}
          </button>
          {livePreview && (
            <button
              onClick={() => setIframeKey((k) => k + 1)}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors text-xs"
              title="Recargar vista previa"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}
          <a
            href={`/t/${tenantSlug}?preview=true`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors text-xs font-medium"
            title="Abrir tienda en nueva pestaña"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Ver tienda
          </a>
          {livePreview && (
            <button
              onClick={() => setSplitPreview((v) => !v)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
                splitPreview ? "bg-purple-600/20 text-purple-400" : "text-gray-400 hover:text-white hover:bg-gray-800",
              )}
              title={splitPreview ? "Vista simple" : "Comparar antes/después"}
            >
              <Columns2 className="h-3.5 w-3.5" />
            </button>
          )}
          <div className="h-4 w-px bg-gray-700" />
          <button
            onClick={handleApply}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-500 transition-colors disabled:opacity-50"
          >
            {saving ? <Sparkles className="h-3.5 w-3.5 animate-pulse" /> : <Save className="h-3.5 w-3.5" />}
            {saving ? "Aplicando..." : "Aplicar y guardar"}
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside className="w-72 bg-gray-900 border-r border-gray-800 overflow-y-auto shrink-0">
          <nav className="p-2 space-y-1">
            {panelItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setPanel(item.id)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all text-left",
                  panel === item.id ? "bg-blue-600/20 text-blue-400 font-semibold" : "text-gray-400 hover:text-gray-200 hover:bg-gray-800",
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="p-3 border-t border-gray-800 mt-2 space-y-4">
            {panel === "plantillas" && (
              <>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Plantillas rapidas</p>
                {QUICK_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => applyTemplate(tpl)}
                    className="w-full text-left p-2.5 rounded-lg bg-gray-800/70 border border-gray-700 hover:border-blue-500 transition-colors"
                  >
                    <p className="text-xs font-bold text-white">{tpl.name}</p>
                    <div className="mt-2 flex gap-1">
                      <span className="h-4 w-4 rounded-full" style={{ backgroundColor: tpl.primaryColor }} />
                      <span className="h-4 w-4 rounded-full" style={{ backgroundColor: tpl.secondaryColor }} />
                      <span className="h-4 w-4 rounded-full" style={{ backgroundColor: tpl.accentColor }} />
                    </div>
                  </button>
                ))}
              </>
            )}

            {panel === "identidad" && (
              <>
                <div>
                  <label className={LABEL_CLASS}>Nombre de tienda</label>
                  <input className={INPUT_CLASS} value={draft.storeName} onChange={(e) => patch("storeName", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Slogan</label>
                  <input className={INPUT_CLASS} value={draft.slogan} onChange={(e) => patch("slogan", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Descripcion</label>
                  <textarea className={cn(INPUT_CLASS, "resize-none")} rows={3} value={draft.description} onChange={(e) => patch("description", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Logo URL</label>
                  <input className={INPUT_CLASS} value={draft.logo} onChange={(e) => patch("logo", e.target.value)} placeholder="https://..." />
                </div>
              </>
            )}

            {panel === "hero" && (
              <>
                <div>
                  <label className={LABEL_CLASS}>Titulo hero</label>
                  <input className={INPUT_CLASS} value={draft.heroTitle} onChange={(e) => patch("heroTitle", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Subtitulo hero</label>
                  <textarea className={cn(INPUT_CLASS, "resize-none")} rows={2} value={draft.heroSubtitle} onChange={(e) => patch("heroSubtitle", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Texto CTA</label>
                  <input className={INPUT_CLASS} value={draft.heroCTA} onChange={(e) => patch("heroCTA", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL_CLASS}>URL CTA</label>
                  <input className={INPUT_CLASS} value={draft.heroLink} onChange={(e) => patch("heroLink", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Badge hero</label>
                  <input className={INPUT_CLASS} value={draft.heroBadge} onChange={(e) => patch("heroBadge", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Imagen hero URL</label>
                  <input className={INPUT_CLASS} value={draft.heroImage} onChange={(e) => patch("heroImage", e.target.value)} placeholder="https://..." />
                </div>
              </>
            )}

            {panel === "colores" && (
              <>
                <ColorField label="Color primario" value={draft.primaryColor} onChange={(v) => patch("primaryColor", v)} />
                <ColorField label="Color secundario" value={draft.secondaryColor} onChange={(v) => patch("secondaryColor", v)} />
                <ColorField label="Color acento" value={draft.accentColor} onChange={(v) => patch("accentColor", v)} />
                <div className="flex items-center justify-between rounded-lg bg-gray-800 border border-gray-700 p-2.5">
                  <span className="text-xs font-semibold text-gray-300">Modo oscuro por defecto</span>
                  <Toggle checked={draft.darkModeDefault} onChange={(v) => patch("darkModeDefault", v)} />
                </div>
              </>
            )}

            {panel === "secciones" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Pagina principal</p>
                  {SECTION_ITEMS.map((section) => {
                    const enabled = draft.sections.includes(section.key);
                    return (
                      <label key={section.key} className="flex items-center justify-between rounded-lg bg-gray-800 border border-gray-700 px-2.5 py-2 cursor-pointer">
                        <span className="text-xs text-gray-200">{section.label}</span>
                        <Toggle checked={enabled} onChange={() => toggleSection(section.key)} />
                      </label>
                    );
                  })}
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Tienda online</p>
                  {tiendaSectionOrder.map((key, idx) => {
                    const enabled = tiendaSectionsEnabled.includes(key);
                    const count = sectionContentCounts[key] ?? 0;
                    return (
                      <div key={key} className="flex items-center gap-1.5 rounded-lg bg-gray-800 border border-gray-700 px-2.5 py-2">
                        <div className="flex flex-col">
                          <button
                            type="button"
                            onClick={() => moveTiendaSection(key, "up")}
                            disabled={idx === 0}
                            className="text-gray-500 hover:text-white disabled:opacity-20 transition-colors"
                          >
                            <ChevronUp className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveTiendaSection(key, "down")}
                            disabled={idx === tiendaSectionOrder.length - 1}
                            className="text-gray-500 hover:text-white disabled:opacity-20 transition-colors"
                          >
                            <ChevronDown className="h-3 w-3" />
                          </button>
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs text-gray-200 block">{TIENDA_SECTION_LABELS[key]}</span>
                          <span className={cn("text-[10px]", count > 0 ? "text-emerald-400" : "text-gray-500")}>
                            {count > 0 ? `${count} productos` : "Sin productos"}
                          </span>
                        </div>
                        <Toggle checked={enabled} onChange={() => toggleTiendaSection(key)} />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {panel === "tipografia" && (
              <>
                <div>
                  <label className={LABEL_CLASS}>Fuente</label>
                  <select className={INPUT_CLASS} value={draft.fontFamily} onChange={(e) => patch("fontFamily", e.target.value as StoreTheme["fontFamily"])}>
                    {FONT_OPTIONS.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className={LABEL_CLASS}>Redondez</label>
                    <span className="text-[10px] text-blue-400 font-bold">{draft.borderRadius}px</span>
                  </div>
                  <input type="range" min={0} max={24} value={draft.borderRadius} onChange={(e) => patch("borderRadius", Number(e.target.value))} className="w-full accent-blue-500" />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Espaciado general</label>
                  <select className={INPUT_CLASS} value={draft.spacing} onChange={(e) => patch("spacing", e.target.value as StoreTheme["spacing"])}>
                    <option value="compact">Compacto</option>
                    <option value="normal">Normal</option>
                    <option value="spacious">Espacioso</option>
                  </select>
                </div>
              </>
            )}

            {panel === "estilos" && (
              <>
                <div>
                  <label className={LABEL_CLASS}>Estilo de cards</label>
                  <select className={INPUT_CLASS} value={draft.cardStyle} onChange={(e) => patch("cardStyle", e.target.value as StoreTheme["cardStyle"])}>
                    <option value="minimal">Minimal</option>
                    <option value="shadow">Shadow</option>
                    <option value="border">Border</option>
                    <option value="glass">Glass</option>
                  </select>
                </div>
                <div>
                  <label className={LABEL_CLASS}>Estilo de carrito</label>
                  <select className={INPUT_CLASS} value={draft.cartStyle} onChange={(e) => patch("cartStyle", e.target.value as StoreTheme["cartStyle"])}>
                    <option value="sidebar">Sidebar</option>
                    <option value="modal">Modal</option>
                    <option value="drawer">Drawer</option>
                  </select>
                </div>
                <div>
                  <label className={LABEL_CLASS}>Botones</label>
                  <select className={INPUT_CLASS} value={draft.buttonStyle} onChange={(e) => patch("buttonStyle", e.target.value as StoreTheme["buttonStyle"])}>
                    <option value="rounded">Rounded</option>
                    <option value="square">Square</option>
                    <option value="pill">Pill</option>
                  </select>
                </div>
                <div>
                  <label className={LABEL_CLASS}>Navbar</label>
                  <select className={INPUT_CLASS} value={draft.navbarStyle} onChange={(e) => patch("navbarStyle", e.target.value as StoreTheme["navbarStyle"])}>
                    <option value="solid">Solid</option>
                    <option value="transparent">Transparent</option>
                    <option value="blur">Blur</option>
                    <option value="minimal">Minimal</option>
                  </select>
                </div>
                <div>
                  <label className={LABEL_CLASS}>Sombras</label>
                  <select className={INPUT_CLASS} value={draft.shadowLevel} onChange={(e) => patch("shadowLevel", e.target.value as StoreTheme["shadowLevel"])}>
                    <option value="none">Sin sombra</option>
                    <option value="soft">Suave</option>
                    <option value="deep">Profunda</option>
                  </select>
                </div>
                <div>
                  <label className={LABEL_CLASS}>Animaciones</label>
                  <select className={INPUT_CLASS} value={draft.animations} onChange={(e) => patch("animations", e.target.value as StoreTheme["animations"])}>
                    <option value="none">Ninguna</option>
                    <option value="subtle">Sutil</option>
                    <option value="dynamic">Dinamica</option>
                  </select>
                </div>
                <div>
                  <label className={LABEL_CLASS}>Fondo</label>
                  <select className={INPUT_CLASS} value={draft.backgroundPattern} onChange={(e) => patch("backgroundPattern", e.target.value as StoreTheme["backgroundPattern"])}>
                    <option value="none">Plano</option>
                    <option value="dots">Dots</option>
                    <option value="waves">Waves</option>
                    <option value="gradient">Gradient</option>
                  </select>
                </div>
              </>
            )}

            {panel === "contacto" && (
              <>
                <div>
                  <label className={LABEL_CLASS}>WhatsApp</label>
                  <input className={INPUT_CLASS} value={draft.whatsapp} onChange={(e) => patch("whatsapp", e.target.value)} placeholder="+51 999 999 999" />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Mensaje WhatsApp</label>
                  <textarea className={cn(INPUT_CLASS, "resize-none")} rows={2} value={draft.whatsappMessage} onChange={(e) => patch("whatsappMessage", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Email</label>
                  <input className={INPUT_CLASS} value={draft.email} onChange={(e) => patch("email", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Telefono</label>
                  <input className={INPUT_CLASS} value={draft.phone} onChange={(e) => patch("phone", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Direccion</label>
                  <input className={INPUT_CLASS} value={draft.address} onChange={(e) => patch("address", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Horario</p>
                  {DAYS.map((day) => (
                    <div key={day} className="grid grid-cols-[1fr,1fr,1fr] gap-2 items-center rounded-lg bg-gray-800 border border-gray-700 p-2">
                      <span className="text-[11px] font-semibold text-gray-300 capitalize">{day}</span>
                      <input className={cn(INPUT_CLASS, "px-2 py-1.5 text-xs")} value={draft.schedules[day].open} onChange={(e) => patchSchedule(day, "open", e.target.value)} />
                      <input className={cn(INPUT_CLASS, "px-2 py-1.5 text-xs")} value={draft.schedules[day].close} onChange={(e) => patchSchedule(day, "close", e.target.value)} />
                    </div>
                  ))}
                </div>
              </>
            )}

            {panel === "automatizacion" && (
              <>
                <div className="flex items-center justify-between rounded-lg bg-gray-800 border border-gray-700 p-2.5">
                  <span className="text-xs font-semibold text-gray-300">Popup bienvenida</span>
                  <Toggle checked={draft.welcomePopupEnabled} onChange={(v) => patch("welcomePopupEnabled", v)} />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Titulo popup</label>
                  <input className={INPUT_CLASS} value={draft.welcomePopupTitle} onChange={(e) => patch("welcomePopupTitle", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Mensaje popup</label>
                  <textarea className={cn(INPUT_CLASS, "resize-none")} rows={3} value={draft.welcomePopupMessage} onChange={(e) => patch("welcomePopupMessage", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Cupon popup</label>
                  <input className={INPUT_CLASS} value={draft.welcomePopupCoupon} onChange={(e) => patch("welcomePopupCoupon", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Texto footer</label>
                  <input className={INPUT_CLASS} value={draft.footerText} onChange={(e) => patch("footerText", e.target.value)} />
                </div>
              </>
            )}

            {panel === "avanzado" && (
              <>
                <div>
                  <label className={LABEL_CLASS}>Google Analytics ID</label>
                  <input className={INPUT_CLASS} value={draft.analyticsId} onChange={(e) => patch("analyticsId", e.target.value)} placeholder="G-XXXXXXXXXX" />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Facebook Pixel ID</label>
                  <input className={INPUT_CLASS} value={draft.pixelId} onChange={(e) => patch("pixelId", e.target.value)} />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Favicon URL</label>
                  <input className={INPUT_CLASS} value={draft.favicon} onChange={(e) => patch("favicon", e.target.value)} placeholder="https://..." />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Custom CSS</label>
                  <textarea className={cn(INPUT_CLASS, "resize-none font-mono text-xs")} rows={6} value={draft.customCSS} onChange={(e) => patch("customCSS", e.target.value)} />
                </div>
              </>
            )}

            {panel === "historial" && (
              <div className="space-y-3">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Versiones guardadas</p>
                {savedSnapshots.length === 0 ? (
                  <p className="text-xs text-gray-500">Aún no hay versiones. Guarda cambios para crear una.</p>
                ) : (
                  savedSnapshots.map((snap, idx) => (
                    <div key={idx} className="rounded-lg bg-gray-800 border border-gray-700 p-2.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-400">{snap.savedAt}</span>
                        <button
                          type="button"
                          onClick={() => pushChange(snap.theme)}
                          className="text-[10px] font-bold text-blue-400 hover:text-blue-300 transition-colors"
                        >
                          Restaurar
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                          <span className="h-4 w-4 rounded-full border border-gray-600" style={{ backgroundColor: snap.theme.primaryColor }} />
                          <span className="h-4 w-4 rounded-full border border-gray-600" style={{ backgroundColor: snap.theme.secondaryColor }} />
                          <span className="h-4 w-4 rounded-full border border-gray-600" style={{ backgroundColor: snap.theme.accentColor }} />
                        </div>
                        <span className="text-[10px] text-gray-400">{snap.theme.fontFamily}</span>
                        {snap.theme.darkModeDefault && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">Dark</span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-300 font-semibold truncate">{snap.theme.storeName}</p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </aside>

        <main className="flex-1 bg-gray-950 flex items-start justify-center p-4 overflow-auto">
          {livePreview ? (
            <div className={cn("flex gap-4 w-full justify-center", splitPreview && "items-start")}>
              {splitPreview && (
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <span className="text-[10px] font-bold text-gray-500 uppercase">Guardado</span>
                  <div
                    className="bg-white rounded-lg shadow-2xl overflow-hidden"
                    style={{ width: viewport === "mobile" ? "320px" : "48%", maxWidth: "50%", height: "calc(100vh - 100px)" }}
                  >
                    <iframe
                      src={`/t/${tenantSlug}`}
                      title="Versión actual"
                      className="w-full h-full border-0"
                    />
                  </div>
                </div>
              )}
              <div className={cn("flex flex-col items-center gap-1", splitPreview && "shrink-0")}>
                {splitPreview && <span className="text-[10px] font-bold text-blue-400 uppercase">Borrador</span>}
                <div
                  className="bg-white rounded-lg shadow-2xl overflow-hidden transition-all duration-300"
                  style={{
                    width: splitPreview ? (viewport === "mobile" ? "320px" : "48%") : activeViewport.width,
                    maxWidth: splitPreview ? "50%" : "100%",
                    height: "calc(100vh - 100px)",
                  }}
                >
                  <iframe
                    key={iframeKey}
                    src={`/t/${tenantSlug}?preview=true`}
                    title="Vista previa en vivo"
                    className="w-full h-full border-0"
                  />
                </div>
              </div>
            </div>
          ) : (
          <div
            className="bg-white rounded-lg shadow-2xl overflow-hidden transition-all duration-300"
            style={{ width: activeViewport.width, maxWidth: "100%", minHeight: "calc(100vh - 80px)", fontFamily }}
          >
            <div className={cn("min-h-full", draft.darkModeDefault ? "bg-gray-950 text-white" : "bg-gray-50 text-gray-900")}>
              <div className="px-4 py-3 border-b" style={{ borderColor: draft.darkModeDefault ? "#1f2937" : "#e5e7eb", background: draft.navbarStyle === "transparent" ? "transparent" : draft.primaryColor }}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="relative h-9 w-9 rounded-xl bg-white/20 flex items-center justify-center overflow-hidden">
                      {draft.logo ? (
                        <Image src={draft.logo} alt="" fill sizes="36px" className="object-cover" unoptimized={draft.logo.startsWith("data:")} />
                      ) : (
                        <span className="text-sm font-black text-white">{draft.storeName.slice(0, 2).toUpperCase()}</span>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-black text-white">{draft.storeName || "Mi tienda"}</p>
                      <p className="text-[10px] text-white/80 line-clamp-1">{draft.slogan || "Tu tienda de confianza"}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-white/80">Preview</span>
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
                    <p className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-white/25 text-white px-2 py-1 rounded-full">
                      <Sparkles className="h-3 w-3" />
                      {draft.heroBadge || "Oferta"}
                    </p>
                    <h2 className="mt-3 text-2xl font-black text-white leading-tight">{draft.heroTitle || "Todo lo que necesitas"}</h2>
                    <p className="mt-2 text-sm text-white/90 line-clamp-2">{draft.heroSubtitle || "Delivery rapido en tu zona"}</p>
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
                  <h3 className="text-sm font-black">Productos destacados</h3>
                  <span className="text-[10px] text-gray-400">{draft.sections.length} secciones activas</span>
                </div>

                <div className={cn("grid grid-cols-2 gap-3", viewport === "desktop" && "sm:grid-cols-3 lg:grid-cols-4")}
                >
                  {(storeProducts.length > 0 ? storeProducts : [
                    { name: "Arroz premium 5kg", price: 23.90 },
                    { name: "Aceite vegetal 1L", price: 9.50 },
                    { name: "Leche entera 400g", price: 4.80 },
                    { name: "Azucar rubia 1kg", price: 5.20 },
                  ]).map((p, i) => (
                    <PreviewCard key={i} title={p.name} price={`S/ ${p.price.toFixed(2)}`} primaryColor={draft.primaryColor} borderRadius={draft.borderRadius} styleVariant={draft.cardStyle} />
                  ))}
                </div>

                {/* Tienda sections preview */}
                {tiendaSectionsEnabled.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Secciones de tienda</p>
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
                    <span className="text-[10px] px-2 py-1 rounded-full bg-blue-100 text-blue-700">{draft.cartStyle}</span>
                    <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">{draft.buttonStyle}</span>
                    <span className="text-[10px] px-2 py-1 rounded-full bg-purple-100 text-purple-700">{draft.animations}</span>
                    <span className="text-[10px] px-2 py-1 rounded-full bg-amber-100 text-amber-700">{draft.backgroundPattern}</span>
                    <span className="text-[10px] px-2 py-1 rounded-full bg-slate-100 text-slate-700">{draft.fontFamily}</span>
                  </div>
                </div>

                {draft.welcomePopupEnabled && (
                  <div className="rounded-xl border p-3 bg-white" style={{ borderColor: draft.secondaryColor }}>
                    <p className="text-xs font-black" style={{ color: draft.primaryColor }}>{draft.welcomePopupTitle || "Bienvenido"}</p>
                    <p className="text-xs text-gray-500 mt-1">{draft.welcomePopupMessage || "Usa este cupon en tu primera compra"}</p>
                    <div className="mt-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold bg-gray-100 text-gray-700">
                      <Check className="h-3 w-3" />
                      {draft.welcomePopupCoupon || "BIENVENIDO10"}
                    </div>
                  </div>
                )}
              </div>

              <div className="px-4 py-3 border-t text-[10px] text-center" style={{ borderColor: draft.darkModeDefault ? "#1f2937" : "#e5e7eb" }}>
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
