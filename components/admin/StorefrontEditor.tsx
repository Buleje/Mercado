"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Save, Eye, Loader2, Check, GripVertical,
  Megaphone, Layout, Grid3x3, ShoppingBag, Tag,
  Package, BookOpen, MessageSquare, HelpCircle,
  Phone, Map, ToggleLeft, ToggleRight,
} from "lucide-react";
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
    iconBg: "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400",
  },
  {
    key: "hero",
    label: "Hero principal",
    description: "Banner grande con foto y llamada a la acción",
    icon: <Layout className="h-4 w-4" />,
    iconBg: "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400",
  },
  {
    key: "categories",
    label: "Categorías",
    description: "Burbujas de categorías para explorar la tienda",
    icon: <Grid3x3 className="h-4 w-4" />,
    iconBg: "bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400",
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
    iconBg: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400",
  },
  {
    key: "combos",
    label: "Combos",
    description: "Paquetes de productos con precio especial",
    icon: <Package className="h-4 w-4" />,
    iconBg: "bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400",
  },
  {
    key: "recipes",
    label: "Recetas",
    description: "Ideas de recetas peruanas con ingredientes de la bodega",
    icon: <BookOpen className="h-4 w-4" />,
    iconBg: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400",
  },
  {
    key: "testimonials",
    label: "Testimonios",
    description: "Opiniones de clientes satisfechos",
    icon: <MessageSquare className="h-4 w-4" />,
    iconBg: "bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-400",
  },
  {
    key: "faq",
    label: "Preguntas frecuentes",
    description: "Respuestas a las dudas más comunes de los clientes",
    icon: <HelpCircle className="h-4 w-4" />,
    iconBg: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
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
    icon: <Map className="h-4 w-4" />,
    iconBg: "bg-cyan-100 text-cyan-600 dark:bg-cyan-900/40 dark:text-cyan-400",
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

  // Usar el orden guardado si existe; si no, orden por defecto
  const baseOrder = orderKeys.length > 0 ? orderKeys : SECTION_DEFAULTS.map((s) => s.key);

  // Agregar al final cualquier sección que no esté en el orden (ej. nuevas)
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

// ── Componente SortableRow (dnd-kit) ────────────────────────────────────────

function SortableRow({
  section,
  onToggle,
}: {
  section: StorefrontSection;
  onToggle: () => void;
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
        "flex items-center gap-3 p-3.5 rounded-xl border transition-all duration-150 select-none",
        section.enabled
          ? "bg-white dark:bg-card border-gray-200 dark:border-card-border shadow-sm"
          : "bg-gray-50 dark:bg-surface border-gray-100 dark:border-card-border opacity-60",
        isDragging && "ring-2 ring-primary/40 bg-primary/5 dark:bg-primary/10 shadow-lg"
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
        <GripVertical className="h-4 w-4 text-gray-300 dark:text-gray-600 shrink-0" />
      </button>

      {/* Icon */}
      <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", section.iconBg)}>
        {section.icon}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-semibold leading-tight", section.enabled ? "text-foreground" : "text-muted")}>
          {section.label}
        </p>
        <p className="text-xs text-muted mt-0.5 truncate">{section.description}</p>
      </div>

      {/* Toggle */}
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 transition-colors duration-200",
          section.enabled
            ? "bg-primary border-primary"
            : "bg-gray-200 dark:bg-gray-700 border-transparent"
        )}
        aria-label={section.enabled ? `Ocultar ${section.label}` : `Mostrar ${section.label}`}
        aria-pressed={section.enabled}
      >
        <span
          className={cn(
            "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200",
            section.enabled ? "translate-x-5" : "translate-x-0.5"
          )}
        />
      </button>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function StorefrontEditor() {
  const [sections, setSections] = useState<StorefrontSection[]>([]);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  // Cargar configuración actual
  useEffect(() => {
    setLoadingSettings(true);
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        // Leer secciones visibles y orden
        const visibleKeys: SectionKey[] =
          (s?.storeTheme?.sections as SectionKey[] | undefined) ??
          (s?.homepage?.visibleSections as SectionKey[] | undefined) ??
          [];
        const orderKeys: SectionKey[] =
          (s?.storeTheme?.sectionOrder as SectionKey[] | undefined) ?? [];
        setSections(buildSectionsFromData(visibleKeys, orderKeys));
      })
      .catch(() => {
        setSections(buildSectionsFromData([], []));
      })
      .finally(() => setLoadingSettings(false));
  }, []);

  const toggleSection = useCallback((key: SectionKey) => {
    setSections((prev) =>
      prev.map((s) => (s.key === key ? { ...s, enabled: !s.enabled } : s))
    );
    setSaved(false);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setSections((prev) => {
      const oldIndex = prev.findIndex((s) => s.key === active.id);
      const newIndex = prev.findIndex((s) => s.key === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
    setSaved(false);
  }, []);

  // Guardar: persiste visibilidad + orden en storeTheme
  const handleSave = useCallback(async () => {
    setSaving(true);
    const visibleSections = sections.filter((s) => s.enabled).map((s) => s.key);
    const sectionOrder = sections.map((s) => s.key);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeTheme: {
            sections: visibleSections,
            sectionOrder,
          },
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
  }, [sections]);

  const enabledCount = sections.filter((s) => s.enabled).length;

  if (loadingSettings) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-extrabold text-foreground">Secciones de la tienda online</h2>
          <p className="text-sm text-muted mt-0.5">
            Activa, desactiva y reordena las secciones de tu página principal.{" "}
            <span className="font-semibold text-foreground">{enabledCount} de {sections.length}</span> secciones visibles.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-card-border text-sm font-semibold text-foreground hover:bg-gray-50 dark:hover:bg-surface transition-colors min-h-[44px]"
          >
            <Eye className="h-4 w-4" />
            <span className="hidden sm:inline">Vista previa</span>
          </a>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all min-h-[44px]",
              saved
                ? "bg-emerald-500 hover:bg-emerald-600"
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

      {/* Info tip */}
      <div className="flex items-start gap-2 bg-primary/5 dark:bg-primary/10 border border-primary/15 rounded-xl px-4 py-3">
        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
          <ToggleLeft className="h-4 w-4 text-primary" />
          <ToggleRight className="h-4 w-4 text-primary" />
        </div>
        <p className="text-xs text-foreground/70">
          Arrastra las filas para reordenar las secciones. El orden y visibilidad se aplican en la tienda al guardar.
        </p>
      </div>

      {/* Lista de secciones con dnd-kit */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sections.map((s) => s.key)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {sections.map((section) => (
              <SortableRow
                key={section.key}
                section={section}
                onToggle={() => toggleSection(section.key)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-card-border">
        <button
          type="button"
          onClick={() => {
            setSections((prev) => prev.map((s) => ({ ...s, enabled: true })));
            setSaved(false);
          }}
          className="text-xs font-semibold text-primary hover:underline"
        >
          Activar todo
        </button>
        <button
          type="button"
          onClick={() => {
            setSections((prev) => prev.map((s) => ({ ...s, enabled: false })));
            setSaved(false);
          }}
          className="text-xs font-semibold text-muted hover:text-foreground hover:underline"
        >
          Desactivar todo
        </button>
      </div>
    </div>
  );
}
