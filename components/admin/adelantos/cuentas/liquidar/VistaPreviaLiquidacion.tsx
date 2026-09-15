"use client";

/**
 * La vista previa de TODOS los movimientos que se van a escribir, con los
 * saldos antes y después (ADR-413 §UI paso 5) — antes de poder confirmar.
 *
 * `admin-mobile-cards`: la tabla se convierte sola en tarjetas a 400px vía el
 * hook global del shell admin (`useMobileTableCards`), sin código propio acá.
 */

import { AlertTriangle } from "@buleje/design-system/icons";
import { leerNeto } from "@/lib/adelantos/cuenta-unificada";
import type { ResultadoPlan } from "@/lib/cuentas/liquidacion";
import { fmtMon } from "../../shared";

export default function VistaPreviaLiquidacion({
  plan,
  nombre,
  vinculoFaltante,
  maderaAFavorSuyo,
}: {
  plan: ResultadoPlan | null;
  nombre: string;
  /** Sin vínculo explícito, la cuenta forestal no entró a esta liquidación. */
  vinculoFaltante: boolean;
  /** El real (de la cabecera), para avisar cuánto queda aparte. */
  maderaAFavorSuyo: number;
}) {
  const notaMaderaAparte =
    vinculoFaltante && maderaAFavorSuyo > 0.005 ? (
      <p className="rounded-xl bg-[var(--data-warning-700)]/10 px-3 py-2 text-sm font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
        La cuenta forestal ({fmtMon(maderaAFavorSuyo)} a favor suyo) queda aparte: todavía no se cruza sin confirmar el vínculo.
      </p>
    ) : null;

  if (!plan) {
    return (
      <div className="space-y-3">
        <p className="rounded-2xl border border-dashed border-[var(--rule-base)] p-4 text-center text-sm text-[var(--text-tertiary)]">
          Elige qué hacer para ver la vista previa.
        </p>
        {notaMaderaAparte}
      </div>
    );
  }

  if (!plan.ok) {
    return (
      <div className="space-y-3">
        <div className="space-y-1 rounded-2xl border border-[var(--data-error-700)]/30 bg-[var(--data-error-700)]/10 p-4">
          {plan.errores.map((e, i) => (
            <p key={i} className="flex items-start gap-1.5 text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {e}
            </p>
          ))}
        </div>
        {notaMaderaAparte}
      </div>
    );
  }

  const { plan: p } = plan;
  const filas = [
    ...p.entregas.map((e) => ({ libreta: "Adelantos" as const, concepto: e.descripcion, referencia: e.codigo, monto: -e.valor })),
    ...p.movimientos.map((m) => ({
      libreta: "Cuenta forestal" as const,
      concepto: m.notas,
      referencia: null,
      monto: m.tipo === "cargo" ? m.monto : -m.monto,
    })),
  ];

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-[var(--rule-base)] admin-mobile-cards">
        <table className="w-full text-sm">
          <thead className="bg-[var(--surface-sunken)] text-xs text-[var(--text-tertiary)]">
            <tr className="text-left">
              <th className="px-3 py-2 font-bold">Libreta</th>
              <th className="px-3 py-2 font-bold">Qué se escribe</th>
              <th className="px-3 py-2 font-bold">Referencia</th>
              <th className="px-3 py-2 text-right font-bold">Monto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--rule-soft)]">
            {filas.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-[var(--text-tertiary)]">
                  No se va a escribir nada todavía.
                </td>
              </tr>
            ) : (
              filas.map((f, i) => (
                <tr key={i}>
                  <td data-label="Libreta" className="px-3 py-2 text-[var(--text-primary)]">{f.libreta}</td>
                  <td data-label="Qué se escribe" className="px-3 py-2 text-[var(--text-secondary)]">{f.concepto}</td>
                  <td data-label="Referencia" className="px-3 py-2 text-[var(--text-tertiary)]">{f.referencia ?? "—"}</td>
                  <td
                    data-label="Monto"
                    className={`whitespace-nowrap px-3 py-2 text-right font-bold tabular-nums ${
                      f.monto >= 0 ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" : "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                    }`}
                  >
                    {f.monto >= 0 ? "+" : "−"}
                    {fmtMon(Math.abs(f.monto))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="grid gap-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 sm:grid-cols-3">
        <Antes label="Adelantos" antes={p.antes.adelantosTeDebe} despues={p.despues.adelantosTeDebe} />
        <Antes label="Cuenta forestal" antes={p.antes.maderaSaldo} despues={p.despues.maderaSaldo} />
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Neto</p>
          <p className="text-sm font-semibold text-[var(--text-tertiary)] line-through">{leerNeto(p.antes.neto, nombre)}</p>
          <p className="text-base font-extrabold text-[var(--text-primary)]">{leerNeto(p.despues.neto, nombre)}</p>
        </div>
      </div>

      <p className="text-sm font-semibold text-[var(--text-secondary)]">
        {p.caja ? `${p.caja.tipo === "ingreso" ? "Entran" : "Salen"} ${fmtMon(p.caja.monto)} ${p.caja.tipo === "ingreso" ? "a" : "de"} la caja (${p.caja.metodo}).` : "No mueve la caja."}
      </p>

      {notaMaderaAparte}

      {p.fuera.length > 0 && (
        <div className="rounded-2xl bg-[var(--surface-sunken)] p-3 text-sm text-[var(--text-secondary)]">
          <p className="font-bold text-[var(--text-primary)]">Queda fuera:</p>
          <ul className="mt-1 space-y-0.5">
            {p.fuera.map((f, i) => (
              <li key={i}>
                {f.etiqueta} ({fmtMon(f.monto)}{f.moneda !== "PEN" ? ` ${f.moneda}` : ""}) — {f.motivo}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Antes({ label, antes, despues }: { label: string; antes: number; despues: number }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{label}</p>
      <p className="text-sm text-[var(--text-tertiary)] line-through">{fmtMon(antes)}</p>
      <p className="text-base font-extrabold text-[var(--text-primary)]">{fmtMon(despues)}</p>
    </div>
  );
}
