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
import { PaicheMascot } from "@/components/ui-system/illustrations/PaicheMascot";

// Si la navegación tarda más que esto, mostramos el overlay del Paiche nadando.
const PAICHE_DELAY_MS = 400;
// Si la navegación NO termina en este tiempo (RSC/chunk que falla o cuelga),
// el overlay ofrece una SALIDA visible. Sin esto, `done()` sólo dispara al
// cambiar el pathname → una navegación que nunca completa dejaba al usuario
// atrapado para siempre en "Un toque… ya viene" (audit comprador 2026-07-05).
const ESCAPE_DELAY_MS = 5000;

export default function NavProgress() {
  const pathname = usePathname();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState(false);
  const [showPaiche, setShowPaiche] = useState(false);
  // Salida de emergencia cuando la navegación se cuelga (>5s sin completar).
  const [showEscape, setShowEscape] = useState(false);
  const rafRef = useRef<number | null>(null);
  const trickleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paicheTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const escapeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Arranca la barra (con trickle hacia 90%) + arma el overlay del Paiche
  // para navegaciones que tarden >400ms + el escape si se cuelga (>5s).
  const start = () => {
    if (hideRef.current) clearTimeout(hideRef.current);
    setActive(true);
    setWidth(8);
    setShowEscape(false);
    if (trickleRef.current) clearInterval(trickleRef.current);
    trickleRef.current = setInterval(() => {
      setWidth((w) => (w < 90 ? w + Math.max(0.5, (90 - w) * 0.08) : w));
    }, 200);
    if (paicheTimerRef.current) clearTimeout(paicheTimerRef.current);
    paicheTimerRef.current = setTimeout(() => setShowPaiche(true), PAICHE_DELAY_MS);
    if (escapeTimerRef.current) clearTimeout(escapeTimerRef.current);
    escapeTimerRef.current = setTimeout(() => setShowEscape(true), ESCAPE_DELAY_MS);
  };

  // Completa: 100% y fade out + oculta el Paiche + el escape.
  const done = () => {
    if (trickleRef.current) clearInterval(trickleRef.current);
    if (paicheTimerRef.current) clearTimeout(paicheTimerRef.current);
    if (escapeTimerRef.current) clearTimeout(escapeTimerRef.current);
    setShowPaiche(false);
    setShowEscape(false);
    setWidth(100);
    hideRef.current = setTimeout(() => {
      setActive(false);
      setWidth(0);
    }, 260);
  };

  // Completar en cada cambio de ruta.
  useEffect(() => {
    done();
     
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
      if (paicheTimerRef.current) clearTimeout(paicheTimerRef.current);
      if (escapeTimerRef.current) clearTimeout(escapeTimerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <>
      {/* Barra de progreso superior */}
      {(active || width > 0) && (
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
      )}

      {/* Overlay del Paiche nadando — solo si la navegación tarda >400ms.
          Fondo blanco OPACO (antes era translúcido) + paiche grande centrado. */}
      {showPaiche && (
        <div
          role="status"
          aria-label="Cargando"
          className="fixed inset-0 z-[9998] flex flex-col items-center justify-center"
          style={{
            background: "var(--surface-canvas)",
            animation: "navp-fade-in .2s ease both",
          }}
        >
          {/* Aura radial teal sutil detrás del paiche */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at center, color-mix(in oklab, var(--accent) 10%, transparent) 0%, transparent 60%)",
            }}
          />
          <div className="relative text-[var(--accent)]">
            <PaicheMascot size={300} animated strokeWidth={1.75} />
          </div>
          <p className="relative mt-6 text-2xl font-black tracking-[-0.02em] text-[var(--text-primary)]">
            Un toque
            <span className="ml-1.5 italic font-serif text-[var(--accent)]">ya viene</span>
          </p>

          {/* Salida de emergencia — aparece si la navegación se cuelga (>5s).
              Usa window.location (navegación DURA) a propósito: si el router
              cliente quedó trabado (RSC/chunk que falló), un <Link>/router.push
              también se colgaría. La recarga/redirección dura siempre escapa.
              Antes NO existía → el usuario quedaba atrapado sin menú ni botón. */}
          {showEscape && (
            <div className="relative mt-8 flex flex-col items-center gap-3 animate-[navp-fade-in_.3s_ease_both]">
              <p className="text-sm font-semibold text-[var(--text-secondary)]">
                Esto está tardando más de lo normal.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = "/";
                  }}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--accent)] px-6 text-sm font-extrabold text-white shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                >
                  Volver al inicio
                </button>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] px-6 text-sm font-bold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                >
                  Reintentar
                </button>
              </div>
            </div>
          )}
          <style>{`@keyframes navp-fade-in { from { opacity: 0 } to { opacity: 1 } }`}</style>
        </div>
      )}
    </>
  );
}
