"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * StorefrontEditOverlay — capa de edición tipo page builder (Brandon 2026-06-25,
 * Fases 1-3 de docs/PAGE_BUILDER_PLAN.md). Solo en `/t/<slug>?preview=true`.
 *
 * Fase 1: click en [data-pb] → postMessage pb-select → editor abre panel.
 * Fase 2: recibe pb-reorder del editor → reordena DOM de [data-pb] en vivo.
 * Fase 3: dblclick en [data-live] → contentEditable; blur → pb-inline-edit →
 *         editor hace patch(). Escape = cancelar. Enter (no-shift) = confirmar.
 *         Panel hover → pb-highlight del editor → outline ámbar en esa sección.
 *
 * outline (no border) para evitar design-lint. Overlay fixedposition pointer-events:none.
 */

const LABELS: Record<string, string> = {
  announcement: "Banner de anuncio",
  hero: "Hero",
  trust: "Confianza",
  promos: "Promociones",
  featured: "Productos",
  info: "Información",
};

const SKY = "#0ea5e9";
const AMBER = "#f59e0b";

type Box = { top: number; left: number; width: number; height: number };

function rectOf(el: Element): Box {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/**
 * Reordena directamente en el DOM los [data-pb] hijos de <main> según `order`.
 * Los elementos que no estén en `order` permanecen donde están.
 * Los no-[data-pb] (nav, footer, etc.) no se tocan.
 */
function reorderPbElements(order: string[]) {
  const main = document.querySelector("main");
  if (!main) return;
  const allPb = [...main.querySelectorAll(":scope > [data-pb]")] as HTMLElement[];
  if (allPb.length < 2) return;

  // Marker justo antes del primer [data-pb]
  const marker = document.createComment("pb-anchor");
  main.insertBefore(marker, allPb[0]);

  // Desadjuntar todos (preserva su estado React, solo mueve nodos)
  allPb.forEach((el) => main.removeChild(el));

  // Reinsertar en orden deseado (saltando keys sin elemento)
  const frag = document.createDocumentFragment();
  order.forEach((key) => {
    const el = allPb.find((n) => n.getAttribute("data-pb") === key);
    if (el) frag.appendChild(el);
  });
  // Agregar los que no estaban en order al final
  allPb.forEach((el) => {
    if (!frag.contains(el)) frag.appendChild(el);
  });

  main.insertBefore(frag, marker.nextSibling);
  main.removeChild(marker);
}

export default function StorefrontEditOverlay() {
  const [enabled, setEnabled] = useState(false);
  const [hover, setHover] = useState<{ box: Box; key: string } | null>(null);
  const [selected, setSelected] = useState<{ box: Box; key: string } | null>(null);
  const [panelHighlight, setPanelHighlight] = useState<{ box: Box; key: string } | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);

  const selectedEl = useRef<Element | null>(null);
  const editingEl = useRef<HTMLElement | null>(null);
  const editingOriginal = useRef<string>("");

  // recalcula la caja del bloque seleccionado (scroll/resize lo desalinean)
  const reposition = useCallback(() => {
    if (selectedEl.current && document.contains(selectedEl.current)) {
      setSelected((s) => (s ? { ...s, box: rectOf(selectedEl.current as Element) } : s));
    }
  }, []);

  // Confirma la edición inline: quita contentEditable y avisa al editor.
  const commitEdit = useCallback(() => {
    const el = editingEl.current;
    if (!el) return;
    const field = el.getAttribute("data-live") || "";
    const value = el.textContent || "";
    el.contentEditable = "inherit";
    el.style.removeProperty("outline");
    el.style.removeProperty("cursor");
    editingEl.current = null;
    setEditingField(null);
    if (field && value !== editingOriginal.current) {
      try {
        window.parent?.postMessage(
          { source: "buleje-preview", type: "pb-inline-edit", field, value },
          window.location.origin,
        );
      } catch {
        /* cross-origin guard */
      }
    }
  }, []);

  // Cancela la edición: restaura el texto original.
  const cancelEdit = useCallback(() => {
    const el = editingEl.current;
    if (!el) return;
    el.textContent = editingOriginal.current;
    el.contentEditable = "inherit";
    el.style.removeProperty("outline");
    el.style.removeProperty("cursor");
    editingEl.current = null;
    setEditingField(null);
  }, []);

  useEffect(() => {
    const isPreview =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("preview") === "true";
    if (!isPreview) return;
    setEnabled(true);

    const pbBlock = (t: EventTarget | null): Element | null =>
      t instanceof Element ? t.closest("[data-pb]") : null;

    const liveEl = (t: EventTarget | null): HTMLElement | null =>
      t instanceof Element ? (t.closest("[data-live]") as HTMLElement | null) : null;

    /* ── Hover: outline dashed sobre el bloque ── */
    const onOver = (e: MouseEvent) => {
      if (editingEl.current) return;
      const el = pbBlock(e.target);
      if (!el) { setHover(null); return; }
      setHover({ box: rectOf(el), key: el.getAttribute("data-pb") || "" });
    };

    /* ── Click único: selecciona sección → avisa al editor ── */
    const onClick = (e: MouseEvent) => {
      if (editingEl.current) return; // En edición inline: dejar pasar
      const el = pbBlock(e.target);
      if (!el) return;
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

    /* ── Doble click: edición inline en [data-live] ── */
    const onDblClick = (e: MouseEvent) => {
      const live = liveEl(e.target);
      if (!live) return;
      e.preventDefault();
      e.stopPropagation();
      // Si ya estaba editando otro → confirmar primero
      if (editingEl.current && editingEl.current !== live) commitEdit();
      editingEl.current = live;
      editingOriginal.current = live.textContent || "";
      live.contentEditable = "true";
      live.style.outline = `2px solid ${SKY}`;
      live.style.cursor = "text";
      setEditingField(live.getAttribute("data-live") || "");
      // Foco al final del texto
      live.focus();
      const range = document.createRange();
      range.selectNodeContents(live);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    };

    /* ── Teclas durante la edición inline ── */
    const onKeyDown = (e: KeyboardEvent) => {
      if (!editingEl.current) return;
      if (e.key === "Escape") {
        e.preventDefault();
        cancelEdit();
        return;
      }
      // Enter sin Shift confirma en elementos de una sola línea
      if (e.key === "Enter" && !e.shiftKey) {
        const tag = editingEl.current.tagName;
        if (["H1", "H2", "H3", "P", "SPAN", "DIV"].includes(tag)) {
          e.preventDefault();
          commitEdit();
        }
      }
    };

    /* ── Blur confirma la edición ── */
    const onBlur = (e: FocusEvent) => {
      if (editingEl.current && e.target === editingEl.current) {
        commitEdit();
      }
    };

    /* ── Mensajes DESDE el editor padre ── */
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const d = e.data as {
        source?: string;
        type?: string;
        key?: string | null;
        order?: string[];
      } | null;
      if (!d || d.source !== "buleje-editor") return;

      // pb-highlight: panel hoverea una sección → ámbar en el iframe
      if (d.type === "pb-highlight") {
        if (!d.key) {
          setPanelHighlight(null);
          return;
        }
        const el = document.querySelector(`[data-pb="${d.key}"]`);
        setPanelHighlight(el ? { box: rectOf(el), key: d.key } : null);
      }

      // pb-reorder: drag en panel → reordena DOM en vivo
      if (d.type === "pb-reorder" && Array.isArray(d.order)) {
        reorderPbElements(d.order);
        // Recalcula posiciones de overlays
        if (selectedEl.current && document.contains(selectedEl.current)) {
          setSelected((s) => (s ? { ...s, box: rectOf(selectedEl.current as Element) } : s));
        }
        setPanelHighlight((ph) => {
          if (!ph) return null;
          const el = document.querySelector(`[data-pb="${ph.key}"]`);
          return el ? { box: rectOf(el), key: ph.key } : null;
        });
      }
    };

    document.addEventListener("mouseover", onOver, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("dblclick", onDblClick, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("blur", onBlur, true);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("message", onMessage);
    return () => {
      document.removeEventListener("mouseover", onOver, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("dblclick", onDblClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("blur", onBlur, true);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("message", onMessage);
    };
  }, [reposition, commitEdit, cancelEdit]);

  if (!enabled) return null;

  return (
    <>
      {/* Highlight desde el panel (hover sección en el editor → outline ámbar) */}
      {panelHighlight && panelHighlight.key !== selected?.key && (
        <div
          className="pointer-events-none fixed z-[89] rounded-sm"
          style={{
            top: panelHighlight.box.top,
            left: panelHighlight.box.left,
            width: panelHighlight.box.width,
            height: panelHighlight.box.height,
            outline: `2px dashed ${AMBER}`,
            outlineOffset: "-2px",
          }}
        />
      )}

      {/* Hover (outline dashed azul; no muestra si ya está seleccionado) */}
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

      {/* Seleccionado (outline sólido + chip) */}
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

      {/* Banner de edición inline (aparece cuando hay texto activo) */}
      {editingField && (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-[99] -translate-x-1/2 flex items-center gap-2 rounded-full bg-black/90 px-4 py-2 text-sm font-semibold text-white shadow-xl">
          <span className="h-2 w-2 animate-pulse rounded-full bg-sky-400" />
          Editando · Enter para guardar · Esc para cancelar
        </div>
      )}
    </>
  );
}
