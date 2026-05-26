"use client";

/**
 * NavProgress — barra de progreso de navegación global (estilo YouTube/Vercel).
 *
 * Problema que resuelve: en el App Router, al hacer clic en un <Link> la página
 * actual se queda "congelada" mientras Next descarga el RSC de la nueva ruta,
 * sin feedback inmediato. Los `loading.tsx` cubren la carga del segmento, pero
 * hay un micro-gap entre el clic y que aparezcan. Esta barra da feedback
 * INSTANTÁNEO al primer clic, en toda la app.
 *
 * Cómo funciona:
 *   - Intercepta clics en anchors internos (capture phase) → arranca la barra.
 *   - Avanza 0→90% mientras carga (no llega a 100 hasta completar).
 *   - Cuando cambia el pathname (navegación terminada) → 100% + fade out.
 *
 * Cero dependencias. Respeta clics modificados, target=_blank, externos,
 * hash, mailto/tel y misma-URL (no dispara en esos casos).
 */

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export default function NavProgress() {
  const pathname = usePathname();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState(false);
  const rafRef = useRef<number | null>(null);
  const trickleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Arranca la barra (con trickle hacia 90%).
  const start = () => {
    if (hideRef.current) clearTimeout(hideRef.current);
    setActive(true);
    setWidth(8);
    if (trickleRef.current) clearInterval(trickleRef.current);
    trickleRef.current = setInterval(() => {
      setWidth((w) => (w < 90 ? w + Math.max(0.5, (90 - w) * 0.08) : w));
    }, 200);
  };

  // Completa: 100% y fade out.
  const done = () => {
    if (trickleRef.current) clearInterval(trickleRef.current);
    setWidth(100);
    hideRef.current = setTimeout(() => {
      setActive(false);
      setWidth(0);
    }, 260);
  };

  // Completar en cada cambio de ruta.
  useEffect(() => {
    done();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Interceptar clics en links internos.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }
      const target = e.target as HTMLElement | null;
      const a = target?.closest?.("a");
      if (!a) return;
      // Anchors con descarga, nueva pestaña o rel externo → no interceptar.
      if (a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return;
      }
      // Distinto origen → navegación externa, no aplica.
      if (a.origin !== window.location.origin) return;
      // Misma URL exacta → no hay navegación.
      if (a.pathname === window.location.pathname && a.search === window.location.search) {
        return;
      }
      start();
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      if (trickleRef.current) clearInterval(trickleRef.current);
      if (hideRef.current) clearTimeout(hideRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  if (!active && width === 0) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[9999] h-[3px]"
      style={{ opacity: active ? 1 : 0, transition: "opacity .25s ease" }}
    >
      <div
        className="h-full rounded-r-full"
        style={{
          width: `${width}%`,
          background:
            "linear-gradient(90deg, var(--accent), var(--accent-dark, var(--accent)))",
          boxShadow: "0 0 8px var(--accent), 0 0 4px var(--accent)",
          transition: "width .2s ease",
        }}
      />
    </div>
  );
}
