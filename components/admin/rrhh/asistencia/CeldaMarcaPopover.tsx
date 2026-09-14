"use client";

/**
 * CeldaMarcaPopover — editar UNA celda de la hoja del mes (ADR-414 §7).
 *
 * Mismo patrón de portal que `ActionMenu` (memoria `modales-anidados-z-index-
 * radix`, lección «ActionMenu»): si la celda vive dentro de un `AdminModal`,
 * el panel se porta DENTRO del `[role=dialog]` — afuera hereda
 * `pointer-events: none` del overlay de Radix y se ve pero no se puede tocar.
 * Escape cierra sólo el popover (`preventDefault` + `marcarMenuAbierto`),
 * nunca el diálogo de abajo.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { History, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { marcarMenuAbierto, marcoDeFixed } from "@/components/admin/shared/action-menu";
import { ESTADO_ASISTENCIA_META, ORDEN_ESTADOS_ASISTENCIA } from "../rrhh-ui";
import type { AsistenciaDTO, ColaboradorMinDTO, EstadoAsistencia, FechaKey } from "@/lib/rrhh/tipos";

interface Props {
  colaborador: ColaboradorMinDTO;
  fecha: FechaKey;
  marca: AsistenciaDTO | undefined;
  pendiente: boolean;
  errorMsg: string | undefined;
  incluido: boolean;
  /** Fuera de la ventana de corrección del rol — el trigger sigue abriendo (para ver historial), los botones de estado no. */
  editable: boolean;
  motivoNoEditable?: string;
  onMarcar: (estado: EstadoAsistencia | null) => void;
  onVerHistorial: () => void;
}

export default function CeldaMarcaPopover({ colaborador, fecha, marca, pendiente, errorMsg, incluido, editable, motivoNoEditable, onMarcar, onVerHistorial }: Props) {
  const [open, setOpen] = useState(false);
  const anclaRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const portalARef = useRef<HTMLElement | null>(null);

  const ubicar = useCallback(() => {
    const ancla = anclaRef.current;
    const b = ancla?.getBoundingClientRect();
    if (!b || !ancla) return;
    const dialogo = ancla.closest<HTMLElement>('[role="dialog"]');
    portalARef.current = dialogo;
    const marco = marcoDeFixed(dialogo);
    const base = marco ?? { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
    const ANCHO = 224;
    setPos({
      top: b.bottom - base.top + 6,
      left: Math.min(Math.max(8, b.left - base.left), base.width - ANCHO - 8),
    });
  }, []);

  useLayoutEffect(() => {
    if (open) ubicar();
  }, [open, ubicar]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", ubicar, true);
    window.addEventListener("resize", ubicar);
    return () => {
      window.removeEventListener("scroll", ubicar, true);
      window.removeEventListener("resize", ubicar);
    };
  }, [open, ubicar]);

  useEffect(() => {
    if (!open) return;
    const dialogo = anclaRef.current?.closest<HTMLElement>('[role="dialog"]') ?? null;
    if (dialogo) marcarMenuAbierto(dialogo, true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      if (dialogo) marcarMenuAbierto(dialogo, false);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const meta = marca ? ESTADO_ASISTENCIA_META[marca.estado] : null;

  const panel = open && pos && (
    <>
      <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} aria-hidden="true" />
      <div
        style={{ top: pos.top, left: pos.left }}
        className="fixed z-[61] w-56 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-2.5 shadow-[var(--shadow-lg)]"
      >
        <div className="mb-1.5 flex items-center justify-between">
          <p className="truncate text-xs font-bold text-[var(--text-primary)]">{colaborador.nombre}</p>
          <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {!editable && motivoNoEditable && (
          <p className="mb-1.5 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{motivoNoEditable}</p>
        )}
        <div className="grid grid-cols-4 gap-1">
          {ORDEN_ESTADOS_ASISTENCIA.map((estado) => {
            const m = ESTADO_ASISTENCIA_META[estado];
            const activo = marca?.estado === estado;
            return (
              <button
                key={estado}
                type="button"
                disabled={!editable}
                title={m.label}
                aria-pressed={activo}
                onClick={() => {
                  onMarcar(activo ? null : estado);
                  setOpen(false);
                }}
                className={cn(
                  "flex h-8 items-center justify-center rounded-lg border-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40",
                  activo ? cn("border-transparent", m.claseChip) : "border-[var(--rule-base)] text-[var(--text-tertiary)] hover:border-[var(--rule-strong)]",
                )}
              >
                {m.letra}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => { setOpen(false); onVerHistorial(); }}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border-t border-[var(--rule-soft)] pt-2 text-[length:var(--ts-2xs)] font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
        >
          <History className="h-3 w-3" /> Ver historial del día
        </button>
      </div>
    </>
  );

  return (
    <>
      <button
        ref={anclaRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={!incluido && !marca}
        aria-label={`${colaborador.nombre}, ${fecha}: ${errorMsg ?? meta?.label ?? (incluido ? "sin marcar" : "no incluido")}${!editable && motivoNoEditable ? ` — ${motivoNoEditable}` : ""}`}
        title={`${errorMsg ?? meta?.label ?? (incluido ? "Sin marcar" : "No incluido")}${!editable && motivoNoEditable ? ` — ${motivoNoEditable}` : ""}`}
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-30",
          meta ? meta.claseChip : "text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]",
          errorMsg && "ring-2 ring-[var(--data-error-500)]",
          pendiente && "animate-pulse",
          !editable && "opacity-60",
        )}
      >
        {meta?.letra ?? "·"}
      </button>
      {typeof document !== "undefined" && panel ? createPortal(panel, portalARef.current ?? document.body) : null}
    </>
  );
}
