"use client";

import React from "react";
import { CardTitle } from "@buleje/design-system";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
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
import {
  ChevronDown,
  GripVertical,
  Search,
  RotateCcw,
  Eye,
  EyeOff,
  Check,
  Sparkles,
  X,
  Palette,
  Layout,
  PanelTop,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TabCategory } from "@/app/admin/_lib/tab-categories";
import type { Tab } from "@/app/admin/_lib/tabs.types";

// ─── Types ───────────────────────────────────────────────────────────────────

export type SidebarTheme = "light" | "dark" | "cristal" | "shaded";

export type AccentColor = "teal" | "emerald" | "sky" | "violet" | "amber" | "rose";
export type Density = "compact" | "normal" | "spacious";
export type IconStyle = "colored" | "monochrome";

export interface SidebarExtendedConfig {
  hiddenCategories: Set<string>;
  hiddenSubTabs: Set<Tab>;
  categoryOrder: string[];
  theme: SidebarTheme;
  accent: AccentColor;
  density: Density;
  iconStyle: IconStyle;
  applyToHeader: boolean;
}

type SidebarConfiguratorProps = {
  allCategories: TabCategory[];
  hiddenCategories: Set<string>;
  hiddenSubTabs: Set<Tab>;
  categoryOrder: string[];
  theme: SidebarTheme;
  accent?: AccentColor;
  density?: Density;
  iconStyle?: IconStyle;
  applyToHeader?: boolean;
  allTabs: readonly { id: Tab; label: string; icon: React.ElementType }[];
  allowedTabs: Tab[];
  onSave: (config: SidebarExtendedConfig) => void;
  onCancel: () => void;
  /** Callback opcional: cada cambio del draft → el parent aplica en vivo. */
  onLiveDraftChange?: (draft: SidebarExtendedConfig) => void;
};

// ─── Accent color palette ────────────────────────────────────────────────────

const ACCENT_COLORS: Array<{ id: AccentColor; label: string; hex: string; ring: string }> = [
  { id: "teal",    label: "Teal",    hex: "#00B4A6", ring: "ring-teal-400" },
  { id: "emerald", label: "Verde",   hex: "#10B981", ring: "ring-emerald-400" },
  { id: "sky",     label: "Cielo",   hex: "#0EA5E9", ring: "ring-sky-400" },
  { id: "violet",  label: "Violeta", hex: "#8B5CF6", ring: "ring-violet-400" },
  { id: "amber",   label: "Ámbar",   hex: "#F59E0B", ring: "ring-amber-400" },
  { id: "rose",    label: "Rosa",    hex: "#F43F5E", ring: "ring-rose-400" },
];

// ─── Diseños preestablecidos ─────────────────────────────────────────────────

interface Preset {
  id: string;
  label: string;
  description: string;
  theme: SidebarTheme;
  accent: AccentColor;
  density: Density;
  iconStyle: IconStyle;
  applyToHeader: boolean;
}

const PRESETS: Preset[] = [
  {
    id: "buleje",
    label: "Buleje",
    description: "Paleta de marca, íconos coloridos, densidad normal.",
    theme: "cristal",
    accent: "teal",
    density: "normal",
    iconStyle: "colored",
    applyToHeader: false,
  },
  {
    id: "ejecutivo",
    label: "Ejecutivo",
    description: "Oscuro elegante, ámbar, monocromo, compacto.",
    theme: "dark",
    accent: "amber",
    density: "compact",
    iconStyle: "monochrome",
    applyToHeader: true,
  },
  {
    id: "sereno",
    label: "Sereno",
    description: "Fondo claro, azul cielo, amplio y descansado.",
    theme: "light",
    accent: "sky",
    density: "spacious",
    iconStyle: "colored",
    applyToHeader: false,
  },
  {
    id: "vibrante",
    label: "Vibrante",
    description: "Marca con rosa, íconos coloridos, barra superior teñida.",
    theme: "cristal",
    accent: "rose",
    density: "normal",
    iconStyle: "colored",
    applyToHeader: true,
  },
];

// ─── Sortable Category Item ──────────────────────────────────────────────────

function SortableCategoryItem({
  category,
  isVisible,
  onToggleVisible,
  isExpanded,
  onToggleExpand,
  hasMultipleTabs,
  visibleSubCount,
  totalSubCount,
  children,
}: {
  category: TabCategory;
  isVisible: boolean;
  onToggleVisible: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  hasMultipleTabs: boolean;
  visibleSubCount: number;
  totalSubCount: number;
  children?: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
  });

  const style = { transform: CSS.Transform.toString(transform), transition };
  const CategoryIcon = category.icon;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-lg transition-all border border-transparent bg-zinc-850",
        isDragging && "opacity-70 border-primary/50 shadow-xl",
        !isVisible && "opacity-55",
      )}
    >
      <div className="flex items-center gap-3 py-2.5 px-3">
        <button
          type="button"
          onClick={onToggleVisible}
          className={cn(
            "h-9 w-9 rounded-md flex items-center justify-center shrink-0 transition-all",
            isVisible
              ? "bg-primary/20 text-primary hover:bg-primary/30"
              : "bg-zinc-800 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300",
          )}
          title={isVisible ? "Ocultar módulo" : "Mostrar módulo"}
          aria-pressed={isVisible}
        >
          {isVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>

        <CategoryIcon className="h-5 w-5 text-zinc-300 shrink-0" />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-zinc-50 truncate leading-tight">
            {category.label}
          </p>
          {hasMultipleTabs && (
            <p className="text-xs text-zinc-400 mt-0.5 tabular-nums">
              {visibleSubCount} de {totalSubCount} sub-secciones visibles
            </p>
          )}
        </div>

        {hasMultipleTabs && (
          <button
            onClick={onToggleExpand}
            className="p-2 rounded-md hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
            aria-label="Expandir sub-módulos"
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform duration-[var(--dur-base)]",
                isExpanded && "rotate-180",
              )}
            />
          </button>
        )}

        <button
          {...attributes}
          {...listeners}
          className="p-2 rounded-md cursor-grab active:cursor-grabbing hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors touch-none"
          aria-label="Arrastrar para reordenar"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </div>

      {hasMultipleTabs && (
        <div
          className="grid transition-[grid-template-rows] duration-[var(--dur-base)] ease-in-out"
          style={{ gridTemplateRows: isExpanded ? "1fr" : "0fr" }}
        >
          <div className="overflow-hidden">
            <div className="pl-14 pr-3 pb-2 space-y-0.5">{children}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Theme preview card (live) ───────────────────────────────────────────────

function ThemePreview({
  theme,
  accent,
  selected,
}: {
  theme: SidebarTheme;
  accent: AccentColor;
  selected: boolean;
}) {
  const styles: Record<string, { bg: string; text: string; border: string; activeBg: string }> = {
    cristal: {
      bg: "bg-[#0b1f2b]",
      text: "text-white/70",
      border: "border-white/10",
      activeBg: "bg-white/10",
    },
    shaded: {
      bg: "bg-[#0b1f2b]",
      text: "text-white/70",
      border: "border-white/10",
      activeBg: "bg-white/10",
    },
    dark: {
      bg: "bg-zinc-950",
      text: "text-zinc-400",
      border: "border-white/5",
      activeBg: "bg-white/10",
    },
    light: {
      bg: "bg-white",
      text: "text-zinc-500",
      border: "border-zinc-200",
      activeBg: "bg-zinc-100",
    },
  };
  const s = styles[theme] ?? styles.cristal;
  const accentHex = ACCENT_COLORS.find((c) => c.id === accent)?.hex ?? "#00B4A6";

  return (
    <div
      className={cn(
        "rounded-md p-2 border transition-all",
        s.bg,
        s.border,
        selected && "ring-2 ring-offset-2 ring-offset-zinc-900",
      )}
      style={selected ? { boxShadow: `0 0 0 2px ${accentHex}` } : undefined}
    >
      <div
        className="text-[10px] px-2 py-1 rounded font-semibold flex items-center gap-1"
        style={{
          color: theme === "light" ? accentHex : "#ffffff",
          background:
            theme === "light" ? `${accentHex}1A` : `${accentHex}33`,
        }}
      >
        <span
          className="h-0.5 w-1.5 rounded-full"
          style={{ background: accentHex }}
          aria-hidden
        />
        Inicio
      </div>
      <div className={cn("text-[10px] px-2 py-1 mt-0.5", s.text)}>Ventas</div>
      <div className={cn("text-[10px] px-2 py-1", s.text)}>Compras</div>
    </div>
  );
}

// ─── Section header (jerarquía visual uniforme) ──────────────────────────────

function SectionHeader({ icon: Icon, title, hint }: { icon: React.ElementType; title: string; hint?: string }) {
  return (
    <div className="mb-2">
      <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-zinc-400">
        <Icon className="h-3 w-3 text-primary" strokeWidth={2.5} />
        {title}
      </h3>
      {hint && <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{hint}</p>}
    </div>
  );
}

// ─── Toggle switch estilo iOS ────────────────────────────────────────────────

function Switch({ checked, onChange, label, description, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; id?: string }) {
  return (
    <label
      htmlFor={id}
      className="flex items-start gap-3 py-2 px-3 rounded-md hover:bg-zinc-800/70 cursor-pointer transition-colors"
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        id={id}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-5 w-9 rounded-full shrink-0 mt-0.5 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50",
          checked ? "bg-primary" : "bg-zinc-700",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform",
            checked && "translate-x-4",
          )}
        />
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-zinc-100 leading-tight">{label}</p>
        {description && (
          <p className="text-xs text-zinc-400 mt-0.5 leading-snug">{description}</p>
        )}
      </div>
    </label>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function SidebarConfigurator({
  allCategories,
  hiddenCategories: initialHiddenCategories,
  hiddenSubTabs: initialHiddenSubTabs,
  categoryOrder: initialOrder,
  theme: initialTheme,
  accent: initialAccent = "teal",
  density: initialDensity = "normal",
  iconStyle: initialIconStyle = "colored",
  applyToHeader: initialApplyToHeader = false,
  allTabs,
  allowedTabs,
  onSave,
  onCancel,
  onLiveDraftChange,
}: SidebarConfiguratorProps) {
  // ── Snapshot estable del estado inicial al MONTAR.
  //    Necesario porque el padre actualiza `theme/accent/...` props en tiempo
  //    real vía `onLiveDraftChange` (live preview), por lo que las props
  //    `initial*` se reescriben a cada cambio. Sin este snapshot, `isDirty`
  //    siempre devolvía false → el botón "Aplicar cambios" nunca se activaba.
  const baselineRef = React.useRef({
    hiddenCategories: new Set(initialHiddenCategories),
    hiddenSubTabs: new Set(initialHiddenSubTabs),
    order: [...initialOrder],
    theme: initialTheme,
    accent: initialAccent,
    density: initialDensity,
    iconStyle: initialIconStyle,
    applyToHeader: initialApplyToHeader,
  });

  // ── Draft state ──
  const [draftHidden, setDraftHidden] = React.useState<Set<string>>(
    () => new Set(initialHiddenCategories),
  );
  const [draftHiddenSubs, setDraftHiddenSubs] = React.useState<Set<Tab>>(
    () => new Set(initialHiddenSubTabs),
  );
  const [draftOrder, setDraftOrder] = React.useState<string[]>(() => [...initialOrder]);
  const [draftTheme, setDraftTheme] = React.useState<SidebarTheme>(initialTheme);
  const [draftAccent, setDraftAccent] = React.useState<AccentColor>(initialAccent);
  const [draftDensity, setDraftDensity] = React.useState<Density>(initialDensity);
  const [draftIconStyle, setDraftIconStyle] = React.useState<IconStyle>(initialIconStyle);
  const [draftApplyToHeader, setDraftApplyToHeader] = React.useState<boolean>(initialApplyToHeader);
  const [expandedCats, setExpandedCats] = React.useState<Set<string>>(new Set());
  const [query, setQuery] = React.useState("");

  // ── Aplicar preset ──
  const applyPreset = React.useCallback((p: Preset) => {
    setDraftTheme(p.theme);
    setDraftAccent(p.accent);
    setDraftDensity(p.density);
    setDraftIconStyle(p.iconStyle);
    setDraftApplyToHeader(p.applyToHeader);
  }, []);

  // ── Detectar qué preset coincide con el estado actual (si alguno) ──
  const activePresetId = React.useMemo(() => {
    const match = PRESETS.find(
      (p) =>
        p.theme === (draftTheme === "shaded" ? "cristal" : draftTheme) &&
        p.accent === draftAccent &&
        p.density === draftDensity &&
        p.iconStyle === draftIconStyle &&
        p.applyToHeader === draftApplyToHeader,
    );
    return match?.id ?? null;
  }, [draftTheme, draftAccent, draftDensity, draftIconStyle, draftApplyToHeader]);

  // ── Esc para cancelar (UX) ──
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel]);

  // ── Live preview: notificar cada cambio al parent ──
  React.useEffect(() => {
    if (!onLiveDraftChange) return;
    onLiveDraftChange({
      hiddenCategories: draftHidden,
      hiddenSubTabs: draftHiddenSubs,
      categoryOrder: draftOrder,
      theme: draftTheme,
      accent: draftAccent,
      density: draftDensity,
      iconStyle: draftIconStyle,
      applyToHeader: draftApplyToHeader,
    });
  }, [
    draftHidden, draftHiddenSubs, draftOrder, draftTheme, draftAccent,
    draftDensity, draftIconStyle, draftApplyToHeader, onLiveDraftChange,
  ]);

  const isDirty = React.useMemo(() => {
    const base = baselineRef.current;
    // Normalizar alias legacy "shaded" → "cristal" para evitar falsos positivos
    // cuando initial llega como "shaded" y el preset setea "cristal".
    const normTheme = (t: SidebarTheme) => (t === "shaded" ? "cristal" : t);
    if (normTheme(draftTheme) !== normTheme(base.theme)) return true;
    if (draftAccent !== base.accent) return true;
    if (draftDensity !== base.density) return true;
    if (draftIconStyle !== base.iconStyle) return true;
    if (draftApplyToHeader !== base.applyToHeader) return true;
    if (draftOrder.join(",") !== base.order.join(",")) return true;
    if (draftHidden.size !== base.hiddenCategories.size) return true;
    if (draftHiddenSubs.size !== base.hiddenSubTabs.size) return true;
    for (const k of draftHidden) if (!base.hiddenCategories.has(k)) return true;
    for (const k of draftHiddenSubs) if (!base.hiddenSubTabs.has(k)) return true;
    return false;
  }, [
    draftHidden, draftHiddenSubs, draftOrder, draftTheme, draftAccent, draftDensity,
    draftIconStyle, draftApplyToHeader,
  ]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const orderedCategories = React.useMemo(() => {
    const map = new Map(allCategories.map((c) => [c.id, c]));
    const result: TabCategory[] = [];
    for (const id of draftOrder) {
      const cat = map.get(id);
      if (cat) result.push(cat);
    }
    for (const cat of allCategories) {
      if (!draftOrder.includes(cat.id)) result.push(cat);
    }
    return result;
  }, [allCategories, draftOrder]);

  const filteredCategories = React.useMemo(() => {
    if (!query.trim()) return orderedCategories;
    const q = query.trim().toLowerCase();
    return orderedCategories.filter((cat) => {
      if (cat.label.toLowerCase().includes(q)) return true;
      const subs = cat.tabs
        .map((t) => allTabs.find((tab) => tab.id === t))
        .filter(Boolean);
      return subs.some((s) => s!.label.toLowerCase().includes(q));
    });
  }, [orderedCategories, query, allTabs]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setDraftOrder((prev) => {
        const oldIndex = prev.indexOf(active.id as string);
        const newIndex = prev.indexOf(over.id as string);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  const toggleCategoryVisible = (catId: string) => {
    setDraftHidden((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  const toggleSubTabVisible = (tabId: Tab) => {
    setDraftHiddenSubs((prev) => {
      const next = new Set(prev);
      if (next.has(tabId)) next.delete(tabId);
      else next.add(tabId);
      return next;
    });
  };

  const toggleExpand = (catId: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  const handleReset = () => {
    setDraftHidden(new Set());
    setDraftHiddenSubs(new Set());
    setDraftOrder(allCategories.map((c) => c.id));
    setDraftTheme("cristal");
    setDraftAccent("teal");
    setDraftDensity("normal");
    setDraftIconStyle("colored");
    setDraftApplyToHeader(false);
  };

  const handleShowAll = () => {
    setDraftHidden(new Set());
    setDraftHiddenSubs(new Set());
  };

  const handleSave = () => {
    onSave({
      hiddenCategories: draftHidden,
      hiddenSubTabs: draftHiddenSubs,
      categoryOrder: draftOrder,
      theme: draftTheme,
      accent: draftAccent,
      density: draftDensity,
      iconStyle: draftIconStyle,
      applyToHeader: draftApplyToHeader,
    });
  };

  const totalCategories = allCategories.length;
  const visibleCategories = totalCategories - draftHidden.size;
  const themeNormalized = draftTheme === "shaded" ? "cristal" : draftTheme;

  return (
    <div className="flex flex-col h-full bg-zinc-900 text-zinc-200">
      {/* ── Header ── */}
      <div className="px-5 pt-4 pb-3 border-b border-zinc-800 shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <CardTitle as="h2" className="text-base font-bold text-white leading-tight">
              Personaliza tu navegación
            </CardTitle>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              <span className="font-semibold text-zinc-200 tabular-nums">{visibleCategories}</span>
              {" de "}
              <span className="tabular-nums">{totalCategories}</span>
              {" módulos visibles · arrastra para reordenar"}
            </p>
            <p className="text-[10px] text-primary/80 mt-1.5 flex items-center gap-1">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-primary animate-pulse" aria-hidden />
              Preview en vivo · Esc para cancelar
            </p>
          </div>
          <button
            onClick={onCancel}
            className="h-9 w-9 rounded-md flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors shrink-0"
            title="Cerrar"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Búsqueda ── */}
        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" aria-hidden />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar módulo..."
            className="w-full bg-zinc-800 text-zinc-100 placeholder-zinc-500 text-sm rounded-md pl-9 pr-8 py-2 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded flex items-center justify-center text-zinc-500 hover:text-zinc-300"
              aria-label="Limpiar búsqueda"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* ── Quick actions ── */}
        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={handleShowAll}
            className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-zinc-200 bg-zinc-800 hover:bg-zinc-700 rounded-md py-2 transition-colors"
          >
            <Eye className="h-3.5 w-3.5" />
            Mostrar todo
          </button>
          <button
            onClick={handleReset}
            className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-zinc-200 bg-zinc-800 hover:bg-zinc-700 rounded-md py-2 transition-colors"
            title="Restablecer al diseño por defecto"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Restablecer
          </button>
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {/* ── Sección: Diseños preestablecidos (primera — alto impacto) ── */}
        <div className="px-4 py-4 border-b border-zinc-800">
          <SectionHeader
            icon={Sparkles}
            title="Diseños"
            hint="Looks curados · aplica todo con un clic."
          />
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map((p) => {
              const selected = activePresetId === p.id;
              const presetAccent = ACCENT_COLORS.find((c) => c.id === p.accent)?.hex ?? "#00B4A6";
              return (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p)}
                  className={cn(
                    "rounded-md border px-3 py-2.5 text-left transition-all",
                    selected
                      ? "border-primary/60 bg-primary/10"
                      : "border-zinc-700 hover:border-zinc-500 bg-zinc-800/40",
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ background: presetAccent }}
                      aria-hidden
                    />
                    <p className="text-sm font-semibold text-zinc-50 leading-tight truncate">
                      {p.label}
                    </p>
                    {selected && (
                      <Check className="h-3.5 w-3.5 text-primary ml-auto shrink-0" strokeWidth={2.5} />
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 leading-snug">{p.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Sección: Módulos ── */}
        <div className="px-4 py-4 border-b border-zinc-800">
          <SectionHeader icon={Layout} title="Módulos y orden" hint="Activa, oculta o reordena los módulos de tu navegación." />
          <div className="space-y-1">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext
                items={filteredCategories.map((c) => c.id)}
                strategy={verticalListSortingStrategy}
              >
                {filteredCategories.length === 0 ? (
                  <p className="text-center text-xs text-zinc-500 py-6">
                    Sin resultados para &quot;{query}&quot;
                  </p>
                ) : (
                  filteredCategories.map((category) => {
                    const visibleTabs = category.tabs.filter((t) => allowedTabs.includes(t as Tab));
                    const hasMultipleTabs = visibleTabs.length > 1;
                    const isCatVisible = !draftHidden.has(category.id);
                    const visibleSubCount = visibleTabs.filter((t) => !draftHiddenSubs.has(t as Tab)).length;

                    return (
                      <SortableCategoryItem
                        key={category.id}
                        category={category}
                        isVisible={isCatVisible}
                        onToggleVisible={() => toggleCategoryVisible(category.id)}
                        isExpanded={expandedCats.has(category.id)}
                        onToggleExpand={() => toggleExpand(category.id)}
                        hasMultipleTabs={hasMultipleTabs}
                        visibleSubCount={visibleSubCount}
                        totalSubCount={visibleTabs.length}
                      >
                        {hasMultipleTabs &&
                          visibleTabs.map((tabId) => {
                            const tabInfo = allTabs.find((t) => t.id === tabId);
                            if (!tabInfo) return null;
                            const SubIcon = tabInfo.icon;
                            const isSubVisible = !draftHiddenSubs.has(tabId as Tab);
                            return (
                              <button
                                type="button"
                                key={tabId}
                                onClick={() => toggleSubTabVisible(tabId as Tab)}
                                className={cn(
                                  "w-full flex items-center gap-2.5 py-1.5 px-2 rounded-md transition-all text-left",
                                  isSubVisible
                                    ? "text-zinc-100 hover:bg-zinc-800"
                                    : "text-zinc-500 hover:bg-zinc-800/60",
                                )}
                              >
                                <span
                                  className={cn(
                                    "h-4 w-4 rounded flex items-center justify-center shrink-0 border",
                                    isSubVisible
                                      ? "bg-primary/25 border-primary/50 text-primary"
                                      : "bg-zinc-800 border-zinc-600 text-transparent",
                                  )}
                                >
                                  {isSubVisible && <Check className="h-3 w-3" strokeWidth={3} />}
                                </span>
                                <SubIcon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                                <span className="text-xs truncate">{tabInfo.label}</span>
                              </button>
                            );
                          })}
                      </SortableCategoryItem>
                    );
                  })
                )}
              </SortableContext>
            </DndContext>
          </div>
        </div>

        {/* ── Sección: Apariencia ── */}
        <div className="px-4 py-4 border-b border-zinc-800 space-y-4">
          <SectionHeader icon={Sparkles} title="Apariencia" hint="Ajusta el tema visual y los colores a tu gusto." />

          {/* Tema */}
          <div>
            <p className="text-xs font-semibold text-zinc-300 mb-2">Tema de fondo</p>
            <div className="grid grid-cols-3 gap-2">
              {(["cristal", "dark", "light"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setDraftTheme(t)}
                  className={cn(
                    "rounded-md border p-2 text-left transition-all",
                    themeNormalized === t
                      ? "border-primary/60 bg-primary/10"
                      : "border-zinc-700 hover:border-zinc-500 bg-zinc-800/40",
                  )}
                >
                  <ThemePreview theme={t} accent={draftAccent} selected={themeNormalized === t} />
                  <p className="text-xs font-semibold mt-2 text-zinc-100">
                    {t === "cristal" ? "Marca" : t === "dark" ? "Oscuro" : "Claro"}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Color de acento */}
          <div>
            <p className="text-xs font-semibold text-zinc-300 mb-2 flex items-center gap-1.5">
              <Palette className="h-3 w-3" />
              Color de acento
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              {ACCENT_COLORS.map((c) => {
                const selected = draftAccent === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setDraftAccent(c.id)}
                    className={cn(
                      "h-9 w-9 rounded-full transition-all relative",
                      selected && "ring-2 ring-offset-2 ring-offset-zinc-900",
                      selected && c.ring,
                    )}
                    style={{ background: c.hex }}
                    title={c.label}
                    aria-label={`Color ${c.label}`}
                    aria-pressed={selected}
                  >
                    {selected && (
                      <Check className="h-4 w-4 text-white absolute inset-0 m-auto" strokeWidth={3} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Estilo de íconos */}
          <div>
            <p className="text-xs font-semibold text-zinc-300 mb-2">Estilo de íconos</p>
            <div className="grid grid-cols-2 gap-2">
              {(["colored", "monochrome"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setDraftIconStyle(s)}
                  className={cn(
                    "rounded-md border px-3 py-2.5 text-left transition-all",
                    draftIconStyle === s
                      ? "border-primary/60 bg-primary/10 text-zinc-100"
                      : "border-zinc-700 hover:border-zinc-500 bg-zinc-800/40 text-zinc-300",
                  )}
                >
                  <p className="text-sm font-semibold">
                    {s === "colored" ? "Colorido" : "Monocromo"}
                  </p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {s === "colored" ? "Cada módulo con color distinto" : "Todos en un solo tono"}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Densidad */}
          <div>
            <p className="text-xs font-semibold text-zinc-300 mb-2">Densidad</p>
            <div className="grid grid-cols-3 gap-2">
              {(["compact", "normal", "spacious"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDraftDensity(d)}
                  className={cn(
                    "rounded-md border py-2 text-center text-xs font-semibold transition-all",
                    draftDensity === d
                      ? "border-primary/60 bg-primary/10 text-zinc-100"
                      : "border-zinc-700 hover:border-zinc-500 bg-zinc-800/40 text-zinc-300",
                  )}
                >
                  {d === "compact" ? "Compacta" : d === "normal" ? "Normal" : "Amplia"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Sección: Barra superior ── */}
        <div className="px-4 py-4">
          <SectionHeader
            icon={PanelTop}
            title="Barra superior"
            hint="Elige si tu configuración también afecta al encabezado del panel."
          />
          <Switch
            id="apply-to-header"
            checked={draftApplyToHeader}
            onChange={setDraftApplyToHeader}
            label="Aplicar tema a la barra superior"
            description={
              draftApplyToHeader
                ? "La barra superior heredará el tema y el color de acento."
                : "La barra superior conservará su apariencia neutral por defecto."
            }
          />
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="px-4 py-3 space-y-2 border-t border-zinc-800 bg-zinc-900 shrink-0">
        <button
          onClick={handleSave}
          disabled={!isDirty}
          className={cn(
            "rounded-lg py-2.5 w-full font-semibold text-sm transition-all",
            isDirty
              ? "bg-primary text-white hover:bg-primary/90 shadow-[0_4px_14px_rgba(0,180,166,0.35)]"
              : "bg-zinc-800 text-zinc-500 cursor-not-allowed",
          )}
        >
          {isDirty ? "Aplicar cambios" : "Sin cambios"}
        </button>
        <button
          onClick={onCancel}
          className="border border-zinc-700 text-zinc-300 hover:bg-zinc-800 rounded-lg py-2.5 w-full text-sm font-medium transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
