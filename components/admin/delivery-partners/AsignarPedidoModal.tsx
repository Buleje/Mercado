"use client";

/**
 * «Asignar pedido»: elegir el pedido y el repartidor, y confirmar. Sacada de
 * `tabs/AsignacionesTab.tsx` el 10-10; el guardado lo sigue haciendo la sección.
 *
 * 17-10 (P25/M47): el pedido se elige de la lista de los que esperan
 * repartidor (antes: escribir el «ID de orden» a mano). El error del servidor
 * sale acá adentro, no detrás de la ventana.
 */
import { AlertCircle, CheckCircle, ChevronDown, Plus } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { Field } from "@/components/admin/shared/Field";
import { button } from "@/components/ui-system/button-variants";
import { toNum, type DeliveryPartner } from "@/components/admin/delivery-partners/shared";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PedidoPorRepartir } from "./use-pedidos-por-repartir";

export interface EstadoAsignar {
  open: boolean;
  orderId?: string;
}

const ESTADO_PEDIDO: Record<PedidoPorRepartir["estado"], string> = {
  confirmado: "confirmado",
  preparando: "preparando",
  en_camino: "salió sin repartidor",
};

const ROTULO = "text-sm font-semibold text-[var(--text-secondary)]";
const SELECT =
  "w-full px-4 h-12 pr-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-medium text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary appearance-none transition-all";

export function AsignarPedidoModal({
  assignModal,
  setAssignModal,
  partners,
  pedidos,
  selectedPartner,
  setSelectedPartner,
  assigning,
  error,
  handleAssign,
}: {
  assignModal: EstadoAsignar;
  setAssignModal: (v: EstadoAsignar) => void;
  partners: DeliveryPartner[];
  pedidos: PedidoPorRepartir[];
  selectedPartner: string;
  setSelectedPartner: (v: string) => void;
  assigning: boolean;
  error: string | null;
  handleAssign: () => void;
}) {
  const cerrar = () => setAssignModal({ open: false });
  return (
    <AdminModal
      open={assignModal.open}
      onClose={cerrar}
      title="Asignar pedido"
      icon={Plus}
      variant="default"
      footer={
        <ModalFooter>
          <button type="button" onClick={cerrar} className={button({ variant: "secondary" })}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleAssign}
            disabled={assigning || !selectedPartner || !assignModal.orderId}
            className={button({ variant: "primary" })}
          >
            {assigning ? (
              <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4" />
            )}
            {assigning ? "Asignando..." : "Asignar"}
          </button>
        </ModalFooter>
      }
    >
      <div className={cn(MODAL_BODY, "space-y-4")}>
        {error && (
          <div role="alert" className="flex items-center gap-2 p-3 bg-[var(--data-error-50)] border border-[var(--data-error-500)] rounded-xl text-sm text-[var(--data-error-ink)]">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden /> {error}
          </div>
        )}

        <Field className="space-y-2" label="Pedido" required labelClassName={ROTULO}>
          {(id) => (
            <>
              <div className="relative">
                <select
                  id={id}
                  value={assignModal.orderId ?? ""}
                  onChange={(e) => setAssignModal({ ...assignModal, orderId: e.target.value || undefined })}
                  className={SELECT}
                  data-qa="asignar-pedido-select"
                >
                  <option value="">Elige el pedido…</option>
                  {pedidos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.codigo} · {p.cliente} · {formatCurrency(p.total)} · {ESTADO_PEDIDO[p.estado]}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--text-tertiary)] pointer-events-none" />
              </div>
              {pedidos.length === 0 && (
                <p className="text-sm text-[var(--data-warning-ink)] font-bold flex items-center gap-1.5 mt-2">
                  <AlertCircle className="h-4 w-4" aria-hidden />
                  No hay pedidos esperando repartidor: confírmalos en el Tablero.
                </p>
              )}
            </>
          )}
        </Field>

        <Field className="space-y-2" label="Repartidor" required labelClassName={ROTULO}>
          {(id) => (
            <>
              <div className="relative">
                <select
                  id={id}
                  value={selectedPartner}
                  onChange={(e) => setSelectedPartner(e.target.value)}
                  className={SELECT}
                  data-qa="asignar-repartidor-select"
                >
                  <option value="">Elige el repartidor…</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.zone} · le pagas {formatCurrency(toNum(p.fee))}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--text-tertiary)] pointer-events-none" />
              </div>
              {partners.length === 0 && (
                <p className="text-sm text-[var(--data-warning-ink)] font-bold flex items-center gap-1.5 mt-2">
                  <AlertCircle className="h-4 w-4" aria-hidden />
                  No hay repartidores que reciban pedidos: agrégalos en Equipo.
                </p>
              )}
            </>
          )}
        </Field>
      </div>
    </AdminModal>
  );
}
