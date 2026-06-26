"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowDown, Palette, Image as ImageIcon, Bold, AlignLeft, AlignCenter } from "lucide-react";

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
  testimonials: "Testimonios",
  info: "Información",
  countdown: "Contador de oferta",
};

const SKY = "#0ea5e9";
const AMBER = "#f59e0b";

// Secciones del cuerpo que se pueden mover ↑↓ (las fijas hero/announcement no).
const BODY_REORDERABLE = new Set(["trust", "promos", "featured", "testimonials", "info"]);
// Secciones con imagen propia (click 🖼 abre su subidor en el editor).
const IMAGE_CAPABLE = new Set(["hero", "announcement"]);
// Paleta rápida de "pintar" (color inline) → setea el color primario de la marca.
const PRESET_COLORS = [
  "#00A0A0", "#FF6B5B", "#16a34a", "#2563eb",
  "#7c3aed", "#db2777", "#ea580c", "#0f172a",
];

function postToEditor(msg: Record<string, unknown>) {
  try {
    window.parent?.postMessage({ source: "buleje-preview", ...msg }, window.location.origin);
  } catch {
    /* cross-origin guard */
  }
}

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
  const [editingBox, setEditingBox] = useState<Box | null>(null);
  // Barra flotante (Brandon 2026-06-26, Fase 4 "editar potencia"): popover de color abierto.
  const [colorOpen, setColorOpen] = useState(false);
  const [textColorOpen, setTextColorOpen] = useState(false);
  // Drag de secciones en el canvas (Brandon 2026-06-26): indicador de drop.
  const [dropTarget, setDropTarget] = useState<{ box: Box; key: string } | null>(null);
  const canvasDragKey = useRef<string | null>(null);

  const selectedEl = useRef<Element | null>(null);
  const editingEl = useRef<HTMLElement | null>(null);
  const editingOriginal = useRef<string>("");

  // recalcula la caja del bloque seleccionado (scroll/resize lo desalinean)
  const reposition = useCallback(() => {
    if (selectedEl.current && document.contains(selectedEl.current)) {
      setSelected((s) => (s ? { ...s, box: rectOf(selectedEl.current as Element) } : s));
    }
    if (editingEl.current && document.contains(editingEl.current)) {
      setEditingBox(rectOf(editingEl.current));
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
    setEditingBox(null);
    setTextColorOpen(false);
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
    setEditingBox(null);
    setTextColorOpen(false);
  }, []);

  // Barra de texto flotante (Brandon 2026-06-26): aplica tamaño/negrita/color/
  // alineación al texto en edición EN VIVO y lo persiste (pb-text-style).
  const textAction = useCallback(
    (action: "size+" | "size-" | "bold" | "left" | "center" | "right" | { color: string }) => {
      const el = editingEl.current;
      if (!el) return;
      const field = el.getAttribute("data-live") || "";
      let size = parseFloat(el.dataset.bulejeSize ?? "1") || 1;
      let bold = el.style.fontWeight === "800";
      let color: string | undefined = el.style.color || undefined;
      let align = (el.style.textAlign || undefined) as "left" | "center" | "right" | undefined;

      if (action === "size+") size = Math.min(2, +(size + 0.1).toFixed(2));
      else if (action === "size-") size = Math.max(0.6, +(size - 0.1).toFixed(2));
      else if (action === "bold") bold = !bold;
      else if (action === "left" || action === "center" || action === "right") align = action;
      else color = action.color;

      // Aplicar en vivo manteniendo el tamaño base (px actual ÷ mult actual).
      const curMult = parseFloat(el.dataset.bulejeSize ?? "1") || 1;
      const curPx = parseFloat(el.style.fontSize || getComputedStyle(el).fontSize) || 16;
      const basePx = curPx / curMult;
      el.style.fontSize = `${(basePx * size).toFixed(1)}px`;
      el.dataset.bulejeSize = String(size);
      el.style.fontWeight = bold ? "800" : "";
      if (color) el.style.color = color;
      if (align) el.style.textAlign = align;

      postToEditor({ type: "pb-text-style", field, style: { size, bold, color, align } });
    },
    [],
  );

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
      setColorOpen(false);
      postToEditor({ type: "pb-select", key });
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
      setEditingBox(rectOf(live));
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
    /* ── Drag de secciones EN EL CANVAS (Brandon 2026-06-26) ──
       Las secciones del cuerpo (trust/promos/featured/info) se arrastran directo
       en el preview. Drop sobre otra → pb-drop {fromKey,toKey} → editor reordena. */
    const bodyBlock = (t: EventTarget | null): HTMLElement | null => {
      const el = t instanceof Element ? (t.closest("[data-pb]") as HTMLElement | null) : null;
      return el && BODY_REORDERABLE.has(el.getAttribute("data-pb") || "") ? el : null;
    };
    const setDraggable = () => {
      document.querySelectorAll<HTMLElement>("main > [data-pb]").forEach((el) => {
        el.draggable = BODY_REORDERABLE.has(el.getAttribute("data-pb") || "");
      });
    };
    setDraggable();

    const onDragStart = (e: DragEvent) => {
      // Ignorar drag de imágenes/links internos (son drag nativo, no de sección).
      if (e.target instanceof Element && e.target.closest("img, a")) return;
      const el = bodyBlock(e.target);
      if (!el) return;
      canvasDragKey.current = el.getAttribute("data-pb");
      e.dataTransfer?.setData("text/plain", canvasDragKey.current || "");
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    };
    const onDragOver = (e: DragEvent) => {
      if (!canvasDragKey.current) return;
      const el = bodyBlock(e.target);
      if (!el) return;
      const key = el.getAttribute("data-pb") || "";
      if (key === canvasDragKey.current) { setDropTarget(null); return; }
      e.preventDefault(); // permite drop
      setDropTarget({ box: rectOf(el), key });
    };
    const onDrop = (e: DragEvent) => {
      const el = bodyBlock(e.target);
      const from = canvasDragKey.current;
      canvasDragKey.current = null;
      setDropTarget(null);
      if (!el || !from) return;
      e.preventDefault();
      const to = el.getAttribute("data-pb") || "";
      if (to && to !== from) postToEditor({ type: "pb-drop", fromKey: from, toKey: to });
    };
    const onDragEnd = () => { canvasDragKey.current = null; setDropTarget(null); };

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("blur", onBlur, true);
    document.addEventListener("dragstart", onDragStart, true);
    document.addEventListener("dragover", onDragOver, true);
    document.addEventListener("drop", onDrop, true);
    document.addEventListener("dragend", onDragEnd, true);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("message", onMessage);
    return () => {
      document.removeEventListener("mouseover", onOver, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("dblclick", onDblClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("blur", onBlur, true);
      document.removeEventListener("dragstart", onDragStart, true);
      document.removeEventListener("dragover", onDragOver, true);
      document.removeEventListener("drop", onDrop, true);
      document.removeEventListener("dragend", onDragEnd, true);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("message", onMessage);
    };
  }, [reposition, commitEdit, cancelEdit]);

  if (!enabled) return null;

  return (
    <>
      {/* Indicador de drop al arrastrar una sección en el canvas (verde sólido) */}
      {dropTarget && (
        <div
          className="pointer-events-none fixed z-[92] rounded-sm"
          style={{
            top: dropTarget.box.top,
            left: dropTarget.box.left,
            width: dropTarget.box.width,
            height: dropTarget.box.height,
            outline: "3px solid #16a34a",
            outlineOffset: "-3px",
            background: "rgba(22,163,74,0.08)",
          }}
        >
          <span className="absolute left-1/2 top-2 -translate-x-1/2 rounded-full bg-[#16a34a] px-2.5 py-0.5 text-[length:var(--ts-2xs)] font-extrabold text-white shadow-lg">
            Soltar aquí
          </span>
        </div>
      )}

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

      {/* Barra flotante de acciones rápidas (Fase 4 "editar potencia"): mover,
          pintar (color), imagen. pointer-events-auto para ser clickeable. */}
      {selected && !editingField && (
        <div
          className="pointer-events-auto fixed z-[95] flex items-center gap-0.5 rounded-lg bg-black/90 p-1 shadow-xl ring-1 ring-white/15"
          style={{
            top: Math.max(8, selected.box.top - 44),
            left: Math.max(8, selected.box.left + selected.box.width - 196),
          }}
        >
          {BODY_REORDERABLE.has(selected.key) && (
            <>
              <button
                type="button"
                title="Subir sección"
                aria-label="Subir sección"
                onClick={(e) => { e.stopPropagation(); postToEditor({ type: "pb-move", key: selected.key, dir: "up" }); }}
                className="flex h-7 w-7 items-center justify-center rounded text-white/85 transition-colors hover:bg-white/15 hover:text-white"
              >
                <ArrowUp className="h-4 w-4" strokeWidth={2.5} aria-hidden />
              </button>
              <button
                type="button"
                title="Bajar sección"
                aria-label="Bajar sección"
                onClick={(e) => { e.stopPropagation(); postToEditor({ type: "pb-move", key: selected.key, dir: "down" }); }}
                className="flex h-7 w-7 items-center justify-center rounded text-white/85 transition-colors hover:bg-white/15 hover:text-white"
              >
                <ArrowDown className="h-4 w-4" strokeWidth={2.5} aria-hidden />
              </button>
              <span aria-hidden className="mx-0.5 h-4 w-px bg-white/20" />
            </>
          )}

          {IMAGE_CAPABLE.has(selected.key) && (
            <button
              type="button"
              title="Cambiar imagen"
              aria-label="Cambiar imagen"
              onClick={(e) => { e.stopPropagation(); postToEditor({ type: "pb-image", key: selected.key }); }}
              className="flex h-7 items-center gap-1 rounded px-2 text-[length:var(--ts-2xs)] font-bold text-white/85 transition-colors hover:bg-white/15 hover:text-white"
            >
              <ImageIcon className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden /> Imagen
            </button>
          )}

          <button
            type="button"
            title="Cambiar color de la marca"
            aria-label="Cambiar color de la marca"
            onClick={(e) => { e.stopPropagation(); setColorOpen((o) => !o); }}
            className={`flex h-7 items-center gap-1 rounded px-2 text-[length:var(--ts-2xs)] font-bold transition-colors hover:bg-white/15 hover:text-white ${colorOpen ? "bg-white/15 text-white" : "text-white/85"}`}
          >
            <Palette className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden /> Color
          </button>

          {colorOpen && (
            <div className="absolute right-0 top-full mt-1 grid grid-cols-4 gap-1 rounded-lg bg-black/95 p-1.5 shadow-xl ring-1 ring-white/15">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={`Usar ${c}`}
                  aria-label={`Usar color ${c}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    postToEditor({ type: "pb-color", color: c });
                    setColorOpen(false);
                  }}
                  className="h-6 w-6 rounded-full ring-1 ring-white/30 transition-transform hover:scale-110"
                  style={{ background: c }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Barra de texto flotante (Brandon 2026-06-26): tamaño, negrita, color,
          alineación del texto en edición. onMouseDown preventDefault mantiene el
          foco en el contentEditable (no dispara blur/commit). */}
      {editingField && editingBox && (
        <div
          className="pointer-events-auto fixed z-[97] flex items-center gap-0.5 rounded-lg bg-black/90 p-1 shadow-xl ring-1 ring-white/15"
          style={{
            top: Math.max(8, editingBox.top - 46),
            left: Math.max(8, editingBox.left),
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button type="button" title="Letra más chica" aria-label="Letra más chica"
            onClick={() => textAction("size-")}
            className="flex h-7 w-7 items-center justify-center rounded text-white/85 transition-colors hover:bg-white/15 hover:text-white">
            <span aria-hidden className="text-[length:var(--ts-2xs)] font-bold">A−</span>
          </button>
          <button type="button" title="Letra más grande" aria-label="Letra más grande"
            onClick={() => textAction("size+")}
            className="flex h-7 w-7 items-center justify-center rounded text-white/85 transition-colors hover:bg-white/15 hover:text-white">
            <span aria-hidden className="text-[length:var(--ts-sm)] font-bold">A+</span>
          </button>
          <span aria-hidden className="mx-0.5 h-4 w-px bg-white/20" />
          <button type="button" title="Negrita" aria-label="Negrita"
            onClick={() => textAction("bold")}
            className="flex h-7 w-7 items-center justify-center rounded text-white/85 transition-colors hover:bg-white/15 hover:text-white">
            <Bold className="h-3.5 w-3.5" strokeWidth={2.75} aria-hidden />
          </button>
          <button type="button" title="Alinear izquierda" aria-label="Alinear izquierda"
            onClick={() => textAction("left")}
            className="flex h-7 w-7 items-center justify-center rounded text-white/85 transition-colors hover:bg-white/15 hover:text-white">
            <AlignLeft className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          </button>
          <button type="button" title="Centrar" aria-label="Centrar"
            onClick={() => textAction("center")}
            className="flex h-7 w-7 items-center justify-center rounded text-white/85 transition-colors hover:bg-white/15 hover:text-white">
            <AlignCenter className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          </button>
          <span aria-hidden className="mx-0.5 h-4 w-px bg-white/20" />
          <button type="button" title="Color del texto" aria-label="Color del texto"
            onClick={() => setTextColorOpen((o) => !o)}
            className={`flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-white/15 hover:text-white ${textColorOpen ? "bg-white/15 text-white" : "text-white/85"}`}>
            <Palette className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          </button>
          {textColorOpen && (
            <div className="absolute right-0 top-full mt-1 grid grid-cols-4 gap-1 rounded-lg bg-black/95 p-1.5 shadow-xl ring-1 ring-white/15">
              {["#ffffff", "#0f172a", ...PRESET_COLORS].slice(0, 8).map((c) => (
                <button key={c} type="button" title={`Texto ${c}`} aria-label={`Color de texto ${c}`}
                  onClick={() => { textAction({ color: c }); setTextColorOpen(false); }}
                  className="h-6 w-6 rounded-full ring-1 ring-white/30 transition-transform hover:scale-110"
                  style={{ background: c }} />
              ))}
            </div>
          )}
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
