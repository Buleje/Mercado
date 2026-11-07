"use client";

/**
 * El marco de las ventanas de Caja (abrir, cerrar, movimiento, arqueos,
 * detalle, tolerancia). Antes cada una repetía ~25 líneas de backdrop,
 * cabecera, controles de ventana y pie; ahora las seis comparten esto.
 *
 * Semántica igual que antes: `useModalAccesible` (foco atrapado, Escape) y
 * `useVentanaDeModal` (mover, fijar, recordar posición por `claveMemoria`).
 * Se monta sólo cuando la ventana está abierta. El ancho va en rem: `max-w-md`
 * vale ~960 px en este proyecto (override de `--container-*`).
 */
import { useId, useRef, type ReactNode } from "react";
import { CardTitle } from "@buleje/design-system";
import { AlertTriangle, X, type LucideIcon } from "@buleje/design-system/icons";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { useVentanaDeModal } from "@/hooks/use-ventana-de-modal";
import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import { cn } from "@/lib/utils";

/** La clase del título de AdminModal: misma escala en todas las ventanas del panel. */
export const TITULO_VENTANA = "font-display text-base sm:text-lg font-semibold text-[var(--text-primary)] tracking-tight truncate";

interface Props {
  claveMemoria: string;
  titulo: ReactNode;
  subtitulo?: ReactNode;
  icono: LucideIcon;
  /** Fondo + color del ícono de la cabecera. */
  iconoClase?: string;
  ancho?: "md" | "lg";
  onCerrar: () => void;
  /** Error del servidor, a la vista DENTRO de la ventana (antes quedaba detrás del fondo). */
  error?: string | null;
  pie?: ReactNode;
  children: ReactNode;
}

export function MarcoModalCaja({ claveMemoria, titulo, subtitulo, icono: Icono, iconoClase, ancho = "md", onCerrar, error, pie, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const tituloId = useId();
  useModalAccesible(ref, { onCerrar, activo: true });
  const ventana = useVentanaDeModal(true, { ref, aplicarTranslate: true, claveMemoria });

  return (
    <div
      className="modal-backdrop p-4"
      onClick={(e) => e.target === e.currentTarget && !ventana.fijado && onCerrar()}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCerrar();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
        className={cn(
          "relative bg-[var(--surface-raised)] rounded-2xl shadow-[var(--shadow-xl)] ring-1 ring-[var(--rule-base)] w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-[var(--dur-fast)]",
          ancho === "lg" ? "max-w-[36rem]" : "max-w-[30rem]",
        )}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div {...ventana.asaProps} className="px-5 sm:px-6 py-4 border-b border-[var(--rule-soft)] flex items-center gap-3">
          <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", iconoClase ?? "bg-primary/10 text-primary")}>
            <Icono className="h-5 w-5" strokeWidth={2} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle id={tituloId} className={TITULO_VENTANA}>
              {titulo}
            </CardTitle>
            {subtitulo && <p className="text-sm text-[var(--text-tertiary)] truncate">{subtitulo}</p>}
          </div>
          <span className="ml-auto flex items-center gap-1 shrink-0">
            <ControlesDeVentana ventana={ventana} />
            <button type="button" onClick={onCerrar} aria-label="Cerrar" className="p-2 rounded-xl hover:bg-[var(--surface-sunken)] transition-colors">
              <X className="h-5 w-5 text-[var(--text-tertiary)]" />
            </button>
          </span>
        </div>

        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-4">{children}</div>

        {(pie || error) && (
          <div className="px-5 sm:px-6 py-4 border-t border-[var(--rule-soft)] bg-[var(--surface-alt)]/50 space-y-3">
            {error && (
              <div role="alert" aria-live="assertive" className="flex items-start gap-2 rounded-xl border border-[var(--data-error-500)]/30 bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20 px-3 py-2">
                <AlertTriangle className="h-4 w-4 text-[var(--data-error-500)] shrink-0 mt-0.5" aria-hidden />
                <p className="text-sm font-semibold text-[var(--data-error-500)]">{error}</p>
              </div>
            )}
            {pie && <div className="flex gap-3">{pie}</div>}
          </div>
        )}
        <TiradorDeVentana ventana={ventana} />
      </div>
    </div>
  );
}

/** Botón «Cancelar» del pie, igual en todas. */
export function BotonCancelar({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 min-h-11 rounded-xl text-base font-semibold text-[var(--text-secondary)] border border-[var(--rule-base)] bg-[var(--surface-raised)] hover:bg-[var(--surface-alt)] transition-colors"
    >
      Cancelar
    </button>
  );
}

/** Lo que el servidor contestó, o uno genérico con el código. */
export async function mensajeDeError(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return typeof body?.error === "string" ? body.error : `${fallback} (error ${res.status})`;
}
