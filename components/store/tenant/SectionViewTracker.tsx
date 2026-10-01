"use client";

import { useEffect } from "react";

/**
 * SectionViewTracker — engagement por sección del storefront (audit #12). Observa
 * los bloques [data-section-type] de /t con IntersectionObserver y manda UN beacon
 * por sección por carga cuando entra en viewport. Beacon con cookie csrf-token
 * (proxy.ts la setea) → pasa el guard CSRF. En ?preview=true (editor) NO corre.
 * El dueño ve los conteos en el editor (panel Secciones → "Ver métricas").
 */
export default function SectionViewTracker({ slug }: { slug: string }) {
  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;
    if (new URLSearchParams(window.location.search).get("preview") === "true") return;

    const csrf = decodeURIComponent(document.cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/)?.[1] || "");
    const seen = new Set<string>();
    const beacon = (section: string) => {
      try {
        fetch("/api/store-page/section-track", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
          body: JSON.stringify({ slug, section }),
          keepalive: true,
        }).catch((err) => { console.debug("[section-track] beacon best-effort", err); });
      } catch {
        /* no-op */
      }
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const type = (e.target as HTMLElement).dataset.sectionType;
          if (type && !seen.has(type)) {
            seen.add(type);
            beacon(type);
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.4 },
    );

    const els = document.querySelectorAll<HTMLElement>("[data-section-type]");
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [slug]);

  return null;
}
