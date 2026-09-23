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
 *
 * Tardanza (ADR-417): la celda de la semana mide 32 px, así que el aviso NO
 * empuja la grilla — un punto de 8 px en la esquina del cuadrito, que además
 * se dice con palabras en el nombre accesible y en el `title`. El detalle
 * («Llegó 12 min tarde», «Entra 07:30 · 10 min de tolerancia») vive dentro del
 * panel, que es donde hay lugar. El punto se enciende SÓLO cuando queda algo
 * por hacer: PRESENTE, tarde y dentro de la ventana de corrección.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, History, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { tardanzaDe } from "@/lib/rrhh/asistencia";
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
  /** Horario del puesto (ADR-417). `null`/ausente = la tardanza no se juzga sola. */
  horario?: { horaEntrada: string; toleranciaMin: number } | null;
  /**
   * Acepta la tardanza sugerida. La arma el padre porque la marca tiene que
   * viajar COMPLETA: el buffer de `use-rrhh-asistencia` REEMPLAZA lo pendiente
   * de la celda, así que mandar sólo el estado borraría la hora de entrada que
   * justamente delató la tardanza. Sin este callback la celda sólo informa.
   */
  onAceptarTardanza?: () => void;
  onVerHistorial: () => void;
  /** `grande` = 36 px, para el calendario del celular. */
  tamano?: "normal" | "grande";
}

const ANCHO = 256;

export default function CeldaMarcaPopover({ colaborador, fecha, marca, pendiente, errorMsg, incluido, editable, motivoNoEditable, horario, onMarcar, onAceptarTardanza, onVerHistorial, tamano = "normal" }: Props) {
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
  // `null` mientras no haya hora marcada u horario del puesto: sin eso no hay nada que decir.
  const tardanza = horario ? tardanzaDe(marca?.entrada ?? null, horario.horaEntrada, horario.toleranciaMin) : null;
  const minutosTarde = tardanza?.tarde ? tardanza.minutos : null;
  // Igual que la hoja del día: el cambio sólo se ofrece desde PRESENTE (lo que deja
  // «Todos presentes»); con otro estado puesto a mano, la celda informa y no toca nada.
  const sugerida = minutosTarde !== null && marca?.estado === "PRESENTE" && editable && Boolean(onAceptarTardanza);
  const estadoLegible = meta?.label ?? (incluido ? "Sin marcar" : "No trabaja este día");
  // El punto de color no comunica solo: lo mismo que pinta viaja en el nombre accesible.
  const detalle = errorMsg ?? (minutosTarde === null ? estadoLegible : `${estadoLegible} · llegó ${minutosTarde} min tarde${sugerida ? ", tardanza sin marcar" : ""}`);

  const panel = open && pos && (
    <>
      <div className="fixed inset-0 z-modal-2" onClick={() => cerrar()} aria-hidden="true" />
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
        {tardanza && horario && (
          <div role="status" className="mt-2">
            {minutosTarde !== null ? (
              <div className="rounded-lg bg-[var(--data-warning-500)]/10 px-2.5 py-2">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden /> Llegó {minutosTarde} min tarde
                </p>
                <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
                  Entra {horario.horaEntrada} · {horario.toleranciaMin} min de tolerancia
                </p>
                {sugerida && (
                  <button
                    type="button"
                    onClick={() => {
                      onAceptarTardanza?.();
                      cerrar();
                    }}
                    className={cn(BOTON.chico, "mt-2 h-11 w-full sm:h-9")}
                  >
                    Marcar tardanza
                  </button>
                )}
              </div>
            ) : (
              <p className="text-xs text-[var(--text-tertiary)]">Llegó a tiempo para las {horario.horaEntrada}.</p>
            )}
          </div>
        )}
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
          "relative flex items-center justify-center rounded-md font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-30",
          tamano === "grande" ? "h-9 w-9 text-sm" : "h-8 w-8 text-xs",
          meta ? meta.claseChip : "text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]",
          errorMsg && "ring-2 ring-[var(--data-error-500)]",
          pendiente && "animate-pulse",
          !editable && "opacity-60",
        )}
      >
        {meta?.letra ?? "·"}
        {/* Dentro del cuadrito y en su esquina: no mueve la grilla ni pisa la letra. */}
        {sugerida && (
          <span
            data-aviso-tardanza
            aria-hidden
            className={cn(
              "absolute right-0 top-0 rounded-full bg-[var(--data-warning-500)] ring-2 ring-[var(--surface-raised)]",
              // 10 px en el calendario del celular (celda de 36 px), 8 px en la tabla.
              tamano === "grande" ? "h-2.5 w-2.5" : "h-2 w-2",
            )}
          />
        )}
      </button>
      {typeof document !== "undefined" && panel ? createPortal(panel, portalARef.current ?? document.body) : null}
    </>
  );
}
