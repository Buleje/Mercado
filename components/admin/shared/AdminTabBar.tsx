"use client";

import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
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
  moduleId: string;
  draggable?: boolean;
  className?: string;
  vertical?: boolean;
  children?: ReactNode;
}

export default function AdminTabBar({
  tabs,
  activeTab,
  onTabChange,
  moduleId,
  draggable = true,
  className,
  vertical = false,
  children,
}: AdminTabBarProps) {
  const tabsRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [draggedTab, setDraggedTab] = useState<string | null>(null);
  const [dragOverTab, setDragOverTab] = useState<string | null>(null);

  const [tabOrder, setTabOrder] = useState<string[]>(() => {
    if (typeof window === "undefined") return tabs.map((tab) => tab.id);

    try {
      const saved = localStorage.getItem(`tab-order-${moduleId}`);
      if (saved) {
        const parsed = JSON.parse(saved) as string[];
        const allIds = tabs.map((tab) => tab.id);
        const valid = parsed.filter((id) => allIds.includes(id));
        const missing = allIds.filter((id) => !valid.includes(id));
        return [...valid, ...missing];
      }
    } catch {}

    return tabs.map((tab) => tab.id);
  });

  const orderedTabs = tabOrder
    .map((id) => tabs.find((tab) => tab.id === id))
    .filter(Boolean) as AdminTab[];

  const checkScroll = useCallback(() => {
    const element = tabsRef.current;
    if (!element) return;
    setCanScrollLeft(element.scrollLeft > 2);
    setCanScrollRight(element.scrollLeft + element.clientWidth < element.scrollWidth - 2);
  }, []);

  useEffect(() => {
    checkScroll();
    window.addEventListener("resize", checkScroll);
    return () => window.removeEventListener("resize", checkScroll);
  }, [checkScroll]);

  const scrollTabs = (direction: "left" | "right") => {
    tabsRef.current?.scrollBy({
      left: direction === "left" ? -200 : 200,
      behavior: "smooth",
    });
    setTimeout(checkScroll, 350);
  };

  const handleDrop = (targetId: string) => {
    if (!draggedTab || draggedTab === targetId) return;

    const newOrder = [...tabOrder];
    const fromIndex = newOrder.indexOf(draggedTab);
    const toIndex = newOrder.indexOf(targetId);

    newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, draggedTab);

    setTabOrder(newOrder);

    try {
      localStorage.setItem(`tab-order-${moduleId}`, JSON.stringify(newOrder));
    } catch {}

    setDraggedTab(null);
    setDragOverTab(null);
  };

  const resetOrder = () => {
    const defaultOrder = tabs.map((tab) => tab.id);
    setTabOrder(defaultOrder);
    try {
      localStorage.removeItem(`tab-order-${moduleId}`);
    } catch {}
  };

  const isReordered = JSON.stringify(tabOrder) !== JSON.stringify(tabs.map((tab) => tab.id));

  if (vertical) {
    return (
      <div className={cn("flex flex-col gap-3 lg:flex-row lg:items-stretch lg:gap-0", className)}>
        {/* Sub-tab nav: flush against main sidebar with matching style */}
        <nav className={cn(
          "w-full shrink-0",
          // Desktop: fixed strip matching sidebar visual style
          "lg:w-40 lg:self-stretch lg:-ml-3 sm:lg:-ml-6 lg:pl-3 sm:lg:pl-6 lg:pr-0",
          "lg:border-r lg:border-gray-200 lg:dark:border-card-border",
          "lg:bg-white lg:dark:bg-card",
          "lg:pt-1 lg:pb-4",
        )}>
          <div className="grid grid-cols-2 gap-0.5 sm:grid-cols-3 lg:grid-cols-1 lg:pt-0">
            {orderedTabs.map((tab) => {
              const Icon = tab.icon;

              return (
                <button
                  key={tab.id}
                  onClick={() => !tab.disabled && onTabChange(tab.id)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition-all duration-150",
                    "lg:rounded-none lg:rounded-r-lg",
                    activeTab === tab.id
                      ? "bg-primary/10 font-semibold text-primary border-l-[3px] border-l-primary dark:bg-primary/15"
                      : "text-gray-500 hover:bg-gray-50 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-200 border-l-[3px] border-l-transparent",
                    "rounded-lg lg:rounded-none lg:rounded-r-lg",
                    tab.disabled && "cursor-not-allowed opacity-40",
                  )}
                >
                  {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
                  <span className="truncate">{tab.label}</span>
                  {tab.badge != null && (
                    <span className="ml-auto flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {isReordered && (
            <button
              onClick={resetOrder}
              className="mt-1.5 w-full border-t border-gray-100 px-3 pt-1.5 text-left text-[10px] text-gray-400 transition-colors hover:text-primary dark:border-white/10"
            >
              Restablecer orden
            </button>
          )}
        </nav>

        {/* Content: fills 100% remaining space */}
        <div className="min-w-0 flex-1 lg:pl-4">{children}</div>
      </div>
    );
  }

  return (
    <>
    <div className={cn("relative", className)}>
      {canScrollLeft && (
        <button
          onClick={() => scrollTabs("left")}
          className="absolute left-0 top-0 bottom-0 z-10 flex w-10 items-center bg-gradient-to-r from-white via-white/90 to-transparent transition-opacity duration-300"
          aria-label="Ver tabs anteriores"
        >
          <ChevronLeft className="h-4 w-4 text-gray-500" />
        </button>
      )}

      <div
        ref={tabsRef}
        onScroll={checkScroll}
        className="-mx-1 flex gap-0.5 overflow-x-auto scroll-smooth border-b border-gray-200 px-1 scrollbar-none sm:gap-1"
        style={{ scrollbarWidth: "none" }}
      >
        {orderedTabs.map((tab) => {
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              draggable={draggable}
              onDragStart={() => setDraggedTab(tab.id)}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOverTab(tab.id);
              }}
              onDragLeave={() => setDragOverTab(null)}
              onDrop={() => handleDrop(tab.id)}
              onDragEnd={() => {
                setDraggedTab(null);
                setDragOverTab(null);
              }}
              onClick={() => !tab.disabled && onTabChange(tab.id)}
              disabled={tab.disabled}
              title={tab.label}
              className={cn(
                "flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-[3px] px-2.5 py-2 text-xs transition-all duration-200 sm:px-4 sm:py-2.5 sm:text-sm",
                draggable && "cursor-grab active:cursor-grabbing",
                activeTab === tab.id
                  ? "border-[#00B4A6] bg-[#00B4A6]/5 font-semibold text-[#00B4A6]"
                  : "border-transparent font-normal text-gray-500 hover:bg-gray-50 hover:text-gray-700",
                tab.disabled && "cursor-not-allowed opacity-40",
                draggedTab === tab.id && "scale-95 opacity-40",
                dragOverTab === tab.id && draggedTab !== tab.id && "rounded-t-lg ring-2 ring-[#00B4A6] ring-offset-1",
              )}
            >
              {draggable && <GripVertical className="h-3 w-3 shrink-0 opacity-30" />}
              {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
              <span>{tab.shortLabel || tab.label}</span>
              {tab.badge != null && (
                <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}

        {isReordered && (
          <button
            onClick={resetOrder}
            className="ml-1 shrink-0 whitespace-nowrap px-2 py-1.5 text-[10px] text-gray-400 transition-colors hover:text-[#00B4A6]"
            title="Restablecer orden de tabs"
          >
            Restablecer
          </button>
        )}
      </div>

      {canScrollRight && (
        <button
          onClick={() => scrollTabs("right")}
          className="absolute right-0 top-0 bottom-0 z-10 flex w-10 items-center justify-end bg-gradient-to-l from-white via-white/90 to-transparent transition-opacity duration-300"
          aria-label="Ver más tabs"
        >
          <ChevronRight className="h-4 w-4 text-gray-500" />
        </button>
      )}
    </div>
    {children}
    </>
  );
}