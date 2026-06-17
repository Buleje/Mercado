"use client";

import { LoadingState, SectionTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback } from "react";
import { activateProps } from "@/components/admin/shared/a11y";
import Image from "next/image";
import { Field } from "@/components/admin/shared/Field";
import {
  Save, Eye, Loader2, Check, GripVertical,
  Megaphone, Layout, Grid3x3, ShoppingBag, Tag,
  Package, BookOpen, MessageSquare, HelpCircle,
  Phone, Map as MapIcon, ToggleLeft, ToggleRight,
  Zap, TrendingUp, Star, Clock, Heart, Home, Store, AlertTriangle,
  Navigation, ChefHat, Award, Mail, History, Globe,
  X, Search, Plus, ChevronUp, ChevronDown, Pencil,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type SectionKey =
  | "announcement"
  | "hero"
  | "categories"
  | "popular"
  | "deals"
  | "combos"
  | "recipes"
  | "testimonials"
  | "faq"
  | "contact"
  | "delivery_map";

export type TiendaSectionKey =
  | "daily_special"
  | "seasonal_promo"
  | "countdown"
  | "flash_deals"
  | "popular_products"
  | "featured_carousel"
  | "combos"
  | "recipes"
  | "favorites"
  | "recently_viewed"
  | "last_units";

type StorefrontSection = {
  key: SectionKey;
  label: string;
  description: string;
  icon: React.ReactNode;
  iconBg: string;
  enabled: boolean;
};

const SECTION_DEFAULTS: Omit<StorefrontSection, "enabled">[] = [
  {
    key: "announcement",
    label: "Banner de anuncio",
    description: "Barra superior con mensajes promocionales",
    icon: <Megaphone className="h-4 w-4" />,
    iconBg: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/40 dark:text-[var(--data-warning-500)]",
  },
  {
    key: "hero",
    label: "Hero principal",
    description: "Banner grande con foto y llamada a la acción",
    icon: <Layout className="h-4 w-4" />,
    iconBg: "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]",
  },
  {
    key: "categories",
    label: "Categorías",
    description: "Burbujas de categorías para explorar la tienda",
    icon: <Grid3x3 className="h-4 w-4" />,
    iconBg: "bg-[var(--surface-sunken)] text-[var(--text-primary)]",
  },
  {
    key: "popular",
    label: "Productos populares",
    description: "Grilla de productos más vendidos o destacados",
    icon: <ShoppingBag className="h-4 w-4" />,
    iconBg: "bg-primary/10 text-primary dark:bg-primary/20",
  },
  {
    key: "deals",
    label: "Ofertas del día",
    description: "Producto con descuento especial y cuenta regresiva",
    icon: <Tag className="h-4 w-4" />,
    iconBg: "bg-[var(--data-error-100)] text-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/40 dark:text-[var(--data-error-500)]",
  },
  {
    key: "combos",
    label: "Combos",
    description: "Paquetes de productos con precio especial",
    icon: <Package className="h-4 w-4" />,
    iconBg: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/40 dark:text-[var(--data-warning-500)]",
  },
  {
    key: "recipes",
    label: "Recetas",
    description: "Ideas de recetas peruanas con ingredientes de la bodega",
    icon: <BookOpen className="h-4 w-4" />,
    iconBg: "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]",
  },
  {
    key: "testimonials",
    label: "Testimonios",
    description: "Opiniones de clientes satisfechos",
    icon: <MessageSquare className="h-4 w-4" />,
    iconBg: "bg-[var(--data-info-100)] text-[var(--data-info-500)] dark:bg-[var(--data-info-500)]/40 dark:text-[var(--data-info-500)]",
  },
  {
    key: "faq",
    label: "Preguntas frecuentes",
    description: "Respuestas a las dudas más comunes de los clientes",
    icon: <HelpCircle className="h-4 w-4" />,
    iconBg: "bg-gray-100 text-[var(--text-secondary)] dark:bg-gray-800 dark:text-[var(--text-tertiary)]",
  },
  {
    key: "contact",
    label: "Contacto",
    description: "Formulario y datos de contacto de la bodega",
    icon: <Phone className="h-4 w-4" />,
    iconBg: "bg-teal-100 text-[var(--accent-dark)] dark:bg-teal-900/40 dark:text-teal-400",
  },
  {
    key: "delivery_map",
    label: "Mapa de delivery",
    description: "Mapa interactivo con la zona de cobertura",
    icon: <MapIcon className="h-4 w-4" />,
    iconBg: "bg-[var(--data-info-100)] text-[var(--data-info-500)] dark:bg-[var(--data-info-500)]/40 dark:text-[var(--data-info-500)]",
  },
];

// ── Secciones de la página de TIENDA (/tienda) ─────────────────────────────

type TiendaSection = {
  key: TiendaSectionKey;
  label: string;
  description: string;
  icon: React.ReactNode;
  iconBg: string;
  enabled: boolean;
  defaultEnabled: boolean;
};

const TIENDA_SECTION_DEFAULTS: Omit<TiendaSection, "enabled">[] = [
  {
    key: "daily_special",
    label: "Oferta Especial de Hoy",
    description: "El producto del día con precio especial",
    icon: <Star className="h-4 w-4" />,
    iconBg: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/40 dark:text-[var(--data-warning-500)]",
    defaultEnabled: true,
  },
  {
    key: "seasonal_promo",
    label: "Promo de Temporada",
    description: "Promoción estacional destacada",
    icon: <Tag className="h-4 w-4" />,
    iconBg: "bg-[var(--surface-sunken)] text-[var(--text-primary)]",
    defaultEnabled: true,
  },
  {
    key: "countdown",
    label: "Cuenta Regresiva",
    description: "Banner con cuenta atrás para ofertas limitadas",
    icon: <Clock className="h-4 w-4" />,
    iconBg: "bg-[var(--data-error-100)] text-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/40 dark:text-[var(--data-error-500)]",
    defaultEnabled: true,
  },
  {
    key: "flash_deals",
    label: "Ofertas Relámpago",
    description: "Ofertas por tiempo limitado con temporizador",
    icon: <Zap className="h-4 w-4" />,
    iconBg: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/40 dark:text-[var(--data-warning-500)]",
    defaultEnabled: true,
  },
  {
    key: "popular_products",
    label: "Más Vendidos de la Semana",
    description: "Los productos que más se venden esta semana",
    icon: <TrendingUp className="h-4 w-4" />,
    iconBg: "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]",
    defaultEnabled: true,
  },
  {
    key: "featured_carousel",
    label: "Productos Destacados",
    description: "Carrusel de productos que quieres resaltar",
    icon: <ShoppingBag className="h-4 w-4" />,
    iconBg: "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]",
    defaultEnabled: true,
  },
  {
    key: "combos",
    label: "Combos Inteligentes",
    description: "Paquetes de productos con precio especial",
    icon: <Package className="h-4 w-4" />,
    iconBg: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/40 dark:text-[var(--data-warning-500)]",
    defaultEnabled: true,
  },
  {
    key: "recipes",
    label: "Ideas para Cocinar",
    description: "Recetas peruanas con ingredientes de la bodega",
    icon: <BookOpen className="h-4 w-4" />,
    iconBg: "bg-lime-100 text-lime-600 dark:bg-lime-900/40 dark:text-lime-400",
    defaultEnabled: false,
  },
  {
    key: "favorites",
    label: "Mis Favoritos",
    description: "Productos que el cliente marcó como favoritos",
    icon: <Heart className="h-4 w-4" />,
    iconBg: "bg-[var(--surface-sunken)] text-[var(--text-primary)]",
    defaultEnabled: true,
  },
  {
    key: "recently_viewed",
    label: "Vistos Recientemente",
    description: "Productos que el cliente vio hace poco",
    icon: <Clock className="h-4 w-4" />,
    iconBg: "bg-slate-100 text-slate-600 dark:bg-slate-900/40 dark:text-slate-400",
    defaultEnabled: true,
  },
  {
    key: "last_units",
    label: "Últimas Unidades",
    description: "Productos con poco stock — incentiva compra por urgencia",
    icon: <AlertTriangle className="h-4 w-4" />,
    iconBg: "bg-[var(--data-error-100)] text-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/40 dark:text-[var(--data-error-500)]",
    defaultEnabled: true,
  },
];

// ── Navegación (items del menú) ────────────────────────────────────────────

type NavItem = {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  iconBg: string;
  visible: boolean;
};

const NAV_ITEM_DEFAULTS: Omit<NavItem, "visible">[] = [
  {
    id: "tienda",
    label: "Tienda",
    description: "Catálogo completo de productos",
    icon: <Store className="h-4 w-4" />,
    iconBg: "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]",
  },
  {
    id: "recetas",
    label: "Recetas",
    description: "Ideas de recetas con ingredientes de la tienda",
    icon: <ChefHat className="h-4 w-4" />,
    iconBg: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/40 dark:text-[var(--data-warning-500)]",
  },
  {
    id: "marketplace",
    label: "Marketplace",
    description: "Enlace al marketplace con todas las tiendas",
    icon: <Globe className="h-4 w-4" />,
    iconBg: "bg-teal-100 text-[var(--accent-dark)] dark:bg-teal-900/40 dark:text-teal-400",
  },
  {
    id: "historial",
    label: "Historial",
    description: "Historial de compras del cliente",
    icon: <History className="h-4 w-4" />,
    iconBg: "bg-[var(--surface-sunken)] text-[var(--text-primary)]",
  },
  {
    id: "categorias",
    label: "Categorías",
    description: "Menú de categorías en la navegación",
    icon: <Grid3x3 className="h-4 w-4" />,
    iconBg: "bg-[var(--surface-sunken)] text-[var(--text-primary)]",
  },
  {
    id: "beneficios",
    label: "Beneficios",
    description: "Sección de ¿Por qué elegirnos?",
    icon: <Award className="h-4 w-4" />,
    iconBg: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/40 dark:text-[var(--data-warning-500)]",
  },
  {
    id: "contacto",
    label: "Contacto",
    description: "Información de contacto y formulario",
    icon: <Mail className="h-4 w-4" />,
    iconBg: "bg-[var(--data-info-100)] text-[var(--data-info-500)] dark:bg-[var(--data-info-500)]/40 dark:text-[var(--data-info-500)]",
  },
];

// ── Utilidades ────────────────────────────────────────────────────────────────

function buildSectionsFromData(
  visibleKeys: SectionKey[],
  orderKeys: SectionKey[],
): StorefrontSection[] {
  const enabledSet = new Set<SectionKey>(
    visibleKeys.length > 0 ? visibleKeys : SECTION_DEFAULTS.map((s) => s.key)
  );
  const baseOrder = orderKeys.length > 0 ? orderKeys : SECTION_DEFAULTS.map((s) => s.key);
  const allKeys = SECTION_DEFAULTS.map((s) => s.key);
  const orderedKeys = [...baseOrder, ...allKeys.filter((k) => !baseOrder.includes(k))];

  // Deduplicar
  const unique = [...new Set(orderedKeys)];

  return unique
    .filter((key) => SECTION_DEFAULTS.some((s) => s.key === key))
    .map((key) => {
      const def = SECTION_DEFAULTS.find((s) => s.key === key)!;
      return { ...def, enabled: enabledSet.has(key) };
    });
}

function buildTiendaSectionsFromData(
  visibleKeys: TiendaSectionKey[],
  orderKeys: TiendaSectionKey[],
): TiendaSection[] {
  // If no config saved, use defaults (some disabled by default like recipes)
  const hasConfig = visibleKeys.length > 0;
  const enabledSet = hasConfig
    ? new Set<TiendaSectionKey>(visibleKeys)
    : new Set<TiendaSectionKey>(TIENDA_SECTION_DEFAULTS.filter(s => s.defaultEnabled).map(s => s.key));
  const baseOrder = orderKeys.length > 0 ? orderKeys : TIENDA_SECTION_DEFAULTS.map(s => s.key);
  const allKeys = TIENDA_SECTION_DEFAULTS.map(s => s.key);
  const orderedKeys = [...baseOrder, ...allKeys.filter(k => !baseOrder.includes(k))];
  const unique = [...new Set(orderedKeys)];
  return unique
    .filter(key => TIENDA_SECTION_DEFAULTS.some(s => s.key === key))
    .map(key => {
      const def = TIENDA_SECTION_DEFAULTS.find(s => s.key === key)!;
      return { ...def, enabled: enabledSet.has(key) };
    });
}

// ── Tipos de contenido por sección ─────────────────────────────────────────

type SectionContent = {
  productIds: number[];
  title?: string;
};

type SectionContentMap = Record<string, SectionContent>;

// ── Modal de edición de contenido de sección ───────────────────────────────

// Sugerencias de título por tipo de sección — el dueño puede tomarlas con 1 click.
const TITLE_SUGGESTIONS: Record<string, string[]> = {
  daily_special:     ["Solo por hoy", "Oferta del día", "Imperdible", "Hoy con descuento", "El especial de la casa"],
  seasonal_promo:    ["Promo de temporada", "Especial del mes", "Oferta limitada", "No te lo pierdas"],
  countdown:         ["Apurate, se termina", "Oferta por tiempo limitado", "Quedan pocas horas", "Última oportunidad"],
  flash_deals:       ["Ofertas flash", "Solo hoy a este precio", "Liquidación exprés", "Precio bomba"],
  popular_products:  ["Lo más vendido", "Los favoritos del barrio", "Top 10 de esta semana", "Lo que más se llevan"],
  featured_carousel: ["Productos destacados", "Recomendados para vos", "Selección de la casa", "Los mejor calificados"],
  combos:            ["Combos imperdibles", "Pack ahorrador", "Más por menos", "Combinaciones perfectas"],
  recipes:           ["Para cocinar hoy", "Ideas peruanas", "Recetas con ingredientes que tenemos", "Inspirate en la cocina"],
  favorites:         ["Tus favoritos", "Productos que te gustaron", "Tu lista guardada"],
  recently_viewed:   ["Vistos hace poco", "Tu historial reciente", "Donde te quedaste"],
  last_units:        ["Últimas unidades", "Quedan pocas", "Antes que se agote", "Stock final"],
};

// Tips contextuales por sección — guían al dueño sobre qué productos elegir.
const SECTION_TIPS: Record<string, string> = {
  daily_special:     "Tip: elegí 1 producto estrella con precio agresivo. Funciona mejor con stock limitado real.",
  seasonal_promo:    "Tip: agrupá 2-4 productos relacionados con la temporada (panetón, parrilla, helados, etc.).",
  countdown:         "Tip: usá esto para promos REALES con tiempo límite. Si abusas, el cliente deja de creerte.",
  flash_deals:       "Tip: 4-8 productos con descuento real que duren pocas horas. Genera FOMO sano.",
  popular_products:  "Tip: 6-12 best-sellers del último mes. Aumenta confianza social y ticket promedio.",
  featured_carousel: "Tip: elegí los productos con mejor margen y mejor foto — se llevan la atención del cliente.",
  combos:            "Tip: combinaciones que aumentan ticket: pollo + papa + bebida, salchipapa + gaseosa, etc.",
  recipes:           "Tip: recetas peruanas con ingredientes que TENÉS en stock. Linkea cada paso a un producto.",
  favorites:         "Tip: esta sección es automática — el cliente arma su lista. No necesita configuración.",
  recently_viewed:   "Tip: automática — recuerda los productos que el cliente vio hace poco.",
  last_units:        "Tip: productos con stock < 10 unidades. Genera urgencia honesta — si lo hace falso, te rebota.",
};

function SectionEditorModal({
  sectionKey,
  sectionLabel,
  initialContent,
  onSave,
  onClose,
}: {
  sectionKey: string;
  sectionLabel: string;
  initialContent: SectionContent;
  onSave: (content: SectionContent) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(initialContent.title || sectionLabel);
  const [productIds, setProductIds] = useState<number[]>(initialContent.productIds || []);
  const [allProducts, setAllProducts] = useState<Array<{ id: number; name: string; image: string; price: number; category: string }>>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("todos");
  const [loading, setLoading] = useState(true);

  const titleSuggestions = TITLE_SUGGESTIONS[sectionKey] ?? [];
  const sectionTip = SECTION_TIPS[sectionKey] ?? "";

  useEffect(() => {
    fetch("/api/products", { cache: "no-store" })
        .then(r => r.ok ? r.json() : [])
        .then((data: unknown) => {
          const parsed = Array.isArray(data)
            ? data
            : Array.isArray((data as { products?: unknown[] })?.products)
            ? (data as { products: unknown[] }).products
            : [];

          const normalized = parsed
            .map((item) => {
              const product = item as {
                id?: number | string;
                name?: string;
                image?: string;
                imageUrl?: string;
                price?: number | string;
                category?: string;
              };
              const id = Number(product.id);
              if (!Number.isFinite(id) || !product.name) return null;
              return {
                id,
                name: product.name,
                image: product.image ?? product.imageUrl ?? "",
                price: Number(product.price) || 0,
                category: product.category ?? "",
              };
            })
            .filter((item): item is { id: number; name: string; image: string; price: number; category: string } => item !== null);

          setAllProducts(normalized);
        })
      .catch((err) => console.warn("[StorefrontEditor] products fetch failed:", err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const assignedProducts = productIds
    .map(id => allProducts.find(p => p.id === id))
    .filter(Boolean) as typeof allProducts;

  const available = allProducts
    .filter(p => !productIds.includes(p.id))
    .filter(p => !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const addProduct = (id: number) => {
    setProductIds(prev => [...prev, id]);
  };

  const removeProduct = (id: number) => {
    setProductIds(prev => prev.filter(pid => pid !== id));
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    setProductIds(prev => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  };

  const moveDown = (index: number) => {
    if (index >= productIds.length - 1) return;
    setProductIds(prev => {
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  };

  // Categorías únicas del catálogo para los chips de filtro.
  const availableCategories = Array.from(
    new Set(allProducts.filter(p => !productIds.includes(p.id)).map(p => p.category || "Sin categoría"))
  ).sort();

  // Catálogo filtrado por categoría + search.
  const availableFiltered = available.filter(p => {
    if (categoryFilter === "todos") return true;
    return (p.category || "Sin categoría") === categoryFilter;
  });

  // Total estimado de productos asignados (suma de precios).
  const assignedTotal = assignedProducts.reduce((sum, p) => sum + p.price, 0);

  return (
    <div className="modal-backdrop flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[var(--surface-raised)] rounded-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden border-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] flex flex-col shadow-[var(--shadow-xl)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header con kicker descriptivo + counter */}
        <div className="flex items-center justify-between px-6 py-4 border-b-2 border-[var(--rule-soft)] dark:border-[var(--rule-base)] shrink-0 bg-linear-to-r from-primary/5 to-transparent dark:from-primary/10">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-primary">Editar sección</p>
              <h2 className="text-lg font-extrabold text-[var(--text-primary)] leading-tight">{sectionLabel}</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-xl flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-gray-100 dark:hover:bg-surface transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tip contextual */}
        {sectionTip && (
          <div className="px-6 py-3 bg-primary/5 dark:bg-primary/10 border-b border-primary/10 shrink-0">
            <p className="text-sm text-[var(--text-primary)]"><span className="font-bold">💡 </span>{sectionTip}</p>
          </div>
        )}

        {/* Body — Layout 2 columnas: izquierda título+asignados, derecha catálogo */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-2">

          {/* ── COLUMNA IZQUIERDA: TÍTULO + ASIGNADOS ──────────────── */}
          <div className="overflow-y-auto p-6 space-y-5 border-b lg:border-b-0 lg:border-r-2 border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
            {/* Título con sugerencias */}
            <div className="space-y-2">
              <Field label="Título de la sección" labelClassName="text-sm font-bold text-[var(--text-primary)]">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={sectionLabel}
                maxLength={50}
                className="w-full px-4 h-12 rounded-2xl border-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-base text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
              </Field>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted">Aparece arriba de la sección en tu tienda.</p>
                <span className="text-xs font-mono text-muted shrink-0">{(title || "").length}/50</span>
              </div>

              {/* Sugerencias clickeables */}
              {titleSuggestions.length > 0 && (
                <div className="pt-1">
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-muted mb-2">
                    Sugerencias para esta sección
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {titleSuggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setTitle(s)}
                        className={cn(
                          "px-3 h-8 rounded-full text-xs font-semibold border-2 transition-all",
                          title === s
                            ? "bg-primary text-white border-primary"
                            : "bg-[var(--surface-raised)] border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-primary)] hover:border-primary/40 hover:bg-primary/5"
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Productos asignados — header con count + total */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">Productos en esta sección</h3>
                  <span className="inline-flex items-center justify-center h-6 px-2 rounded-md bg-primary/10 text-primary text-xs font-bold tabular-nums">
                    {assignedProducts.length}
                  </span>
                </div>
                {assignedProducts.length > 0 && (
                  <span className="text-xs font-mono tabular-nums text-muted">
                    Total: <span className="font-bold text-[var(--text-primary)]">S/{assignedTotal.toFixed(2)}</span>
                  </span>
                )}
              </div>

              {assignedProducts.length === 0 ? (
                <div className="p-8 rounded-2xl border-2 border-dashed border-[var(--rule-base)] dark:border-[var(--rule-base)] text-center">
                  <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                    <Package className="h-7 w-7 text-primary" />
                  </div>
                  <p className="text-base font-bold text-[var(--text-primary)]">Sin productos todavía</p>
                  <p className="text-sm text-muted mt-1">Buscá y agregá productos del catálogo de la derecha.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {assignedProducts.map((p, idx) => (
                    <div key={p.id} className="group flex items-center gap-3 p-3 rounded-2xl bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:border-primary/40 transition-all">
                      <span className="inline-flex items-center justify-center min-w-[1.75rem] h-7 px-2 rounded-lg bg-primary/10 text-primary text-xs font-bold tabular-nums shrink-0">
                        {idx + 1}
                      </span>
                      <div className="relative h-12 w-12 rounded-xl overflow-hidden bg-gray-100 dark:bg-surface border border-[var(--rule-soft)] dark:border-[var(--rule-base)] shrink-0">
                        {p.image ? (
                          <Image src={p.image} alt={p.name} fill className="object-cover" sizes="48px" />
                        ) : (
                          <div className="h-full flex items-center justify-center text-[var(--text-tertiary)]"><Package className="h-5 w-5" /></div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-[var(--text-primary)] truncate leading-tight">{p.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-sm font-bold text-primary tabular-nums">S/{Number(p.price).toFixed(2)}</span>
                          {p.category && (
                            <>
                              <span className="text-xs text-muted">·</span>
                              <span className="text-xs text-muted truncate">{p.category}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => moveUp(idx)}
                          disabled={idx === 0}
                          className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-gray-100 dark:hover:bg-surface transition-colors disabled:opacity-25"
                          aria-label="Mover arriba"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveDown(idx)}
                          disabled={idx === assignedProducts.length - 1}
                          className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-gray-100 dark:hover:bg-surface transition-colors disabled:opacity-25"
                          aria-label="Mover abajo"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeProduct(p.id)}
                          className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] hover:bg-[var(--data-error-500)]/10 transition-colors"
                          aria-label="Quitar"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── COLUMNA DERECHA: CATÁLOGO ─────────────────────────── */}
          <div className="overflow-hidden flex flex-col">
            {/* Search bar grande */}
            <div className="p-6 pb-4 space-y-3 shrink-0 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
              <div>
                <span className="text-sm font-bold text-[var(--text-primary)]">Catálogo de productos</span>
                <p className="text-xs text-muted mt-0.5">Click en un producto para agregarlo a la sección.</p>
              </div>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted pointer-events-none" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar por nombre…"
                  className="w-full pl-12 pr-12 h-12 rounded-2xl border-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-base text-[var(--text-primary)] placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-gray-100 dark:hover:bg-surface text-muted hover:text-[var(--text-primary)]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Chips de categoría */}
              {availableCategories.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                  <button
                    type="button"
                    onClick={() => setCategoryFilter("todos")}
                    className={cn(
                      "shrink-0 px-3 h-8 rounded-full text-xs font-bold border-2 transition-all",
                      categoryFilter === "todos"
                        ? "bg-primary text-white border-primary"
                        : "bg-[var(--surface-raised)] border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-primary)] hover:border-primary/40"
                    )}
                  >
                    Todas
                  </button>
                  {availableCategories.map((cat) => {
                    const active = categoryFilter === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setCategoryFilter(cat)}
                        className={cn(
                          "shrink-0 px-3 h-8 rounded-full text-xs font-bold border-2 transition-all",
                          active
                            ? "bg-primary text-white border-primary"
                            : "bg-[var(--surface-raised)] border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-primary)] hover:border-primary/40"
                        )}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Catálogo grid scrolleable */}
            <div className="flex-1 overflow-y-auto p-6 pt-3">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : availableFiltered.length === 0 ? (
                <div className="text-center py-12 rounded-2xl border-2 border-dashed border-[var(--rule-base)] dark:border-[var(--rule-base)]">
                  <Search className="h-10 w-10 mx-auto text-muted mb-2" />
                  <p className="text-base font-bold text-[var(--text-primary)]">
                    {searchQuery || categoryFilter !== "todos" ? "Sin resultados" : "Todos los productos están asignados"}
                  </p>
                  <p className="text-sm text-muted mt-1">
                    {searchQuery || categoryFilter !== "todos" ? "Probá con otros filtros." : "Sumá más productos en Inventario."}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {availableFiltered.slice(0, 60).map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addProduct(p.id)}
                      className="group flex items-center gap-3 p-2.5 rounded-2xl border-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-primary hover:bg-primary/5 hover:shadow-md transition-all text-left"
                    >
                      <div className="relative h-12 w-12 rounded-xl overflow-hidden bg-gray-100 dark:bg-surface border border-[var(--rule-soft)] dark:border-[var(--rule-base)] shrink-0">
                        {p.image ? (
                          <Image src={p.image} alt={p.name} fill className="object-cover" sizes="48px" />
                        ) : (
                          <div className="h-full flex items-center justify-center text-[var(--text-tertiary)]"><Package className="h-5 w-5" /></div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-[var(--text-primary)] truncate leading-tight">{p.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-sm font-bold text-primary tabular-nums">S/{Number(p.price).toFixed(2)}</span>
                          {p.category && (
                            <>
                              <span className="text-xs text-muted">·</span>
                              <span className="text-xs text-muted truncate">{p.category}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-colors shrink-0">
                        <Plus className="h-4 w-4" />
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {availableFiltered.length > 60 && (
                <p className="text-xs text-center text-muted mt-4">
                  Mostrando primeros 60 — usá el buscador o filtros para encontrar más.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Footer con counter */}
        <div className="shrink-0 px-6 py-4 border-t-2 border-[var(--rule-soft)] dark:border-[var(--rule-base)] flex items-center justify-between gap-3 bg-gray-50/50 dark:bg-surface/30">
          <p className="text-sm text-muted">
            <span className="font-bold text-[var(--text-primary)]">{assignedProducts.length}</span> producto{assignedProducts.length !== 1 ? "s" : ""} en la sección
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-5 h-11 rounded-xl text-sm font-bold text-[var(--text-secondary)] dark:text-muted hover:bg-gray-100 dark:hover:bg-surface transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => onSave({ productIds, title: title.trim() || undefined })}
              className="flex items-center gap-2 px-6 h-11 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 active:scale-[0.98] transition-all shadow-md"
            >
              <Save className="h-4 w-4" />
              Guardar sección
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Mini-mockup visual de cada seccion ──────────────────────────────────────
// Renderiza una "stripe" que aproxima el layout real de cada seccion en la
// tienda. Asi el dueño no tipea a ciegas — ve qué bloque está activando.

function SectionThumbnail({ sectionKey }: { sectionKey: string }) {
  const cell = "rounded-md bg-linear-to-br from-gray-200 to-gray-300 dark:from-gray-600 dark:to-gray-700";
  const accent = "bg-primary/30";
  const muted = "rounded-full bg-gray-300 dark:bg-gray-600";

  switch (sectionKey) {
    // ── Storefront sections ──
    case "announcement":
      return (
        <div className="h-full w-full flex items-center justify-center bg-primary/15 px-2 gap-1">
          <Megaphone className="h-3 w-3 text-primary" />
          <div className={cn("h-1 w-2/3", muted)} />
        </div>
      );
    case "hero":
      return (
        <div className="h-full w-full grid grid-cols-5 gap-2 p-2">
          <div className="col-span-3 flex flex-col justify-center gap-1">
            <div className={cn("h-1.5 w-3/4", muted)} />
            <div className={cn("h-1 w-1/2", muted)} />
            <div className={cn("h-1.5 w-12 mt-0.5", accent, "rounded-full")} />
          </div>
          <div className="col-span-2 rounded-md bg-primary/20 flex items-center justify-center">
            <ShoppingBag className="h-4 w-4 text-primary/60" />
          </div>
        </div>
      );
    case "categories":
      return (
        <div className="h-full w-full flex items-center justify-around px-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col items-center gap-0.5">
              <div className="h-4 w-4 rounded-full bg-primary/30" />
              <div className={cn("h-0.5 w-4", muted)} />
            </div>
          ))}
        </div>
      );
    case "popular":
    case "popular_products":
    case "flash_deals":
    case "favorites":
    case "recently_viewed":
    case "last_units":
      return (
        <div className="h-full w-full grid grid-cols-4 gap-1.5 p-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={cn("relative", cell)}>
              {sectionKey === "last_units" && i < 2 && (
                <div className="absolute top-0.5 left-0.5 h-1 w-1 rounded-full bg-[var(--data-error-500)]" />
              )}
              {sectionKey === "favorites" && (
                <div className="absolute top-0.5 right-0.5 text-[length:var(--ts-2xs)]">♥</div>
              )}
            </div>
          ))}
        </div>
      );
    case "deals":
    case "daily_special":
      return (
        <div className="h-full w-full flex items-center gap-2 p-2">
          <div className={cn("h-12 w-12 shrink-0", cell, "bg-linear-to-br from-[var(--data-warning-500)]/40 to-[var(--data-error-500)]/40")} />
          <div className="flex-1 flex flex-col gap-1">
            <div className={cn("h-1.5 w-3/4", muted)} />
            <div className={cn("h-1 w-1/2", muted)} />
            <div className={cn("h-1.5 w-10 mt-0.5", "bg-[var(--data-error-500)]/40 rounded-full")} />
          </div>
        </div>
      );
    case "seasonal_promo":
      return (
        <div className="h-full w-full flex items-center justify-center bg-linear-to-r from-primary/30 via-primary/15 to-primary/30 px-2 gap-1.5">
          <Tag className="h-3.5 w-3.5 text-primary" />
          <div className={cn("h-1.5 w-1/3", muted)} />
        </div>
      );
    case "countdown":
      return (
        <div className="h-full w-full flex items-center justify-center bg-[var(--data-error-500)]/15 gap-1.5 px-2">
          <Clock className="h-3.5 w-3.5 text-[var(--data-error-500)]" />
          <div className="flex gap-0.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-3 w-4 rounded-sm bg-[var(--data-error-500)]/40 flex items-center justify-center">
                <span className="text-[length:var(--ts-2xs)] font-mono text-[var(--data-error-500)]">0{i}</span>
              </div>
            ))}
          </div>
        </div>
      );
    case "combos":
      return (
        <div className="h-full w-full grid grid-cols-3 gap-1.5 p-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className={cn("relative", cell)}>
              <div className="absolute top-0.5 left-0.5 h-2 w-2 rounded-full bg-[var(--data-warning-500)]/60 flex items-center justify-center">
                <Package className="h-1 w-1 text-white" />
              </div>
            </div>
          ))}
        </div>
      );
    case "recipes":
      return (
        <div className="h-full w-full grid grid-cols-3 gap-1.5 p-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className={cn("flex flex-col gap-0.5", cell, "p-1")}>
              <ChefHat className="h-2 w-2 text-white/70" />
            </div>
          ))}
        </div>
      );
    case "featured_carousel":
      return (
        <div className="h-full w-full flex items-center gap-1.5 p-2">
          <div className="text-[length:var(--ts-2xs)] text-muted">‹</div>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={cn("flex-1", cell)} />
          ))}
          <div className="text-[length:var(--ts-2xs)] text-muted">›</div>
        </div>
      );
    case "testimonials":
      return (
        <div className="h-full w-full grid grid-cols-3 gap-1.5 p-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-0.5 rounded-md border border-[var(--rule-soft)] dark:border-[var(--rule-base)] p-1">
              <div className="flex gap-0.5">
                {[0, 1, 2, 3, 4].map((s) => (
                  <Star key={s} className="h-1 w-1 fill-[var(--data-warning-500)] text-[var(--data-warning-500)]" />
                ))}
              </div>
              <div className={cn("h-0.5 w-full", muted)} />
              <div className={cn("h-0.5 w-2/3", muted)} />
            </div>
          ))}
        </div>
      );
    case "faq":
      return (
        <div className="h-full w-full flex flex-col gap-1 p-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between rounded border border-[var(--rule-soft)] dark:border-[var(--rule-base)] px-1.5 py-0.5">
              <div className={cn("h-1 w-1/2", muted)} />
              <ChevronDown className="h-2 w-2 text-muted" />
            </div>
          ))}
        </div>
      );
    case "contact":
      return (
        <div className="h-full w-full grid grid-cols-3 gap-1.5 p-2">
          <div className="flex flex-col items-center justify-center gap-0.5">
            <Phone className="h-3 w-3 text-primary" />
            <div className={cn("h-0.5 w-3/4", muted)} />
          </div>
          <div className="flex flex-col items-center justify-center gap-0.5">
            <Mail className="h-3 w-3 text-primary" />
            <div className={cn("h-0.5 w-3/4", muted)} />
          </div>
          <div className="flex flex-col items-center justify-center gap-0.5">
            <MapIcon className="h-3 w-3 text-primary" />
            <div className={cn("h-0.5 w-3/4", muted)} />
          </div>
        </div>
      );
    case "delivery_map":
      return (
        <div className="h-full w-full bg-linear-to-br from-primary/10 to-primary/30 flex items-center justify-center relative">
          <MapIcon className="h-5 w-5 text-primary/70" />
          <div className="absolute bottom-1 left-1 right-1 h-0.5 bg-white/30 rounded-full" />
        </div>
      );
    default:
      return (
        <div className="h-full w-full grid grid-cols-3 gap-1.5 p-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className={cn(cell)} />
          ))}
        </div>
      );
  }
}

// ── Categorias visuales para agrupar las secciones ──────────────────────────
// El array original sigue siendo plano (orden importa para dnd-kit). Esto solo
// agrupa visualmente para que el dueño escanee mas facil.

const SECTION_GROUPS: Record<string, { label: string; keys: readonly string[] }> = {
  promos: {
    label: "Promociones y ofertas",
    keys: ["daily_special", "seasonal_promo", "countdown", "flash_deals", "deals", "announcement"] as const,
  },
  productos: {
    label: "Productos",
    keys: ["popular_products", "popular", "featured_carousel", "combos", "categories", "hero"] as const,
  },
  engagement: {
    label: "Engagement y descubrimiento",
    keys: ["recipes", "favorites", "recently_viewed", "last_units", "testimonials"] as const,
  },
  ayuda: {
    label: "Ayuda y contacto",
    keys: ["faq", "contact", "delivery_map"] as const,
  },
};

function getSectionGroup(key: string): keyof typeof SECTION_GROUPS {
  for (const [groupKey, group] of Object.entries(SECTION_GROUPS)) {
    if (group.keys.includes(key)) return groupKey as keyof typeof SECTION_GROUPS;
  }
  return "engagement";
}

// ── Componente SortableRow (dnd-kit) ────────────────────────────────────────

function SortableRow({
  section,
  position,
  onToggle,
  onEdit,
}: {
  section: StorefrontSection | TiendaSection;
  position: number;
  onToggle: () => void;
  onEdit?: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.key });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.85 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group rounded-2xl border-2 transition-all duration-[var(--dur-fast)] select-none overflow-hidden",
        section.enabled
          ? "bg-[var(--surface-raised)] border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:border-primary/40 hover:shadow-md"
          : "bg-gray-50 dark:bg-surface border-dashed border-[var(--rule-soft)] dark:border-[var(--rule-base)] hover:opacity-100",
        isDragging && "ring-2 ring-primary/40 bg-primary/5 dark:bg-primary/10 shadow-xl scale-[1.01]"
      )}
    >
      {/* ── Top row: drag, icon, info, actions ────────────────────────── */}
      <div className="flex items-center gap-3 p-3.5">
        {/* Drag handle */}
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing touch-none p-1 -m-1 rounded-md hover:bg-gray-100 dark:hover:bg-surface transition-colors shrink-0"
          aria-label={`Reordenar ${section.label}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-5 w-5 text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)] dark:text-[var(--text-secondary)]" />
        </button>

        {/* Position pill — orden visual sobre el storefront */}
        <span
          className={cn(
            "inline-flex items-center justify-center min-w-[1.75rem] h-7 px-2 rounded-lg text-xs font-bold tabular-nums shrink-0 border",
            section.enabled
              ? "bg-primary/10 text-primary border-primary/20"
              : "bg-gray-100 dark:bg-gray-700 text-[var(--text-tertiary)] border-transparent"
          )}
          aria-label={`Posición ${position}`}
        >
          {position}
        </span>

        {/* Icon */}
        <div className={cn(
          "h-11 w-11 rounded-xl flex items-center justify-center shrink-0",
          section.iconBg,
          !section.enabled && "opacity-50"
        )}>
          {section.icon}
        </div>

        {/* Info — clickable to edit */}
        <div
          className={cn("flex-1 min-w-0", onEdit && "cursor-pointer")}
          {...(onEdit ? activateProps(onEdit) : {})}
        >
          <div className="flex items-center gap-2">
            <p className={cn("text-base font-bold leading-tight", section.enabled ? "text-[var(--text-primary)]" : "text-muted")}>
              {section.label}
            </p>
            {!section.enabled && (
              <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-[var(--text-tertiary)] shrink-0">
                Oculta
              </span>
            )}
          </div>
          <p className="text-sm text-muted leading-snug mt-0.5 line-clamp-1">{section.description}</p>
        </div>

        {/* Edit button */}
        {onEdit && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="h-9 w-9 rounded-xl flex items-center justify-center text-[var(--text-tertiary)] hover:text-primary hover:bg-primary/10 transition-colors shrink-0"
            aria-label={`Editar ${section.label}`}
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}

        {/* Toggle */}
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 transition-colors duration-[var(--dur-base)]",
            section.enabled
              ? "bg-primary border-primary"
              : "bg-gray-200 dark:bg-gray-700 border-transparent"
          )}
          aria-label={section.enabled ? `Ocultar ${section.label}` : `Mostrar ${section.label}`}
          aria-pressed={section.enabled}
        >
          <span
            className={cn(
              "inline-block h-4 w-4 rounded-full bg-white dark:bg-[var(--color-card)] shadow transition-transform duration-[var(--dur-base)]",
              section.enabled ? "translate-x-6" : "translate-x-1"
            )}
          />
        </button>
      </div>

      {/* ── Mini-mockup visual del bloque ─────────────────────────────── */}
      <div
        className={cn(
          "h-16 mx-3.5 mb-3.5 rounded-xl border overflow-hidden bg-linear-to-br from-gray-50 to-gray-100 dark:from-surface dark:to-card transition-all",
          section.enabled
            ? "border-[var(--rule-soft)] dark:border-[var(--rule-base)]"
            : "border-dashed border-[var(--rule-soft)] dark:border-[var(--rule-base)] opacity-50"
        )}
        aria-hidden="true"
      >
        <SectionThumbnail sectionKey={section.key} />
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function StorefrontEditor() {
  const [tiendaSections, setTiendaSections] = useState<TiendaSection[]>([]);
  const [navItems, setNavItems] = useState<NavItem[]>([]);
  const [activeTab, setActiveTab] = useState<"tienda" | "navegacion">("tienda");
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sectionContent, setSectionContent] = useState<SectionContentMap>({});
  const [editingSection, setEditingSection] = useState<{ key: string; label: string } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  // Cargar configuración actual
  useEffect(() => {
    setLoadingSettings(true);
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        // Tienda sections
        const tiendaVisible: TiendaSectionKey[] =
          (s?.storeTheme?.tiendaSections as TiendaSectionKey[] | undefined) ?? [];
        const tiendaOrder: TiendaSectionKey[] =
          (s?.storeTheme?.tiendaSectionOrder as TiendaSectionKey[] | undefined) ?? [];
        setTiendaSections(buildTiendaSectionsFromData(tiendaVisible, tiendaOrder));

        // Section content (per-section product assignments)
        const savedContent = (s?.storeTheme?.sectionContent as SectionContentMap | undefined) ?? {};
        setSectionContent(savedContent);

        // Nav links
        const savedNavLinks: Array<{ id: string; visible: boolean }> = Array.isArray(s?.navLinks) ? s.navLinks : [];
        const navSet = new Map(savedNavLinks.map(n => [n.id, n.visible] as [string, boolean]));
        setNavItems(NAV_ITEM_DEFAULTS.map(def => ({
          ...def,
          visible: navSet.has(def.id) ? navSet.get(def.id)! : (def.id !== "categorias"), // categorias off by default
        })));
      })
      .catch(() => {
        setTiendaSections(buildTiendaSectionsFromData([], []));
        setNavItems(NAV_ITEM_DEFAULTS.map(def => ({
          ...def,
          visible: def.id !== "categorias",
        })));
      })
      .finally(() => setLoadingSettings(false));
  }, []);

  const toggleTiendaSection = useCallback((key: TiendaSectionKey) => {
    setTiendaSections((prev) =>
      prev.map((s) => (s.key === key ? { ...s, enabled: !s.enabled } : s))
    );
    setSaved(false);
  }, []);

  const toggleNavItem = useCallback((id: string) => {
    setNavItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, visible: !n.visible } : n))
    );
    setSaved(false);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setTiendaSections((prev) => {
      const oldIndex = prev.findIndex((s) => s.key === active.id);
      const newIndex = prev.findIndex((s) => s.key === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
    setSaved(false);
  }, []);

  // Guardar: persiste visibilidad + orden en storeTheme + navLinks.
  // [BUG FIX 2026-05-05] Antes faltaba el header x-csrf-token → el proxy
  // devolvia 403 silenciosamente y el usuario nunca veia su cambio aplicado.
  // El catch generico tampoco distinguia el motivo del fallo.
  const handleSave = useCallback(async () => {
    setSaving(true);
    const tiendaVisible = tiendaSections.filter((s) => s.enabled).map((s) => s.key);
    const tiendaOrder = tiendaSections.map((s) => s.key);
    const navLinksPayload = navItems.map(n => ({ id: n.id, visible: n.visible }));
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          storeTheme: {
            tiendaSections: tiendaVisible,
            tiendaSectionOrder: tiendaOrder,
            sectionContent,
          },
          navLinks: navLinksPayload,
        }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      // silencioso — el usuario puede reintentar
    } finally {
      setSaving(false);
    }
  }, [tiendaSections, navItems, sectionContent]);

  const currentSections = activeTab === "tienda" ? tiendaSections : [];
  const enabledCount = activeTab === "navegacion"
    ? navItems.filter(n => n.visible).length
    : tiendaSections.filter((s) => s.enabled).length;
  const totalCount = activeTab === "navegacion" ? navItems.length : tiendaSections.length;

  if (loadingSettings) {
    return (
      <LoadingState />
    );
  }

  // Vista previa: detecta el tenant slug del URL (/t/[slug]/admin) o cae a /tienda.
  // [BUG FIX 2026-05-05] Antes el link era hardcoded a "/tienda" y abria la
  // tienda de "main" aun cuando el dueño estaba editando otra tienda.
  let previewHref = "/tienda";
  if (typeof window !== "undefined") {
    const m = window.location.pathname.match(/^\/t\/([^/]+)/);
    if (m?.[1]) previewHref = `/t/${m[1]}/tienda`;
  }

  return (
    <div className="space-y-5">
      {/* Header — solo contador y CTAs (titulo lo da el wrapper de StoreCustomizer) */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center justify-center min-w-[2.5rem] h-10 px-3 rounded-xl bg-primary/10 text-primary font-bold text-base">
            {enabledCount}
            <span className="text-muted/70 mx-1">/</span>
            <span className="text-muted">{totalCount}</span>
          </span>
          <p className="text-sm text-muted">
            {activeTab === "navegacion" ? "enlaces visibles en el menú" : "secciones visibles en la tienda"}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <a
            href={previewHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3.5 h-10 rounded-xl border-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm font-semibold text-[var(--text-primary)] hover:bg-gray-50 dark:hover:bg-surface hover:border-primary/40 transition-colors"
          >
            <Eye className="h-4 w-4" />
            <span className="hidden sm:inline">Vista previa</span>
          </a>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={cn(
              "flex items-center gap-1.5 px-4 h-10 rounded-xl text-sm font-bold text-white transition-all",
              saved
                ? "bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)]"
                : "bg-primary hover:bg-primary/90 active:scale-[0.98] shadow-md",
              saving && "opacity-70 cursor-not-allowed"
            )}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : saved ? (
              <Check className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving ? "Guardando..." : saved ? "Guardado" : "Guardar"}
          </button>
        </div>
      </div>

      {/* Page tabs: Tienda vs Navegación */}
      <div className="flex gap-1 p-1 bg-gray-100 dark:bg-surface rounded-xl">
        <button
          type="button"
          onClick={() => setActiveTab("tienda")}
          className={cn(
            "flex items-center gap-2 flex-1 justify-center px-4 py-2 rounded-lg text-sm font-semibold transition-all",
            activeTab === "tienda"
              ? "bg-[var(--surface-raised)] text-[var(--text-primary)] "
              : "text-muted hover:text-[var(--text-primary)]"
          )}
        >
          <Store className="h-4 w-4" />
          Tienda
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("navegacion")}
          className={cn(
            "flex items-center gap-2 flex-1 justify-center px-4 py-2 rounded-lg text-sm font-semibold transition-all",
            activeTab === "navegacion"
              ? "bg-[var(--surface-raised)] text-[var(--text-primary)] "
              : "text-muted hover:text-[var(--text-primary)]"
          )}
        >
          <Navigation className="h-4 w-4" />
          Navegación
        </button>
      </div>

      {/* Info tip */}
      <div className="flex items-start gap-2 bg-primary/5 dark:bg-primary/10 border border-primary/15 rounded-xl px-4 py-3">
        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
          <ToggleLeft className="h-4 w-4 text-primary" />
          <ToggleRight className="h-4 w-4 text-primary" />
        </div>
        <p className="text-xs text-[var(--text-primary)]/70">
          {activeTab === "tienda"
            ? "Controla qué secciones ve el cliente en la tienda. Si desactivas una, el espacio se ajusta automáticamente."
            : "Elige qué enlaces aparecen en el menú de navegación de tu tienda."}
        </p>
      </div>

      {/* Lista de secciones con dnd-kit (Tienda tab) — agrupada por categoria */}
      {activeTab !== "navegacion" ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={currentSections.map((s) => s.key)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-6">
              {(() => {
                // Agrupamos visualmente sin alterar el orden funcional
                // (dnd-kit sigue trabajando sobre el array plano).
                const groups = ["promos", "productos", "engagement", "ayuda"] as const;
                const indexMap = new Map(tiendaSections.map((s, i) => [s.key, i + 1]));
                return groups.map((groupKey) => {
                  const sectionsInGroup = tiendaSections.filter((s) => getSectionGroup(s.key) === groupKey);
                  if (sectionsInGroup.length === 0) return null;
                  const enabledInGroup = sectionsInGroup.filter((s) => s.enabled).length;
                  return (
                    <section key={groupKey} className="space-y-2.5">
                      <header className="flex items-center justify-between gap-2 px-1">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                          {SECTION_GROUPS[groupKey].label}
                        </h3>
                        <span className="text-xs font-mono tabular-nums text-muted shrink-0">
                          {enabledInGroup}/{sectionsInGroup.length}
                        </span>
                      </header>
                      {/* Grid 2-col en >= xl, single col en mobile/tablet */}
                      <div className="grid gap-2 grid-cols-1 xl:grid-cols-2">
                        {sectionsInGroup.map((section) => (
                          <SortableRow
                            key={section.key}
                            section={section}
                            position={indexMap.get(section.key) ?? 0}
                            onToggle={() => toggleTiendaSection(section.key)}
                            onEdit={() => setEditingSection({ key: section.key, label: section.label })}
                          />
                        ))}
                      </div>
                    </section>
                  );
                });
              })()}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        /* Lista de navegación (sin drag — solo toggle).
           Replica el estilo visual del tab Tienda + agrega un preview real
           del menu navbar arriba para que el dueño vea exactamente qué
           cambia cuando activa/desactiva un link. */
        <div className="space-y-5">
          {/* ── Preview del menu navbar real ────────────────────────── */}
          <div className="rounded-2xl border-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-linear-to-br from-gray-50 to-gray-100 dark:from-surface dark:to-card overflow-hidden">
            <div className="px-4 py-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-muted border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] bg-white/50 dark:bg-[var(--surface-raised)]/50">
              Vista previa de tu menú
            </div>
            <div className="px-4 py-3 flex items-center gap-2.5 flex-wrap">
              {navItems.filter(i => i.visible).length === 0 ? (
                <span className="text-xs text-muted italic">Sin enlaces visibles. El menú estará vacío.</span>
              ) : (
                navItems.filter(i => i.visible).map((item) => (
                  <span
                    key={item.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--surface-raised)] border border-[var(--rule-soft)] dark:border-[var(--rule-base)] text-sm font-semibold text-[var(--text-primary)]"
                  >
                    <span className={cn("h-4 w-4 rounded flex items-center justify-center", item.iconBg)}>
                      {item.icon}
                    </span>
                    {item.label}
                  </span>
                ))
              )}
            </div>
          </div>

          {/* ── Lista editable — grid 2-col en >= xl ─────────────────── */}
          <div className="grid gap-2 grid-cols-1 xl:grid-cols-2">
            {navItems.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "group flex items-center gap-3 p-4 rounded-2xl border-2 transition-all duration-[var(--dur-fast)]",
                  item.visible
                    ? "bg-[var(--surface-raised)] border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:border-primary/40 hover:shadow-md"
                    : "bg-gray-50 dark:bg-surface border-dashed border-[var(--rule-soft)] dark:border-[var(--rule-base)] opacity-70 hover:opacity-100"
                )}
              >
                <div className={cn(
                  "h-11 w-11 rounded-xl flex items-center justify-center shrink-0",
                  item.iconBg,
                  !item.visible && "opacity-50"
                )}>
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={cn("text-base font-bold leading-tight", item.visible ? "text-[var(--text-primary)]" : "text-muted")}>
                      {item.label}
                    </p>
                    {!item.visible && (
                      <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-[var(--text-tertiary)] shrink-0">
                        Oculto
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted leading-snug mt-0.5 line-clamp-1">{item.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleNavItem(item.id)}
                  className={cn(
                    "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 transition-colors duration-[var(--dur-base)]",
                    item.visible
                      ? "bg-primary border-primary"
                      : "bg-gray-200 dark:bg-gray-700 border-transparent"
                  )}
                  aria-label={item.visible ? `Ocultar ${item.label}` : `Mostrar ${item.label}`}
                  aria-pressed={item.visible}
                >
                  <span
                    className={cn(
                      "inline-block h-4 w-4 rounded-full bg-white dark:bg-[var(--color-card)] shadow transition-transform duration-[var(--dur-base)]",
                      item.visible ? "translate-x-6" : "translate-x-1"
                    )}
                  />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
        <button
          type="button"
          onClick={() => {
            if (activeTab === "tienda") {
              setTiendaSections((prev) => prev.map((s) => ({ ...s, enabled: true })));
            } else {
              setNavItems((prev) => prev.map((n) => ({ ...n, visible: true })));
            }
            setSaved(false);
          }}
          className="text-xs font-semibold text-primary hover:underline"
        >
          Activar todo
        </button>
        <button
          type="button"
          onClick={() => {
            if (activeTab === "tienda") {
              setTiendaSections((prev) => prev.map((s) => ({ ...s, enabled: false })));
            } else {
              setNavItems((prev) => prev.map((n) => ({ ...n, visible: false })));
            }
            setSaved(false);
          }}
          className="text-xs font-semibold text-muted hover:text-[var(--text-primary)] hover:underline"
        >
          Desactivar todo
        </button>
      </div>

      {/* Section editor modal */}
      {editingSection && (
        <SectionEditorModal
          sectionKey={editingSection.key}
          sectionLabel={editingSection.label}
          initialContent={sectionContent[editingSection.key] || { productIds: [] }}
          onSave={(content) => {
            setSectionContent(prev => ({ ...prev, [editingSection.key]: content }));
            setEditingSection(null);
            setSaved(false);
          }}
          onClose={() => setEditingSection(null)}
        />
      )}
    </div>
  );
}
