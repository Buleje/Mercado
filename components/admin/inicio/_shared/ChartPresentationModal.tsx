"use client";

import { useEffect, useCallback, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
// html-to-image (~35KB gz) lazy-loaded — solo se descarga cuando el usuario
// exporta o copia. AICommandCenter ya usa el mismo patron.
import { toast } from "sonner";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Maximize,
  Minimize,
  Download,
  Copy,
  Play,
  Pause,
  Timer,
} from "@buleje/design-system/icons";
import { SectionTitle } from "@buleje/design-system";
import { cn } from "@/lib/utils";

/**
 * ChartPresentationModal — modal fullscreen para "presentar" un chart.
 *
 * Features (v2 2026-07-14, brief Brandon: colores calibrados al DS + sin cortes):
 *  - Superficies 100% con tokens del DS (light y dark consistentes con el admin).
 *  - Contenido alto NO se corta: centrado con margen auto → scrollea desde arriba.
 *  - Navegacion: flechas laterales + ← → + numeros 1-9 + Home/End + thumbnails +
 *    Shift+rueda (debounced). Esc cierra.
 *  - Export PNG y COPIAR al portapapeles, con el fondo del tema real (no blanco fijo).
 *  - Pantalla completa REAL del navegador (tecla F o boton) — ideal para TV.
 *  - Modo TV: autoplay con intervalo configurable (5/7/10/15s) + progress bar.
 *  - Portal a document.body + body scroll lock.
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
  /** Intervalo inicial del modo TV en ms. Default 7000 (7s). */
  autoplayIntervalMs?: number;
}

const WHEEL_DEBOUNCE_MS = 350;
const TV_INTERVALS_MS = [5000, 7000, 10000, 15000];

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

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const chartAreaRef = useRef<HTMLDivElement | null>(null);
  const wheelLockRef = useRef(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [autoplayProgress, setAutoplayProgress] = useState(0);
  const [intervalMs, setIntervalMs] = useState(
    TV_INTERVALS_MS.includes(autoplayIntervalMs) ? autoplayIntervalMs : 7000,
  );
  const [isFs, setIsFs] = useState(false);

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

  // ── Pantalla completa real (F) ──
  const toggleFullscreen = useCallback(() => {
    // Los rechazos de la Fullscreen API (sin gesto de usuario / permisos) no son
    // accionables: la UI simplemente queda como estaba. Silenciarlos es intencional.
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    } else {
      dialogRef.current?.requestFullscreen?.().catch(() => undefined);
    }
  }, []);
  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  // Al desmontar/cerrar, salir de fullscreen si quedó activo (rechazo = no accionable).
  useEffect(() => {
    if (activeItem) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
  }, [activeItem]);

  // ── Keyboard nav ──
  useEffect(() => {
    if (!activeItem) return;
    const onKey = (e: KeyboardEvent) => {
      // No robar teclas cuando el usuario está tipeando en un input del chart
      // presentado (ej. los date-pickers de la tabla de conversión).
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === "Escape") {
        // Con fullscreen activo, Esc primero sale del fullscreen (el navegador
        // ya lo hace solo); el segundo Esc cierra el modal.
        if (!document.fullscreenElement) onClose();
      } else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
      else if (e.key === "Home" && items.length) onNavigate(items[0].id);
      else if (e.key === "End" && items.length) onNavigate(items[items.length - 1].id);
      else if (e.key === "f" || e.key === "F") toggleFullscreen();
      else if (e.key === " ") {
        e.preventDefault();
        setAutoplay((a) => !a);
      } else if (/^[1-9]$/.test(e.key)) {
        const target = items[Number(e.key) - 1];
        if (target) onNavigate(target.id);
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [activeItem, onClose, goPrev, goNext, items, onNavigate, toggleFullscreen]);

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
      const pct = Math.min(100, (elapsed / intervalMs) * 100);
      setAutoplayProgress(pct);
      if (elapsed >= intervalMs) {
        window.clearInterval(tick);
        goNext();
      }
    }, tickMs);
    return () => window.clearInterval(tick);
  }, [autoplay, activeId, activeItem, goNext, intervalMs]);

  // ── Captura PNG (compartida por exportar y copiar) — fondo del TEMA real ──
  const captureDataUrl = useCallback(async () => {
    const el = chartAreaRef.current;
    if (!el) return null;
    const { toPng } = await import("html-to-image");
    // Fondo = el del dialog según el tema activo (antes era #fff fijo → los
    // PNG en dark salían con texto claro sobre blanco, ilegibles).
    const bg = dialogRef.current ? getComputedStyle(dialogRef.current).backgroundColor : "#ffffff";
    return toPng(el, {
      backgroundColor: bg && bg !== "rgba(0, 0, 0, 0)" ? bg : "#ffffff",
      cacheBust: true,
      pixelRatio: 2,
      // Filtrar controles absolutos (flechas, botones) → screenshot limpio.
      filter: (node) => {
        if (!(node instanceof HTMLElement)) return true;
        if (node.dataset.exportHide === "true") return false;
        return true;
      },
    });
  }, []);

  const handleExport = useCallback(async () => {
    if (!activeItem) return;
    setIsExporting(true);
    try {
      const dataUrl = await captureDataUrl();
      if (!dataUrl) return;
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
  }, [activeItem, captureDataUrl]);

  // Copiar el chart como imagen al portapapeles (pegarlo directo en WhatsApp/Word).
  const handleCopy = useCallback(async () => {
    if (!activeItem) return;
    setIsCopying(true);
    try {
      if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
        throw new Error("Este navegador no permite copiar imágenes");
      }
      const dataUrl = await captureDataUrl();
      if (!dataUrl) return;
      const blob = await (await fetch(dataUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast.success("Copiado al portapapeles", {
        description: `${activeItem.title} · pegalo con Ctrl+V donde quieras`,
        duration: 2500,
      });
    } catch (err) {
      toast.error("No se pudo copiar", {
        description: err instanceof Error ? err.message : "Error desconocido",
        duration: 3000,
      });
    } finally {
      setIsCopying(false);
    }
  }, [activeItem, captureDataUrl]);

  const cycleInterval = () => {
    const i = TV_INTERVALS_MS.indexOf(intervalMs);
    setIntervalMs(TV_INTERVALS_MS[(i + 1) % TV_INTERVALS_MS.length]);
  };

  if (!activeItem || typeof document === "undefined") return null;

  const ctlBtn =
    "inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold transition-colors border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]";

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Presentación: ${activeItem.title}`}
      className="fixed inset-0 z-[9999] bg-[var(--surface-canvas)] flex flex-col animate-in fade-in duration-200"
    >
      {/* Header barra — titulo + indicador + acciones */}
      <header
        className="flex items-center justify-between gap-3 px-6 py-4 border-b border-[var(--rule-soft)] bg-[var(--surface-raised)] shrink-0"
        data-export-hide="true"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="inline-flex items-center justify-center h-9 w-9 rounded-xl bg-primary/10 shrink-0">
            <Maximize2 className="h-4 w-4 text-[var(--accent)]" />
          </span>
          <div className="min-w-0">
            <p className="text-[length:var(--ts-xs)] font-bold uppercase tracking-wider text-[var(--accent)]">
              Presentación · {activeIdx + 1} de {items.length}
              {autoplay && <span className="ml-2">· Modo TV</span>}
            </p>
            <SectionTitle as="h2" className="font-display text-xl sm:text-2xl tracking-tight text-[var(--text-primary)] leading-tight truncate">
              {activeItem.title}
            </SectionTitle>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {/* Copiar al portapapeles */}
          <button
            type="button"
            onClick={handleCopy}
            disabled={isCopying}
            aria-label="Copiar imagen al portapapeles"
            title="Copiar este gráfico como imagen (pegar con Ctrl+V)"
            className={cn(ctlBtn, isCopying && "opacity-60 cursor-wait")}
          >
            <Copy className="h-4 w-4" />
            <span className="hidden lg:inline">{isCopying ? "Copiando…" : "Copiar"}</span>
          </button>
          {/* Export PNG */}
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting}
            aria-label="Descargar PNG"
            title="Descargar este gráfico como imagen"
            className={cn(ctlBtn, isExporting && "opacity-60 cursor-wait")}
          >
            <Download className="h-4 w-4" />
            <span className="hidden lg:inline">{isExporting ? "Exportando…" : "PNG"}</span>
          </button>
          {/* Pantalla completa real */}
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFs ? "Salir de pantalla completa" : "Pantalla completa"}
            title={isFs ? "Salir de pantalla completa (F)" : "Pantalla completa del navegador (F) — ideal para TV"}
            className={ctlBtn}
          >
            {isFs ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            <span className="hidden lg:inline">{isFs ? "Salir" : "Pantalla"}</span>
          </button>
          {/* Intervalo del modo TV */}
          <button
            type="button"
            onClick={cycleInterval}
            aria-label={`Intervalo del modo TV: ${intervalMs / 1000} segundos`}
            title="Cada cuántos segundos rota el modo TV (click para cambiar)"
            className={ctlBtn}
          >
            <Timer className="h-4 w-4" />
            <span className="tabular-nums">{intervalMs / 1000}s</span>
          </button>
          {/* Modo TV toggle */}
          <button
            type="button"
            onClick={() => setAutoplay((a) => !a)}
            aria-label={autoplay ? "Pausar modo TV" : "Iniciar modo TV"}
            title={autoplay ? "Pausar rotación automática" : `Modo TV — rota cada ${Math.round(intervalMs / 1000)}s (o pulsa espacio)`}
            className={cn(
              "inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold transition-colors",
              autoplay
                ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]",
            )}
          >
            {autoplay ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            <span className="hidden lg:inline">{autoplay ? "Pausar" : "Modo TV"}</span>
          </button>
          {/* Cerrar */}
          <button type="button" onClick={onClose} className={ctlBtn} aria-label="Cerrar presentación">
            <X className="h-4 w-4" />
            <span className="hidden lg:inline">Cerrar</span>
            <kbd className="hidden xl:inline-block text-[length:var(--ts-2xs)] font-mono bg-[var(--surface-sunken)] text-[var(--text-tertiary)] px-1.5 py-0.5 rounded border border-[var(--rule-soft)]">
              Esc
            </kbd>
          </button>
        </div>
      </header>

      {/* Autoplay progress bar */}
      {autoplay && (
        <div className="h-1 bg-[var(--surface-sunken)] shrink-0 overflow-hidden" data-export-hide="true">
          <div
            className="h-full bg-[var(--accent)] transition-[width] duration-75 ease-linear"
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
            "bg-[var(--surface-raised)] border border-[var(--rule-base)] shadow-sm",
            "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]",
            "transition-all",
            !hasPrev && "opacity-30 cursor-not-allowed",
          )}
        >
          <ChevronLeft className="h-6 w-6" />
        </button>

        {/* Chart principal — ref para export/wheel.
            data-chart-presentation activa overrides CSS del global para que
            los wrappers internos de Recharts (altura fija) crezcan a ~65vh.
            OJO layout: el hijo centra con my-auto (NO justify-center) — con
            contenido más alto que la pantalla, justify-center recorta la parte
            de arriba y no hay scroll que la alcance (bug clásico de flexbox). */}
        <div
          ref={chartAreaRef}
          data-chart-presentation="true"
          className="flex-1 flex flex-col px-8 sm:px-12 py-6 overflow-auto"
          onMouseEnter={() => {
            // Pausar autoplay al hover para dejar leer
            if (autoplay) setAutoplay(false);
          }}
        >
          <div className="w-full max-w-[1600px] mx-auto my-auto">
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
            "bg-[var(--surface-raised)] border border-[var(--rule-base)] shadow-sm",
            "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]",
            "transition-all",
            !hasNext && !autoplay && "opacity-30 cursor-not-allowed",
          )}
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      </div>

      {/* Footer — thumbnail strip navigable */}
      <footer
        className="border-t border-[var(--rule-soft)] px-6 py-3 bg-[var(--surface-raised)] shrink-0"
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
                  "shrink-0 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
                  isActive
                    ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                    : "bg-[var(--surface-canvas)] text-[var(--text-secondary)] border-[var(--rule-base)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]",
                )}
              >
                <span className="tabular-nums font-bold">{idx + 1}</span>
                <span className="max-w-[180px] truncate">{it.title}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[length:var(--ts-xs)] text-[var(--text-tertiary)] flex items-center gap-3 flex-wrap">
          <Hint k="← →" label="navegar" />
          <Hint k="1-9" label="ir al gráfico" />
          <Hint k="F" label="pantalla completa" />
          <Hint k="Espacio" label="modo TV" />
          <Hint k="Shift+rueda" label="scroll lateral" />
          <Hint k="Esc" label="cerrar" />
        </p>
      </footer>
    </div>,
    document.body,
  );
}

function Hint({ k, label }: { k: string; label: string }) {
  return (
    <span>
      <kbd className="text-[length:var(--ts-2xs)] font-mono bg-[var(--surface-canvas)] text-[var(--text-secondary)] px-1.5 py-0.5 rounded border border-[var(--rule-base)]">
        {k}
      </kbd>{" "}
      {label}
    </span>
  );
}
