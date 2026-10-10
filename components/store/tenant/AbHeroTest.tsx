"use client";

import { useEffect } from "react";

/**
 * AbHeroTest — A/B testing del hero (Brandon 2026-06-28, audit #13). Asigna al
 * visitante una variante (A o B, 50/50, sticky en localStorage), y si es B
 * reemplaza el título/subtítulo del hero usando los nodos data-live ya existentes
 * (mismo mecanismo que el preview en vivo, sin hacks). Manda un beacon de "view"
 * al montar y de "click" cuando se clickea un CTA del hero. El beacon usa la
 * cookie csrf-token (que proxy.ts setea en cada respuesta) → pasa el guard CSRF.
 * En ?preview=true (editor) NO corre, para no contaminar métricas ni el editor.
 */
export default function AbHeroTest({
  slug,
  variantB,
}: {
  slug: string;
  variantB: { heroTitle?: string; heroSubtitle?: string };
}) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("preview") === "true") return;

    const lsKey = `buleje-ab-${slug}`;
    let variant: "A" | "B";
    try {
      const stored = localStorage.getItem(lsKey);
      variant = stored === "A" || stored === "B" ? stored : Math.random() < 0.5 ? "A" : "B";
      localStorage.setItem(lsKey, variant);
    } catch {
      variant = Math.random() < 0.5 ? "A" : "B";
    }

    if (variant === "B") {
      if (variantB.heroTitle) {
        const el = document.querySelector('[data-live="heroTitle"]');
        if (el) el.textContent = variantB.heroTitle;
      }
      if (variantB.heroSubtitle) {
        const el = document.querySelector('[data-live="heroSubtitle"]');
        if (el) el.textContent = variantB.heroSubtitle;
      }
    }

    const csrf = decodeURIComponent(document.cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/)?.[1] || "");
    const beacon = (event: "view" | "click") => {
      try {
        fetch("/api/store-page/ab-track", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
          body: JSON.stringify({ slug, variant, event }),
          keepalive: true,
        }).catch(() => { /* beacon best-effort: una métrica perdida no afecta al visitante */ });
      } catch {
        /* no-op */
      }
    };
    beacon("view");

    const ctas = Array.from(document.querySelectorAll('[data-live^="inlineText:hero."]'))
      .map((s) => s.closest("a"))
      .filter((a): a is HTMLAnchorElement => !!a);
    const onClick = () => beacon("click");
    ctas.forEach((c) => c.addEventListener("click", onClick, { once: true }));
    return () => ctas.forEach((c) => c.removeEventListener("click", onClick));
  }, [slug, variantB.heroTitle, variantB.heroSubtitle]);

  return null;
}
