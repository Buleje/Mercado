"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { GripVertical, ArrowUp, ArrowDown, Save, RotateCcw, Check } from "lucide-react";

interface CategoryItem {
  id: string;
  label: string;
}

interface SidebarReorderPanelProps {
  categories: CategoryItem[];
  onSave: (order: string[]) => void;
}

export default function SidebarReorderPanel({ categories, onSave }: SidebarReorderPanelProps) {
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-gray-900 dark:text-foreground">Ordenar categorías de la barra lateral</h3>
          <p className="text-xs text-gray-500 dark:text-muted mt-0.5">Arrastra o usa las flechas para mover cada categoría</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-500 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent transition-colors border border-gray-200 dark:border-card-border"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Restablecer
          </button>
          <button
            onClick={handleSave}
            className={cn(
              "flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
              saved
                ? "bg-emerald-500 text-white"
                : "bg-primary text-white hover:bg-primary/90"
            )}
          >
            {saved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
            {saved ? "Guardado" : "Guardar orden"}
          </button>
        </div>
      </div>

      <div className="space-y-1 bg-gray-50 dark:bg-surface rounded-xl p-2">
        {items.map((item, idx) => (
          <div
            key={item.id}
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDragEnd={handleDragEnd}
            className={cn(
              "flex items-center gap-2 px-3 py-2.5 rounded-lg bg-white dark:bg-card border border-gray-200 dark:border-card-border transition-all cursor-grab active:cursor-grabbing",
              dragIdx === idx && "opacity-50 scale-[0.98] shadow-lg ring-2 ring-primary/30"
            )}
          >
            <GripVertical className="h-4 w-4 text-gray-300 dark:text-muted shrink-0" />
            <span className="text-xs font-bold text-gray-400 dark:text-muted w-5 text-center">{idx + 1}</span>
            <span className="flex-1 text-sm font-semibold text-gray-700 dark:text-foreground">{item.label}</span>
            <div className="flex gap-0.5">
              <button
                onClick={() => moveItem(idx, idx - 1)}
                disabled={idx === 0}
                className={cn(
                  "p-1 rounded transition-colors",
                  idx === 0 ? "text-gray-200 dark:text-gray-700" : "text-gray-400 hover:text-primary hover:bg-primary/10"
                )}
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => moveItem(idx, idx + 1)}
                disabled={idx === items.length - 1}
                className={cn(
                  "p-1 rounded transition-colors",
                  idx === items.length - 1 ? "text-gray-200 dark:text-gray-700" : "text-gray-400 hover:text-primary hover:bg-primary/10"
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
