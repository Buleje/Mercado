"use client";

/**
 * «¿Eliminar repartidor?» (sacada de `PartnerModal.tsx` el 17-10).
 *
 * Si el servidor se niega porque tiene entregas o retiros, la ventana no se
 * cierra: dice por qué y ofrece desactivarlo (deja de recibir pedidos y su
 * historial y su saldo quedan).
 */
import { AlertCircle } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";

export function ConfirmarBorrarRepartidor({
  nombre,
  borrando,
  aviso,
  onCancelar,
  onConfirmar,
  onPausar,
}: {
  nombre?: string;
  borrando: boolean;
  aviso: { mensaje: string; pausar: boolean } | null;
  onCancelar: () => void;
  onConfirmar: () => void;
  onPausar: () => void;
}) {
  const ofrecePausar = Boolean(aviso?.pausar);
  return (
    <AdminModal
      open
      onClose={onCancelar}
      title={ofrecePausar ? "No se puede eliminar" : `¿Eliminar a ${nombre ?? "este repartidor"}?`}
      icon={AlertCircle}
      size="sm"
      footer={
        <ModalFooter>
          <button type="button" onClick={onCancelar} className={button({ variant: "secondary" })}>
            Cancelar
          </button>
          {ofrecePausar ? (
            <button type="button" onClick={onPausar} disabled={borrando} className={button({ variant: "primary" })}>
              {borrando ? "Desactivando…" : "Desactivarlo"}
            </button>
          ) : (
            <button type="button" onClick={onConfirmar} disabled={borrando} className={button({ variant: "danger" })}>
              {borrando ? "Eliminando…" : "Sí, eliminar"}
            </button>
          )}
        </ModalFooter>
      }
    >
      <div className={`space-y-2 text-sm ${MODAL_BODY}`}>
        {aviso ? (
          <p role="alert" className={ofrecePausar ? "text-[var(--text-primary)]" : "font-semibold text-[var(--data-error-ink)]"}>
            {aviso.mensaje}
          </p>
        ) : (
          <p className="text-[var(--text-secondary)]">
            Esta acción no se puede deshacer. Si ya hizo entregas, mejor desactívalo.
          </p>
        )}
      </div>
    </AdminModal>
  );
}
