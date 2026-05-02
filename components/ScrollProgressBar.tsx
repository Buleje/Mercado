"use client";

/**
 * ScrollProgressBar — barra de progreso fina (3px) en el top de la
 * pantalla que se rellena con teal según cuánto scrolleó el cliente.
 * Indicador visual sutil + profesional (estilo Stripe/Notion/Linear).
 *
 * Sincronizado con Lenis vía evento "scroll" — si Lenis no está activo
 * (mobile puro), cae a `window.scrollY` nativo.
 */

import { useEffect, useState } from "react";

export default function ScrollProgressBar() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let raf = 0;

    const compute = () => {
      const doc = document.documentElement;
      const scrollTop = window.scrollY || doc.scrollTop;
      const scrollHeight = doc.scrollHeight - doc.clientHeight;
      const pct = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
      setProgress(pct);
    };

    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
    };

    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] bg-transparent"
    >
      <div
        className="h-full origin-left will-change-transform"
        style={{
          transform: `scaleX(${progress / 100})`,
          background:
            "linear-gradient(90deg, var(--brand-primary, #00B4A6) 0%, #34d4be 50%, var(--brand-primary, #00B4A6) 100%)",
          boxShadow: "0 0 12px rgba(0, 180, 166, 0.5)",
          transition: "transform 0.08s linear",
        }}
      />
    </div>
  );
}
