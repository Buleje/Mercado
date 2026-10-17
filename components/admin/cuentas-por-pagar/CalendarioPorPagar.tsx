"use client";

import { Fragment, useMemo, useState } from "react";
import { DataTable } from "@buleje/design-system";
import { ChevronDown, ChevronRight } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { descripcionALaVista } from "@/lib/compras/referencia-documento";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CAMPO } from "./OrigenCuentaCampos";
import { antiguedad, diaDeVencimiento, fechaConDia, saldo, type CuentaPorPagar, type TonoVence, type TramoId } from "./resumen-cuentas";

const BARRA: Record<TonoVence, string> = {
  vencida: "bg-[var(--data-error-500)]",
  pronto: "bg-[var(--data-warning-500)]",
  "al-dia": "bg-primary",
  pagada: "bg-[var(--data-success-500)]",
};

/**
 * Calendario y antigüedad del saldo (C45): cuánto está vencido, vence hoy, en
 * la semana o más adelante, contado al día de corte. Los tramos suman lo mismo
 * que «Le debes». Elegir un tramo muestra sus cuentas.
 */
export default function CalendarioPorPagar({ cuentas, hoy }: { cuentas: CuentaPorPagar[]; hoy: string }) {
  const [corte, setCorte] = useState(hoy);
  const [abierto, setAbierto] = useState<TramoId | null>(null);
  const dia = corte >= hoy ? corte : hoy;
  const { tramos, total } = useMemo(() => antiguedad(cuentas, dia), [cuentas, dia]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
          Al día
          <input type="date" value={dia} min={hoy} onChange={(e) => setCorte(e.target.value || hoy)} className={cn(CAMPO, "w-auto")} />
        </label>
        <p className="text-sm text-[var(--text-secondary)]">
          {fechaConDia(dia)} · en soles (S/) · le debes <strong className="tabular-nums text-[var(--text-primary)]">{formatCurrency(total)}</strong>
        </p>
        <InfoTip
          title="Antigüedad del saldo"
          what="Cada cuenta con saldo cae en un tramo según cuántos días faltan o pasaron desde su vencimiento hasta el día elegido."
          affects="Elige un día futuro para ver qué estará vencido para entonces (por ejemplo, el viernes de pago). Para un día pasado usa el Estado de cuenta del proveedor."
          example="Una factura que venció el lunes 06/10, vista al jueves 16/10, cae en «Vencido hace 1 a 30 días»."
        />
      </div>
      <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <DataTable wrapperClassName="overflow-visible rounded-none border-0" className="w-full">
          <thead>
            <tr>
              <th>Cuándo</th>
              <th className="text-right">Cuentas</th>
              <th className="text-right">Te falta pagar</th>
              <th data-label="Parte del total"><span className="sr-only">Parte del total</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--rule-soft)]">
            {tramos.map((t) => {
              const pct = total > 0 ? Math.round((t.saldo / total) * 100) : 0;
              const abre = abierto === t.id;
              const Flecha = abre ? ChevronDown : ChevronRight;
              return (
                <Fragment key={t.id}>
                  <tr className={cn(t.n === 0 && "text-[var(--text-secondary)]")}>
                    <td>
                      <button
                        type="button"
                        disabled={t.n === 0}
                        aria-expanded={abre}
                        onClick={() => setAbierto(abre ? null : t.id)}
                        className="inline-flex min-h-12 items-center gap-1.5 text-left font-semibold disabled:cursor-default disabled:font-normal"
                      >
                        <Flecha className={cn("h-4 w-4 shrink-0", t.n === 0 && "invisible")} aria-hidden />
                        {t.label}
                      </button>
                    </td>
                    <td className="text-right tabular-nums">{t.n}</td>
                    <td className="text-right font-semibold tabular-nums">{formatCurrency(t.saldo)}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 rounded-full bg-[var(--surface-sunken)]" aria-hidden>
                          <div className={cn("h-1.5 rounded-full", BARRA[t.tono])} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-sm tabular-nums text-[var(--text-secondary)]">{pct} %</span>
                      </div>
                    </td>
                  </tr>
                  {abre && (
                    <tr>
                      <td colSpan={4} data-label="">
                        <ul className="space-y-1.5 border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-3 py-3 sm:px-4">
                          {t.cuentas.map((c) => (
                            <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded-lg bg-[var(--surface-raised)] px-3 py-2 text-sm">
                              <span className="min-w-0">
                                <strong className="text-[var(--text-primary)]">{c.supplierName}</strong>
                                <span className="ml-2 text-[var(--text-secondary)]">{descripcionALaVista(c.description, c.purchaseOrderId)}</span>
                              </span>
                              <span className="tabular-nums text-[var(--text-secondary)]">
                                vence {fechaConDia(diaDeVencimiento(c.dueDate))} · <strong className="text-[var(--text-primary)]">{formatCurrency(saldo(c))}</strong>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </DataTable>
      </div>
    </div>
  );
}
