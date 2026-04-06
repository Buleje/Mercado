"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export interface AdminTab {
  id: string;
  label: string;
  shortLabel?: string;
  icon?: LucideIcon;
  badge?: number | string;
  disabled?: boolean;
}

interface AdminTabBarProps {
  tabs: AdminTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  moduleId: string; // para persistir orden en localStorage
  draggable?: boolean;
  className?: string;
}

export default function AdminTabBar({ tabs, activeTab, onTabChange, moduleId, draggable = true, className }: AdminTabBarProps) {
  const tabsRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [draggedTab, setDraggedTab] = useState<string | null>(null);
  const [dragOverTab, setDragOverTab] = useState<string | null>(null);

  // Tab order persistence
  const [tabOrder, setTabOrder] = useState<string[]>(() => {
    if (typeof window === "undefined") return tabs.map(t => t.id);
    try {
      const saved = localStorage.getItem(`tab-order-${moduleId}`);
      if (saved) {
        const parsed = JSON.parse(saved) as string[];
        const allIds = tabs.map(t => t.id);
        const valid = parsed.filter(id => allIds.includes(id));
        const missing = allIds.filter(id => !valid.includes(id));
        return [...valid, ...missing];
      }
    } catch {}
    return tabs.map(t => t.id);
  });

  const orderedTabs = tabOrder.map(id => tabs.find(t => t.id === id)).filter(Boolean) as AdminTab[];

  const checkScroll = useCallback(() => {
    const el = tabsRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    checkScroll();
    window.addEventListener("resize", checkScroll);
    return () => window.removeEventListener("resize", checkScroll);
  }, [checkScroll]);

  const scrollTabs = (dir: "left" | "right") => {
    tabsRef.current?.scrollBy({ left: dir === "left" ? -200 : 200, behavior: "smooth" });
    setTimeout(checkScroll, 350);
  };

  const handleDrop = (targetId: string) => {
    if (!draggedTab || draggedTab === targetId) return;
    const newOrder = [...tabOrder];
    const fromIdx = newOrder.indexOf(draggedTab);
    const toIdx = newOrder.indexOf(targetId);
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, draggedTab);
    setTabOrder(newOrder);
    try { localStorage.setItem(`tab-order-${moduleId}`, JSON.stringify(newOrder)); } catch {}
    setDraggedTab(null);
    setDragOverTab(null);
  };

  const resetOrder = () => {
    const defaultOrder = tabs.map(t => t.id);
    setTabOrder(defaultOrder);
    try { localStorage.removeItem(`tab-order-${moduleId}`); } catch {}
  };

  const isReordered = JSON.stringify(tabOrder) !== JSON.stringify(tabs.map(t => t.id));

  return (
    <div className={cn("relative", className)}>
      {canScrollLeft && (
        <button
          onClick={() => scrollTabs("left")}
          className="absolute left-0 top-0 bottom-0 w-10 bg-gradient-to-r from-white via-white/90 to-transparent z-10 flex items-center transition-opacity duration-300"
          aria-label="Ver tabs anteriores"
        >
          <ChevronLeft className="h-4 w-4 text-gray-500" />
        </button>
      )}

      <div
        ref={tabsRef}
        onScroll={checkScroll}
        className="flex gap-0.5 sm:gap-1 overflow-x-auto scrollbar-none scroll-smooth border-b border-gray-200 -mx-1 px-1"
        style={{ scrollbarWidth: "none" }}
      >
        {orderedTabs.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              draggable={draggable}
              onDragStart={() => setDraggedTab(t.id)}
              onDragOver={e => { e.preventDefault(); setDragOverTab(t.id); }}
              onDragLeave={() => setDragOverTab(null)}
              onDrop={() => handleDrop(t.id)}
              onDragEnd={() => { setDraggedTab(null); setDragOverTab(null); }}
              onClick={() => !t.disabled && onTabChange(t.id)}
              disabled={t.disabled}
              title={t.label}
              className={cn(
                "shrink-0 flex items-center gap-1.5 px-2.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm whitespace-nowrap transition-all duration-200 border-b-[3px]",
                draggable && "cursor-grab active:cursor-grabbing",
                activeTab === t.id
                  ? "border-[#00B4A6] text-[#00B4A6] font-semibold bg-[#00B4A6]/5"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50 font-normal",
                t.disabled && "opacity-40 cursor-not-allowed",
                draggedTab === t.id && "opacity-40 scale-95",
                dragOverTab === t.id && draggedTab !== t.id && "ring-2 ring-[#00B4A6] ring-offset-1 rounded-t-lg",
              )}
            >
              {draggable && <GripVertical className="h-3 w-3 shrink-0 opacity-30" />}
              {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
              <span>{t.shortLabel || t.label}</span>
              {t.badge != null && (
                <span className="h-4 min-w-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center font-bold">
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}

        {isReordered && (
          <button
            onClick={resetOrder}
            className="shrink-0 ml-1 px-2 py-1.5 text-[10px] text-gray-400 hover:text-[#00B4A6] transition-colors whitespace-nowrap"
            title="Restablecer orden de tabs"
          >
            Restablecer
          </button>
        )}
      </div>

      {canScrollRight && (
        <button
          onClick={() => scrollTabs("right")}
          className="absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-white via-white/90 to-transparent z-10 flex items-center justify-end transition-opacity duration-300"
          aria-label="Ver más tabs"
        >
          <ChevronRight className="h-4 w-4 text-gray-500" />
        </button>
      )}
    </div>
  );
}
