'use client';

import { useId } from 'react';
import { InfoTip } from '@/components/superadmin/_shared/InfoTip';
import { inputCls } from './proveedor-form-datos';

/**
 * «Días de entrega» del proveedor (`Supplier.leadTimeDias`). Sugerencias de
 * compra ya lo leía («el declarado gana», `compras-sugerencias.db.ts`) pero el
 * formulario no lo pedía: el campo estaba siempre vacío. El ⓘ va AL LADO del
 * rótulo, nunca adentro.
 */
export default function CampoDiasEntrega({ valor, onCambio }: { valor: string; onCambio: (v: string) => void }) {
  const id = useId();
  return (
    <div>
      <div className="mb-1 flex h-4 items-center gap-1.5">
        <label htmlFor={id} className="text-xs font-semibold text-[var(--text-secondary)]">Días de entrega</label>
        <InfoTip
          title="Días de entrega"
          what="Cuántos días pasan desde que le pides hasta que la mercadería llega a tu tienda."
          affects="Sugerencias de compra lo usa para avisarte a tiempo: si tarda 5 días, te pide reponer cuando te quedan más de 5 días de venta. Vacío = se usa lo que tardaron de verdad sus órdenes."
          example="Distribuidora de Lima que llega por carretera a Pucallpa: 4 días."
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          max={365}
          step={1}
          value={valor}
          onChange={(e) => onCambio(e.target.value)}
          placeholder="Ej. 3"
          className={`${inputCls} w-28 tabular-nums`}
        />
        <span className="text-sm text-[var(--text-secondary)]">días</span>
      </div>
    </div>
  );
}
