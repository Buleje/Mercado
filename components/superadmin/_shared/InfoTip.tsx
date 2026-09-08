"use client";

/**
 * InfoTip — ícono de información junto a un título de sección que, al pasar el
 * mouse (o al hacer click / foco), muestra un popover al lado con qué hace el
 * módulo, a dónde afecta y un ejemplo fácil de entender (Brandon 2026-06-19).
 * Accesible: hover + click + foco + Escape + click-fuera. Hereda los tokens de
 * plataforma.
 *
 * Vive bajo `superadmin/_shared` por dónde nació, pero es de TODO el panel: lo
 * usan `AdminTabShell` y el Cubicador. No moverlo por moverlo (19 archivos lo
 * importan de acá) — sí saber que no es exclusivo del superadmin.
 *
 * Dos formas de llenarlo:
 *  - estructurada (`what` / `affects` / `example`), la de las secciones;
 *  - libre (`body`), para lo que no entra en esas tres preguntas — una lista
 *    de comandos de voz, unos atajos de teclado. Sin esto había que estirar el
 *    molde de tres preguntas hasta que dejaba de decir la verdad.
 */

import { useEffect, useId, useRef, useState } from "react";
import { HelpCircle, Info } from "@buleje/design-system/icons";

export interface InfoTipProps {
  /** Título del popover (normalmente el nombre de la sección). */
  title?: string;
  /** ¿Qué hace? — descripción simple. Opcional si se pasa `body`. */
  what?: string;
  /** Contenido libre, para lo que no es «qué hace / a dónde afecta / ejemplo». */
  body?: React.ReactNode;
  /** Lo que lee un lector de pantalla en el botón, si el texto no alcanza. */
  ariaLabel?: string;
  /** Ancho del popover. Por defecto `w-72`; `w-96` para listas largas. */
  ancho?: string;
  /**
   * Qué ícono lleva. `info` (ⓘ) es el de las secciones del superadmin; `ayuda`
   * (?) es el de «cómo se usa esto», que es otra pregunta: uno explica QUÉ es
   * la sección, el otro CÓMO se opera. Por defecto el de siempre, para no
   * cambiarles el ícono a las 19 pantallas que ya lo usan.
   */
  icono?: "info" | "ayuda";
  /** ¿A dónde afecta? — qué cambia / dónde se ve el efecto. */
  affects?: string;
  /** Ejemplo concreto y fácil de entender. */
  example?: string;
  /** Lado donde aparece el popover. */
  side?: "right" | "left" | "bottom";
  className?: string;
}

export function InfoTip({ title, what, body, affects, example, side = "right", className, ariaLabel, ancho, icono = "info" }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();

  const show = () => { if (closeTimer.current) clearTimeout(closeTimer.current); setOpen(true); };
  const hide = () => { closeTimer.current = setTimeout(() => setOpen(false), 140); };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onDoc = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDoc);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDoc); };
  }, [open]);

  const pos = side === "left" ? "right-full mr-2 top-0" : side === "bottom" ? "left-0 top-full mt-2" : "left-full ml-2 top-0";

  return (
    <span ref={wrapRef} className={["relative inline-flex align-middle", className].filter(Boolean).join(" ")} onMouseEnter={show} onMouseLeave={hide}>
      <button
        type="button"
        aria-label={ariaLabel ?? `Información: ${title ?? what?.slice(0, 40) ?? "ayuda"}`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen(true)}
        onFocus={show}
        onBlur={hide}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--surface-sunken)] transition-colors"
      >
        {icono === "ayuda" ? (
          <HelpCircle className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        ) : (
          <Info className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        )}
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          onMouseEnter={show}
          onMouseLeave={hide}
          className={`absolute z-50 ${pos} ${ancho ?? "w-72"} max-w-[80vw] rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3.5 text-left shadow-[var(--shadow-lg,0_8px_24px_rgba(0,0,0,.18))] normal-case tracking-normal`}
        >
          {title && <p className="text-sm font-extrabold text-[var(--text-primary)] mb-2 leading-tight">{title}</p>}
          <div className="space-y-2">
            {body}
            {what && (
              <div>
                <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent)]">Qué hace</p>
                <p className="text-xs font-normal text-[var(--text-secondary)] leading-snug mt-0.5">{what}</p>
              </div>
            )}
            {affects && (
              <div>
                <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent-ink)] dark:text-[var(--accent)]">A dónde afecta</p>
                <p className="text-xs font-normal text-[var(--text-secondary)] leading-snug mt-0.5">{affects}</p>
              </div>
            )}
            {example && (
              <div>
                <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">Ejemplo</p>
                <p className="text-xs font-normal text-[var(--text-secondary)] leading-snug mt-0.5 italic">{example}</p>
              </div>
            )}
          </div>
        </span>
      )}
    </span>
  );
}
