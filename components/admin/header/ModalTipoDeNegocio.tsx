"use client";

/**
 * Ventana «Tipo de negocio». Se abría con la pastilla del rubro arriba de la
 * barra lateral; desde el 23-10 esa marca vive en el encabezado y la ventana
 * se abre desde la tarjeta del negocio (`AdminUserDropdown`). Sólo dueño/admin.
 */

import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";

interface Props {
  open: boolean;
  onClose: () => void;
  rubro: string;
  detalle: string;
}

export function ModalTipoDeNegocio({ open, onClose, rubro, detalle }: Props) {
  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title="Tipo de negocio"
      description="El tipo de negocio decide qué módulos aparecen en tu panel."
      variant="centered-sm"
    >
      <div className={MODAL_BODY}>
        <div className="mb-4 flex items-center gap-3 rounded-xl bg-primary/5 p-3 ring-1 ring-primary/15">
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">{rubro}</p>
            <p className="text-xs text-[var(--text-secondary)]">{detalle}</p>
          </div>
        </div>
        <EnlacePanel
          apariencia="heredada"
          href="/admin?tab=config&vista=negocio"
          onClick={onClose}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:no-underline hover:opacity-90"
        >
          Cambiar tipo de negocio
        </EnlacePanel>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full py-1.5 text-center text-sm text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
        >
          Cancelar
        </button>
      </div>
    </AdminModal>
  );
}
