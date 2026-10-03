"use client";

/**
 * El marco de los modales de la barra de lotes elegidos («Salió sin guía»,
 * «Volver a disponibles», «Cerrar lotes»).
 *
 * En portal, como `AdminModal`: dentro del panel, `.admin-mobile-cards`
 * convertía a tarjetas las tablitas de un modal a 400 px. Fuera del panel hay
 * que traer los tokens de la tienda (`usePanelTokens`), y el teclado lo maneja
 * `useModalAccesible`: Tab no se escapa a la pantalla de atrás, Escape cierra
 * y el foco vuelve al botón que lo abrió.
 */

import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "@buleje/design-system/icons";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { usePanelTokens } from "@/components/admin/shared/use-panel-tokens";

export function MarcoModalLotes({
  titulo,
  icono,
  ayuda,
  onClose,
  ocupado,
  pie,
  children,
}: {
  titulo: string;
  icono: ReactNode;
  /** El ⓘ del título. */
  ayuda?: ReactNode;
  onClose: () => void;
  /** Mientras escribe en el libro no se cierra (ni Escape ni clic afuera). */
  ocupado?: boolean;
  pie: ReactNode;
  children: ReactNode;
}) {
  const cajaRef = useRef<HTMLDivElement>(null);
  const tokens = usePanelTokens(true);
  useModalAccesible(cajaRef, { onCerrar: ocupado ? undefined : onClose });

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      style={tokens}
      role="presentation"
      className="modal-backdrop fixed inset-0 z-modal-2 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !ocupado) onClose();
      }}
    >
      <div
        ref={cajaRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="flex max-h-[92vh] w-full max-w-[36rem] flex-col overflow-hidden rounded-t-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[var(--shadow-xl)] sm:rounded-2xl"
      >
        <header className="flex items-center justify-between gap-3 border-b-2 border-[var(--rule-base)] px-4 py-3 sm:px-5">
          <p className="flex min-w-0 items-center gap-2 text-base font-bold">
            {icono}
            <span className="min-w-0">{titulo}</span>
            {ayuda}
          </p>
          <button
            type="button"
            onClick={onClose}
            disabled={ocupado}
            aria-label="Cerrar"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
        <footer className="flex flex-wrap items-center justify-end gap-2 border-t-2 border-[var(--rule-soft)] px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:px-5">
          {pie}
        </footer>
      </div>
    </div>,
    document.body,
  );
}

/* Botones propios y no `Btn`: `Btn` ya trae `h-11 text-sm` y una clase extra
   no le gana con seguridad (en Tailwind 4 decide el orden de la hoja, no el
   del atributo). Mismos colores que `Btn`, con el alto y la letra de la regla. */
const BOTON =
  "inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-base font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40";
export const BOTON_PRIMARIO = `${BOTON} bg-[var(--accent-dark)] text-white shadow-sm hover:brightness-110`;
export const BOTON_SECUNDARIO = `${BOTON} border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]`;

/** El campo del motivo, igual en los tres modales. */
export function CampoMotivo({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-bold">
        Motivo, queda en el libro <span className="font-normal text-[var(--text-secondary)]">(obligatorio)</span>
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        maxLength={300}
        disabled={disabled}
        placeholder={placeholder}
        className="min-h-[3.5rem] w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-base text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]"
      />
    </label>
  );
}
