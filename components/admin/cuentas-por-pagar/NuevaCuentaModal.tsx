"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { CreditCard } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { Field } from "@/components/admin/shared/Field";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { limaDateKey } from "@/lib/utils";
import { venceConCredito } from "./resumen-cuentas";
import type { NuevaCuenta, ProveedorBasico } from "./use-cuentas-por-pagar";

const ROTULO = "mb-1 block text-sm font-semibold text-[var(--text-secondary)]";
const CAMPO =
  "h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";
const VACIA: NuevaCuenta = { supplierId: "", description: "", amount: "", dueDate: "" };

/** Alta a mano de una cuenta por pagar (las de una OC a crédito nacen solas). */
export default function NuevaCuentaModal({
  proveedores,
  saving,
  onCrear,
  onCerrar,
}: {
  proveedores: ProveedorBasico[];
  saving: boolean;
  onCrear: (f: NuevaCuenta) => Promise<boolean>;
  onCerrar: () => void;
}) {
  const [f, setF] = useState<NuevaCuenta>(VACIA);
  const formId = useId();
  const hoy = limaDateKey();
  const sugerencia = (id: string) =>
    venceConCredito(hoy, proveedores.find((p) => p.id === id)?.diasCredito);
  // La línea sólo acompaña a la fecha sugerida: si la cambias a mano, se va.
  const sugerida = f.supplierId ? sugerencia(f.supplierId) : null;

  // Última fecha que puso el sistema: si «Vence» es otra, la escribiste tú y no se pisa.
  const autoRef = useRef("");

  /** Elegir proveedor llena «Vence» con sus días de crédito, salvo que ya la hayas escrito tú. */
  const elegirProveedor = (id: string) => {
    const aMano = f.dueDate !== "" && f.dueDate !== autoRef.current;
    const dueDate = id && !aMano ? sugerencia(id).fecha : f.dueDate;
    if (id && !aMano) autoRef.current = dueDate;
    setF((x) => ({ ...x, supplierId: id, dueDate }));
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.supplierId || !f.amount) return;
    if (await onCrear(f)) onCerrar();
  };

  return (
    <AdminModal
      open
      onClose={onCerrar}
      title="Nueva cuenta por pagar"
      icon={CreditCard}
      size="lg"
      claveVentana="cuentas-por-pagar-nueva"
      footer={
        <ModalFooter>
          <button type="button" onClick={onCerrar} className={button({ variant: "secondary" })}>
            Cancelar
          </button>
          <button
            type="submit"
            form={formId}
            disabled={saving}
            className={button({ variant: "primary" })}
          >
            {saving ? "Guardando…" : "Crear cuenta"}
          </button>
        </ModalFooter>
      }
    >
      <form id={formId} onSubmit={enviar} className={`space-y-4 ${MODAL_BODY}`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Proveedor *" labelClassName={ROTULO}>
            <select
              required
              value={f.supplierId}
              onChange={(e) => elegirProveedor(e.target.value)}
              className={CAMPO}
            >
              <option value="">Elige el proveedor</option>
              {proveedores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Monto (S/) *" labelClassName={ROTULO}>
            <input
              required
              type="number"
              step="0.01"
              min="0.01"
              inputMode="decimal"
              value={f.amount}
              onChange={(e) => setF((x) => ({ ...x, amount: e.target.value }))}
              placeholder="0.00"
              className={CAMPO}
            />
          </Field>
          <Field label="Qué es" labelClassName={ROTULO}>
            <input
              value={f.description}
              onChange={(e) => setF((x) => ({ ...x, description: e.target.value }))}
              placeholder="Factura F001-123…"
              className={CAMPO}
            />
          </Field>
          <Field
            label="Vence el"
            labelClassName={ROTULO}
            hint={sugerida && f.dueDate === sugerida.fecha ? sugerida.linea : undefined}
          >
            <input
              type="date"
              value={f.dueDate}
              onChange={(e) => setF((x) => ({ ...x, dueDate: e.target.value }))}
              className={CAMPO}
            />
          </Field>
        </div>
      </form>
    </AdminModal>
  );
}
