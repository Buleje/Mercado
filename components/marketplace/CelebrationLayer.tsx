"use client";

/**
 * CelebrationLayer — capa global de confetti del marketplace. Se monta UNA vez
 * y escucha el evento `buleje:celebrate` (ver `lib/celebrate.ts`). Cada acción
 * real del usuario (add-to-cart, voto, hito de racha) dispara un estallido
 * desde la posición del click.
 *
 * Perf: canvas-confetti (~7kb) se carga DINÁMICAMENTE en el primer disparo —
 * cero costo si el usuario nunca celebra. Respeta prefers-reduced-motion.
 */
import { useEffect } from "react";
import type { CelebrateOptions } from "@/lib/celebrate";

type ConfettiFn = (opts: Record<string, unknown>) => void;

export default function CelebrationLayer() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduced =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduced) return; // sin animación → no montamos el listener

    let confettiFn: ConfettiFn | null = null;
    let canvas: HTMLCanvasElement | null = null;
    let loading = false;
    let lastFire = 0;

    const fire = (opts: CelebrateOptions) => {
      if (!confettiFn) return;
      const x = typeof opts.x === "number" ? opts.x / window.innerWidth : 0.5;
      const y = typeof opts.y === "number" ? opts.y / window.innerHeight : 0.7;
      const intensity = opts.intensity ?? "md";
      const particleCount = intensity === "lg" ? 130 : intensity === "sm" ? 36 : 70;
      confettiFn({
        particleCount,
        spread: intensity === "lg" ? 100 : 62,
        startVelocity: intensity === "lg" ? 46 : 32,
        gravity: 0.9,
        scalar: 0.9,
        ticks: 170,
        origin: { x, y },
        colors: ["#00A0A0", "#00A0A0", "#f59e0b", "#fbbf24", "#ffffff"],
        disableForReducedMotion: true,
      });
    };

    const handler = (e: Event) => {
      const now = Date.now();
      if (now - lastFire < 350) return; // throttle anti-spam
      lastFire = now;
      const opts = (e as CustomEvent<CelebrateOptions>).detail ?? {};

      if (confettiFn) {
        fire(opts);
        return;
      }
      if (loading) return;
      loading = true;
      import("canvas-confetti")
        .then((mod) => {
          // Canvas propio + useWorker:false → evita el error "Creating a worker
          // from blob" (CSP/sandbox) y mantiene el confetti sobre toda la pantalla.
          canvas = document.createElement("canvas");
          canvas.style.cssText =
            "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:200";
          document.body.appendChild(canvas);
          confettiFn = (
            mod.default as unknown as {
              create: (c: HTMLCanvasElement, o: Record<string, unknown>) => ConfettiFn;
            }
          ).create(canvas, { resize: true, useWorker: false });
          fire(opts);
        })
        .catch(() => {
          /* confetti opcional — si falla, sin drama */
        })
        .finally(() => {
          loading = false;
        });
    };

    window.addEventListener("buleje:celebrate", handler as EventListener);
    return () => {
      window.removeEventListener("buleje:celebrate", handler as EventListener);
      canvas?.remove();
    };
  }, []);

  return null;
}
