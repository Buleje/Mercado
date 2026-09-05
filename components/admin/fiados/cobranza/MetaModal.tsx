"use client";

/**
 * La meta de recuperación del mes — port de MetaModal.tsx (Adelantos).
 * Sin partir por moneda: Fiados es siempre soles.
 */

import { useState } from "react";
import { formatCurrency } from "@/lib/currency";
import { avanceDeMeta } from "@/lib/fiados/gestion-cobranza";
import AdminModal from "@/components/admin/shared/AdminModal";
import { Field } from "@/components/admin/shared/Field";
import { ModalActions, inputCls } from "./shared";

export default function MetaModal({
  meta,
  recuperado,
  onClose,
  onGuardar,
}: {
  meta: number;
  recuperado: number;
  onClose: () => void;
  onGuardar: (m: number) => void;
}) {
  const [valor, setValor] = useState(meta > 0 ? String(meta) : "");
  const avance = avanceDeMeta(Number(valor) || 0, recuperado);

  return (
    <AdminModal
      open
      onClose={onClose}
      title="Meta de recuperación"
      description="Cuánto querés recuperar este mes"
      footer={<ModalActions onClose={onClose} onSubmit={() => onGuardar(Number(valor) || 0)} saving={false} label="Guardar meta" />}
    >
      <div className="space-y-4 px-6 py-5">
        <Field label="Meta del mes (S/)" hint="Dejalo vacío para no medirte contra nada.">
          <input
            type="number"
            min={0}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="5000"
            autoFocus
            className={`${inputCls} tabular-nums text-lg`}
          />
        </Field>

        <div className="rounded-xl bg-[var(--surface-sunken)] p-4">
          <p className="text-sm font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Este mes ya entraron</p>
          <p className="mt-1 text-2xl font-extrabold tabular-nums text-[var(--data-success)]">{formatCurrency(recuperado)}</p>
          {avance.porcentaje != null && (
            <>
              <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface-raised)]">
                <div className="h-full rounded-full bg-[var(--data-success)]" style={{ width: `${avance.porcentaje}%` }} />
              </div>
              <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
                {avance.porcentaje}% de la meta ·{" "}
                {avance.falta > 0 ? `faltan ${formatCurrency(avance.falta)}` : "meta cumplida"}
              </p>
            </>
          )}
        </div>
        <p className="text-sm text-[var(--text-tertiary)]">
          Se cuenta todo lo pagado en el mes, incluso lo parcial.
        </p>
      </div>
    </AdminModal>
  );
}
