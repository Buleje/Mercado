"use client";

/**
 * «Nueva asignación»: elegir el repartidor (y, si quieres, el número de pedido)
 * y confirmar. Sacada de `tabs/AsignacionesTab.tsx` el 10-10, mismo
 * comportamiento; el guardado lo sigue haciendo la sección.
 */
import { AlertCircle, CheckCircle, ChevronDown, Plus } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { Field } from "@/components/admin/shared/Field";
import { toNum, type DeliveryPartner } from "@/components/admin/delivery-partners/shared";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface EstadoAsignar {
  open: boolean;
  orderId?: string;
}

export function AsignarPedidoModal({
  assignModal,
  setAssignModal,
  partners,
  selectedPartner,
  setSelectedPartner,
  assigning,
  handleAssign,
}: {
  assignModal: EstadoAsignar;
  setAssignModal: (v: EstadoAsignar) => void;
  partners: DeliveryPartner[];
  selectedPartner: string;
  setSelectedPartner: (v: string) => void;
  assigning: boolean;
  handleAssign: () => void;
}) {
  return (
    <AdminModal
      open={assignModal.open}
      onClose={() => setAssignModal({ open: false })}
      title="Nueva asignación"
      icon={Plus}
      variant="default"
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setAssignModal({ open: false })}
            className="flex-1 h-12 rounded-xl text-sm font-semibold text-[var(--text-primary)] bg-[var(--surface-sunken)] hover:brightness-95 border border-[var(--rule-base)] transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleAssign}
            disabled={assigning || !selectedPartner}
            className="flex-[2] inline-flex items-center justify-center gap-2 h-12 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            {assigning ? (
              <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4" />
            )}
            {assigning ? "Asignando..." : "Confirmar asignación"}
          </button>
        </div>
      }
    >
      <div className={cn(MODAL_BODY, "space-y-4")}>
        <Field className="space-y-2" label="ID de orden (opcional)" labelClassName="text-sm font-semibold text-[var(--text-secondary)]">
          <input
            type="text"
            value={assignModal.orderId ?? ""}
            onChange={(e) => setAssignModal({ ...assignModal, orderId: e.target.value })}
            placeholder="Ej: ORD-12345"
            className="w-full px-4 h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-medium text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
          />
        </Field>

        <Field className="space-y-2" label="Repartidor *" labelClassName="text-sm font-semibold text-[var(--text-secondary)]">
          {(id) => (
            <>
              <div className="relative">
                <select
                  id={id}
                  value={selectedPartner}
                  onChange={(e) => setSelectedPartner(e.target.value)}
                  className="w-full px-4 h-12 pr-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-medium text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary appearance-none transition-all"
                >
                  <option value="">Seleccionar repartidor...</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.zone} — {formatCurrency(toNum(p.fee))}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--text-tertiary)] pointer-events-none" />
              </div>
              {partners.length === 0 && (
                <p className="text-sm text-[var(--data-warning-500)] font-bold flex items-center gap-1.5 mt-2">
                  <AlertCircle className="h-4 w-4" />
                  No hay repartidores: agrega uno en Reparto › Equipo.
                </p>
              )}
            </>
          )}
        </Field>
      </div>
    </AdminModal>
  );
}
