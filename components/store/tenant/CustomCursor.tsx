"use client";

import { useEffect } from "react";

/**
 * CustomCursor — cursor de marca para el storefront (audit #7.2). "dot" = punto
 * que sigue exacto; "ring" = punto + anillo que persigue con lag (estilo agencia).
 * Solo en punteros finos (no touch) y fuera del preview del editor. Oculta el
 * cursor nativo mientras está montado y lo restaura al desmontar. El color usa
 * el primario del tenant via --tenant-primary.
 */
export default function CustomCursor({ mode }: { mode: "dot" | "ring" }) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(pointer: coarse)").matches) return; // touch: sin cursor
    if (new URLSearchParams(window.location.search).get("preview") === "true") return;

    const color = "var(--tenant-primary, var(--accent, #00A0A0))";
    const dot = document.createElement("div");
    dot.style.cssText = `position:fixed;top:0;left:0;width:8px;height:8px;border-radius:9999px;background:${color};pointer-events:none;z-index:99999;transform:translate(-50%,-50%);transition:opacity .2s;opacity:0`;
    document.body.appendChild(dot);

    let ring: HTMLDivElement | null = null;
    if (mode === "ring") {
      ring = document.createElement("div");
      ring.style.cssText = `position:fixed;top:0;left:0;width:34px;height:34px;border-radius:9999px;border:2px solid ${color};pointer-events:none;z-index:99998;transform:translate(-50%,-50%);transition:opacity .2s,width .15s,height .15s;opacity:0`;
      document.body.appendChild(ring);
    }

    let mx = 0, my = 0, rx = 0, ry = 0, raf = 0;
    const onMove = (e: MouseEvent) => {
      mx = e.clientX; my = e.clientY;
      dot.style.left = `${mx}px`; dot.style.top = `${my}px`; dot.style.opacity = "1";
      if (ring) ring.style.opacity = "1";
    };
    const loop = () => {
      if (ring) {
        rx += (mx - rx) * 0.18; ry += (my - ry) * 0.18;
        ring.style.left = `${rx}px`; ring.style.top = `${ry}px`;
      }
      raf = requestAnimationFrame(loop);
    };
    const prevCursor = document.body.style.cursor;
    document.body.style.cursor = "none";
    window.addEventListener("mousemove", onMove);
    raf = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
      document.body.style.cursor = prevCursor;
      dot.remove();
      ring?.remove();
    };
  }, [mode]);

  return null;
}
