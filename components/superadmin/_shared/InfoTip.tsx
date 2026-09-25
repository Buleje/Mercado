"use client";

/**
 * InfoTip — ícono de información junto a un título de sección que, al pasar el
 * mouse (o al hacer click / foco), muestra un popover al lado con qué hace el
 * módulo, a dónde afecta y un ejemplo fácil de entender (Brandon 2026-06-19).
 * Accesible: hover + click + foco + Escape + click-fuera. Hereda los tokens de
 * plataforma.
 *
 * Es LA forma de explicar una pantalla sin llenarla de texto (Brandon
 * 2026-09-24: «mucho texto por todos lados… poner un ícono y al pasar el
 * mouse se pondrá sus datos con ejemplos»). Subtítulos, consejos y notas de
 * «cómo se lee esta cifra» van acá; a la vista quedan el título y el dato.
 *
 * Vive bajo `superadmin/_shared` por dónde nació, pero es de TODO el panel: lo
 * usan `AdminTabShell`, el Cubicador y el Libro CTP. No moverlo por moverlo —
 * sí saber que no es exclusivo del superadmin.
 *
 * Dos formas de llenarlo:
 *  - estructurada (`what` / `affects` / `example`), la de las secciones;
 *  - libre (`body`), para lo que no entra en esas tres preguntas — una lista
 *    de comandos de voz, unos atajos de teclado.
 *
 * El popover va en un PORTAL con posición fija (2026-09-24): absoluto dentro
 * del ícono, lo recortaba cualquier tarjeta con `overflow-hidden` (la banda de
 * los libros, las tablas con scroll) y a la derecha de la pantalla se salía.
 * Ahora se ubica contra el ícono, cambia de lado si no entra y nunca pasa del
 * borde de la ventana.
 */

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HelpCircle, Info } from "@buleje/design-system/icons";
import { usePanelTokens } from "@/components/admin/shared/use-panel-tokens";

export interface InfoTipProps {
  /** Título del popover (normalmente el nombre de la sección). */
  title?: string;
  /** ¿Qué hace? — descripción simple. Opcional si se pasa `body`. */
  what?: React.ReactNode;
  /** Contenido libre, para lo que no es «qué hace / a dónde afecta / ejemplo». */
  body?: React.ReactNode;
  /** Lo que lee un lector de pantalla en el botón, si el texto no alcanza. */
  ariaLabel?: string;
  /** Ancho del popover. Por defecto `w-72`; `w-96` para listas largas. */
  ancho?: string;
  /**
   * Qué ícono lleva. `info` (ⓘ) es el de las secciones del superadmin; `ayuda`
   * (?) es el de «cómo se usa esto», que es otra pregunta: uno explica QUÉ es
   * la sección, el otro CÓMO se opera.
   */
  icono?: "info" | "ayuda";
  /** ¿A dónde afecta? — qué cambia / dónde se ve el efecto. */
  affects?: React.ReactNode;
  /** Ejemplo concreto y fácil de entender. */
  example?: React.ReactNode;
  /** Lado preferido. Si no entra, se da vuelta solo. */
  side?: "right" | "left" | "bottom" | "top";
  className?: string;
}

const MARGEN = 8;
const SEPARACION = 8;

type Pos = { top: number; left: number };

/** Dónde va el popover: el lado pedido si entra, si no el opuesto, y siempre dentro de la ventana. */
function ubicar(r: DOMRect, w: number, h: number, side: NonNullable<InfoTipProps["side"]>): Pos {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cabe = {
    right: r.right + SEPARACION + w <= vw - MARGEN,
    left: r.left - SEPARACION - w >= MARGEN,
    bottom: r.bottom + SEPARACION + h <= vh - MARGEN,
    top: r.top - SEPARACION - h >= MARGEN,
  };
  const orden: Record<typeof side, (keyof typeof cabe)[]> = {
    right: ["right", "left", "bottom", "top"],
    left: ["left", "right", "bottom", "top"],
    bottom: ["bottom", "top", "right", "left"],
    top: ["top", "bottom", "right", "left"],
  };
  const lado = orden[side].find((l) => cabe[l]) ?? "bottom";
  let top = 0;
  let left = 0;
  if (lado === "right" || lado === "left") {
    left = lado === "right" ? r.right + SEPARACION : r.left - SEPARACION - w;
    top = r.top - 6;
  } else {
    top = lado === "bottom" ? r.bottom + SEPARACION : r.top - SEPARACION - h;
    left = r.left + r.width / 2 - w / 2;
  }
  return {
    left: Math.min(Math.max(MARGEN, left), vw - w - MARGEN),
    top: Math.min(Math.max(MARGEN, top), Math.max(MARGEN, vh - h - MARGEN)),
  };
}

export function InfoTip({ title, what, body, affects, example, side = "right", className, ariaLabel, ancho, icono = "info" }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();

  const show = () => { if (closeTimer.current) clearTimeout(closeTimer.current); setOpen(true); };
  /* Salir del popover dispara `mouseleave` en él Y en el contenedor (el portal
     sigue en el árbol de React): sin limpiar antes, quedaba un temporizador
     huérfano que cerraba el ⓘ aunque se volviera al ícono. */
  const hide = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 140);
  };
  /* El portal cuelga del `body`, que lleva los tokens de la TIENDA: en oscuro
     los rótulos salían en coral. Se copian los del panel (mismo trato que
     AdminModal y ConfirmDialog). */
  const tokensPanel = usePanelTokens(open);
  /* Un clic DENTRO del popover (para leer o copiar) le saca el foco al ícono:
     sin esto, el `blur` lo cerraba con el mouse todavía encima. */
  const sobrePopover = useRef(false);
  const alPerderFoco = () => { if (!sobrePopover.current) hide(); };

  const reubicar = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    const p = popRef.current;
    if (!r || !p) return;
    setPos(ubicar(r, p.offsetWidth, p.offsetHeight, side));
  }, [side]);

  /* Se mide con el popover ya montado (invisible hasta tener lugar) para saber
     su alto real antes de decidir si entra arriba o abajo. */
  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    reubicar();
    window.addEventListener("resize", reubicar);
    // Captura: el scroll que mueve el ícono es el del panel, que no burbujea hasta window.
    window.addEventListener("scroll", reubicar, true);
    return () => {
      window.removeEventListener("resize", reubicar);
      window.removeEventListener("scroll", reubicar, true);
    };
  }, [open, reubicar]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDoc);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDoc); };
  }, [open]);

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  return (
    <span ref={wrapRef} className={["relative inline-flex align-middle", className].filter(Boolean).join(" ")} onMouseEnter={show} onMouseLeave={hide}>
      <button
        ref={btnRef}
        type="button"
        aria-label={ariaLabel ?? `Información: ${title ?? "ayuda"}`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen(true)}
        onFocus={show}
        onBlur={alPerderFoco}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        {icono === "ayuda" ? (
          <HelpCircle className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        ) : (
          <Info className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        )}
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <span
          ref={popRef}
          id={id}
          role="tooltip"
          onMouseEnter={() => { sobrePopover.current = true; show(); }}
          onMouseLeave={() => { sobrePopover.current = false; hide(); }}
          style={{ ...tokensPanel, ...(pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: "hidden" }) }}
          /* `z-system`: hay modales del libro en esa capa (9000) y con `z-modal-3`
             el ⓘ abría detrás del velo; a igual z gana el portal, que va
             después en el DOM. `pointer-events-auto`: con un modal de Radix
             abierto el `body` tiene `pointer-events:none` y el popover lo
             heredaba — el clic lo atravesaba y cerraba el modal. */
          className={`pointer-events-auto fixed z-system block ${ancho ?? "w-72"} max-w-[calc(100vw-1rem)] rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3.5 text-left normal-case tracking-normal text-[var(--text-primary)] shadow-[var(--shadow-lg)]`}
        >
          {title && <span className="mb-2 block text-sm font-extrabold leading-tight text-[var(--text-primary)]">{title}</span>}
          <span className="block space-y-2">
            {body && <span className="block text-sm leading-snug text-[var(--text-secondary)]">{body}</span>}
            {what && (
              <span className="block">
                <span className="block text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent-ink)] dark:text-[var(--accent)]">Qué hace</span>
                <span className="mt-0.5 block text-sm font-normal leading-snug text-[var(--text-secondary)]">{what}</span>
              </span>
            )}
            {affects && (
              <span className="block">
                <span className="block text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent-ink)] dark:text-[var(--accent)]">A dónde afecta</span>
                <span className="mt-0.5 block text-sm font-normal leading-snug text-[var(--text-secondary)]">{affects}</span>
              </span>
            )}
            {example && (
              <span className="block">
                <span className="block text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">Ejemplo</span>
                <span className="mt-0.5 block text-sm font-normal italic leading-snug text-[var(--text-secondary)]">{example}</span>
              </span>
            )}
          </span>
        </span>,
        document.body,
      )}
    </span>
  );
}
