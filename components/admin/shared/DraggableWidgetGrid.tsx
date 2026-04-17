"use client";

import { useState, useEffect, useCallback, Children, isValidElement } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

// ── DraggableWidget ────────────────────────────────────────────────────────────

interface DraggableWidgetProps {
  id: string;
  children: React.ReactNode;
}

function DraggableWidget({ id, children }: DraggableWidgetProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative group/widget",
        isDragging && "opacity-50 scale-[0.98] z-50"
      )}
    >
      {/* Drag handle — visible on hover */}
      <button
        {...attributes}
        {...listeners}
        className="absolute top-3 right-3 opacity-0 group-hover/widget:opacity-100 transition-opacity cursor-grab active:cursor-grabbing p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700 z-10"
        aria-label="Arrastrar widget"
      >
        <GripVertical className="w-4 h-4 text-gray-400" />
      </button>
      {children}
    </div>
  );
}

// ── DraggableWidgetGrid ────────────────────────────────────────────────────────

interface DraggableWidgetGridProps {
  storageKey: string;
  children: React.ReactNode;
  columns?: number;
  className?: string;
}

export function DraggableWidgetGrid({
  storageKey,
  children,
  columns = 2,
  className,
}: DraggableWidgetGridProps) {
  // Extract widget IDs from children
  const childArray = Children.toArray(children).filter(isValidElement);
  const defaultIds = childArray.map((child, i) => {
    const key = child.key != null ? String(child.key) : `widget-${i}`;
    // React prepends keys with ".$" or "."; strip it
    return key.replace(/^\.\$?/, "");
  });

  const [order, setOrder] = useState<string[]>(defaultIds);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Load persisted order from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as string[];
        // Validate that stored order matches current children
        if (
          parsed.length === defaultIds.length &&
          defaultIds.every((id) => parsed.includes(id))
        ) {
          setOrder(parsed);
          return;
        }
      }
    } catch {
      /* use default */
    }
    setOrder(defaultIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, defaultIds.join(",")]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);

      if (!over || active.id === over.id) return;

      setOrder((prev) => {
        const oldIndex = prev.indexOf(String(active.id));
        const newIndex = prev.indexOf(String(over.id));
        if (oldIndex === -1 || newIndex === -1) return prev;

        const next = arrayMove(prev, oldIndex, newIndex);
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [storageKey]
  );

  // Build a map of id -> child element
  const childMap = new Map<string, React.ReactElement>();
  childArray.forEach((child, i) => {
    const key = child.key != null ? String(child.key) : `widget-${i}`;
    const cleanKey = key.replace(/^\.\$?/, "");
    childMap.set(cleanKey, child as React.ReactElement);
  });

  const colsClass =
    columns === 1
      ? "grid-cols-1"
      : columns === 3
        ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
        : "grid-cols-1 md:grid-cols-2";

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={order} strategy={rectSortingStrategy}>
        <div className={cn("grid gap-4", colsClass, className)}>
          {order.map((id) => {
            const child = childMap.get(id);
            if (!child) return null;
            return (
              <DraggableWidget key={id} id={id}>
                {child}
              </DraggableWidget>
            );
          })}
        </div>
      </SortableContext>
      <DragOverlay>
        {activeId ? (
          <div className="opacity-80 scale-[1.02] rounded-xl pointer-events-none">
            {childMap.get(activeId)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

export default DraggableWidgetGrid;
