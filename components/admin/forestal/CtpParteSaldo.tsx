"use client";

/**
 * El saldo de una parte, arriba de su ficha (ADR-430). Sólo lectura.
 *
 * Pedido de Brandon (22-09): «hipervincular todo con la cuenta o saldo para una
 * contabilidad más detallada». La ficha dice cuánto debe esta parte, cuánto sus
 * vinculados —cada uno en su libreta, sin mezclarlas— y lleva a su cuenta.
 *
 * El saldo se dice con palabras: «Te debe S/ 700» se entiende; «saldo 700», no
 * siempre (mismo criterio que `CtpCuentaCorriente`).
 */

import { ArrowRight, Wallet } from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/format";
import type { SaldoConsolidado } from "@/lib/forestal/vinculos-parte";

/** Positivo = nos debe. Medio céntimo es «al día»: el redondeo no es deuda. */
export function textoSaldo(saldo: number): string {
  if (saldo > 0.005) return `Te debe ${formatCurrency(saldo)}`;
  if (saldo < -0.005) return `Le debes ${formatCurrency(-saldo)}`;
  return "Al día";
}

/** `-700` para lo que nos debe, `-500` en oscuro: el token base no pasa AA a 14 px (medido en Cuenta por persona). */
export function claseSaldo(saldo: number): string {
  if (saldo > 0.005) return "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]";
  if (saldo < -0.005) return "text-[var(--data-info-700)] dark:text-[var(--data-info-500)]";
  return "text-[var(--text-secondary)]";
}

export default function CtpParteSaldo({
  saldo,
  onVerCuenta,
}: {
  saldo: SaldoConsolidado | null;
  onVerCuenta: () => void;
}) {
  if (!saldo) return null;
  const { propio, vinculados, total } = saldo;
  const deVinculados = vinculados.reduce((s, v) => s + v.saldo, 0);
  const sinMovimientos = propio.cargos === 0 && propio.abonos === 0 && vinculados.length === 0;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2">
      <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
        <Wallet className="h-3.5 w-3.5" aria-hidden />
        Su cuenta
      </span>
      {sinMovimientos ? (
        <span className="text-sm text-[var(--text-secondary)]">Sin movimientos todavía</span>
      ) : (
        <>
          <span className={`text-sm font-bold tabular-nums ${claseSaldo(propio.saldo)}`}>
            {textoSaldo(propio.saldo)}
            {(propio.cargos !== 0 || propio.abonos !== 0) && (
              <span className="ml-1 font-normal text-[var(--text-tertiary)]">
                (cargos {formatCurrency(propio.cargos)} · abonos {formatCurrency(propio.abonos)})
              </span>
            )}
          </span>
          {vinculados.length > 0 && (
            <span className="text-sm tabular-nums text-[var(--text-secondary)]">
              {vinculados.length === 1 ? "Su vinculado" : `Sus ${vinculados.length} vinculados`}:{" "}
              <b className={`whitespace-nowrap ${claseSaldo(deVinculados)}`}>
                {textoSaldo(deVinculados)}
              </b>{" "}
              · <span className="whitespace-nowrap">juntos {formatCurrency(total)}</span>
            </span>
          )}
        </>
      )}
      <button
        type="button"
        onClick={onVerCuenta}
        title="Abre Adelantos → Cuenta por persona"
        className="ml-auto inline-flex h-9 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-[var(--accent-ink)] transition-colors hover:bg-[var(--surface-sunken)] dark:text-[var(--accent)]"
      >
        Ver su cuenta
        <ArrowRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
