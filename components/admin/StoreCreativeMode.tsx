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
} from "@buleje/design-system/icons";
import { Field } from "@/components/admin/shared/Field";
import ImageUpload from "./ImageUpload";
import { cn } from "@/lib/utils";
import { EDITOR_FONT_MAP, EDITOR_BTN_RADIUS } from "@/lib/store-design-tokens";
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
const LANDING_BODY_ITEMS: { key: string; label: string }[] = [
  { key: "trust", label: "Confianza (insignias)" },
  { key: "promos", label: "Promociones" },
  { key: "featured", label: "Productos destacados" },
  { key: "info", label: "Información del negocio" },
];
const LANDING_BODY_DEFAULT = ["trust", "promos", "featured", "info"];

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

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  // El <input type="color"> SOLO acepta hex; si el valor es una CSS var
  // (var(--color-primary) = teal de marca) caía a algo inválido → el picker
  // nativo mostraba negro. Fallback al hex real de la marca para que muestre bien.
  const safe = /^#[0-9A-Fa-f]{6}$/.test(value) ? value : "#00A0A0";
  return (
    <div className="space-y-2">
      <Field label={label} labelClassName={LABEL_CLASS}>
        {(id) => (
          <div className="flex items-center gap-2">
            <input type="color" value={safe} onChange={(e) => onChange(e.target.value)} className="h-9 w-10 rounded-lg border border-white/10 bg-white/[0.04] p-0.5 cursor-pointer" aria-label={`Color picker ${label}`} />
            <input id={id} value={value} onChange={(e) => onChange(e.target.value)} maxLength={7} className={INPUT_CLASS} />
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
    heroSubtitle: _hs, ...rest
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
  info: "contacto",
};
const PB_KEY_LABEL: Record<string, string> = {
  announcement: "Banner de anuncio",
  hero: "Hero",
  trust: "Confianza",
  promos: "Promociones",
  featured: "Productos",
  info: "Información",
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
  // Drag-reorder de secciones (page builder Fase 2): qué se arrastra / sobre quién.
  const [dragKey, setDragKey] = useState<SectionKey | null>(null);
  const [dragOverKey, setDragOverKey] = useState<SectionKey | null>(null);
  // Drag del cuerpo REAL de la landing (trust/promos/featured/info → bodyOrder).
  const [bodyDragKey, setBodyDragKey] = useState<string | null>(null);
  const [bodyDragOverKey, setBodyDragOverKey] = useState<string | null>(null);
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

  // Drag-reorder (Brandon 2026-06-25, page builder Fase 2): mueve `fromKey` a la
  // posición de `toKey` dentro de las secciones activas (draft.sections).
  // También avisa al iframe (pb-reorder) para que reordene el DOM en vivo.
  const reorderSection = useCallback((fromKey: SectionKey, toKey: SectionKey) => {
    if (fromKey === toKey) return;
    const arr = [...draft.sections];
    const from = arr.indexOf(fromKey);
    const to = arr.indexOf(toKey);
    if (from < 0 || to < 0) return;
    arr.splice(from, 1);
    arr.splice(to, 0, fromKey);
    patch("sections", arr);
    // Fase 2 — reflejo visual inmediato en el iframe (DOM reorder vía postMessage)
    const frame = document.querySelector<HTMLIFrameElement>('iframe[data-live-preview="1"]');
    try {
      frame?.contentWindow?.postMessage(
        { source: "buleje-editor", type: "pb-reorder", order: arr },
        window.location.origin,
      );
    } catch { /* cross-origin guard */ }
  }, [draft.sections, patch]);

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
    const vars: Record<string, string> = {
      "--tenant-primary": theme.primaryColor,
      "--tenant-secondary": theme.secondaryColor,
      "--tenant-accent": theme.accentColor,
      "--tenant-radius": `${theme.borderRadius}px`,
      ...(font ? { "--tenant-font": font.stack } : {}),
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
      } | null;
      if (d?.source !== "buleje-preview") return;
      if (d.type === "ready") {
        postLiveTheme(draftRef.current);
        return;
      }
      // Fase 1: click en un bloque del preview → abrir su panel + resaltar.
      if (d.type === "pb-select" && d.key && PB_KEY_TO_PANEL[d.key]) {
        setPanel(PB_KEY_TO_PANEL[d.key]);
        setPbSelected(d.key);
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
  }, [postLiveTheme, patch, moveBodySection, reorderBody]);

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
      setIframeKey((k) => k + 1);
      setSavedSnapshots((prev) => [
        { theme: draft, savedAt: new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }) },
        ...prev.slice(0, 4),
      ]);
    } finally {
      setSaving(false);
    }
  }, [draft, onApplyTheme]);


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
              const active = viewport === vp.id;
              return (
                <button
                  key={vp.id}
                  onClick={() => setViewport(vp.id)}
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
              </>
            )}
          </div>

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
                  onClick={() => setPanel(item.id)}
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
                <div>
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
              </>
            )}

            {panel === "identidad" && (
              <>
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
              <div className="space-y-6">
                {/* Banner de la tienda — imagen arriba de la página (Brandon 2026-06-25) */}
                <div className="space-y-1.5">
                  <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]">Banner de la tienda</p>
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
                  <p className="text-[length:var(--ts-2xs)] text-gray-500">Imagen full-width arriba de la tienda · click o arrastrá · máx 5 MB</p>
                </div>
                <div className="space-y-2">
                  <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]">Pagina principal</p>
                  <p className="text-[length:var(--ts-2xs)] text-gray-500">Arrastrá el asa para reordenar · el toggle activa u oculta la sección</p>
                  {[
                    ...draft.sections,
                    ...SECTION_ITEMS.filter((s) => !draft.sections.includes(s.key)).map((s) => s.key),
                  ].map((key) => {
                    const section = SECTION_ITEMS.find((s) => s.key === key);
                    if (!section) return null;
                    const enabled = draft.sections.includes(key);
                    // hero/announcement ya tienen su propio slot de imagen (panel Hero
                    // y "Banner de la tienda"); el resto recibe imagen por sección.
                    const hasOwnImageSlot = key === "hero" || key === "announcement";
                    const sectionImg = draft.sectionImages?.[key] ?? "";
                    return (
                      <div
                        key={key}
                        onMouseEnter={() => sendHighlight(key)}
                        onMouseLeave={() => sendHighlight(null)}
                        onDragOver={(e) => {
                          if (dragKey && dragKey !== key && enabled) {
                            e.preventDefault();
                            setDragOverKey(key);
                          }
                        }}
                        onDragLeave={() => setDragOverKey((k) => (k === key ? null : k))}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (dragKey) reorderSection(dragKey, key);
                          setDragKey(null);
                          setDragOverKey(null);
                        }}
                        className={cn(
                          "rounded-lg bg-white/[0.03] border transition-colors",
                          dragOverKey === key ? "border-[var(--data-info-500)]" : "border-white/10",
                          dragKey === key && "opacity-40",
                        )}
                      >
                        <span className="flex items-center gap-1.5 px-2.5 py-2">
                          {enabled ? (
                            <button
                              type="button"
                              draggable
                              onDragStart={() => setDragKey(key)}
                              onDragEnd={() => {
                                setDragKey(null);
                                setDragOverKey(null);
                              }}
                              aria-label={`Arrastrar ${section.label} para reordenar`}
                              className="shrink-0 cursor-grab text-[var(--text-tertiary)] transition-colors hover:text-white active:cursor-grabbing"
                            >
                              <GripVertical className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          ) : (
                            <span className="w-3.5 shrink-0" aria-hidden />
                          )}
                          <span className="flex-1 text-xs text-gray-200">{section.label}</span>
                          <Toggle checked={enabled} onChange={() => toggleSection(key)} />
                        </span>
                        {enabled && !hasOwnImageSlot && (
                          <div className="dark border-t border-white/10 px-2.5 py-2.5">
                            <ImageUpload
                              value={sectionImg}
                              onChange={(url) => setSectionImage(key, url)}
                              onClear={() => setSectionImage(key, "")}
                              folder="store-customizer"
                              aspectRatio="banner"
                              label=""
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Orden REAL del inicio (page builder Fase 2): arrastra para
                    cambiar el orden en tu tienda pública. Persiste en /t. */}
                <div className="space-y-2">
                  <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]">Orden del inicio · en vivo</p>
                  <p className="text-[length:var(--ts-2xs)] text-gray-500">Arrastrá para reordenar las secciones de tu página de inicio. El banner y el hero quedan fijos arriba.</p>
                  {(() => {
                    // Orden visible = bodyOrder válido primero, faltantes al final.
                    const valid = (draft.bodyOrder ?? []).filter((k) => LANDING_BODY_DEFAULT.includes(k));
                    const finalOrder = [...valid, ...LANDING_BODY_DEFAULT.filter((k) => !valid.includes(k))];
                    return finalOrder.map((key) => {
                      const item = LANDING_BODY_ITEMS.find((s) => s.key === key);
                      if (!item) return null;
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
                            "flex items-center gap-1.5 rounded-lg bg-white/[0.03] border px-2.5 py-2 transition-colors",
                            bodyDragOverKey === key ? "border-[var(--data-info-500)]" : "border-white/10",
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
                            className="shrink-0 cursor-grab text-[var(--text-tertiary)] transition-colors hover:text-white active:cursor-grabbing"
                          >
                            <GripVertical className="h-3.5 w-3.5" aria-hidden />
                          </button>
                          <span className="flex-1 text-xs text-gray-200">{item.label}</span>
                        </div>
                      );
                    });
                  })()}
                </div>

                <div className="space-y-2">
                  <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]">Tienda online</p>
                  {tiendaSectionOrder.map((key, idx) => {
                    const enabled = tiendaSectionsEnabled.includes(key);
                    const count = sectionContentCounts[key] ?? 0;
                    return (
                      <div key={key} className="flex items-center gap-1.5 rounded-lg bg-white/[0.03] border border-white/10 px-2.5 py-2">
                        <div className="flex flex-col">
                          <button
                            type="button"
                            onClick={() => moveTiendaSection(key, "up")}
                            disabled={idx === 0}
                            className="text-[var(--text-secondary)] hover:text-white disabled:opacity-20 transition-colors"
                          >
                            <ChevronUp className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveTiendaSection(key, "down")}
                            disabled={idx === tiendaSectionOrder.length - 1}
                            className="text-[var(--text-secondary)] hover:text-white disabled:opacity-20 transition-colors"
                          >
                            <ChevronDown className="h-3 w-3" />
                          </button>
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs text-gray-200 block">{TIENDA_SECTION_LABELS[key]}</span>
                          <span className={cn("text-[length:var(--ts-2xs)]", count > 0 ? "text-[var(--data-success-500)]" : "text-[var(--text-secondary)]")}>
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
                {/* Fuente — tarjetas renderizadas en su PROPIA tipografía (Brandon 2026-06-25) */}
                <div>
                  <p className={LABEL_CLASS}>Fuente</p>
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

                {/* Vista previa: título + cuerpo en la fuente elegida + redondez del botón */}
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3" style={{ fontFamily: EDITOR_FONT_MAP[draft.fontFamily]?.stack }}>
                  <p className="text-lg font-black text-white leading-tight">Bodega Buleje</p>
                  <p className="text-xs text-gray-400 mt-1">Frutas frescas, abarrotes y delivery rápido a tu puerta.</p>
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
              </>
            )}

            {panel === "historial" && (
              <div className="space-y-3">
                <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]">Versiones guardadas</p>
                {savedSnapshots.length === 0 ? (
                  <p className="text-xs text-[var(--text-secondary)]">Aún no hay versiones. Guarda cambios para crear una.</p>
                ) : (
                  savedSnapshots.map((snap, idx) => (
                    <div key={idx} className="rounded-lg bg-white/[0.03] border border-white/10 p-2.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{snap.savedAt}</span>
                        <button
                          type="button"
                          onClick={() => pushChange(snap.theme)}
                          className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-500)] hover:text-[var(--data-success-500)] transition-colors"
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
