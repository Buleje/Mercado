"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { button } from "@/components/ui-system/button-variants";
import { GripVertical, ArrowUp, ArrowDown, Save, RotateCcw, Check } from "@buleje/design-system/icons";

interface CategoryItem {
  id: string;
  label: string;
}

interface SidebarReorderPanelProps {
  categories: CategoryItem[];
  onSave: (order: string[]) => void;
  /** Hay un orden fijado a mano: recién ahí «Volver al orden de fábrica» hace algo. */
  hayOrdenManual?: boolean;
}

export default function SidebarReorderPanel({ categories, onSave, hayOrdenManual = true }: SidebarReorderPanelProps) {
  const [items, setItems] = useState<CategoryItem[]>(categories);
  const [saved, setSaved] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const moveItem = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setItems(next);
    setSaved(false);
  };

  const handleDragStart = (idx: number) => {
    setDragIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    moveItem(dragIdx, idx);
    setDragIdx(idx);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
  };

  const handleSave = () => {
    onSave(items.map(i => i.id));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setItems(categories);
    onSave([]);
    setSaved(false);
  };

  return (
    <div className="space-y-6">
      {/* El título lo pone el plegable de Configuración › Mi panel. */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {/* Vuelve al orden de fábrica (con lo de tu rubro arriba y lo que más usa tu negocio primero). No toca ocultos ni favoritos. */}
        <button
          type="button"
          onClick={handleReset}
          disabled={!hayOrdenManual}
          title={hayOrdenManual ? undefined : "Ya está en el orden de fábrica"}
          className={button({ variant: "secondary", className: "gap-1.5" })}
        >
          <RotateCcw className="h-4 w-4" /> Volver al orden de fábrica
        </button>
        <button type="button" onClick={handleSave} className={button({ className: "gap-1.5" })}>
          {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saved ? "Guardado" : "Guardar orden"}
        </button>
      </div>

      <div className="space-y-1 bg-[var(--surface-sunken)] rounded-xl p-2">
        {items.map((item, idx) => (
          <div
            key={item.id}
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDragEnd={handleDragEnd}
            className={cn(
              "flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] transition-all cursor-grab active:cursor-grabbing",
              dragIdx === idx && "opacity-50 scale-[0.98] ring-2 ring-primary/30"
            )}
          >
            <GripVertical className="h-4 w-4 text-[var(--text-tertiary)] dark:text-muted shrink-0" />
            <span className="text-xs font-bold text-[var(--text-tertiary)] dark:text-muted w-5 text-center">{idx + 1}</span>
            <span className="flex-1 text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{item.label}</span>
            <div className="flex gap-0.5">
              <button aria-label="Subir"
                onClick={() => moveItem(idx, idx - 1)}
                disabled={idx === 0}
                className={cn(
                  "p-1 rounded transition-colors",
                  idx === 0 ? "text-[var(--text-tertiary)] dark:text-[var(--text-primary)]" : "text-[var(--text-tertiary)] hover:text-primary hover:bg-primary/10"
                )}
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button aria-label="Bajar"
                onClick={() => moveItem(idx, idx + 1)}
                disabled={idx === items.length - 1}
                className={cn(
                  "p-1 rounded transition-colors",
                  idx === items.length - 1 ? "text-[var(--text-tertiary)] dark:text-[var(--text-primary)]" : "text-[var(--text-tertiary)] hover:text-primary hover:bg-primary/10"
                )}
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
