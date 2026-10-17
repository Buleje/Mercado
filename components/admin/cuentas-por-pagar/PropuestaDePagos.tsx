"use client";

import { useMemo } from "react";
import { DataTable } from "@buleje/design-system";
import { DollarSign, Download } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { descripcionALaVista } from "@/lib/compras/referencia-documento";
import { formatCurrency } from "@/lib/format";
import { cn, exportToCSV } from "@/lib/utils";
import { diaDeVencimiento, estaPagada, fechaConDia, ordenar, saldo, vencimiento, type CuentaPorPagar } from "./resumen-cuentas";
import { CHIP_VENCE } from "./TablaCuentas";

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Propuesta de pagos (C46, sólo vista): las cuentas con saldo, marcadas de
 * entrada las vencidas y las que vencen en la semana. Marcar y descargar NO
 * paga nada; cada pago se registra aparte con «Pagar», que lleva a la cuenta.
 */
export default function PropuestaDePagos({ cuentas, hoy, elegidas, setElegidas, onPagar }: {
  cuentas: CuentaPorPagar[];
  hoy: string;
  elegidas: Set<string>;
  setElegidas: (s: Set<string>) => void;
  onPagar: (id: string) => void;
}) {
  const abiertas = useMemo(() => ordenar(cuentas).filter((c) => !estaPagada(c)), [cuentas]);
  const marcadas = abiertas.filter((c) => elegidas.has(c.id));
  const total = r2(marcadas.reduce((s, c) => s + saldo(c), 0));
  const proveedores = new Set(marcadas.map((c) => c.supplierId)).size;
  const todas = abiertas.length > 0 && marcadas.length === abiertas.length;

  const alternar = (id: string) => {
    const s = new Set(elegidas);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setElegidas(s);
  };

  const descargar = () => exportToCSV(marcadas.map((c) => ({
    proveedor: c.supplierName, documento: descripcionALaVista(c.description, c.purchaseOrderId),
    vence: diaDeVencimiento(c.dueDate), a_pagar: saldo(c),
  })), `propuesta-de-pagos-${hoy}`);

  if (abiertas.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--rule-base)] px-4 py-6 text-center text-sm text-[var(--text-secondary)]">
        No le debes nada a ningún proveedor: no hay pagos que preparar.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-[var(--text-secondary)]" aria-live="polite">
          {marcadas.length === 0 ? "Marca las cuentas que vas a pagar" : (
            <>
              Vas a pagar <strong className="tabular-nums text-[var(--text-primary)]">{formatCurrency(total)}</strong> en {marcadas.length} cuenta{marcadas.length === 1 ? "" : "s"} a {proveedores} proveedor{proveedores === 1 ? "" : "es"}
            </>
          )}
        </p>
        <InfoTip
          title="Propuesta de pagos"
          what="Una lista para decidir qué pagar: de entrada salen marcadas las vencidas y las que vencen en los próximos 7 días."
          affects="Preparar o descargar la lista no paga nada ni mueve la caja. Cada pago se registra con «Pagar», en su cuenta."
          example="Marcas 3 facturas por S/ 1.250, descargas la lista para el banco y después pagas cada una."
        />
        <button type="button" onClick={descargar} disabled={marcadas.length === 0} className={button({ variant: "secondary", className: "ml-auto gap-1.5 rounded-xl" })}>
          <Download className="h-4 w-4" aria-hidden /> Descargar lista
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <DataTable wrapperClassName="overflow-visible rounded-none border-0" className="w-full">
          <thead>
            <tr>
              <th data-label="Marcar">
                <input
                  type="checkbox"
                  checked={todas}
                  onChange={() => setElegidas(todas ? new Set() : new Set(abiertas.map((c) => c.id)))}
                  aria-label={todas ? "Desmarcar todas" : "Marcar todas"}
                  className="h-5 w-5 accent-[var(--accent)]"
                />
              </th>
              <th>Proveedor</th>
              <th>Vence</th>
              <th className="text-right">Te falta pagar</th>
              <th className="text-right" data-label="Acciones"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--rule-soft)]">
            {abiertas.map((c) => {
              const v = vencimiento(c, hoy);
              const marcada = elegidas.has(c.id);
              return (
                <tr key={c.id} className={cn(marcada && "bg-[var(--accent-soft)]")}>
                  <td>
                    <input
                      type="checkbox"
                      checked={marcada}
                      onChange={() => alternar(c.id)}
                      aria-label={`Incluir la cuenta con ${c.supplierName}`}
                      className="h-5 w-5 accent-[var(--accent)]"
                    />
                  </td>
                  <td>
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--text-primary)]">{c.supplierName || "Sin nombre"}</p>
                      <p className="line-clamp-1 text-sm text-[var(--text-secondary)]">{descripcionALaVista(c.description, c.purchaseOrderId)}</p>
                    </div>
                  </td>
                  <td>
                    <div className="min-w-0">
                      <p className="text-[var(--text-primary)]">{fechaConDia(diaDeVencimiento(c.dueDate))}</p>
                      <span className={cn("mt-1 inline-flex rounded-full px-2 py-0.5 text-sm font-semibold", CHIP_VENCE[v.tono])}>{v.texto}</span>
                    </div>
                  </td>
                  <td className="text-right font-bold tabular-nums">{formatCurrency(saldo(c))}</td>
                  <td>
                    <div className="flex justify-end">
                      <button type="button" onClick={() => onPagar(c.id)} className={button({ variant: "secondary", className: "gap-1.5 rounded-xl" })}>
                        <DollarSign className="h-4 w-4" aria-hidden /> Pagar
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      </div>
    </div>
  );
}
