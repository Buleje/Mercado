"use client";

import { LoadingState, SectionTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
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
    iconBg: "bg-[var(--data-warning-100)] text-[var(--data-warning)] dark:bg-[var(--data-warning)]/40 dark:text-[var(--data-warning)]",
  },
  {
    key: "hero",
    label: "Hero principal",
    description: "Banner grande con foto y llamada a la acción",
    icon: <Layout className="h-4 w-4" />,
    iconBg: "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]",
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
    iconBg: "bg-[var(--data-error-100)] text-[var(--data-error)] dark:bg-[var(--data-error)]/40 dark:text-[var(--data-error)]",
  },
  {
    key: "combos",
    label: "Combos",
    description: "Paquetes de productos con precio especial",
    icon: <Package className="h-4 w-4" />,
    iconBg: "bg-[var(--data-warning-100)] text-[var(--data-warning)] dark:bg-[var(--data-warning)]/40 dark:text-[var(--data-warning)]",
  },
  {
    key: "recipes",
    label: "Recetas",
    description: "Ideas de recetas peruanas con ingredientes de la bodega",
    icon: <BookOpen className="h-4 w-4" />,
    iconBg: "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]",
  },
  {
    key: "testimonials",
    label: "Testimonios",
    description: "Opiniones de clientes satisfechos",
    icon: <MessageSquare className="h-4 w-4" />,
    iconBg: "bg-[var(--data-info-100)] text-[var(--data-info)] dark:bg-[var(--data-info)]/40 dark:text-[var(--data-info)]",
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
    iconBg: "bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-400",
  },
  {
    key: "delivery_map",
    label: "Mapa de delivery",
    description: "Mapa interactivo con la zona de cobertura",
    icon: <MapIcon className="h-4 w-4" />,
    iconBg: "bg-[var(--data-info-100)] text-[var(--data-info)] dark:bg-[var(--data-info)]/40 dark:text-[var(--data-info)]",
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
    iconBg: "bg-[var(--data-warning-100)] text-[var(--data-warning)] dark:bg-[var(--data-warning)]/40 dark:text-[var(--data-warning)]",
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
    iconBg: "bg-[var(--data-error-100)] text-[var(--data-error)] dark:bg-[var(--data-error)]/40 dark:text-[var(--data-error)]",
    defaultEnabled: true,
  },
  {
    key: "flash_deals",
    label: "Ofertas Relámpago",
    description: "Ofertas por tiempo limitado con temporizador",
    icon: <Zap className="h-4 w-4" />,
    iconBg: "bg-[var(--data-warning-100)] text-[var(--data-warning)] dark:bg-[var(--data-warning)]/40 dark:text-[var(--data-warning)]",
    defaultEnabled: true,
  },
  {
    key: "popular_products",
    label: "Más Vendidos de la Semana",
    description: "Los productos que más se venden esta semana",
    icon: <TrendingUp className="h-4 w-4" />,
    iconBg: "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]",
    defaultEnabled: true,
  },
  {
    key: "featured_carousel",
    label: "Productos Destacados",
    description: "Carrusel de productos que quieres resaltar",
    icon: <ShoppingBag className="h-4 w-4" />,
    iconBg: "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]",
    defaultEnabled: true,
  },
  {
    key: "combos",
    label: "Combos Inteligentes",
    description: "Paquetes de productos con precio especial",
    icon: <Package className="h-4 w-4" />,
    iconBg: "bg-[var(--data-warning-100)] text-[var(--data-warning)] dark:bg-[var(--data-warning)]/40 dark:text-[var(--data-warning)]",
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
    iconBg: "bg-[var(--data-error-100)] text-[var(--data-error)] dark:bg-[var(--data-error)]/40 dark:text-[var(--data-error)]",
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
    iconBg: "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]",
  },
  {
    id: "recetas",
    label: "Recetas",
    description: "Ideas de recetas con ingredientes de la tienda",
    icon: <ChefHat className="h-4 w-4" />,
    iconBg: "bg-[var(--data-warning-100)] text-[var(--data-warning)] dark:bg-[var(--data-warning)]/40 dark:text-[var(--data-warning)]",
  },
  {
    id: "marketplace",
    label: "Marketplace",
    description: "Enlace al marketplace con todas las tiendas",
    icon: <Globe className="h-4 w-4" />,
    iconBg: "bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-400",
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
    iconBg: "bg-[var(--data-warning-100)] text-[var(--data-warning)] dark:bg-[var(--data-warning)]/40 dark:text-[var(--data-warning)]",
  },
  {
    id: "contacto",
    label: "Contacto",
    description: "Información de contacto y formulario",
    icon: <Mail className="h-4 w-4" />,
    iconBg: "bg-[var(--data-info-100)] text-[var(--data-info)] dark:bg-[var(--data-info)]/40 dark:text-[var(--data-info)]",
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
  const [loading, setLoading] = useState(true);

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
      .catch(() => {})
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

  return (
    <div className="modal-backdrop flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-card rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden border border-[var(--rule-base)] dark:border-card-border flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--rule-soft)] dark:border-card-border shrink-0">
          <div>
            <SectionTitle className="text-lg font-extrabold text-foreground">Editar sección</SectionTitle>
            <p className="text-xs text-muted mt-0.5">{sectionLabel}</p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-full flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-gray-100 dark:hover:bg-surface transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Section title */}
          <div>
            <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Título de la sección</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={sectionLabel}
              className="mt-1 w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>

          {/* Assigned products */}
          <div>
            <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
              Productos en esta sección ({assignedProducts.length})
            </label>
            {assignedProducts.length === 0 ? (
              <div className="mt-2 p-6 rounded-xl border border-dashed border-[var(--rule-base)] dark:border-card-border text-center">
                <Package className="h-8 w-8 mx-auto text-[var(--text-tertiary)] mb-2" />
                <p className="text-sm text-muted">No hay productos asignados</p>
                <p className="text-xs text-muted mt-1">Busca y agrega productos abajo</p>
              </div>
            ) : (
              <div className="mt-2 space-y-1.5">
                {assignedProducts.map((p, idx) => (
                  <div key={p.id} className="flex items-center gap-2 p-2 rounded-xl bg-gray-50 dark:bg-surface border border-[var(--rule-soft)] dark:border-card-border">
                    <div className="relative h-9 w-9 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                      {p.image ? (
                        <Image src={p.image} alt={p.name} fill className="object-cover" sizes="36px" />
                      ) : (
                        <div className="h-full flex items-center justify-center text-[var(--text-tertiary)]"><Package className="h-4 w-4" /></div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{p.name}</p>
                      <p className="text-xs text-primary font-bold">S/{p.price.toFixed(2)}</p>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button type="button" onClick={() => moveUp(idx)} disabled={idx === 0} className="h-7 w-7 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:text-foreground hover:bg-gray-200 dark:hover:bg-card transition-colors disabled:opacity-30">
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => moveDown(idx)} disabled={idx === assignedProducts.length - 1} className="h-7 w-7 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:text-foreground hover:bg-gray-200 dark:hover:bg-card transition-colors disabled:opacity-30">
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => removeProduct(p.id)} className="h-7 w-7 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--data-error)] hover:bg-[var(--data-error-50)] dark:hover:bg-[var(--data-error)]/20 transition-colors">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Search and add products */}
          <div>
            <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Agregar productos</label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar producto para agregar…"
                className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : (
              <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
                {available.slice(0, 20).map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addProduct(p.id)}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-primary/5 dark:hover:bg-primary/10 transition-colors text-left"
                  >
                    <div className="relative h-8 w-8 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                      {p.image ? (
                        <Image src={p.image} alt={p.name} fill className="object-cover" sizes="32px" />
                      ) : (
                        <div className="h-full flex items-center justify-center text-[var(--text-tertiary)]"><Package className="h-4 w-4" /></div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                    </div>
                    <span className="text-xs font-bold text-primary">S/{p.price.toFixed(2)}</span>
                    <Plus className="h-4 w-4 text-primary shrink-0" />
                  </button>
                ))}
                {available.length === 0 && (
                  <p className="text-center text-sm text-muted py-3">
                    {searchQuery ? "No se encontraron productos" : "Todos los productos ya están asignados"}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-6 py-4 border-t border-[var(--rule-soft)] dark:border-card-border flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-[var(--text-secondary)] dark:text-muted hover:bg-gray-100 dark:hover:bg-surface transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => onSave({ productIds, title: title.trim() || undefined })}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-white text-sm font-bold  hover:bg-primary/90 active:scale-95 transition-all"
          >
            <Save className="h-4 w-4" />
            Guardar sección
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Componente SortableRow (dnd-kit) ────────────────────────────────────────

function SortableRow({
  section,
  onToggle,
  onEdit,
}: {
  section: StorefrontSection | TiendaSection;
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
        "flex items-center gap-3 p-3.5 rounded-xl border transition-all duration-[var(--dur-fast)] select-none",
        section.enabled
          ? "bg-white dark:bg-card border-[var(--rule-base)] dark:border-card-border "
          : "bg-gray-50 dark:bg-surface border-[var(--rule-soft)] dark:border-card-border opacity-60",
        isDragging && "ring-2 ring-primary/40 bg-primary/5 dark:bg-primary/10"
      )}
    >
      {/* Drag handle */}
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing touch-none p-0.5 -m-0.5"
        aria-label={`Reordenar ${section.label}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)] shrink-0" />
      </button>

      {/* Icon */}
      <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", section.iconBg)}>
        {section.icon}
      </div>

      {/* Info — clickable to edit */}
      <div
        className={cn("flex-1 min-w-0", onEdit && "cursor-pointer hover:opacity-80")}
        onClick={onEdit}
      >
        <p className={cn("text-sm font-semibold leading-tight", section.enabled ? "text-foreground" : "text-muted")}>
          {section.label}
        </p>
        <p className="text-xs text-muted mt-0.5 truncate">{section.description}</p>
      </div>

      {/* Edit button */}
      {onEdit && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="h-7 w-7 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:text-primary hover:bg-primary/10 transition-colors shrink-0"
          aria-label={`Editar ${section.label}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Toggle */}
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 transition-colors duration-[var(--dur-base)]",
          section.enabled
            ? "bg-primary border-primary"
            : "bg-gray-200 dark:bg-gray-700 border-transparent"
        )}
        aria-label={section.enabled ? `Ocultar ${section.label}` : `Mostrar ${section.label}`}
        aria-pressed={section.enabled}
      >
        <span
          className={cn(
            "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-[var(--dur-base)]",
            section.enabled ? "translate-x-5" : "translate-x-0.5"
          )}
        />
      </button>
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

  // Guardar: persiste visibilidad + orden en storeTheme + navLinks
  const handleSave = useCallback(async () => {
    setSaving(true);
    const tiendaVisible = tiendaSections.filter((s) => s.enabled).map((s) => s.key);
    const tiendaOrder = tiendaSections.map((s) => s.key);
    const navLinksPayload = navItems.map(n => ({ id: n.id, visible: n.visible }));
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
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

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <SectionTitle className="text-lg font-extrabold text-foreground">Secciones de la tienda online</SectionTitle>
          <p className="text-sm text-muted mt-0.5">
            Activa, desactiva y reordena las secciones.{" "}
            <span className="font-semibold text-foreground">{enabledCount} de {totalCount}</span> {activeTab === "navegacion" ? "enlaces visibles" : "secciones visibles"}.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <a
            href="/tienda"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm font-semibold text-foreground hover:bg-gray-50 dark:hover:bg-surface transition-colors min-h-[44px]"
          >
            <Eye className="h-4 w-4" />
            <span className="hidden sm:inline">Vista previa</span>
          </a>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white transition-all min-h-[44px]",
              saved
                ? "bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)]"
                : "bg-primary hover:bg-primary/90 active:scale-[0.98]",
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
              ? "bg-white dark:bg-card text-foreground "
              : "text-muted hover:text-foreground"
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
              ? "bg-white dark:bg-card text-foreground "
              : "text-muted hover:text-foreground"
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
        <p className="text-xs text-foreground/70">
          {activeTab === "tienda"
            ? "Controla qué secciones ve el cliente en la tienda. Si desactivas una, el espacio se ajusta automáticamente."
            : "Elige qué enlaces aparecen en el menú de navegación de tu tienda."}
        </p>
      </div>

      {/* Lista de secciones con dnd-kit (Tienda tab) */}
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
            <div className="space-y-2">
              {tiendaSections.map((section) => (
                    <SortableRow
                      key={section.key}
                      section={section}
                      onToggle={() => toggleTiendaSection(section.key)}
                      onEdit={() => setEditingSection({ key: section.key, label: section.label })}
                    />
                  ))
              }
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        /* Lista de navegación (sin drag — solo toggle) */
        <div className="space-y-2">
          {navItems.map((item) => (
            <div
              key={item.id}
              className={cn(
                "flex items-center gap-3 p-3.5 rounded-xl border transition-all duration-[var(--dur-fast)]",
                item.visible
                  ? "bg-white dark:bg-card border-[var(--rule-base)] dark:border-card-border "
                  : "bg-gray-50 dark:bg-surface border-[var(--rule-soft)] dark:border-card-border opacity-60"
              )}
            >
              <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", item.iconBg)}>
                {item.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn("text-sm font-semibold leading-tight", item.visible ? "text-foreground" : "text-muted")}>
                  {item.label}
                </p>
                <p className="text-xs text-muted mt-0.5 truncate">{item.description}</p>
              </div>
              <button
                type="button"
                onClick={() => toggleNavItem(item.id)}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 transition-colors duration-[var(--dur-base)]",
                  item.visible
                    ? "bg-primary border-primary"
                    : "bg-gray-200 dark:bg-gray-700 border-transparent"
                )}
                aria-label={item.visible ? `Ocultar ${item.label}` : `Mostrar ${item.label}`}
                aria-pressed={item.visible}
              >
                <span
                  className={cn(
                    "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-[var(--dur-base)]",
                    item.visible ? "translate-x-5" : "translate-x-0.5"
                  )}
                />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-[var(--rule-soft)] dark:border-card-border">
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
          className="text-xs font-semibold text-muted hover:text-foreground hover:underline"
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
