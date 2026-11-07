"use client";

/** «Por cobrar» de Cuentas: quién debe, cuántos adelantos abiertos y el saldo de hoy. */
import { DataTable } from "@buleje/design-system";
import { ArrowRight } from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/format";
import { button } from "@/components/ui-system/button-variants";
import type { CuentasDelPeriodo } from "@/lib/finance/cuentas-tipos";

export function PorCobrarDeCuentas({ porCobrar, onIr }: { porCobrar: CuentasDelPeriodo["porCobrar"]; onIr: (id: string) => void }) {
  const { deudores, total } = porCobrar;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-[var(--text-secondary)]">
          Saldo de hoy: <span className="font-extrabold tabular-nums text-[var(--text-primary)]">{formatCurrency(total)}</span>
        </p>
        <button type="button" onClick={() => onIr("adelantos")} className={button({ variant: "secondary", className: "h-12 gap-2 rounded-xl px-4" })}>
          Ir a Adelantos<ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {deudores.length === 0 ? (
        <p className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3 text-sm font-semibold text-[var(--text-primary)]">
          Nadie te debe adelantos hoy.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl">
          <DataTable>
            <thead>
              <tr>
                <th>Persona</th>
                <th className="text-right">Adelantos abiertos</th>
                <th className="text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {deudores.map((d) => (
                <tr key={d.persona}>
                  <td className="font-semibold">{d.persona || "—"}</td>
                  <td className="text-right tabular-nums">{d.adelantos}</td>
                  <td className="whitespace-nowrap text-right font-extrabold tabular-nums">{formatCurrency(d.saldo)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="font-bold">Total</td>
                <td />
                <td className="whitespace-nowrap text-right font-extrabold tabular-nums">{formatCurrency(total)}</td>
              </tr>
            </tfoot>
          </DataTable>
        </div>
      )}
    </div>
  );
}
