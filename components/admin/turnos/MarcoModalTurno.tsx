"use client";

/**
 * Marco de las 4 ventanas de Turnos (nueva cajera, cerrar turno, diferencia
 * alta, resumen). Eran cuatro copias de ~40 líneas del mismo overlay a mano:
 * fondo, diálogo con trampa de foco (`useModalAccesible`), ventana movible y
 * fijable (`useVentanaDeModal`) y tirador. El Escape lo lleva el módulo (un
 * solo oyente que cierra la de más arriba), por eso `cerrarConEscape: false`.
 *
 * Ancho en rem: `max-w-md/lg` valen el doble en este proyecto (override de
 * `--container-*`) y la ventana de cierre salía de 960-1200 px.
 */
import { useId, useRef, type ReactNode } from "react";
import { X, type LucideIcon } from "@buleje/design-system/icons";
import { m, AnimatePresence } from "@/components/admin/providers";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { useVentanaDeModal } from "@/hooks/use-ventana-de-modal";
import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import { cn } from "@/lib/utils";

/** La clase del título de AdminModal (nivel «ventana» de la escala del panel). */
export const TITULO_VENTANA = "font-display text-base sm:text-lg font-semibold text-[var(--text-primary)] tracking-tight";

type Props = {
  abierto: boolean;
  claveMemoria: string;
  titulo: ReactNode;
  subtitulo?: ReactNode;
  icono: LucideIcon;
  tono?: "accent" | "error";
  ancho?: "md" | "lg";
  /** Se abre encima de otra ventana de Turnos (diferencia alta sobre el cierre). */
  encima?: boolean;
  /** Clic en el fondo (no corre si la ventana está fijada). */
  onFondo: () => void;
  /** Muestra la X; sin esto la ventana sólo se cierra con sus botones. */
  onCerrar?: () => void;
  pie?: ReactNode;
  children: ReactNode;
};

export function MarcoModalTurno({
  abierto, claveMemoria, titulo, subtitulo, icono: Icono, tono = "accent", ancho = "md", encima, onFondo, onCerrar, pie, children,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const tituloId = useId();
  useModalAccesible(ref, { activo: abierto, cerrarConEscape: false });
  const ventana = useVentanaDeModal(abierto, { ref, aplicarTranslate: true, claveMemoria });
  const error = tono === "error";

  return (
    <AnimatePresence>
      {abierto && (
        <m.div
          key={`${claveMemoria}-fondo`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className={cn("modal-backdrop p-4", encima && "z-[60]")}
          onClick={(e) => { if (e.target === e.currentTarget && !ventana.fijado) onFondo(); }}
        >
          <m.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={tituloId}
            tabIndex={-1}
            initial={{ scale: 0.95, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "relative w-full bg-[var(--surface-raised)] rounded-2xl shadow-[var(--shadow-xl)] ring-1 max-h-[92vh] flex flex-col overflow-hidden",
              ancho === "lg" ? "max-w-[36rem]" : "max-w-[28rem]",
              error ? "ring-[var(--data-error-500)]/30" : "ring-[var(--rule-base)]",
            )}
          >
            <div
              {...ventana.asaProps}
              className={cn(
                "px-6 py-4 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] flex items-center gap-3",
                error && "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/10",
              )}
            >
              <div className={cn(
                "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
                error ? "bg-[var(--data-error-500)]/15" : "bg-primary/10",
              )}>
                <Icono className={cn("h-5 w-5", error ? "text-[var(--data-error-500)]" : "text-primary")} strokeWidth={2} aria-hidden />
              </div>
              <div className="min-w-0">
                <h2 id={tituloId} className={TITULO_VENTANA}>{titulo}</h2>
                {subtitulo && <p className="text-sm text-[var(--text-tertiary)]">{subtitulo}</p>}
              </div>
              <span className="ml-auto flex items-center gap-1">
                <ControlesDeVentana ventana={ventana} />
              </span>
              {onCerrar && (
                <button type="button" onClick={onCerrar} aria-label="Cerrar" className="p-2 hover:bg-[var(--surface-sunken)] rounded-xl transition-colors">
                  <X className="h-5 w-5 text-[var(--text-tertiary)]" />
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">{children}</div>
            {pie && (
              <div className="px-6 py-4 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] bg-[var(--surface-sunken)] flex flex-wrap gap-3">
                {pie}
              </div>
            )}
            <TiradorDeVentana ventana={ventana} />
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}

/** Caja roja de error dentro de una ventana. */
export function ErrorVentana({ mensaje }: { mensaje: string | null }) {
  if (!mensaje) return null;
  return (
    <div role="alert" className="rounded-xl bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/15 border border-[var(--data-error-500)]/30 px-4 py-3">
      <p className="text-sm text-[var(--data-error-500)] font-semibold">{mensaje}</p>
    </div>
  );
}

export const BOTON_SECUNDARIO = "flex-1 min-h-11 px-4 rounded-xl text-base font-semibold text-[var(--text-secondary)] border border-[var(--rule-base)] bg-[var(--surface-raised)] hover:bg-[var(--surface-sunken)] disabled:opacity-50 transition-colors";
export const BOTON_PRIMARIO = "flex-1 flex items-center justify-center gap-2 min-h-11 px-4 rounded-xl text-base font-semibold text-white bg-primary hover:bg-primary-dark disabled:opacity-50 transition-colors";
export const BOTON_PELIGRO = "flex-1 flex items-center justify-center gap-2 min-h-11 px-4 rounded-xl text-base font-semibold text-white bg-[var(--data-error-500)] hover:bg-[var(--data-error-500)]/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors";
export const INPUT_VENTANA = "w-full h-12 px-4 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-base text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all";
