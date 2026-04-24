"use client";

import { useEffect, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight, Maximize2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

/**
 * ChartPresentationModal — modal fullscreen para "presentar" un chart.
 *
 * Contexto: el dashboard tiene 8-12 charts por tab. En reuniones o al
 * enfocarse en un dato, ayuda ver UNO solo grande, sin distractores,
 * con navegacion para pasar al siguiente sin cerrar el modal.
 *
 * Features:
 *  - Fondo blanco total (no es overlay oscuro).
 *  - Chart centrado grande (80% viewport).
 *  - Flecha izquierda/derecha (botones + teclas ← →).
 *  - Indicador "3 / 7" arriba.
 *  - ESC cierra.
 *  - Scroll horizontal mouse wheel + touch swipe.
 *  - Persistente en el DOM via portal (fuera del tree del card).
 */

export interface ChartPresentationItem {
  id: string;
  title: string;
  render: () => ReactNode;
}

interface Props {
  items: ChartPresentationItem[];
  activeId: string | null;
  onClose: () => void;
  onNavigate: (id: string) => void;
}

export function ChartPresentationModal({ items, activeId, onClose, onNavigate }: Props) {
  const activeIdx = items.findIndex((i) => i.id === activeId);
  const activeItem = activeIdx >= 0 ? items[activeIdx] : null;

  const hasPrev = activeIdx > 0;
  const hasNext = activeIdx >= 0 && activeIdx < items.length - 1;

  const goPrev = useCallback(() => {
    if (hasPrev) onNavigate(items[activeIdx - 1].id);
  }, [hasPrev, items, activeIdx, onNavigate]);

  const goNext = useCallback(() => {
    if (hasNext) onNavigate(items[activeIdx + 1].id);
  }, [hasNext, items, activeIdx, onNavigate]);

  useEffect(() => {
    if (!activeItem) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    };
    document.addEventListener("keydown", onKey);
    // Lock body scroll while modal is open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [activeItem, onClose, goPrev, goNext]);

  if (!activeItem || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Presentación: ${activeItem.title}`}
      className="fixed inset-0 z-[9999] bg-white flex flex-col animate-in fade-in duration-200"
    >
      {/* Header barra — titulo + indicador + cerrar */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center justify-center h-8 w-8 rounded-md bg-gray-100">
            <Maximize2 className="h-4 w-4 text-gray-700" />
          </span>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
              Presentación · {activeIdx + 1} de {items.length}
            </p>
            <h2 className="text-lg font-extrabold tracking-tight text-gray-900 leading-tight">
              {activeItem.title}
            </h2>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors"
          aria-label="Cerrar presentación"
        >
          <X className="h-4 w-4" />
          <span>Cerrar</span>
          <kbd className="hidden sm:inline-block text-[10px] font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded border border-gray-200">
            Esc
          </kbd>
        </button>
      </header>

      {/* Main area con flechas laterales */}
      <div className="flex-1 flex items-stretch relative overflow-hidden">
        {/* Flecha izquierda */}
        <button
          type="button"
          onClick={goPrev}
          disabled={!hasPrev}
          aria-label="Gráfico anterior"
          className={cn(
            "absolute left-4 top-1/2 -translate-y-1/2 z-10",
            "inline-flex items-center justify-center h-12 w-12 rounded-full",
            "bg-white border border-gray-200 shadow-sm",
            "text-gray-700 hover:text-gray-900 hover:bg-gray-50",
            "transition-all",
            !hasPrev && "opacity-30 cursor-not-allowed",
          )}
        >
          <ChevronLeft className="h-6 w-6" />
        </button>

        {/* Chart principal */}
        <div className="flex-1 flex items-center justify-center px-16 py-8 overflow-auto">
          <div
            className="w-full max-w-6xl mx-auto"
            style={{
              // Permitir que el chart interno use toda la altura disponible.
              minHeight: "60vh",
            }}
          >
            {activeItem.render()}
          </div>
        </div>

        {/* Flecha derecha */}
        <button
          type="button"
          onClick={goNext}
          disabled={!hasNext}
          aria-label="Gráfico siguiente"
          className={cn(
            "absolute right-4 top-1/2 -translate-y-1/2 z-10",
            "inline-flex items-center justify-center h-12 w-12 rounded-full",
            "bg-white border border-gray-200 shadow-sm",
            "text-gray-700 hover:text-gray-900 hover:bg-gray-50",
            "transition-all",
            !hasNext && "opacity-30 cursor-not-allowed",
          )}
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      </div>

      {/* Footer — thumbnail strip navigable */}
      <footer className="border-t border-gray-200 px-6 py-3 bg-gray-50 shrink-0">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin pb-1">
          {items.map((it, idx) => {
            const isActive = it.id === activeId;
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => onNavigate(it.id)}
                className={cn(
                  "shrink-0 inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors",
                  isActive
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-600 border-gray-300 hover:border-gray-400 hover:text-gray-900",
                )}
              >
                <span className="tabular-nums font-bold">{idx + 1}</span>
                <span className="max-w-[180px] truncate">{it.title}</span>
              </button>
            );
          })}
        </div>
      </footer>
    </div>,
    document.body,
  );
}
