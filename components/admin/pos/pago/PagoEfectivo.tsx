"use client";

import { cn } from "@/lib/utils";
import type { PagoModal } from "@/components/admin/pos/pago/usePagoModal";
import { montosSugeridos } from "@/components/admin/pos/pago/montos-sugeridos";
import PagoVuelto from "@/components/admin/pos/pago/PagoVuelto";

const BILLETES_SUMABLES = [200, 100, 50, 20, 10] as const;

const BOTON_MONTO =
  "h-12 min-w-0 rounded-xl border px-2 text-base font-bold tabular-nums transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/50";
const MONTO_ELEGIDO = "border-primary bg-[var(--accent-soft)] text-[var(--accent-ink)]";
const MONTO_LIBRE = "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:border-primary/50";

/**
 * Efectivo: «Recibido» grande, el vuelto al lado (debajo en celular, sin
 * scrollear), los montos que el cliente suele dar y los billetes que se suman.
 * Todo escribe con `updateAmount(0, …)` / `addBillete` de `usePagoModal`.
 */
export default function PagoEfectivo({ p }: { p: PagoModal }) {
  const { paymentLines, total, updateAmount, billetes, totalBilletes, addBillete, limpiarBilletes, vuelto, pendiente } = p;
  const recibido = paymentLines[0]?.amount ?? 0;
  const sugeridos = montosSugeridos(total);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
        <label className="block min-w-0">
          <span className="text-sm font-semibold text-[var(--text-secondary)]">Recibido</span>
          <span className="relative mt-1.5 block">
            <span aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl font-bold text-[var(--text-tertiary)]">
              S/
            </span>
            <input
              type="number"
              inputMode="decimal"
              step="0.10"
              value={recibido || ""}
              onChange={(e) => updateAmount(0, Number(e.target.value) || 0)}
              onFocus={(e) => e.currentTarget.select()}
              placeholder={total.toFixed(2)}
              aria-label="Monto recibido"
              data-pago-enter=""
              // eslint-disable-next-line jsx-a11y/no-autofocus -- lo recibido es lo primero que se tipea al abrir el cobro
              autoFocus
              className="h-16 w-full rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-12 pr-4 text-4xl font-extrabold tabular-nums text-[var(--text-primary)] outline-none transition-colors [appearance:textfield] focus:border-primary focus:ring-2 focus:ring-primary/30 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </span>
        </label>
        <PagoVuelto vuelto={vuelto} pendiente={pendiente} conVuelto className="lg:mt-6.5" />
      </div>

      <div className="grid grid-cols-4 gap-2" role="group" aria-label="Montos rápidos">
        <button
          type="button"
          onClick={() => updateAmount(0, total)}
          aria-pressed={recibido === total}
          className={cn(BOTON_MONTO, recibido === total ? MONTO_ELEGIDO : MONTO_LIBRE)}
        >
          Exacto
        </button>
        {sugeridos.map((monto) => (
          <button
            key={monto}
            type="button"
            onClick={() => updateAmount(0, monto)}
            aria-pressed={recibido === monto}
            className={cn(BOTON_MONTO, recibido === monto ? MONTO_ELEGIDO : MONTO_LIBRE)}
          >
            S/ {monto}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 basis-full text-sm font-semibold text-[var(--text-tertiary)] sm:basis-auto">Suma billetes</span>
        {BILLETES_SUMABLES.map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => addBillete(b)}
            aria-label={`Sumar un billete de ${b} soles`}
            className="h-10 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-2.5 text-sm font-semibold tabular-nums text-[var(--text-secondary)] transition-colors hover:border-primary/50 hover:text-[var(--text-primary)]"
          >
            +{b}
          </button>
        ))}
        {billetes.length > 0 && (
          <button
            type="button"
            onClick={limpiarBilletes}
            className="h-10 px-2 text-sm font-semibold text-[var(--data-error-ink)] hover:underline"
          >
            Limpiar
          </button>
        )}
      </div>
      {billetes.length > 0 && (
        <p className="text-sm text-[var(--text-tertiary)]">
          {billetes.map((b) => `S/${b}`).join(" + ")} = <span className="font-bold text-[var(--text-secondary)]">S/{totalBilletes}</span>
        </p>
      )}
    </div>
  );
}
