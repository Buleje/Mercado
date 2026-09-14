"use client";

/**
 * CeldaMarcaPopover — editar UNA celda de la hoja del mes (ADR-414 §7).
 *
 * Mismo patrón de portal que `ActionMenu` (memoria `modales-anidados-z-index-
 * radix`, lección «ActionMenu»): si la celda vive dentro de un `AdminModal`,
 * el panel se porta DENTRO del `[role=dialog]` — afuera hereda
 * `pointer-events: none` del overlay de Radix y se ve pero no se puede tocar.
 * Escape cierra sólo el popover (`preventDefault` + `marcarMenuAbierto`),
 * nunca el diálogo de abajo. Al abrir, el foco va al estado; al cerrar,
 * vuelve a la celda (antes quedaba perdido en el `body`).
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { History, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { etiquetaDia } from "@/lib/rrhh/fechas";
import { marcarMenuAbierto, marcoDeFixed } from "@/components/admin/shared/action-menu";
import { BOTON } from "../rrhh-form";
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

const ANCHO = 256;

export default function CeldaMarcaPopover({ colaborador, fecha, marca, pendiente, errorMsg, incluido, editable, motivoNoEditable, onMarcar, onVerHistorial }: Props) {
  const [open, setOpen] = useState(false);
  const anclaRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
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
    setPos({
      top: b.bottom - base.top + 6,
      left: Math.min(Math.max(8, b.left - base.left), base.width - ANCHO - 8),
    });
  }, []);

  const cerrar = useCallback((devolverFoco = true) => {
    setOpen(false);
    if (devolverFoco) anclaRef.current?.focus();
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
      cerrar();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      if (dialogo) marcarMenuAbierto(dialogo, false);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open, cerrar]);

  // Foco al estado marcado (o al primero) apenas el panel está ubicado.
  useEffect(() => {
    if (!open || !pos) return;
    const id = requestAnimationFrame(() => {
      const panel = panelRef.current;
      const destino =
        panel?.querySelector<HTMLButtonElement>('[data-estado][aria-pressed="true"]:not([disabled])') ??
        panel?.querySelector<HTMLButtonElement>("[data-estado]:not([disabled])") ??
        panel?.querySelector<HTMLButtonElement>("[data-historial]");
      destino?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open, pos]);

  const meta = marca ? ESTADO_ASISTENCIA_META[marca.estado] : null;
  const detalle = errorMsg ?? meta?.label ?? (incluido ? "Sin marcar" : "No trabaja este día");

  const panel = open && pos && (
    <>
      <div className="fixed inset-0 z-[60]" onClick={() => cerrar()} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-label={`${colaborador.nombre}, ${etiquetaDia(fecha)}`}
        style={{ top: pos.top, left: pos.left, width: ANCHO }}
        className="fixed z-[61] rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 shadow-[var(--shadow-lg)]"
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{colaborador.nombre}</p>
            <p className="text-xs text-[var(--text-tertiary)] first-letter:uppercase">
              {etiquetaDia(fecha)} · {detalle}
            </p>
          </div>
          <button type="button" onClick={() => cerrar()} aria-label="Cerrar" className={cn(BOTON.icono, "-mr-1.5 -mt-1.5 h-8 w-8")}>
            <X className="h-4 w-4" />
          </button>
        </div>
        {!editable && motivoNoEditable && <p className="mb-2 text-xs text-[var(--text-tertiary)]">{motivoNoEditable}</p>}
        <div className="grid grid-cols-4 gap-1.5">
          {ORDEN_ESTADOS_ASISTENCIA.map((estado) => {
            const m = ESTADO_ASISTENCIA_META[estado];
            const activo = marca?.estado === estado;
            return (
              <button
                key={estado}
                type="button"
                data-estado={estado}
                disabled={!editable}
                title={m.label}
                aria-pressed={activo}
                onClick={() => {
                  onMarcar(activo ? null : estado);
                  cerrar();
                }}
                className={cn(
                  "flex h-10 items-center justify-center rounded-lg border-2 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40",
                  activo ? cn("border-current", m.claseChip) : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--text-tertiary)] hover:text-[var(--text-primary)]",
                )}
              >
                <span aria-hidden>{m.letra}</span>
                <span className="sr-only">{m.label}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          data-historial
          onClick={() => {
            cerrar(false);
            onVerHistorial();
          }}
          className={cn(BOTON.chicoFantasma, "mt-2 w-full")}
        >
          <History className="h-4 w-4" /> Ver historial del día
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
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${colaborador.nombre}, ${fecha}: ${detalle}${!editable && motivoNoEditable ? ` — ${motivoNoEditable}` : ""}`}
        title={`${detalle}${!editable && motivoNoEditable ? ` — ${motivoNoEditable}` : ""}`}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-md text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-30",
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
