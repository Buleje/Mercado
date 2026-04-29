"use client";

/**
 * BackNavRefresh — Recarga la página cada vez que el usuario hace back/forward
 * en el browser, garantizando que banners, categorías, recomendaciones,
 * imágenes y demás elementos client-side se rehidraten desde cero.
 *
 * Por qué siempre recargar:
 * Next 16 preserva el árbol cliente del layout entre navegaciones (Cache
 * Components). Tras back-nav los useEffect de strips/banners no re-ejecutan
 * y quedan con state stale o skeletons. Detección selectiva (detail → list)
 * dejaba ventanas (ej: tienda → producto → back → back) donde el banner
 * principal y las imágenes de categorías no cargaban.
 *
 * Solución: popstate global → reload SIEMPRE. Pequeña pérdida de velocidad
 * SPA a cambio de garantía total de que TODO carga.
 *
 * Anti-loop: si recargamos hace <1.5s, saltamos.
 */

import { useEffect } from "react";

const RELOAD_KEY = "__bsm_just_reloaded";

export default function BackNavRefresh() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const onPopState = () => {
      // Anti-loop: si ya recargamos hace <1.5s, saltamos.
      const last = Number(sessionStorage.getItem(RELOAD_KEY) || "0");
      const now = Date.now();
      if (now - last < 1500) return;
      sessionStorage.setItem(RELOAD_KEY, String(now));
      // Microtask delay para que location.pathname y la navegación SPA
      // queden completas antes del reload.
      queueMicrotask(() => {
        window.location.reload();
      });
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return null;
}
