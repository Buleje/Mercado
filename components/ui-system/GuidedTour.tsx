"use client";

/**
 * GuidedTour — Tour interactivo con tooltips posicionados sobre elementos reales.
 *
 * Cada step selecciona un elemento por selector o ref y dibuja:
 *  - Un spotlight (cutout circular/cuadrado alrededor del elemento)
 *  - Un tooltip con titulo, descripcion y CTAs (skip/next/done)
 *
 * Se dispara una sola vez via localStorage key. El user puede reanudar con
 * "Ver tour" desde ayuda.
 *
 * Uso:
 *   <GuidedTour
 *     tourId="marketplace-2026-04"
 *     steps={[
 *       { target: "#search-input", title: "Buscá aquí", description: "..."},
 *       { target: "[data-tour='cart']", title: "Tu carrito", description: "..."},
 *     ]}
 *   />
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { X, ChevronRight, ChevronLeft } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export interface TourStep {
  /** Selector CSS o elemento HTML */
  target: string | HTMLElement;
  title: string;
  description: string;
  /** Posicion del tooltip. Default "bottom" */
  placement?: "top" | "bottom" | "left" | "right";
  /** Forma del cutout. Default "rounded" */
  spotlight?: "circle" | "rounded" | "square";
  /** Skip step si el elemento no existe. Default true */
  skipIfMissing?: boolean;
  /** Callback cuando el step se activa */
  onEnter?: () => void;
}

interface Props {
  tourId: string;
  steps: TourStep[];
  /** Fuerza mostrar aunque ya se haya visto. Default false */
  forceShow?: boolean;
  /** Callback al terminar (done o skip) */
  onFinish?: (completed: boolean) => void;
}

const STORAGE_PREFIX = "buleje-tour-";

export default function GuidedTour({ tourId, steps, forceShow = false, onFinish }: Props) {
  const [active, setActive] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const scrollLockRef = useRef<string>("");

  // Check if should show
  useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = localStorage.getItem(`${STORAGE_PREFIX}${tourId}`) === "1";
    if (!seen || forceShow) {
      setActive(true);
      setCurrentIdx(0);
    }
  }, [tourId, forceShow]);

  // Lock body scroll
  useEffect(() => {
    if (!active) return;
    scrollLockRef.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = scrollLockRef.current;
    };
  }, [active]);

  // Measure target rect
  useEffect(() => {
    if (!active) return;
    const step = steps[currentIdx];
    if (!step) return;

    const findElement = (): HTMLElement | null => {
      if (typeof step.target === "string") {
        return document.querySelector<HTMLElement>(step.target);
      }
      return step.target;
    };

    const measure = () => {
      const el = findElement();
      if (!el) {
        if (step.skipIfMissing ?? true) {
          // Siguiente step
          if (currentIdx + 1 < steps.length) {
            setCurrentIdx(currentIdx + 1);
          } else {
            finish(false);
          }
        } else {
          setRect(null);
        }
        return;
      }
      step.onEnter?.();
      // Scroll into view
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      // Esperar un tick para que scroll termine
      requestAnimationFrame(() => {
        setRect(el.getBoundingClientRect());
      });
    };

    measure();

    const resizeObs = new ResizeObserver(measure);
    const el = findElement();
    if (el) resizeObs.observe(el);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });

    return () => {
      resizeObs.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, currentIdx]);

  const finish = useCallback(
    (completed: boolean) => {
      localStorage.setItem(`${STORAGE_PREFIX}${tourId}`, "1");
      setActive(false);
      onFinish?.(completed);
    },
    [tourId, onFinish],
  );

  const next = () => {
    if (currentIdx + 1 < steps.length) {
      setCurrentIdx(currentIdx + 1);
    } else {
      finish(true);
    }
  };
  const prev = () => {
    if (currentIdx > 0) setCurrentIdx(currentIdx - 1);
  };

  if (!active || !rect) return null;

  const step = steps[currentIdx];
  const placement = step.placement ?? "bottom";
  const spotlightShape = step.spotlight ?? "rounded";

  // Tooltip positioning
  const MARGIN = 12;
  const tooltipStyle: React.CSSProperties = (() => {
    switch (placement) {
      case "top":
        return { left: rect.left + rect.width / 2, top: rect.top - MARGIN, transform: "translate(-50%, -100%)" };
      case "left":
        return { left: rect.left - MARGIN, top: rect.top + rect.height / 2, transform: "translate(-100%, -50%)" };
      case "right":
        return { left: rect.right + MARGIN, top: rect.top + rect.height / 2, transform: "translate(0, -50%)" };
      case "bottom":
      default:
        return { left: rect.left + rect.width / 2, top: rect.bottom + MARGIN, transform: "translate(-50%, 0)" };
    }
  })();

  // Spotlight shape
  const spotRadius = spotlightShape === "circle" ? "50%" : spotlightShape === "rounded" ? "16px" : "4px";
  const PAD = 8;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
      className="fixed inset-0 z-[100] motion-safe:animate-[fadeIn_0.2s] motion-reduce:animate-none"
    >
      {/* SVG mask with cutout */}
      <svg
        aria-hidden
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: "none" }}
      >
        <defs>
          <mask id={`tour-mask-${tourId}`}>
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <rect
              x={rect.left - PAD}
              y={rect.top - PAD}
              width={rect.width + PAD * 2}
              height={rect.height + PAD * 2}
              rx={spotRadius}
              fill="black"
            />
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.65)"
          mask={`url(#tour-mask-${tourId})`}
        />
      </svg>

      {/* Halo animado alrededor del spotlight */}
      <div
        aria-hidden
        className="absolute pointer-events-none motion-safe:animate-pulse motion-reduce:animate-none"
        style={{
          left: rect.left - PAD - 4,
          top: rect.top - PAD - 4,
          width: rect.width + PAD * 2 + 8,
          height: rect.height + PAD * 2 + 8,
          borderRadius: spotRadius,
          border: "2px solid var(--accent)",
          boxShadow: "0 0 0 2px var(--accent-soft), 0 0 24px var(--accent-soft)",
        }}
      />

      {/* Tooltip */}
      <div
        className="absolute w-[min(calc(100vw-2rem),22rem)] rounded-2xl bg-[var(--surface-raised)] shadow-2xl p-5 space-y-3"
        style={tooltipStyle}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
              Paso {currentIdx + 1} de {steps.length}
            </p>
            <h3 id="tour-title" className="text-base font-extrabold text-[var(--text-primary)] tracking-tight">
              {step.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => finish(false)}
            aria-label="Cerrar tour"
            className="shrink-0 p-1 -m-1 rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
          >
            <X className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
        </div>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{step.description}</p>

        {/* Progress bar */}
        <div aria-hidden className="h-1 rounded-full bg-[var(--surface-sunken)] overflow-hidden">
          <div
            className="h-full bg-[var(--accent)] transition-all duration-300"
            style={{ width: `${((currentIdx + 1) / steps.length) * 100}%` }}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-2 pt-1">
          {currentIdx > 0 ? (
            <button
              type="button"
              onClick={prev}
              className="inline-flex items-center gap-1 text-xs font-bold text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              Anterior
            </button>
          ) : (
            <button
              type="button"
              onClick={() => finish(false)}
              className="text-xs font-bold text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Omitir tour
            </button>
          )}
          <button
            type="button"
            onClick={next}
            className={cn(
              "inline-flex items-center gap-1 rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)]",
              "px-4 py-2 text-xs font-bold hover:bg-[var(--accent)] transition-colors",
            )}
          >
            {currentIdx + 1 === steps.length ? "¡Listo!" : "Siguiente"}
            {currentIdx + 1 < steps.length && <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Helper: resetear un tour (para "Ver tour de nuevo")
 */
export function resetTour(tourId: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(`${STORAGE_PREFIX}${tourId}`);
}

/**
 * Helper: saber si ya fue visto
 */
export function wasTourSeen(tourId: string): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(`${STORAGE_PREFIX}${tourId}`) === "1";
}
