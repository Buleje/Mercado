"use client";

import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SlidersHorizontal, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { marcarMenuAbierto, marcoDeFixed } from "./action-menu";

/* ═══════════════════════════════════════════════════════════════════════════
 * FiltrosEnBoton — recoge los filtros sueltos de una cabecera en UN botón
 * «Filtros (N)» que despliega un popover con los controles (render libre), y
 * muestra lo aplicado como chips con ✕ al lado, para verlo sin abrir.
 *
 * El único primitivo de compactación que faltaba (los demás —ActionMenu,
 * AccionesDeLaVista, Plegable, BarraDeSecciones, FilterChip, CommandPalette—
 * ya existen). Reglas 5/6/11 de ui-components.
 *
 * Reusa el portal + posición + Escape ya probados en `action-menu`
 * (`marcoDeFixed` resuelve el containing-block del `position: fixed` cuando
 * cuelga dentro de un diálogo de Radix; `marcarMenuAbierto` evita que Escape
 * cierre el AdminModal de abajo).
 * ═══════════════════════════════════════════════════════════════════════════ */

export interface ChipFiltroActivo {
  /** Clave estable para el `key` y para quitarlo. */
  id: string;
  /** Lo que se lee en el chip: «Esta semana», «Fiado». */
  label: string;
  /** Quita ESTE filtro (deja los demás). */
  onQuitar: () => void;
}

interface Props {
  /** Cuántos filtros hay puestos: prende el botón y pinta el contador. */
  activos: number;
  /** Los controles (selects, inputs, chips) van acá dentro del popover. */
  children: ReactNode;
  /** Lo puesto, como etiquetas con ✕, al lado del botón: se ve sin abrir. */
  chips?: ChipFiltroActivo[];
  /** Si se pasa, aparece «Limpiar» cuando `activos > 0` y vacía todo de un saque. */
  onLimpiar?: () => void;
  /** Texto del botón. Default «Filtros». */
  label?: string;
  className?: string;
}

/** Ancho del popover; `ubicar` lo achica si el marco es más angosto. */
const ANCHO_REM = 20;

export default function FiltrosEnBoton({ activos, children, chips, onLimpiar, label = "Filtros", className }: Props) {
  const [open, setOpen] = useState(false);
  const anclaRef = useRef<HTMLButtonElement>(null);
  const portalARef = useRef<HTMLElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);

  /**
   * Dónde y con cuánto alto se dibuja: debajo del botón salvo que no entre
   * (ahí hacia arriba), alineado a su borde izquierdo sin salirse del marco.
   */
  const ubicar = useCallback(() => {
    const ancla = anclaRef.current;
    const b = ancla?.getBoundingClientRect();
    if (!b || !ancla) return;
    const dialogo = ancla.closest<HTMLElement>('[role="dialog"]');
    portalARef.current = dialogo;
    const marco = marcoDeFixed(dialogo);
    const base = marco ?? { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };

    const MARGEN = 12;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const ancho = Math.max(0, Math.min(ANCHO_REM * rem, base.width - 2 * MARGEN));
    const bTop = b.top - base.top;
    const bBottom = b.bottom - base.top;
    const bLeft = b.left - base.left;
    const abajo = base.height - bBottom - MARGEN;
    const arriba = bTop - MARGEN;
    const haciaArriba = abajo < 260 && arriba > abajo;
    const disponible = Math.min(haciaArriba ? arriba : abajo, 480);
    setPos({
      top: haciaArriba ? Math.max(MARGEN, bTop - disponible - 8) : bBottom + 8,
      left: Math.min(Math.max(MARGEN, bLeft), base.width - ancho - MARGEN),
      width: ancho,
      maxHeight: Math.max(0, disponible - 8),
    });
  }, []);

  /* `useLayoutEffect`: ubicarlo antes de pintar evita que aparezca un frame en
     la esquina y salte. */
  useLayoutEffect(() => {
    if (open) ubicar();
  }, [open, ubicar]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", ubicar, true);
    window.addEventListener("resize", ubicar);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", ubicar, true);
      window.removeEventListener("resize", ubicar);
    };
  }, [open, ubicar]);

  /* Marca el diálogo ancestro mientras está abierto: AdminModal lo mira para no
     cerrarse él también con Escape (segunda defensa; la primera es el
     `preventDefault` de arriba). */
  useEffect(() => {
    if (!open) return;
    const dialogo = anclaRef.current?.closest<HTMLElement>('[role="dialog"]') ?? null;
    if (!dialogo) return;
    marcarMenuAbierto(dialogo, true);
    return () => marcarMenuAbierto(dialogo, false);
  }, [open]);

  const popover = open && pos && (
    <>
      <div className="fixed inset-0 z-modal-2" onClick={() => setOpen(false)} aria-hidden="true" />
      <div
        role="dialog"
        aria-label={`${label}: opciones`}
        style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
        className="fixed z-modal-2 flex flex-col overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-lg)]"
      >
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">{children}</div>
        <div className="flex items-center justify-between gap-2 border-t border-[var(--rule-base)] p-3">
          {onLimpiar ? (
            <button
              type="button"
              onClick={onLimpiar}
              disabled={activos === 0}
              className="text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--accent)] disabled:opacity-40"
            >
              Limpiar
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex min-h-9 items-center rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white hover:bg-[var(--accent-600)]"
          >
            Listo
          </button>
        </div>
      </div>
    </>
  );

  const destino = portalARef.current ?? (typeof document !== "undefined" ? document.body : null);

  return (
    <div className={cn("inline-flex flex-wrap items-center gap-2", className)}>
      <button
        type="button"
        ref={anclaRef}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          "inline-flex h-12 items-center gap-2 rounded-2xl border px-4 text-sm font-semibold transition-colors",
          activos > 0
            ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
            : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)]",
        )}
      >
        <SlidersHorizontal className="h-4 w-4" />
        {label}
        {activos > 0 && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[length:var(--ts-2xs)] font-bold text-white">
            {activos > 99 ? "99+" : activos}
          </span>
        )}
      </button>

      {chips?.map((c) => (
        <span
          key={c.id}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] py-1 pl-2.5 pr-1 text-sm font-medium text-[var(--text-secondary)]"
        >
          {c.label}
          <button
            type="button"
            onClick={c.onQuitar}
            aria-label={`Quitar ${c.label}`}
            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-alt)] hover:text-[var(--text-primary)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      ))}

      {destino && popover ? createPortal(popover, destino) : null}
    </div>
  );
}
