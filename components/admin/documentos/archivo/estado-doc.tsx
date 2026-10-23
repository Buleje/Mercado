"use client";

import { type TonoEstado, estadoDe as estadoDeDoc, META_ESTADO, ORDEN_ESTADOS } from "@/lib/documents/estados-doc";
import type { EstadoDelMenu } from "../MenuDocumento";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Plus, Check } from "@buleje/design-system/icons";

/**
 * Cómo se pinta cada tono de estado. La lista de estados y sus etiquetas viven
 * en `lib/documents/estados-doc` (la comparten los endpoints); acá sólo el
 * vestuario: el punto del chip, el texto, el fondo y —lo que hace que se vean
 * de lejos— el borde y la franja de la tarjeta.
 */
const TONO_CLASES: Record<TonoEstado, { dot: string; text: string; bg: string; borde: string; franja: string }> = {
  neutro: {
    dot: "bg-[var(--text-tertiary)]", text: "text-[var(--text-secondary)]", bg: "bg-[var(--surface-sunken)]",
    borde: "border-[var(--rule-strong)]", franja: "bg-[var(--text-tertiary)]",
  },
  aviso: {
    dot: "bg-[var(--data-warning-500)]", text: "text-[var(--data-warning)]", bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/15",
    borde: "border-[var(--data-warning-500)]", franja: "bg-[var(--data-warning-500)]",
  },
  alerta: {
    dot: "bg-[var(--data-error-500)]", text: "text-[var(--data-error)]", bg: "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/15",
    borde: "border-[var(--data-error-500)]", franja: "bg-[var(--data-error-500)]",
  },
  ok: {
    dot: "bg-[var(--data-success-500)]", text: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]", bg: "bg-[var(--data-success-50)] dark:bg-[var(--data-success-500)]/15",
    borde: "border-[var(--data-success-500)]", franja: "bg-[var(--data-success-500)]",
  },
  info: {
    dot: "bg-[var(--data-info-500)]", text: "text-[var(--data-info-700)] dark:text-[var(--data-info-500)]", bg: "bg-[var(--data-info-100)] dark:bg-[var(--data-info-500)]/15",
    borde: "border-[var(--data-info-500)]", franja: "bg-[var(--data-info-500)]",
  },
};

/** Clases + etiqueta de un estado, en un solo lugar. */
export function pinta(estado: string) {
  const e = estadoDeDoc(estado);
  return { ...TONO_CLASES[META_ESTADO[e].tono], label: META_ESTADO[e].label, ayuda: META_ESTADO[e].ayuda, estado: e };
}

export const STATUS_META: Record<string, { label: string; dot: string; text: string; bg: string }> = Object.fromEntries(
  ORDEN_ESTADOS.map((e) => [e, pinta(e)]),
);
export const STATUS_ORDER: string[] = ORDEN_ESTADOS;
/** Los estados que ofrece el «⋯» de cada documento, con el mismo punto de color que el chip. */
export const ESTADOS_DEL_MENU: EstadoDelMenu[] = ORDEN_ESTADOS.map((e) => ({ clave: e, label: STATUS_META[e].label, dot: STATUS_META[e].dot }));

// Chip de estado que además abre un dropdown (fixed) para cambiarlo. "none" = sin estado.
export function StatusControl({ status, onChange }: { status: string; onChange: (s: string) => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);
  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (open) { setOpen(false); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: r.left });
    setOpen(true);
  };
  const meta = STATUS_META[status];
  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        title={meta ? `Estado: ${meta.label}` : "Poner un estado"}
        aria-label={meta ? `Estado: ${meta.label}` : "Poner un estado"}
        className={cn(
          "inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-sm font-bold transition-colors",
          meta ? cn(meta.bg, meta.text) : "border border-dashed border-[var(--rule-base)] text-[var(--text-tertiary)] hover:border-primary hover:text-primary"
        )}
      >
        {meta ? (
          <><span className={cn("h-2 w-2 rounded-full", meta.dot)} /> {meta.label}</>
        ) : (
          <Plus className="h-3 w-3" aria-hidden />
        )}
      </button>
      {open && pos && (
        <div className="fixed z-50 min-w-[160px] overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] py-1 shadow-xl" style={{ top: pos.top, left: pos.left }} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          {STATUS_ORDER.map((k) => {
            const m = STATUS_META[k];
            return (
              <button
                key={k}
                onClick={(e) => { e.stopPropagation(); setOpen(false); onChange(k); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)]"
              >
                <span className={cn("h-2.5 w-2.5 rounded-full", m.dot)} /> {m.label}
                {status === k && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
              </button>
            );
          })}
          {status !== "none" && (
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); onChange("none"); }}
              className="flex w-full items-center gap-2 border-t border-[var(--rule-base)] px-3 py-1.5 text-sm font-medium text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)]"
            >
              Sin estado
            </button>
          )}
        </div>
      )}
    </>
  );
}
