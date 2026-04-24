"use client";

/**
 * FeatureSpotlight — Popover "nueva feature" que apunta a un elemento.
 *
 * Diferente a GuidedTour: es UN solo tooltip para UN feature nuevo (ej.
 * "Probá el Chef IA ←"). Se muestra una sola vez via localStorage key.
 *
 * Uso:
 *   <FeatureSpotlight
 *     id="chef-ia-launch-2026-04"
 *     target="[data-spotlight='chef-ia']"
 *     title="Nuevo: Chef IA"
 *     description="Pedile una receta y armamos tu carrito en 1 tap."
 *     placement="bottom"
 *     badge="Nuevo"
 *   />
 */

import { useEffect, useState, useCallback } from "react";
import { Sparkles, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface Props {
  /** localStorage key unica. Incluye version para re-disparar */
  id: string;
  target: string; // selector CSS
  title: string;
  description: string;
  /** Texto del badge arriba. Default "Nuevo" */
  badge?: string | null;
  placement?: "top" | "bottom" | "left" | "right";
  /** Icono decorativo. Default <Sparkles /> */
  icon?: React.ReactNode;
  /** CTA opcional */
  cta?: { label: string; onClick: () => void };
  /** Disparar automaticamente. Default true */
  autoShow?: boolean;
  /** Delay en ms antes de mostrar. Default 500 */
  showDelayMs?: number;
}

const STORAGE_PREFIX = "buleje-spotlight-";

export default function FeatureSpotlight({
  id,
  target,
  title,
  description,
  badge = "Nuevo",
  placement = "bottom",
  icon = <Sparkles className="h-4 w-4 text-[var(--accent)]" strokeWidth={2} aria-hidden />,
  cta,
  autoShow = true,
  showDelayMs = 500,
}: Props) {
  const [visible, setVisible] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const dismiss = useCallback(() => {
    localStorage.setItem(`${STORAGE_PREFIX}${id}`, "1");
    setVisible(false);
  }, [id]);

  useEffect(() => {
    if (!autoShow || typeof window === "undefined") return;
    const seen = localStorage.getItem(`${STORAGE_PREFIX}${id}`) === "1";
    if (seen) return;

    const timer = setTimeout(() => {
      const el = document.querySelector<HTMLElement>(target);
      if (!el) return;
      setRect(el.getBoundingClientRect());
      setVisible(true);
    }, showDelayMs);

    return () => clearTimeout(timer);
  }, [id, target, autoShow, showDelayMs]);

  // Reposicionar al resize/scroll
  useEffect(() => {
    if (!visible) return;
    const reposition = () => {
      const el = document.querySelector<HTMLElement>(target);
      if (!el) return;
      setRect(el.getBoundingClientRect());
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, { passive: true });
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition);
    };
  }, [visible, target]);

  if (!visible || !rect) return null;

  const MARGIN = 12;
  const style: React.CSSProperties = (() => {
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

  return (
    <div
      role="dialog"
      aria-label={title}
      className={cn(
        "fixed z-[90] w-[min(calc(100vw-2rem),20rem)]",
        "rounded-2xl bg-[var(--surface-raised)] shadow-2xl border border-[var(--accent-soft)] p-4",
        "motion-safe:animate-[bounceIn_0.5s_cubic-bezier(0.34,1.56,0.64,1)]",
      )}
      style={style}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 h-8 w-8 rounded-full bg-[var(--accent-soft)] flex items-center justify-center">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          {badge && (
            <span className="inline-block mb-1 rounded-full bg-[var(--accent)] text-[var(--surface-canvas)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide">
              {badge}
            </span>
          )}
          <h3 className="text-sm font-extrabold text-[var(--text-primary)] tracking-tight">{title}</h3>
          <p className="mt-1 text-xs text-[var(--text-secondary)] leading-snug">{description}</p>
          {cta && (
            <button
              type="button"
              onClick={() => {
                cta.onClick();
                dismiss();
              }}
              className="mt-3 inline-flex items-center rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-3 py-1.5 text-xs font-bold hover:bg-[var(--accent)] transition-colors"
            >
              {cta.label}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Cerrar"
          className="shrink-0 p-1 -m-1 rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        </button>
      </div>
    </div>
  );
}

export function resetSpotlight(id: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(`${STORAGE_PREFIX}${id}`);
}
