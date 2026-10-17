"use client";

import { efectoDeLaCondicion, FORMAS_DE_PAGO, generaCuentaPorPagar } from "@/lib/compras/estados-oc";
import type { PaymentMethod } from "@/lib/types/purchases";

interface Props {
  value: PaymentMethod;
  onChange: (v: PaymentMethod) => void;
  disabled?: boolean;
}

const AL_CONTADO = FORMAS_DE_PAGO.filter((f) => !generaCuentaPorPagar(f.id));
const A_CREDITO = FORMAS_DE_PAGO.filter((f) => generaCuentaPorPagar(f.id));

/**
 * Condición de pago de la orden (auditoría Compras O05/C05). Antes era «Método
 * de pago» con contado, crédito y transferencia mezclados: ahora se agrupan por
 * lo que hacen (crear o no una deuda) y debajo se lee el efecto. El medio con
 * el que pagas se elige al pagar la cuenta en Por pagar.
 */
export default function CompraCondicionPago({ value, onChange, disabled }: Props) {
  return (
    <div>
      <label htmlFor="poc-condicion" className="block text-xs text-[var(--text-secondary)] mb-1">
        Condición de pago
      </label>
      <select
        id="poc-condicion"
        value={value}
        onChange={(e) => onChange(e.target.value as PaymentMethod)}
        disabled={disabled}
        aria-describedby="poc-condicion-efecto"
        className="w-full px-3 py-1.5 border border-[var(--rule-base)] rounded-xl text-sm bg-[var(--surface-raised)] text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
      >
        <optgroup label="Al contado: no crea deuda">
          {AL_CONTADO.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </optgroup>
        <optgroup label="A crédito: crea una cuenta en Por pagar">
          {A_CREDITO.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </optgroup>
      </select>
      <p id="poc-condicion-efecto" className="mt-1 text-xs text-[var(--text-secondary)]">
        {efectoDeLaCondicion(value)}
      </p>
    </div>
  );
}
