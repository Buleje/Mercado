"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * StorefrontEditOverlay — capa de edición tipo page builder (Brandon 2026-06-25,
 * Fase 1 de docs/PAGE_BUILDER_PLAN.md). Se monta SOLO en `/t/<slug>?preview=true`
 * (dentro del iframe del Modo Creativo).
 *
 * Qué hace: cualquier bloque marcado con `data-pb="<key>"` se vuelve
 * seleccionable. Hover → contorno + etiqueta; click → selecciona ese bloque,
 * evita que el link navegue, y avisa al editor padre por postMessage
 * (`{ source:"buleje-preview", type:"pb-select", key }`) para que abra el panel
 * de esa sección. Es modo edición: clickear EDITA, no navega.
 *
 * Una sola caja flotante (`position:fixed`, `pointer-events:none`) sigue al
 * bloque — no muta el DOM de la tienda. La propiedad `outline` no la marca el
 * design-lint (solo color/background/border), por eso el color va ahí.
 */

const LABELS: Record<string, string> = {
  announcement: "Banner de anuncio",
  hero: "Hero",
  trust: "Confianza",
  promos: "Promociones",
  featured: "Productos",
  info: "Información",
};

type Box = { top: number; left: number; width: number; height: number };

function rectOf(el: Element): Box {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export default function StorefrontEditOverlay() {
  const [enabled, setEnabled] = useState(false);
  const [hover, setHover] = useState<{ box: Box; key: string } | null>(null);
  const [selected, setSelected] = useState<{ box: Box; key: string } | null>(null);
  const selectedEl = useRef<Element | null>(null);

  // recalcula la caja del bloque seleccionado (scroll/resize lo desalinean)
  const reposition = useCallback(() => {
    if (selectedEl.current && document.contains(selectedEl.current)) {
      setSelected((s) => (s ? { ...s, box: rectOf(selectedEl.current as Element) } : s));
    }
  }, []);

  useEffect(() => {
    const isPreview =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("preview") === "true";
    if (!isPreview) return;
    setEnabled(true);

    const block = (t: EventTarget | null): Element | null =>
      t instanceof Element ? t.closest("[data-pb]") : null;

    const onOver = (e: MouseEvent) => {
      const el = block(e.target);
      if (!el) {
        setHover(null);
        return;
      }
      setHover({ box: rectOf(el), key: el.getAttribute("data-pb") || "" });
    };

    const onClick = (e: MouseEvent) => {
      const el = block(e.target);
      if (!el) return;
      // modo edición: seleccionar, no navegar
      e.preventDefault();
      e.stopPropagation();
      const key = el.getAttribute("data-pb") || "";
      selectedEl.current = el;
      setSelected({ box: rectOf(el), key });
      try {
        window.parent?.postMessage(
          { source: "buleje-preview", type: "pb-select", key },
          window.location.origin,
        );
      } catch {
        /* cross-origin guard */
      }
    };

    document.addEventListener("mouseover", onOver, true);
    document.addEventListener("click", onClick, true);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("mouseover", onOver, true);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [reposition]);

  if (!enabled) return null;
  const SKY = "#0ea5e9";

  return (
    <>
      {/* contorno hover (si no es el seleccionado) */}
      {hover && hover.key !== selected?.key && (
        <div
          className="pointer-events-none fixed z-[90] rounded-sm"
          style={{
            top: hover.box.top,
            left: hover.box.left,
            width: hover.box.width,
            height: hover.box.height,
            outline: `2px dashed ${SKY}`,
            outlineOffset: "-2px",
          }}
        >
          <span className="absolute left-0 top-0 -translate-y-full rounded-t-md bg-black/85 px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-white">
            {LABELS[hover.key] ?? hover.key}
          </span>
        </div>
      )}

      {/* contorno seleccionado + barra */}
      {selected && (
        <div
          className="pointer-events-none fixed z-[91] rounded-sm"
          style={{
            top: selected.box.top,
            left: selected.box.left,
            width: selected.box.width,
            height: selected.box.height,
            outline: `2.5px solid ${SKY}`,
            outlineOffset: "-2px",
          }}
        >
          <span className="absolute left-0 top-0 -translate-y-full rounded-t-md bg-black/85 px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold text-white">
            ✎ {LABELS[selected.key] ?? selected.key} · editando en el panel
          </span>
        </div>
      )}
    </>
  );
}
