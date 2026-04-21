"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { m, AnimatePresence } from "@/components/admin/providers";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Eye, EyeOff, RotateCcw } from "@buleje/design-system/icons";

export interface DraggableItem {
  id: string;
  render: () => ReactNode;
}

interface Props {
  items: DraggableItem[];
  /** localStorage key to persist order + hidden. Scope por módulo. */
  storageKey?: string;
  /** gap in rem entre secciones — default 1 */
  gap?: number;
}

interface PersistState {
  order: string[];
  hidden: string[];
}

/**
 * DraggableSections — secciones reorderables por drag handle.
 *
 * Stack:
 *  - @dnd-kit/sortable → drag + keyboard + accesibilidad
 *  - framer-motion `m` (LazyMotion strict compatible) → scale/shadow/entry
 *  - sonner → toasts de feedback
 *
 * Features:
 *  - Drag por handle (no por card)
 *  - Hide/show per sección (ojo)
 *  - Reset orden
 *  - Keyboard: Tab al handle, Space/Enter activa, ↑↓ mueve, Space confirma
 *  - Toast "Layout guardado" en primer drag
 *  - Persiste en localStorage (orden + hidden)
 */
export function DraggableSections({ items, storageKey, gap = 1 }: Props) {
  const [state, setState] = useState<PersistState>(() => ({
    order: items.map((i) => i.id),
    hidden: [],
  }));
  const [hydrated, setHydrated] = useState(false);
  const firstDragRef = useRef(true);

  // Hydrate desde localStorage
  useEffect(() => {
    setHydrated(true);
    if (!storageKey) return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) return;
      const parsed = JSON.parse(saved) as unknown;
      if (!parsed || typeof parsed !== "object") return;
      const p = parsed as Partial<PersistState>;
      const known = new Set(items.map((i) => i.id));
      const cleanOrder = Array.isArray(p.order)
        ? [
            ...p.order.filter((id): id is string => typeof id === "string" && known.has(id)),
            ...items.filter((i) => !p.order!.includes(i.id)).map((i) => i.id),
          ]
        : items.map((i) => i.id);
      const cleanHidden = Array.isArray(p.hidden)
        ? p.hidden.filter((id): id is string => typeof id === "string" && known.has(id))
        : [];
      setState({ order: cleanOrder, hidden: cleanHidden });
      if (cleanOrder.some((id, i) => id !== items[i]?.id) || cleanHidden.length > 0) {
        firstDragRef.current = false; // ya interactuó antes
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  function persist(next: PersistState) {
    setState(next);
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(ev: DragEndEvent) {
    const { active, over } = ev;
    if (!over || active.id === over.id) return;
    const oldIdx = state.order.indexOf(String(active.id));
    const newIdx = state.order.indexOf(String(over.id));
    if (oldIdx < 0 || newIdx < 0) return;
    const next: PersistState = { ...state, order: arrayMove(state.order, oldIdx, newIdx) };
    persist(next);
    if (firstDragRef.current) {
      firstDragRef.current = false;
      toast.success("Layout guardado", {
        description: "Tu orden persiste en este dispositivo.",
        duration: 2500,
      });
    }
  }

  function toggleHidden(id: string) {
    const s = new Set(state.hidden);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    persist({ ...state, hidden: Array.from(s) });
  }

  function handleReset() {
    persist({ order: items.map((i) => i.id), hidden: [] });
    firstDragRef.current = true;
    toast("Orden restaurado", {
      description: "Volviste al layout por defecto.",
      duration: 2000,
    });
  }

  const renderById = new Map(items.map((i) => [i.id, i.render]));
  const validOrder = state.order.filter((id) => renderById.has(id));
  const hiddenSet = new Set(state.hidden);
  const isDefault =
    validOrder.every((id, i) => id === items[i]?.id) && state.hidden.length === 0;

  return (
    <div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={validOrder} strategy={verticalListSortingStrategy}>
          <div style={{ display: "flex", flexDirection: "column", gap: `${gap}rem` }}>
            <AnimatePresence initial={false}>
              {validOrder.map((id, index) => {
                const render = renderById.get(id);
                if (!render) return null;
                return (
                  <DraggableSection
                    key={id}
                    id={id}
                    index={index}
                    hydrated={hydrated}
                    hidden={hiddenSet.has(id)}
                    onToggle={() => toggleHidden(id)}
                  >
                    {render()}
                  </DraggableSection>
                );
              })}
            </AnimatePresence>
          </div>
        </SortableContext>
      </DndContext>

      {hydrated && !isDefault && (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors px-3 py-1.5 rounded-md hover:bg-[var(--surface-sunken)] border border-transparent hover:border-[var(--rule-soft)]"
          >
            <RotateCcw className="h-3 w-3" />
            Restaurar orden
          </button>
        </div>
      )}
    </div>
  );
}

function DraggableSection({
  id,
  index,
  hydrated,
  hidden,
  onToggle,
  children,
}: {
  id: string;
  index: number;
  hydrated: boolean;
  hidden: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const dndStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 30 : 1,
    position: "relative",
  };

  return (
    <div ref={setNodeRef} style={dndStyle} className="group">
      <m.div
        initial={hydrated ? false : { opacity: 0, y: 10 }}
        animate={{
          opacity: hidden ? 0.45 : 1,
          y: 0,
          scale: isDragging ? 1.012 : 1,
          boxShadow: isDragging
            ? "0 24px 48px -12px rgba(0,0,0,0.22), 0 8px 20px -6px rgba(0,0,0,0.14)"
            : "0 0 0 rgba(0,0,0,0)",
        }}
        transition={{
          opacity: { duration: 0.2 },
          y: { type: "spring", stiffness: 260, damping: 26, delay: hydrated ? 0 : index * 0.04 },
          scale: { duration: 0.18 },
          boxShadow: { duration: 0.2 },
        }}
        style={{ borderRadius: "0.75rem" }}
      >
        <div className="absolute top-3 right-3 z-20 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200">
          <button
            type="button"
            onClick={onToggle}
            aria-label={hidden ? "Mostrar sección" : "Ocultar sección"}
            title={hidden ? "Mostrar" : "Ocultar"}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--surface-sunken)] border border-[var(--rule-soft)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--rule-base)] transition-colors"
          >
            {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
          <button
            ref={setActivatorNodeRef}
            type="button"
            aria-label="Mover sección — arrastrar o usar teclado (Space para activar, ↑↓ para mover)"
            title="Arrastrar para reordenar"
            {...attributes}
            {...listeners}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--surface-sunken)] border border-[var(--rule-soft)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--rule-base)] transition-colors touch-none select-none cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        </div>
        {hidden ? <HiddenPlaceholder /> : children}
      </m.div>
    </div>
  );
}

function HiddenPlaceholder() {
  return (
    <div className="rounded-xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)] py-6 px-5 flex items-center gap-3">
      <EyeOff className="h-4 w-4 text-[var(--text-tertiary)]" />
      <p className="text-sm text-[var(--text-tertiary)]">
        Sección oculta — pasá el mouse por encima y click al ojo para volver a mostrarla.
      </p>
    </div>
  );
}
