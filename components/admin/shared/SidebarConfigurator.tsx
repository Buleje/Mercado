"use client";

import React from "react";
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
import { ChevronDown, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TabCategory } from "@/app/admin/_lib/tab-categories";
import type { Tab } from "@/app/admin/_lib/tabs.types";

// ─── Types ───────────────────────────────────────────────────────────────────

export type SidebarTheme = "light" | "shaded" | "dark";

type SidebarConfiguratorProps = {
  /** All available categories (BASIC_MODULES + TIENDA_MODULE etc.) */
  allCategories: TabCategory[];
  /** Currently hidden category ids */
  hiddenCategories: Set<string>;
  /** Currently hidden individual tabs */
  hiddenSubTabs: Set<Tab>;
  /** Current category order (array of category ids) */
  categoryOrder: string[];
  /** Current sidebar theme */
  theme: SidebarTheme;
  /** All tabs reference for resolving sub-tab labels */
  allTabs: readonly { id: Tab; label: string; icon: React.ElementType }[];
  /** Allowed tabs for this user */
  allowedTabs: Tab[];
  /** Save handler */
  onSave: (config: {
    hiddenCategories: Set<string>;
    hiddenSubTabs: Set<Tab>;
    categoryOrder: string[];
    theme: SidebarTheme;
  }) => void;
  /** Cancel handler */
  onCancel: () => void;
};

// ─── Sortable Category Item ──────────────────────────────────────────────────

function SortableCategoryItem({
  category,
  isVisible,
  onToggleVisible,
  isExpanded,
  onToggleExpand,
  hasMultipleTabs,
  children,
}: {
  category: TabCategory;
  isVisible: boolean;
  onToggleVisible: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  hasMultipleTabs: boolean;
  children?: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const CategoryIcon = category.icon;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-lg transition-colors",
        isDragging && "opacity-60 bg-zinc-700/50"
      )}
    >
      <div className="flex items-center gap-3 py-3 px-4">
        {/* Checkbox */}
        <label className="flex items-center shrink-0 cursor-pointer">
          <input
            type="checkbox"
            checked={isVisible}
            onChange={onToggleVisible}
            className="w-5 h-5 rounded-md border-2 border-zinc-500 bg-zinc-700 checked:bg-emerald-500 checked:border-emerald-500 cursor-pointer accent-emerald-500"
          />
        </label>

        {/* Icon + label */}
        <CategoryIcon className="h-4.5 w-4.5 text-zinc-400 shrink-0" />
        <span className="text-[13px] font-medium text-zinc-200 flex-1 truncate">
          {category.label}
        </span>

        {/* Expand toggle for multi-tab categories */}
        {hasMultipleTabs && (
          <button
            onClick={onToggleExpand}
            className="p-1 rounded hover:bg-zinc-700 transition-colors"
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 text-zinc-400 transition-transform duration-200",
                isExpanded && "rotate-180"
              )}
            />
          </button>
        )}

        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="p-1 rounded cursor-grab active:cursor-grabbing hover:bg-zinc-700 transition-colors touch-none"
        >
          <GripVertical className="h-4 w-4 text-zinc-500" />
        </button>
      </div>

      {/* Expanded sub-tabs */}
      {hasMultipleTabs && (
        <div
          className="grid transition-[grid-template-rows] duration-200 ease-in-out"
          style={{ gridTemplateRows: isExpanded ? "1fr" : "0fr" }}
        >
          <div className="overflow-hidden">
            <div className="pl-12 pr-4 pb-2 space-y-0.5">
              {children}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function SidebarConfigurator({
  allCategories,
  hiddenCategories: initialHiddenCategories,
  hiddenSubTabs: initialHiddenSubTabs,
  categoryOrder: initialOrder,
  theme: initialTheme,
  allTabs,
  allowedTabs,
  onSave,
  onCancel,
}: SidebarConfiguratorProps) {
  // ── Local draft state (only committed on Save) ──
  const [draftHidden, setDraftHidden] = React.useState<Set<string>>(
    () => new Set(initialHiddenCategories)
  );
  const [draftHiddenSubs, setDraftHiddenSubs] = React.useState<Set<Tab>>(
    () => new Set(initialHiddenSubTabs)
  );
  const [draftOrder, setDraftOrder] = React.useState<string[]>(
    () => [...initialOrder]
  );
  const [draftTheme, setDraftTheme] = React.useState<SidebarTheme>(initialTheme);
  const [expandedCats, setExpandedCats] = React.useState<Set<string>>(new Set());

  // ── dnd-kit sensors ──
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  // ── Ordered categories ──
  const orderedCategories = React.useMemo(() => {
    const map = new Map(allCategories.map(c => [c.id, c]));
    const result: TabCategory[] = [];
    for (const id of draftOrder) {
      const cat = map.get(id);
      if (cat) result.push(cat);
    }
    // Add any categories not in the order (new ones)
    for (const cat of allCategories) {
      if (!draftOrder.includes(cat.id)) result.push(cat);
    }
    return result;
  }, [allCategories, draftOrder]);

  // ── Handlers ──
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setDraftOrder(prev => {
        const oldIndex = prev.indexOf(active.id as string);
        const newIndex = prev.indexOf(over.id as string);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  const toggleCategoryVisible = (catId: string) => {
    setDraftHidden(prev => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  const toggleSubTabVisible = (tabId: Tab) => {
    setDraftHiddenSubs(prev => {
      const next = new Set(prev);
      if (next.has(tabId)) next.delete(tabId);
      else next.add(tabId);
      return next;
    });
  };

  const toggleExpand = (catId: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  const handleSave = () => {
    onSave({
      hiddenCategories: draftHidden,
      hiddenSubTabs: draftHiddenSubs,
      categoryOrder: draftOrder,
      theme: draftTheme,
    });
  };

  return (
    <div className="flex flex-col h-full bg-zinc-800 text-zinc-200">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 border-b border-zinc-700">
        <h2 className="text-[15px] font-bold text-white leading-tight">
          Personaliza tu navegacion
        </h2>
        <p className="text-[12px] text-zinc-400 mt-1.5 leading-relaxed">
          Marca las categorias que quieras ver y arrastralas para cambiar el orden.
        </p>
      </div>

      {/* Category list — scrollable */}
      <div className="flex-1 overflow-y-auto py-2 px-1 scrollbar-hide">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={orderedCategories.map(c => c.id)}
            strategy={verticalListSortingStrategy}
          >
            {orderedCategories.map(category => {
              const visibleTabs = category.tabs.filter(t =>
                allowedTabs.includes(t as Tab)
              );
              const hasMultipleTabs = visibleTabs.length > 1;
              const isCatVisible = !draftHidden.has(category.id);

              return (
                <SortableCategoryItem
                  key={category.id}
                  category={category}
                  isVisible={isCatVisible}
                  onToggleVisible={() => toggleCategoryVisible(category.id)}
                  isExpanded={expandedCats.has(category.id)}
                  onToggleExpand={() => toggleExpand(category.id)}
                  hasMultipleTabs={hasMultipleTabs}
                >
                  {hasMultipleTabs &&
                    visibleTabs.map(tabId => {
                      const tabInfo = allTabs.find(t => t.id === tabId);
                      if (!tabInfo) return null;
                      const SubIcon = tabInfo.icon;
                      const isSubVisible = !draftHiddenSubs.has(tabId as Tab);
                      return (
                        <label
                          key={tabId}
                          className="flex items-center gap-3 py-2 px-2 rounded-md hover:bg-zinc-700/50 cursor-pointer transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={isSubVisible}
                            onChange={() => toggleSubTabVisible(tabId as Tab)}
                            className="w-4 h-4 rounded border-2 border-zinc-500 bg-zinc-700 checked:bg-emerald-500 checked:border-emerald-500 cursor-pointer accent-emerald-500"
                          />
                          <SubIcon className="h-4 w-4 text-zinc-400 shrink-0" />
                          <span className="text-[12px] text-zinc-300 truncate">
                            {tabInfo.label}
                          </span>
                        </label>
                      );
                    })}
                </SortableCategoryItem>
              );
            })}
          </SortableContext>
        </DndContext>
      </div>

      {/* Theme selector */}
      <div className="px-5 py-3 border-t border-zinc-700">
        <label className="block text-[12px] font-semibold text-zinc-400 uppercase tracking-wide mb-2">
          Tema
        </label>
        <select
          value={draftTheme}
          onChange={e => setDraftTheme(e.target.value as SidebarTheme)}
          className="w-full bg-zinc-700 text-zinc-200 text-[13px] rounded-lg px-3 py-2 border border-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
        >
          <option value="light">Claro</option>
          <option value="shaded">Sombreado</option>
          <option value="dark">Oscuro</option>
        </select>
      </div>

      {/* Footer buttons */}
      <div className="px-5 py-4 space-y-2 border-t border-zinc-700">
        <button
          onClick={handleSave}
          className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl py-3 w-full font-semibold text-[14px] transition-colors"
        >
          Guardar
        </button>
        <button
          onClick={onCancel}
          className="border border-zinc-600 text-zinc-300 hover:bg-zinc-700 rounded-xl py-3 w-full text-[14px] font-medium transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
