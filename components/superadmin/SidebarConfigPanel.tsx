"use client";

/**
 * SidebarConfigPanel — configurador completo del sidebar del superadmin.
 *
 * Espeja la UX del SidebarConfigurator del panel del negocio:
 *   - Hide/show por item
 *   - Drag & drop para reordenar (dnd-kit)
 *   - Theme: light / dark / cristal / shaded
 *   - Accent color: teal / emerald / sky / violet / amber / rose
 *   - Density: compact / normal / spacious
 *   - Icon style: colored / monochrome
 *   - Presets: Buleje / Ejecutivo / Sereno / Vibrante
 *
 * Persistencia: localStorage. SuperAdminShell.tsx escucha estos cambios via
 * CustomEvent("superadmin-nav-config-changed") y aplica los CSS vars.
 */

import { useEffect, useState } from "react";
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
  Eye,
  EyeOff,
  GripVertical,
  RotateCcw,
  Check,
  Palette,
  Layout,
  Sparkles,
} from "@buleje/design-system/icons";

// ─── Types ───────────────────────────────────────────────────────────────────

export type SidebarTheme = "light" | "dark" | "cristal" | "shaded" | "buleje";
export type AccentColor = "teal" | "emerald" | "sky" | "violet" | "amber" | "rose";
export type Density = "compact" | "normal" | "spacious";
export type IconStyle = "colored" | "monochrome";

export interface SidebarPrefs {
  hidden: string[];
  order: string[];
  theme: SidebarTheme;
  accent: AccentColor;
  density: Density;
  iconStyle: IconStyle;
}

interface NavMeta {
  label: string;
  href: string;
}

interface Props {
  items: NavMeta[];
}

// ─── Storage keys ────────────────────────────────────────────────────────────

const KEYS = {
  hidden: "superadmin-nav-hidden",
  order: "superadmin-nav-order",
  theme: "superadmin-nav-theme",
  accent: "superadmin-nav-accent",
  density: "superadmin-nav-density",
  iconStyle: "superadmin-nav-icon-style",
} as const;

// Brandon mayo 2026: default cambiado a preset "Ejecutivo" — dark + amber +
// density compact. El preset "Buleje" sigue disponible pero ya no es default.
const DEFAULTS: SidebarPrefs = {
  hidden: [],
  order: [],
  theme: "dark",
  accent: "amber",
  density: "compact",
  iconStyle: "monochrome",
};

function readPrefs(): SidebarPrefs {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    return {
      hidden: JSON.parse(localStorage.getItem(KEYS.hidden) ?? "[]"),
      order: JSON.parse(localStorage.getItem(KEYS.order) ?? "[]"),
      theme: (localStorage.getItem(KEYS.theme) as SidebarTheme) ?? DEFAULTS.theme,
      accent: (localStorage.getItem(KEYS.accent) as AccentColor) ?? DEFAULTS.accent,
      density: (localStorage.getItem(KEYS.density) as Density) ?? DEFAULTS.density,
      iconStyle: (localStorage.getItem(KEYS.iconStyle) as IconStyle) ?? DEFAULTS.iconStyle,
    };
  } catch {
    return DEFAULTS;
  }
}

function persist(prefs: SidebarPrefs) {
  localStorage.setItem(KEYS.hidden, JSON.stringify(prefs.hidden));
  localStorage.setItem(KEYS.order, JSON.stringify(prefs.order));
  localStorage.setItem(KEYS.theme, prefs.theme);
  localStorage.setItem(KEYS.accent, prefs.accent);
  localStorage.setItem(KEYS.density, prefs.density);
  localStorage.setItem(KEYS.iconStyle, prefs.iconStyle);
  window.dispatchEvent(new CustomEvent("superadmin-nav-config-changed"));
}

// ─── Palette ─────────────────────────────────────────────────────────────────

const ACCENT_COLORS: Array<{ id: AccentColor; label: string; hex: string }> = [
  { id: "teal",    label: "Teal",    hex: "#00A0A0" },
  { id: "emerald", label: "Verde",   hex: "#10B981" },
  { id: "sky",     label: "Cielo",   hex: "#0EA5E9" },
  { id: "violet",  label: "Violeta", hex: "#8B5CF6" },
  { id: "amber",   label: "Ámbar",   hex: "#0d9488" },
  { id: "rose",    label: "Rosa",    hex: "#F43F5E" },
];

const THEMES: Array<{ id: SidebarTheme; label: string; preview: string }> = [
  { id: "buleje",  label: "Buleje",  preview: "bg-[linear-gradient(135deg,#0b1f2b_0%,#00A0A0_100%)] border border-[#00A0A0]/40" },
  { id: "light",   label: "Claro",   preview: "bg-white border border-gray-200" },
  { id: "dark",    label: "Oscuro",  preview: "bg-zinc-900 border border-zinc-700" },
  { id: "cristal", label: "Cristal", preview: "bg-linear-to-br from-white/80 to-white/40 border border-white/40 backdrop-blur" },
  { id: "shaded",  label: "Sombra",  preview: "bg-linear-to-b from-zinc-100 to-zinc-200 border border-zinc-300" },
];

const DENSITIES: Density[] = ["compact", "normal", "spacious"];
const ICON_STYLES: IconStyle[] = ["colored", "monochrome"];

const PRESETS: Array<{ id: string; label: string; description: string; swatch: string; prefs: Partial<SidebarPrefs> }> = [
  {
    id: "buleje",
    label: "Buleje",
    description: "Editorial slate-deep · teal vibrante · branded total",
    swatch: "linear-gradient(135deg, #0b1f2b 0%, #00A0A0 100%)",
    // Theme dedicado "buleje" — sidebar branded SIEMPRE oscuro editorial con
    // teal #00A0A0 (color de marca real), independiente del light/dark del shell.
    // Render en SuperAdminShell.tsx → sidebarBgClass case isBuleje.
    prefs: { theme: "buleje", accent: "teal", density: "normal", iconStyle: "monochrome" },
  },
  {
    id: "ejecutivo",
    label: "Ejecutivo",
    description: "Oscuro · ámbar · compacto",
    swatch: "linear-gradient(135deg, #18181b 0%, #27272a 100%)",
    prefs: { theme: "dark", accent: "amber", density: "compact", iconStyle: "monochrome" },
  },
  {
    id: "sereno",
    label: "Sereno",
    description: "Claro · cielo · amplio",
    swatch: "linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)",
    prefs: { theme: "light", accent: "sky", density: "spacious", iconStyle: "colored" },
  },
  {
    id: "vibrante",
    label: "Vibrante",
    description: "Cristal · rosa · normal",
    swatch: "linear-gradient(135deg, #fff1f2 0%, #fecdd3 100%)",
    prefs: { theme: "cristal", accent: "rose", density: "normal", iconStyle: "colored" },
  },
];

// ─── Sortable item ──────────────────────────────────────────────────────────

function SortableNavItem({
  item,
  hidden,
  onToggle,
}: {
  item: NavMeta;
  hidden: boolean;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.href,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        "flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors",
        isDragging
          ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-lg"
          : "border-[var(--rule-soft)] bg-[var(--surface-canvas)] hover:bg-[var(--surface-sunken)]",
        hidden ? "opacity-60" : "",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={onToggle}
        className={[
          "h-8 w-8 rounded-md flex items-center justify-center shrink-0 transition-colors",
          hidden
            ? "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] hover:text-[var(--accent)]"
            : "bg-[var(--accent-soft)] text-[var(--accent)] hover:bg-[var(--accent)]/15",
        ].join(" ")}
        title={hidden ? "Mostrar" : "Ocultar"}
        aria-pressed={!hidden}
      >
        {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>

      <div className="flex-1 min-w-0">
        <p className={"text-sm font-semibold leading-tight " + (hidden ? "line-through text-[var(--text-tertiary)]" : "text-[var(--text-primary)]")}>
          {item.label}
        </p>
        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] truncate">
          {item.href}
        </p>
      </div>

      <button
        {...attributes}
        {...listeners}
        className="p-2 rounded-md cursor-grab active:cursor-grabbing text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] touch-none"
        aria-label="Arrastrar para reordenar"
      >
        <GripVertical className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function SidebarConfigPanel({ items }: Props) {
  const [prefs, setPrefs] = useState<SidebarPrefs>(DEFAULTS);
  const [ordered, setOrdered] = useState<NavMeta[]>(items);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  useEffect(() => {
    const p = readPrefs();
    setPrefs(p);
    if (p.order.length === 0) {
      setOrdered(items);
    } else {
      const byHref = new Map(items.map((i) => [i.href, i] as const));
      const out: NavMeta[] = [];
      for (const href of p.order) {
        const it = byHref.get(href);
        if (it) {
          out.push(it);
          byHref.delete(href);
        }
      }
      for (const it of byHref.values()) out.push(it);
      setOrdered(out);
    }
  }, [items]);

  const update = (patch: Partial<SidebarPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    persist(next);
  };

  const toggleHide = (href: string) => {
    const set = new Set(prefs.hidden);
    if (set.has(href)) set.delete(href);
    else set.add(href);
    update({ hidden: Array.from(set) });
  };

  const handleDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const oldIdx = ordered.findIndex((i) => i.href === e.active.id);
    const newIdx = ordered.findIndex((i) => i.href === e.over!.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(ordered, oldIdx, newIdx);
    setOrdered(next);
    update({ order: next.map((i) => i.href) });
  };

  const reset = () => {
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
    setPrefs(DEFAULTS);
    setOrdered(items);
    window.dispatchEvent(new CustomEvent("superadmin-nav-config-changed"));
  };

  const applyPreset = (presetId: string) => {
    const p = PRESETS.find((x) => x.id === presetId);
    if (p) update(p.prefs);
  };

  return (
    <section className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-5 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Layout className="h-4 w-4 text-[var(--accent)]" /> Personalizar barra lateral
          </h3>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
            Mismo configurador que el panel del negocio: ocultá módulos, reordená con drag, y elegí tema/color/densidad/estilo de íconos.
          </p>
        </div>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Restablecer
        </button>
      </div>

      {/* Presets — con swatch visual de cada estilo */}
      <div>
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2 flex items-center gap-1.5">
          <Sparkles className="h-3 w-3" /> Diseños rápidos
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {PRESETS.map((p) => {
            const isActive =
              prefs.theme === p.prefs.theme &&
              prefs.accent === p.prefs.accent &&
              prefs.density === p.prefs.density &&
              prefs.iconStyle === p.prefs.iconStyle;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                aria-pressed={isActive}
                className={[
                  "group text-left rounded-xl border-2 p-3 transition-all",
                  isActive
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-sm"
                    : "border-[var(--rule-soft)] bg-[var(--surface-canvas)] hover:border-[var(--accent)]/60 hover:-translate-y-0.5",
                ].join(" ")}
              >
                <div
                  aria-hidden
                  className="h-12 w-full rounded-lg mb-2.5 ring-1 ring-inset ring-black/5 dark:ring-white/10 flex items-end p-1.5"
                  style={{ background: p.swatch }}
                >
                  <span className="flex gap-1">
                    <span className="h-1.5 w-6 rounded-full bg-white/80" />
                    <span className="h-1.5 w-3 rounded-full bg-white/50" />
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-bold text-[var(--text-primary)]">{p.label}</p>
                  {isActive && <Check className="h-3.5 w-3.5 text-[var(--accent)]" strokeWidth={3} />}
                </div>
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5 leading-snug">
                  {p.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Theme + Accent */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
            Tema
          </p>
          <div className="grid grid-cols-2 gap-2">
            {THEMES.map((t) => {
              const active = prefs.theme === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => update({ theme: t.id })}
                  className={[
                    "rounded-lg border px-3 py-2 text-left transition-colors",
                    active
                      ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                      : "border-[var(--rule-soft)] hover:border-[var(--rule-strong)]",
                  ].join(" ")}
                >
                  <div className={"h-6 rounded mb-1 " + t.preview} aria-hidden />
                  <span className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                    {active && <Check className="h-3.5 w-3.5 text-[var(--accent)]" />} {t.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2 flex items-center gap-1.5">
            <Palette className="h-3 w-3" /> Color de acento
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {ACCENT_COLORS.map((c) => {
              const active = prefs.accent === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => update({ accent: c.id })}
                  className={[
                    "h-12 rounded-lg flex items-center justify-center transition-all",
                    active ? "ring-2 ring-offset-2 ring-offset-[var(--surface-canvas)]" : "hover:scale-105",
                  ].join(" ")}
                  style={{ backgroundColor: c.hex, ...(active ? { boxShadow: `0 0 0 2px ${c.hex}` } : {}) }}
                  title={c.label}
                  aria-label={c.label}
                  aria-pressed={active}
                >
                  {active && <Check className="h-4 w-4 text-white" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Density + Icon style */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
            Densidad
          </p>
          <div className="grid grid-cols-3 gap-2">
            {DENSITIES.map((d) => {
              const active = prefs.density === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => update({ density: d })}
                  className={[
                    "rounded-lg border px-3 py-2 text-sm font-semibold capitalize transition-colors",
                    active
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "border-[var(--rule-soft)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)]",
                  ].join(" ")}
                >
                  {d === "compact" ? "Compacto" : d === "normal" ? "Normal" : "Amplio"}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
            Estilo de íconos
          </p>
          <div className="grid grid-cols-2 gap-2">
            {ICON_STYLES.map((s) => {
              const active = prefs.iconStyle === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => update({ iconStyle: s })}
                  className={[
                    "rounded-lg border px-3 py-2 text-sm font-semibold transition-colors",
                    active
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "border-[var(--rule-soft)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)]",
                  ].join(" ")}
                >
                  {s === "colored" ? "Coloridos" : "Monocromo"}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Reorder + visibility list with dnd */}
      <div>
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
          Módulos del sidebar — arrastrá para reordenar
        </p>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={ordered.map((i) => i.href)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1.5">
              {ordered.map((item) => (
                <SortableNavItem
                  key={item.href}
                  item={item}
                  hidden={prefs.hidden.includes(item.href)}
                  onToggle={() => toggleHide(item.href)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </section>
  );
}
