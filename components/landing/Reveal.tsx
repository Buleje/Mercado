"use client";

/**
 * Reveal — wrapper que aplica fade-up cuando el elemento entra al viewport.
 * Inspirado en el scroll-triggered reveal de beastphilanthropy.org.
 * Zero deps — Intersection Observer + CSS transitions.
 */

import { useEffect, useRef, useState, type ReactNode, type ElementType } from "react";

interface Props {
  children: ReactNode;
  /** Retraso en ms antes de iniciar la animación. */
  delay?: number;
  /** Distancia inicial en px del translateY (default 32). */
  offset?: number;
  /** Duración total de la animación en ms (default 700). */
  duration?: number;
  /** Threshold del IntersectionObserver (default 0.01 — revela apenas asoma). */
  threshold?: number;
  /** Trigger una sola vez (default true). */
  once?: boolean;
  /** Tag HTML wrapper (default "div"). */
  as?: ElementType;
  className?: string;
  /** Direction (default "up"). */
  direction?: "up" | "down" | "left" | "right" | "none";
}

export function Reveal({
  children,
  delay = 0,
  offset = 32,
  duration = 700,
  threshold = 0.01,
  once = true,
  as: Tag = "div",
  className,
  direction = "up",
}: Props) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    // Respect prefers-reduced-motion
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            if (once) obs.disconnect();
          } else if (!once) {
            setVisible(false);
          }
        }
      },
      // Brandon 2026-07-05 (audit comprador): rootMargin POSITIVO abajo (300px)
      // = revela el contenido ANTES de que entre al viewport. Antes ("-10%") lo
      // revelaba recién 10% adentro → al scrollear rápido se veía un flash en
      // blanco (parecía que la página se colgaba). Ahora llega ya visible.
      { threshold, rootMargin: "0px 0px 300px 0px" },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [threshold, once]);

  const initialTransform =
    direction === "up"
      ? `translate3d(0, ${offset}px, 0)`
      : direction === "down"
        ? `translate3d(0, -${offset}px, 0)`
        : direction === "left"
          ? `translate3d(${offset}px, 0, 0)`
          : direction === "right"
            ? `translate3d(-${offset}px, 0, 0)`
            : "none";

  return (
    <Tag
      ref={ref as React.RefObject<HTMLDivElement>}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translate3d(0,0,0)" : initialTransform,
        transition: `opacity ${duration}ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms, transform ${duration}ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`,
        willChange: visible ? "auto" : "opacity, transform",
      }}
    >
      {children}
    </Tag>
  );
}
