"use client";

/**
 * El marco de los modales de la barra de lotes elegidos («Salió sin guía»,
 * «Volver a disponibles», «Cerrar lotes»).
 *
 * Es un `AdminModal` (2026-10-11, «un solo estilo de ventana»): portal, tokens
 * del panel, Escape y clic afuera, foco atrapado y devuelto, mover/fijar. Va
 * con `aboveModals` porque se abre desde el cubicador, que vive dentro de
 * «Producir sin lote». El ícono que pasa quien llama va al chip del título.
 */

import { isValidElement, type ReactNode } from "react";
import type { LucideIcon } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";

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
  return (
    <AdminModal
      open
      onClose={() => {
        if (!ocupado) onClose();
      }}
      title={titulo}
      icon={isValidElement(icono) ? (icono.type as LucideIcon) : undefined}
      ayuda={ayuda}
      size="lg"
      aboveModals
      claveVentana="ctp-lotes-marco"
      footer={<ModalFooter>{pie}</ModalFooter>}
    >
      <div className="space-y-4 px-5 py-5 sm:px-6">{children}</div>
    </AdminModal>
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
