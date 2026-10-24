"use client";

import { useState } from "react";
import { Link2 } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { Field } from "@/components/admin/shared/Field";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { descripcionALaVista } from "@/lib/compras/referencia-documento";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CAMPO, ROTULO, rotuloDeOrden } from "./OrigenCuentaCampos";
import type { CuentaPorPagar } from "./resumen-cuentas";
import type { ResultadoAccion } from "./use-cuentas-por-pagar";
import { useOrdenesSinCuenta } from "./use-origenes-proveedor";

/**
 * Concilia una cuenta cargada a mano con la orden de compra que apareció
 * después (C41). No cambia el monto: desde ahí, un faltante al recibir esa
 * orden baja ESTA cuenta en vez de quedar suelto.
 */
export default function VincularOrdenModal({ cuenta, saving, onVincular, onCerrar }: {
  cuenta: CuentaPorPagar;
  saving: boolean;
  onVincular: (id: string, purchaseOrderId: string) => Promise<ResultadoAccion>;
  onCerrar: () => void;
}) {
  const { ordenes, cargando, error } = useOrdenesSinCuenta(cuenta.supplierId, true);
  const [ordenId, setOrdenId] = useState("");
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const elegida = ordenes.find((o) => o.id === ordenId);
  const distinto = elegida && Math.abs(elegida.total - cuenta.amount) > 0.004;

  const vincular = async () => {
    if (!ordenId) return;
    setErrorServidor(null);
    const r = await onVincular(cuenta.id, ordenId);
    if (r.ok) onCerrar();
    else setErrorServidor(r.error);
  };

  return (
    <AdminModal
      open
      onClose={onCerrar}
      title="Vincular a su orden de compra"
      icon={Link2}
      size="md"
      claveVentana="cuentas-por-pagar-vincular"
      footer={
        <ModalFooter>
          <button type="button" onClick={onCerrar} className={button({ variant: "secondary" })}>Cancelar</button>
          <button type="button" onClick={() => void vincular()} disabled={!ordenId || saving} className={button({ variant: "primary" })}>
            {saving ? "Guardando…" : "Vincular"}
          </button>
        </ModalFooter>
      }
    >
      <div className={`space-y-4 ${MODAL_BODY}`}>
        <p className="text-sm text-[var(--text-secondary)]">
          <strong className="text-[var(--text-primary)]">{cuenta.supplierName}</strong> · {descripcionALaVista(cuenta.description) || "Sin detalle"} · {formatCurrency(cuenta.amount)}
        </p>
        <Field
          label="Orden de compra"
          labelClassName={ROTULO}
          hint={cargando ? "Trayendo sus órdenes…" : error ?? (ordenes.length === 0 ? "Este proveedor no tiene órdenes sin cuenta." : undefined)}
        >
          <select value={ordenId} onChange={(e) => setOrdenId(e.target.value)} disabled={cargando || ordenes.length === 0} className={cn(CAMPO, "disabled:opacity-60")}>
            <option value="">Elige la orden</option>
            {ordenes.map((o) => <option key={o.id} value={o.id}>{rotuloDeOrden(o)}</option>)}
          </select>
        </Field>
        {distinto && (
          <p role="status" className="rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] px-4 py-3 text-sm font-semibold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]">
            La orden es de {formatCurrency(elegida.total)} y la cuenta de {formatCurrency(cuenta.amount)}: el monto de la cuenta no cambia.
          </p>
        )}
        {errorServidor && (
          <p role="alert" className="rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] px-4 py-3 text-sm font-semibold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]">
            {errorServidor}
          </p>
        )}
      </div>
    </AdminModal>
  );
}
