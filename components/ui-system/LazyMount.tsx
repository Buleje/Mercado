"use client";

/**
 * LazyMount — monta children solo cuando entra en viewport.
 *
 * Uso típico para secciones below-the-fold (recommendations,
 * recently-viewed, lives carrusel, etc.) que pegan al backend
 * pero no son críticas en el first paint.
 *
 * Performance: difiere fetch + render hasta que el usuario llega
 * scrolleando — bajan TTI y primer-paint sin cambiar UX.
 *
 * MK-44 — Sprint 1 marketplace blueprint.
 */

import { useState, useEffect, type ReactNode } from "react";
import { useInView } from "@buleje/design-system";

interface LazyMountProps {
  children: ReactNode;
  /**
   * Espacio reservado mientras no se monta (px o tailwind class).
   * Default: 200px para no hacer layout shift.
   */
  minHeight?: number | string;
  /**
   * Margin alrededor del viewport para empezar a montar antes de que
   * el usuario lo vea. Default: "200px".
   */
  rootMargin?: string;
  /**
   * Si una vez montado debería desmontarse al salir del viewport.
   * Default false (mantener montado para no perder estado).
   */
  unmountOnExit?: boolean;
}

export default function LazyMount({
  children,
  minHeight = 200,
  rootMargin = "200px",
  unmountOnExit = false,
}: LazyMountProps) {
  const [ref, isInView] = useInView({ threshold: 0, rootMargin });
  const [hasBeenInView, setHasBeenInView] = useState(false);

  // Sticky mount — una vez visible, queda visible (a menos que unmountOnExit).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (isInView && !hasBeenInView) setHasBeenInView(true);
  }, [isInView, hasBeenInView]);

  const showChildren = unmountOnExit ? isInView : hasBeenInView;

  const minH = typeof minHeight === "number" ? `${minHeight}px` : undefined;
  const cls = typeof minHeight === "string" ? minHeight : undefined;

  return (
    <div ref={ref} className={cls} style={minH ? { minHeight: minH } : undefined}>
      {showChildren ? children : null}
    </div>
  );
}
