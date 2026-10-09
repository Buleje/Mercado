"use client";

import { useState, type FormEvent } from "react";
import { Check } from "@buleje/design-system/icons";
import { Field } from "@/components/admin/shared/Field";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { formatCurrency } from "@/lib/format";
import type { MetodoPago, PagoCuenta, ResultadoPago } from "./use-cuentas-por-pagar";

export const METODOS: Record<MetodoPago, string> = {
  efectivo: "Efectivo", yape: "Yape", plin: "Plin", transferencia: "Transferencia",
};

const CAMPO = "h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";
const ROTULO = "mb-1 block text-xs font-semibold text-[var(--text-secondary)]";

/**
 * Pagar (todo o una parte de) una cuenta. Con efectivo ofrece «Sale de la caja»:
 * el servidor registra el egreso en la caja abierta en la misma operación
 * (contrato «sale de la caja»). La elección se recuerda: quien paga siempre de
 * la caja no tiene que marcarla cada vez.
 */
export default function PagarCuentaForm({ saldo, proveedor, saving, onPagar, onCancelar, onAviso }: {
  saldo: number;
  proveedor: string;
  saving: boolean;
  onPagar: (p: PagoCuenta) => Promise<ResultadoPago>;
  onCancelar: () => void;
  onAviso: (texto: string, tono: "ok" | "aviso") => void;
}) {
  const [salidaDeCaja, setSalidaDeCaja] = useLocalStorage<boolean>("compras:por-pagar:sale-de-caja", false);
  const [f, setF] = useState({ amount: saldo.toFixed(2), method: "efectivo" as MetodoPago, reference: "" });
  const efectivo = f.method === "efectivo";

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const monto = Number(f.amount);
    if (!(monto > 0)) return;
    const pedirCaja = efectivo && salidaDeCaja;
    const r = await onPagar({ ...f, salidaDeCaja: pedirCaja });
    if (!r.ok) return;
    if (pedirCaja && r.caja?.sinCaja) {
      onAviso(`Pago de ${formatCurrency(monto)} registrado, pero no había caja abierta: no salió de ninguna caja.`, "aviso");
    } else if (pedirCaja && r.caja) {
      onAviso(`Pagaste ${formatCurrency(monto)} a ${proveedor}; salió de la caja abierta.`, "ok");
    } else {
      onAviso(`Pagaste ${formatCurrency(monto)} a ${proveedor}.`, "ok");
    }
  };

  return (
    <form onSubmit={enviar} className="flex flex-wrap items-end gap-3 border-t border-[var(--rule-soft)] bg-[var(--accent-soft)] px-3 py-3 sm:px-4">
      <Field label="Monto (S/)" labelClassName={ROTULO}>
        <input
          required type="number" step="0.01" min="0.01" max={saldo} inputMode="decimal"
          value={f.amount}
          onChange={(e) => setF((x) => ({ ...x, amount: e.target.value }))}
          className={`${CAMPO} w-32 tabular-nums`}
        />
      </Field>
      <Field label="Cómo pagas" labelClassName={ROTULO}>
        <select value={f.method} onChange={(e) => setF((x) => ({ ...x, method: e.target.value as MetodoPago }))} className={CAMPO}>
          {(Object.keys(METODOS) as MetodoPago[]).map((m) => <option key={m} value={m}>{METODOS[m]}</option>)}
        </select>
      </Field>
      <Field label="Nº de operación o recibo" labelClassName={ROTULO}>
        <input
          value={f.reference}
          onChange={(e) => setF((x) => ({ ...x, reference: e.target.value }))}
          placeholder="Opcional"
          className={`${CAMPO} w-40`}
        />
      </Field>
      {efectivo && (
        <div className="flex h-10 items-center gap-1.5">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <input
              type="checkbox"
              checked={salidaDeCaja}
              onChange={(e) => setSalidaDeCaja(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            Sale de la caja
          </label>
          <InfoTip
            title="Sale de la caja"
            what="El efectivo con que pagas sale de la caja abierta: queda como egreso «Pago a proveedor» y el cuadre de la caja lo descuenta."
            affects="Si no hay caja abierta el pago se registra igual y te avisamos que no salió de ninguna caja. Déjala sin marcar si pagas con plata que no está en la caja."
            example={`Pagas S/ 120 a ${proveedor || "Distribuidora Ucayali"} con lo de la gaveta: la caja espera S/ 120 menos al cerrar.`}
          />
        </div>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold text-white transition-colors hover:bg-primary/90 disabled:opacity-60">
          <Check className="h-4 w-4" aria-hidden /> {saving ? "Registrando…" : "Registrar pago"}
        </button>
        <button type="button" onClick={onCancelar} className="h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)]">
          Cancelar
        </button>
      </div>
    </form>
  );
}
