"use client";

/**
 * La ventana de revisión de un papel: AdminModal `wide` (bottom-sheet en el
 * celular) con el pie de siempre — a la izquierda lo que gastó la IA y el
 * error, a la derecha [Descartar] y la acción que guarda.
 */

import type { ReactNode } from "react";
import { Loader2, type LucideIcon } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, costoIa } from "./formato";

export interface AccionPapel {
  texto: string;
  onClick: () => void;
  deshabilitada?: boolean;
  ocupada?: boolean;
}

export function MarcoPapel({
  abierto,
  onCerrar,
  titulo,
  icono,
  costoIaUsd,
  error,
  motivo,
  onDescartar,
  accion,
  extra,
  textoLeido,
  children,
}: {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  icono: LucideIcon;
  costoIaUsd: number;
  error: string | null;
  /** Por qué la acción no se puede (rol, faltan productos…): una línea. */
  motivo?: string | null;
  onDescartar: () => void;
  accion?: AccionPapel | null;
  /** Otra salida en lugar de la acción (p. ej. «Abrir Fiados»). */
  extra?: ReactNode;
  /** El texto tal como se leyó, plegado al final: para compararlo con el papel. */
  textoLeido?: string;
  children: ReactNode;
}) {
  return (
    <AdminModal
      open={abierto}
      onClose={onCerrar}
      title={titulo}
      icon={icono}
      variant="wide"
      claveVentana="comandos-ia-papel"
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-sm">
            {error ? (
              <p role="alert" className="font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>
            ) : motivo ? (
              <p aria-live="polite" className="text-[var(--text-secondary)]">{motivo}</p>
            ) : (
              <p className="tabular-nums text-[var(--text-tertiary)]">{costoIa(costoIaUsd)}</p>
            )}
          </div>
          {/* Celular: los botones se reparten el ancho (uno solo = a lo ancho, sin hueco). */}
          <div className="flex gap-2 *:flex-1 sm:shrink-0 sm:*:flex-none">
            <button type="button" onClick={onDescartar} className={BOTON_SECUNDARIO}>
              Descartar
            </button>
            {extra}
            {accion && (
              <button
                type="button"
                onClick={accion.onClick}
                disabled={accion.deshabilitada || accion.ocupada}
                className={BOTON_PRIMARIO}
              >
                {accion.ocupada && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {accion.texto}
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className={`space-y-4 ${MODAL_BODY}`}>
        {children}
        {textoLeido && (
          <details className="rounded-lg border border-[var(--rule-soft)] px-3 py-2 text-sm">
            <summary className="cursor-pointer text-[var(--text-secondary)]">Texto leído</summary>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words font-sans text-xs text-[var(--text-secondary)]">{textoLeido}</pre>
          </details>
        )}
      </div>
    </AdminModal>
  );
}
