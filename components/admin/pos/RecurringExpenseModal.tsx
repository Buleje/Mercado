"use client";

/**
 * Modal "Nuevo gasto recurrente" — versión completa.
 *
 * Reemplaza al modal inline de PuntoCompraView (3 campos) por uno con:
 *  - Categoría (con soporte para crear custom)
 *  - Descripción
 *  - Monto
 *  - Frecuencia (mensual/quincenal/semanal/anual/único)
 *  - Día de pago (1-31 o día de semana según frecuencia)
 *  - Método de pago
 *  - Proveedor opcional (texto libre)
 *  - Notas internas
 *  - Color e ícono visual (para distinguir cards en el catálogo)
 *
 * La metadata extra se serializa dentro de `description` (ver lib/expense-meta.ts)
 * para no requerir migración de schema.
 */

import { Check, Loader2 } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { getCategoryIcon } from "@/lib/expense-icons";
import { useGastoRecurrente } from "@/components/admin/gastos/recurrente/use-gasto-recurrente";
import CategoriaRecurrente from "@/components/admin/gastos/recurrente/CategoriaRecurrente";
import DatosRecurrente from "@/components/admin/gastos/recurrente/DatosRecurrente";
import PagoRecurrente from "@/components/admin/gastos/recurrente/PagoRecurrente";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  tenantSlug: string; // para localStorage de categorías custom
  defaultCategory?: string;
};

export default function RecurringExpenseModal({
  open,
  onClose,
  onCreated,
  tenantSlug,
  defaultCategory,
}: Props) {
  const r = useGastoRecurrente({ open, onClose, onCreated, tenantSlug, defaultCategory });
  const { selectedCategory, submitting, error, handleSubmit } = r;

  const SelectedIcon = getCategoryIcon(selectedCategory.iconKey);

  /* Mientras guarda no se cierra (ni con la X, ni Escape, ni afuera). */
  const cerrar = () => {
    if (!submitting) onClose();
  };

  return (
    <AdminModal
      open={open}
      onClose={cerrar}
      title="Nuevo gasto recurrente"
      description="Un pago fijo (alquiler, internet…) que registras en un toque cuando llega la fecha."
      icon={SelectedIcon}
      size="lg"
      claveVentana="pos-gasto-recurrente"
      footer={
        <ModalFooter error={error}>
          <button
            type="button"
            onClick={cerrar}
            disabled={submitting}
            className={button({ variant: "secondary" })}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className={button({ variant: "primary", className: "gap-2" })}
          >
            {submitting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Check className="h-5 w-5" />
            )}
            Guardar gasto recurrente
          </button>
        </ModalFooter>
      }
    >
      <div className={`space-y-6 ${MODAL_BODY}`}>
        <CategoriaRecurrente r={r} />

        <DatosRecurrente r={r} />

        <PagoRecurrente r={r} />
      </div>
    </AdminModal>
  );
}
