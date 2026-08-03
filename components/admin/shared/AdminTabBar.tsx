"use client";

import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import { isEditableTarget, isModalOpen } from "@/lib/keyboard-guards";
import { ChevronLeft, ChevronRight, GripVertical } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { useModuleTabs } from "@/contexts/module-tabs-context";

export interface AdminTab {
  id: string;
  label: string;
  shortLabel?: string;
  icon?: LucideIcon;
  badge?: number | string;
  disabled?: boolean;
  /** Tooltip nativo al hover. Cae a `label` si no se provee. */
  title?: string;
}

interface AdminTabBarProps {
  tabs: AdminTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  moduleId: string;
  draggable?: boolean;
  className?: string;
  vertical?: boolean;
  /** Las tabs envuelven a 2+ filas cuando superan el ancho, en vez de scroll
      horizontal con chevrons. Útil para módulos con muchas sub-tabs (ej. Finanzas
      con 14) donde el scroll esconde opciones. Default `true` (Brandon 2026-06-18:
      coherencia admin — ninguna pestaña queda oculta tras scroll). Pasar
      `wrap={false}` para forzar scroll horizontal en contextos angostos. */
  wrap?: boolean;
  children?: ReactNode;
  onTabHover?: (id: string) => void;
  /** Contenido alineado a la derecha del tab bar (ej. status chip). */
  rightSlot?: ReactNode;
}

export default function AdminTabBar({
  tabs,
  activeTab,
  onTabChange,
  moduleId,
  draggable = true,
  className,
  vertical = false,
  wrap = true,
  children,
  onTabHover,
  rightSlot,
}: AdminTabBarProps) {
  const { registerSubTabs, registerOnChange, clearSubTabs } = useModuleTabs();

  /**
   * Alt+← / Alt+→ recorren las sub-tabs del módulo activo.
   * Alt+1..9 ya está tomado para saltar entre MÓDULOS (useKeyboardShortcuts),
   * así que acá van las flechas: mismo gesto mental que cambiar de pestaña.
   * Se saltean las deshabilitadas y da la vuelta al llegar al extremo.
   */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
      // Mismo guard que el resto de atajos: nada de robar teclas mientras se
      // escribe en un campo o hay un modal abierto.
      if (isEditableTarget(e.target) || isModalOpen()) return;
      const usables = tabs.filter((t) => !t.disabled);
      if (usables.length < 2) return;
      const i = usables.findIndex((t) => t.id === activeTab);
      if (i === -1) return;
      e.preventDefault();
      const paso = e.key === "ArrowRight" ? 1 : -1;
      const siguiente = usables[(i + paso + usables.length) % usables.length];
      onTabChange(siguiente.id);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [tabs, activeTab, onTabChange]);

  // Register tabs in sidebar context so sidebar can render them
  useEffect(() => {
    registerSubTabs(
      tabs.map((t) => ({ id: t.id, label: t.label, icon: t.icon })),
      activeTab,
    );
    registerOnChange(onTabChange);
    return () => clearSubTabs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs.length, registerSubTabs, registerOnChange, clearSubTabs]);

  // Keep sidebar in sync with active tab changes from module
  useEffect(() => {
    registerSubTabs(
      tabs.map((t) => ({ id: t.id, label: t.label, icon: t.icon })),
      activeTab,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

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
          "lg:border-r lg:border-gray-200 lg:dark:border-[var(--rule-base)]",
          "lg:bg-white lg:dark:bg-[var(--surface-raised)]",
          "lg:pt-1 lg:pb-4",
        )}>
          <div className="grid grid-cols-2 gap-0.5 sm:grid-cols-3 lg:grid-cols-1 lg:pt-0">
            {orderedTabs.map((tab) => {
              const Icon = tab.icon;

              return (
                <button
                  key={tab.id}
                  onClick={() => !tab.disabled && onTabChange(tab.id)}
                  /* La pestaña activa sólo se distinguía por el color y el borde: un
                     lector de pantalla leía botones iguales sin decir en cuál estás. */
                  aria-current={activeTab === tab.id ? "page" : undefined}
                  onMouseEnter={() => onTabHover?.(tab.id)}
                  title={tab.title ?? tab.label}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-[length:var(--ts-sm)] transition-all duration-[var(--dur-fast)]",
                    "lg:rounded-none lg:rounded-r-lg",
                    activeTab === tab.id
                      ? "bg-primary/10 font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)] border-l-[3px] border-l-primary dark:bg-primary/15"
                      : "text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] dark:hover:bg-white/[0.06] border-l-[3px] border-l-transparent",
                    "rounded-lg lg:rounded-none lg:rounded-r-lg",
                    tab.disabled && "cursor-not-allowed opacity-40",
                  )}
                >
                  {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
                  <span className="truncate">{tab.label}</span>
                  {tab.badge != null && (
                    <span className="ml-auto flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded-full bg-[var(--data-error-500)] px-1 text-[length:var(--ts-2xs)] font-bold text-white">
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
              className="mt-1.5 w-full border-t border-[var(--rule-soft)] px-3 pt-1.5 text-left text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] transition-colors hover:text-primary dark:border-white/10"
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
    <div className={cn("@container relative", className)}>
      {canScrollLeft && (
        <button
          onClick={() => scrollTabs("left")}
          className="absolute left-0 top-0 bottom-0 z-10 flex w-10 items-center bg-linear-to-r from-[var(--surface-canvas)] via-[var(--surface-canvas)]/90 to-transparent transition-opacity duration-[var(--dur-base)]"
          aria-label="Ver tabs anteriores"
        >
          <ChevronLeft className="h-4 w-4 text-[var(--text-secondary)]" />
        </button>
      )}

      <div
        ref={tabsRef}
        onScroll={checkScroll}
        className={cn(
          "-mx-1 flex gap-0.5 border-b border-[var(--rule-base)] px-1 sm:gap-1",
          // Angosto: una sola fila que se desliza (recupera ~90px verticales
          // que las 3 filas del wrap le robaban al contenido). Desde 48rem de
          // CONTENEDOR —no de viewport, que ignora el ancho del sidebar—
          // vuelve el wrap de siempre.
          wrap
            ? "overflow-x-auto scroll-smooth scrollbar-none @min-[48rem]:flex-wrap @min-[48rem]:gap-y-1 @min-[48rem]:overflow-x-visible"
            : "overflow-x-auto scroll-smooth scrollbar-none",
        )}
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
              aria-current={activeTab === tab.id ? "page" : undefined}
              onMouseEnter={() => onTabHover?.(tab.id)}
              disabled={tab.disabled}
              title={tab.title ?? tab.label}
              className={cn(
                // Mobile: tap target accesible (min ~44px alto via py-2.5 + texto sm).
                // Desktop: layout original más compacto.
                "flex shrink-0 items-center gap-2 whitespace-nowrap border-b-[3px] px-3 py-2.5 text-sm transition-all duration-[var(--dur-base)] sm:gap-1.5 sm:px-4 sm:py-2.5 sm:text-sm",
                // El `grow` de antes (tabs estiradas para justificar las filas
                // en móvil) ya no aplica: en angosto la barra es una sola fila
                // deslizable, no un wrap de varias filas. Se conserva sólo el
                // padding compacto.
                wrap && "max-sm:px-2",
                draggable && "cursor-grab active:cursor-grabbing",
                activeTab === tab.id
                  ? "border-primary bg-primary/5 font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)]"
                  : "border-transparent font-normal text-[var(--text-secondary)] hover:bg-[var(--surface-alt)] hover:text-[var(--text-primary)]",
                tab.disabled && "cursor-not-allowed opacity-40",
                draggedTab === tab.id && "scale-95 opacity-40",
                dragOverTab === tab.id && draggedTab !== tab.id && "rounded-t-lg ring-2 ring-primary ring-offset-1",
              )}
            >
              {/* El handle de reorden por drag solo aplica en desktop (en touch
                  el drag de sub-tabs no es un gesto usable y el ⋮⋮ es ruido). */}
              {draggable && <GripVertical className="hidden lg:inline-block h-3 w-3 shrink-0 opacity-30" />}
              {Icon && <Icon className="h-4 w-4 shrink-0 sm:h-3.5 sm:w-3.5" />}
              <span>{tab.shortLabel || tab.label}</span>
              {tab.badge != null && (
                <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--data-error-500)] px-1 text-[length:var(--ts-2xs)] font-bold text-white">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}

        {isReordered && (
          <button
            onClick={resetOrder}
            className="ml-1 shrink-0 whitespace-nowrap px-2 py-1.5 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] transition-colors hover:text-primary"
            title="Restablecer orden de tabs"
          >
            Restablecer
          </button>
        )}

        {/* Slot derecho — status chip u otras acciones contextuales.
            ml-auto empuja todo a la derecha, pr-2 margen del borde. */}
        {rightSlot && (
          <div className="ml-auto flex shrink-0 items-center pr-2">
            {rightSlot}
          </div>
        )}
      </div>

      {canScrollRight && (
        <button
          onClick={() => scrollTabs("right")}
          className="absolute right-0 top-0 bottom-0 z-10 flex w-10 items-center justify-end bg-linear-to-l from-[var(--surface-canvas)] via-[var(--surface-canvas)]/90 to-transparent transition-opacity duration-[var(--dur-base)]"
          aria-label="Ver más tabs"
        >
          <ChevronRight className="h-4 w-4 text-[var(--text-secondary)]" />
        </button>
      )}
    </div>
    {children}
    </>
  );
}