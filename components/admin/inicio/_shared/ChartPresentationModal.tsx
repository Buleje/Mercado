"use client";

import { useEffect, useCallback, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { toPng } from "html-to-image";
import { toast } from "sonner";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Download,
  Play,
  Pause,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

/**
 * ChartPresentationModal — modal fullscreen para "presentar" un chart.
 *
 * Features:
 *  - Fondo blanco total, chart centrado grande.
 *  - Navegacion: flechas laterales + teclas ← → + footer thumbnail strip +
 *    scroll con rueda del mouse (debounced).
 *  - Esc cierra.
 *  - Export PNG del chart activo (icono download).
 *  - Modo TV: autoplay que rota entre charts cada N segundos con progress
 *    bar visible. Pausa al interactuar o pulsar el boton.
 *  - Portal a document.body (fuera del DOM del card).
 *  - Body scroll lock mientras abierto.
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
  /** Intervalo del modo TV en ms. Default 7000 (7s). */
  autoplayIntervalMs?: number;
}

const WHEEL_DEBOUNCE_MS = 350;

export function ChartPresentationModal({
  items,
  activeId,
  onClose,
  onNavigate,
  autoplayIntervalMs = 7000,
}: Props) {
  const activeIdx = items.findIndex((i) => i.id === activeId);
  const activeItem = activeIdx >= 0 ? items[activeIdx] : null;

  const hasPrev = activeIdx > 0;
  const hasNext = activeIdx >= 0 && activeIdx < items.length - 1;

  const chartAreaRef = useRef<HTMLDivElement | null>(null);
  const wheelLockRef = useRef(false);
  const [isExporting, setIsExporting] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [autoplayProgress, setAutoplayProgress] = useState(0);

  const goPrev = useCallback(() => {
    if (hasPrev) onNavigate(items[activeIdx - 1].id);
  }, [hasPrev, items, activeIdx, onNavigate]);

  const goNext = useCallback(() => {
    if (hasNext) {
      onNavigate(items[activeIdx + 1].id);
    } else if (autoplay) {
      // Modo TV: wrap-around al final.
      onNavigate(items[0].id);
    }
  }, [hasNext, items, activeIdx, onNavigate, autoplay]);

  // ── Keyboard nav ──
  useEffect(() => {
    if (!activeItem) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
      else if (e.key === " ") {
        e.preventDefault();
        setAutoplay((a) => !a);
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [activeItem, onClose, goPrev, goNext]);

  // ── Wheel nav (debounced) ──
  useEffect(() => {
    if (!activeItem) return;
    const el = chartAreaRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Solo capturamos si el scroll es primariamente horizontal o si el
      // usuario mantiene Shift — asi no interferimos con scroll natural.
      const isHorizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      const withShift = e.shiftKey;
      if (!isHorizontal && !withShift) return;
      e.preventDefault();
      if (wheelLockRef.current) return;
      wheelLockRef.current = true;
      if ((e.deltaX > 0 || (withShift && e.deltaY > 0)) && hasNext) {
        goNext();
      } else if ((e.deltaX < 0 || (withShift && e.deltaY < 0)) && hasPrev) {
        goPrev();
      }
      window.setTimeout(() => {
        wheelLockRef.current = false;
      }, WHEEL_DEBOUNCE_MS);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [activeItem, goNext, goPrev, hasNext, hasPrev]);

  // ── Autoplay (Modo TV) ──
  useEffect(() => {
    if (!autoplay || !activeItem) {
      setAutoplayProgress(0);
      return;
    }
    const start = Date.now();
    const tickMs = 50;
    const tick = window.setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(100, (elapsed / autoplayIntervalMs) * 100);
      setAutoplayProgress(pct);
      if (elapsed >= autoplayIntervalMs) {
        window.clearInterval(tick);
        goNext();
      }
    }, tickMs);
    return () => window.clearInterval(tick);
  }, [autoplay, activeId, activeItem, goNext, autoplayIntervalMs]);

  // ── Exportar PNG ──
  const handleExport = useCallback(async () => {
    const el = chartAreaRef.current;
    if (!el || !activeItem) return;
    setIsExporting(true);
    try {
      const dataUrl = await toPng(el, {
        backgroundColor: "#ffffff",
        cacheBust: true,
        pixelRatio: 2,
        // Filtrar elementos absolutamente posicionados (flechas, botones)
        // para que el screenshot muestre solo el chart limpio.
        filter: (node) => {
          if (!(node instanceof HTMLElement)) return true;
          if (node.dataset.exportHide === "true") return false;
          return true;
        },
      });
      const link = document.createElement("a");
      const safeTitle = activeItem.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      link.download = `${safeTitle}-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = dataUrl;
      link.click();
      toast.success("Grafico exportado", {
        description: `${activeItem.title} · descargado como PNG`,
        duration: 2500,
      });
    } catch (err) {
      toast.error("No se pudo exportar", {
        description: err instanceof Error ? err.message : "Error desconocido",
        duration: 3000,
      });
    } finally {
      setIsExporting(false);
    }
  }, [activeItem]);

  if (!activeItem || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Presentación: ${activeItem.title}`}
      className="fixed inset-0 z-[9999] bg-white flex flex-col animate-in fade-in duration-200"
    >
      {/* Header barra — titulo + indicador + acciones */}
      <header
        className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0"
        data-export-hide="true"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="inline-flex items-center justify-center h-8 w-8 rounded-md bg-gray-100 shrink-0">
            <Maximize2 className="h-4 w-4 text-gray-700" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
              Presentación · {activeIdx + 1} de {items.length}
              {autoplay && <span className="ml-2 text-[var(--data-success)]">· Modo TV</span>}
            </p>
            <h2 className="text-lg font-extrabold tracking-tight text-gray-900 leading-tight truncate">
              {activeItem.title}
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Export PNG */}
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting}
            aria-label="Descargar PNG"
            title="Descargar este gráfico como imagen"
            className={cn(
              "inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold transition-colors",
              "border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400",
              isExporting && "opacity-60 cursor-wait",
            )}
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">{isExporting ? "Exportando…" : "PNG"}</span>
          </button>
          {/* Modo TV toggle */}
          <button
            type="button"
            onClick={() => setAutoplay((a) => !a)}
            aria-label={autoplay ? "Pausar modo TV" : "Iniciar modo TV"}
            title={
              autoplay
                ? "Pausar rotación automática"
                : `Modo TV — rota cada ${Math.round(autoplayIntervalMs / 1000)}s (o pulsa espacio)`
            }
            className={cn(
              "inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold transition-colors",
              autoplay
                ? "bg-[var(--data-success)] text-white border-[var(--data-success)]"
                : "border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400",
            )}
          >
            {autoplay ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            <span className="hidden sm:inline">{autoplay ? "Pausar" : "Modo TV"}</span>
          </button>
          {/* Cerrar */}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors"
            aria-label="Cerrar presentación"
          >
            <X className="h-4 w-4" />
            <span className="hidden sm:inline">Cerrar</span>
            <kbd className="hidden md:inline-block text-[10px] font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded border border-gray-200">
              Esc
            </kbd>
          </button>
        </div>
      </header>

      {/* Autoplay progress bar */}
      {autoplay && (
        <div
          className="h-1 bg-gray-100 shrink-0 overflow-hidden"
          data-export-hide="true"
        >
          <div
            className="h-full bg-[var(--data-success)] transition-[width] duration-75 ease-linear"
            style={{ width: `${autoplayProgress}%` }}
            role="progressbar"
            aria-valuenow={Math.round(autoplayProgress)}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      )}

      {/* Main area con flechas laterales */}
      <div className="flex-1 flex items-stretch relative overflow-hidden">
        {/* Flecha izquierda */}
        <button
          type="button"
          onClick={goPrev}
          disabled={!hasPrev}
          aria-label="Gráfico anterior"
          data-export-hide="true"
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

        {/* Chart principal — ref para export/wheel */}
        <div
          ref={chartAreaRef}
          className="flex-1 flex items-center justify-center px-16 py-8 overflow-auto"
          onMouseEnter={() => {
            // Pausar autoplay al hover para dejar leer
            if (autoplay) setAutoplay(false);
          }}
        >
          <div
            className="w-full max-w-6xl mx-auto"
            style={{
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
          disabled={!hasNext && !autoplay}
          aria-label="Gráfico siguiente"
          data-export-hide="true"
          className={cn(
            "absolute right-4 top-1/2 -translate-y-1/2 z-10",
            "inline-flex items-center justify-center h-12 w-12 rounded-full",
            "bg-white border border-gray-200 shadow-sm",
            "text-gray-700 hover:text-gray-900 hover:bg-gray-50",
            "transition-all",
            !hasNext && !autoplay && "opacity-30 cursor-not-allowed",
          )}
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      </div>

      {/* Footer — thumbnail strip navigable */}
      <footer
        className="border-t border-gray-200 px-6 py-3 bg-gray-50 shrink-0"
        data-export-hide="true"
      >
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
        <p className="mt-2 text-[11px] text-gray-500 flex items-center gap-3 flex-wrap">
          <span>
            <kbd className="text-[10px] font-mono bg-white text-gray-600 px-1.5 py-0.5 rounded border border-gray-300">
              ← →
            </kbd>{" "}
            navegar
          </span>
          <span>
            <kbd className="text-[10px] font-mono bg-white text-gray-600 px-1.5 py-0.5 rounded border border-gray-300">
              Shift+rueda
            </kbd>{" "}
            scroll lateral
          </span>
          <span>
            <kbd className="text-[10px] font-mono bg-white text-gray-600 px-1.5 py-0.5 rounded border border-gray-300">
              Espacio
            </kbd>{" "}
            modo TV
          </span>
          <span>
            <kbd className="text-[10px] font-mono bg-white text-gray-600 px-1.5 py-0.5 rounded border border-gray-300">
              Esc
            </kbd>{" "}
            cerrar
          </span>
        </p>
      </footer>
    </div>,
    document.body,
  );
}
