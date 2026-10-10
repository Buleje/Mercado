"use client";

import { Fragment } from "react";
import { DollarSign, History, MoreHorizontal, Trash2 } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import EnlacePanel from "@/components/admin/shared/EnlacePanel";
import PagarCuentaForm, { METODOS } from "./PagarCuentaForm";
import { diaDeVencimiento, estaPagada, fechaConDia, saldo, vencimiento, type CuentaPorPagar, type TonoVence } from "./resumen-cuentas";
import type { MetodoPago, PagoCuenta, ResultadoPago } from "./use-cuentas-por-pagar";

const CHIP: Record<TonoVence, string> = {
  vencida: "bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]",
  pronto: "bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]",
  "al-dia": "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
  pagada: "bg-primary/10 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
};

export type Abierto = { id: string; que: "pagar" | "pagos" } | null;

/**
 * Una fila por cuenta: quién te cobra, cuánto falta, cuándo vence y «Pagar».
 * El resto (pagos hechos, eliminar) va en el menú de la fila. Debajo de la fila
 * se abre el pago o el historial. A 400 px la tabla pasa a tarjetas sola
 * (`useMobileTableCards` del panel).
 */
export default function TablaCuentas({ cuentas, hoy, abierto, setAbierto, saving, onPagar, onEliminar, onAviso }: {
  cuentas: CuentaPorPagar[];
  hoy: string;
  abierto: Abierto;
  setAbierto: (a: Abierto) => void;
  saving: boolean;
  onPagar: (id: string, p: PagoCuenta) => Promise<ResultadoPago>;
  onEliminar: (id: string) => void;
  onAviso: (texto: string, tono: "ok" | "aviso") => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <table className="w-full text-sm">
        <thead className="bg-[var(--surface-sunken)] text-left text-xs font-semibold text-[var(--text-secondary)]">
          <tr>
            <th className="px-4 py-2.5">Proveedor</th>
            <th className="px-4 py-2.5 text-right">Te falta pagar</th>
            <th className="px-4 py-2.5">Vence</th>
            <th className="px-4 py-2.5 text-right" data-label="Acciones"><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--rule-soft)]">
          {cuentas.map((c) => {
            const falta = saldo(c);
            const v = vencimiento(c, hoy);
            const pagada = estaPagada(c);
            const pct = c.amount > 0 ? Math.min(100, (c.paidAmount / c.amount) * 100) : 0;
            const acciones: MenuAccion[] = [
              { id: "pagos", label: `Pagos hechos (${c.payments.length})`, icon: History, onSelect: () => setAbierto(abierto?.id === c.id && abierto.que === "pagos" ? null : { id: c.id, que: "pagos" }) },
              { id: "eliminar", label: "Eliminar la cuenta", icon: Trash2, tone: "danger", onSelect: () => onEliminar(c.id) },
            ];
            return (
              <Fragment key={c.id}>
                <tr className={cn(v.tono === "vencida" && "bg-[var(--data-error-50)]/40 dark:bg-[var(--data-error-500)]/5")}>
                  <td className="px-4 py-3 align-top">
                    {/* Un solo hijo por celda: a 400 px la celda es «rótulo | contenido» y
                        dos hijos quedaban uno al lado del otro, montados. */}
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--text-primary)]">
                        {/* El proveedor lleva a su ficha (con sus órdenes); sin id, queda el texto. */}
                        <EnlacePanel cosa="proveedor" id={c.supplierId} apariencia="heredada">{c.supplierName || "Sin nombre"}</EnlacePanel>
                      </p>
                      {c.description && <p className="mt-0.5 line-clamp-2 text-xs text-[var(--text-secondary)]">{c.description}</p>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right align-top tabular-nums">
                    <div className="min-w-0">
                      <p className={cn("font-bold", pagada ? "text-[var(--text-secondary)]" : "text-[var(--text-primary)]")}>{formatCurrency(falta)}</p>
                      <p className="text-xs text-[var(--text-secondary)]">de {formatCurrency(c.amount)}</p>
                      <div className="ml-auto mt-1 h-1.5 w-24 max-w-full rounded-full bg-[var(--surface-sunken)]" aria-hidden>
                        <div className={cn("h-1.5 rounded-full", pct >= 100 ? "bg-[var(--data-success-500)]" : "bg-primary")} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="min-w-0">
                      <p className="text-[var(--text-primary)]">{fechaConDia(diaDeVencimiento(c.dueDate))}</p>
                      <span className={cn("mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", CHIP[v.tono])}>{v.texto}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-center justify-end gap-2">
                      {!pagada && (
                        <button
                          type="button"
                          onClick={() => setAbierto(abierto?.id === c.id && abierto.que === "pagar" ? null : { id: c.id, que: "pagar" })}
                          aria-expanded={abierto?.id === c.id && abierto.que === "pagar"}
                          className="inline-flex h-10 items-center gap-1 rounded-xl bg-primary px-3 text-sm font-bold text-white transition-colors hover:bg-primary/90"
                        >
                          <DollarSign className="h-4 w-4" aria-hidden /> Pagar
                        </button>
                      )}
                      <ActionMenu label={`Más de la cuenta con ${c.supplierName}`} soloIcono icon={MoreHorizontal} actions={acciones} />
                    </div>
                  </td>
                </tr>
                {abierto?.id === c.id && (
                  <tr>
                    <td colSpan={4} className="p-0" data-label="">
                      {abierto.que === "pagar" ? (
                        <PagarCuentaForm
                          saldo={falta}
                          proveedor={c.supplierName}
                          saving={saving}
                          onPagar={async (p) => {
                            const r = await onPagar(c.id, p);
                            if (r.ok) setAbierto(null);
                            return r;
                          }}
                          onCancelar={() => setAbierto(null)}
                          onAviso={onAviso}
                        />
                      ) : (
                        <HistorialPagos cuenta={c} />
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function HistorialPagos({ cuenta }: { cuenta: CuentaPorPagar }) {
  return (
    <div className="space-y-1.5 border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-3 py-3 sm:px-4">
      {cuenta.payments.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">Todavía no le pagaste nada de esta cuenta.</p>
      ) : (
        cuenta.payments.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg bg-[var(--surface-raised)] px-3 py-2 text-sm">
            <span>
              <strong className="tabular-nums text-[var(--text-primary)]">{formatCurrency(Number(p.amount))}</strong>
              <span className="ml-2 text-[var(--text-secondary)]">{METODOS[p.method as MetodoPago] ?? p.method}</span>
              {p.reference && <span className="ml-2 text-xs text-[var(--text-secondary)]">Ref: {p.reference}</span>}
            </span>
            <span className="text-xs text-[var(--text-secondary)]">{formatDate(p.date)}</span>
          </div>
        ))
      )}
      <p className="pt-1 text-xs text-[var(--text-secondary)]">
        Cuenta {cuenta.id}
        {cuenta.purchaseOrderId && (
          <>
            {" · "}
            <EnlacePanel cosa="oc" id={cuenta.purchaseOrderId} apariencia="heredada">Orden {cuenta.purchaseOrderId}</EnlacePanel>
          </>
        )}
      </p>
    </div>
  );
}
