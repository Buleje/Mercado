"use client";

/**
 * La meta de recuperación del mes.
 *
 * Sin una meta, la cobranza es una lista infinita sin cierre: no hay forma de
 * saber si el rato que se le dedicó esta semana alcanzó. Con una, la pantalla
 * pasa de lista a tablero.
 */

import { useState } from "react";
import { formatCurrency } from "@/lib/currency";
import { avanceDeMeta } from "@/lib/adelantos/gestion-cobranza";
import { Field, ModalActions, ModalShell, inputCls } from "../shared";

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
    <ModalShell
      title="Meta de recuperación"
      subtitle="Cuánto querés recuperar este mes"
      onClose={onClose}
      size="sm"
      footer={<ModalActions onClose={onClose} onSubmit={() => onGuardar(Number(valor) || 0)} saving={false} label="Guardar meta" />}
    >
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
      {/* Cuenta las ENTREGAS del mes, no los adelantos que cerraron: una entrega
          parcial también es plata que volvió, y esperar el cierre completo deja
          el tablero quieto por semanas. */}
      <p className="text-sm text-[var(--text-tertiary)]">
        Se cuenta todo lo entregado en el mes, incluso lo parcial.
      </p>
    </ModalShell>
  );
}
