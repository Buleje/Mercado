"use client";

/**
 * El camino, no sólo el total: la corrida de movimientos de la cuenta
 * forestal de una persona, con el saldo acumulado paso a paso —lo mismo que
 * se le muestra a la parte cuando discute el número (cuenta-corriente.ts).
 */

import { DataTable } from "@buleje/design-system";
import { ExternalLink } from "@buleje/design-system/icons";
import { corridaDeSaldos, CONCEPTO_LABEL, type MovimientoCuenta } from "@/lib/forestal/cuenta-corriente";
import { fmtMon } from "../shared";
import { formatDate } from "@/lib/format";

/** Fecha date-only (UTC): con la zona de Lima el día cambia antes de tiempo. */
const diaUtc = (iso: string) =>
  formatDate(iso, { soloFecha: true });

export default function DetalleMovimientos({
  movimientos,
  onGoTab,
}: {
  movimientos: MovimientoCuenta[];
  onGoTab: (tab: string) => void;
}) {
  const corrida = corridaDeSaldos(movimientos);
  return (
    <div className="mt-3 space-y-2 border-t border-[var(--rule-soft)] pt-3">
      {corrida.length === 0 ? (
        <p className="py-3 text-center text-sm text-[var(--text-tertiary)]">Sin movimientos en la cuenta forestal todavía.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
          {/* minWidth inline: min-w-* es clase muerta acá (memoria min-width-utilities-muertas). */}
          <DataTable className="w-full text-sm" style={{ minWidth: 480 }}>
            <thead className="bg-[var(--surface-sunken)] text-xs text-[var(--text-tertiary)]">
              <tr className="text-left">
                <th className="px-3 py-2 font-bold">Fecha</th>
                <th className="px-3 py-2 font-bold">Concepto</th>
                <th className="px-3 py-2 font-bold">Referencia</th>
                <th className="px-3 py-2 text-right font-bold">Monto</th>
                <th className="px-3 py-2 text-right font-bold">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--rule-soft)]">
              {corrida.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-[var(--text-secondary)]">{diaUtc(m.fecha)}</td>
                  <td className="px-3 py-2 text-[var(--text-primary)]">{CONCEPTO_LABEL[m.concepto] ?? m.concepto}</td>
                  <td className="px-3 py-2 text-[var(--text-tertiary)]">{m.referencia ?? "—"}</td>
                  <td
                    className={`whitespace-nowrap px-3 py-2 text-right font-bold tabular-nums ${
                      // -700/-500: mismo patrón AA que CtpCuentaCorriente.tsx (el token base no pasa).
                      m.tipo === "cargo"
                        ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                        : "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                    }`}
                  >
                    {m.tipo === "cargo" ? "+" : "−"}
                    {fmtMon(m.monto, m.moneda)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-bold tabular-nums text-[var(--text-primary)]">
                    {fmtMon(m.acumulado, m.moneda)}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      )}
      <button
        type="button"
        onClick={() => onGoTab("personas")}
        className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline"
      >
        Ver sus adelantos <ExternalLink className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
