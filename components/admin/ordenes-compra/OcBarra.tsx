"use client";

import { History, Download } from "@buleje/design-system/icons";
import type { PurchaseStatus } from "@/lib/jsondb";
import { cn } from "@/lib/utils";
import { exportToExcel } from "@/lib/export-excel";
import { formatDateNumeric } from "@/lib/format";
import { QuotationComparator } from "@/components/admin/compras/SupplierPriceComparison";
import { STATUS_LABELS } from "@/components/admin/ordenes-compra/oc-compartido";
import type { OrdenesCompra } from "@/components/admin/ordenes-compra/hooks/use-ordenes-compra";

/** Acciones sobre la lista: historial, exportar y comparar cotizaciones. Pieza de PurchaseOrdersTab: recibe `useOrdenesCompra` entero. */
export default function OcBarra({ oc }: { oc: OrdenesCompra }) {
  const {
    orders, suppliers, showSupplierHistory, setShowSupplierHistory, f,
  } = oc;
  return (
    <>
      {/* ─── Toolbar: acciones sobre la lista ────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setShowSupplierHistory(v => !v)}
          className={cn(
            "inline-flex items-center gap-2 h-11 px-4 rounded-2xl border-2 text-sm font-semibold transition-colors",
            showSupplierHistory
              ? "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
              : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--text-primary)] hover:text-[var(--text-primary)]",
          )}
        >
          <History className="h-4 w-4" />
          <span className="hidden sm:inline">Historial</span>
        </button>
        <button
          type="button"
          disabled={orders.length === 0}
          onClick={() => {
            // Se exporta lo que estás viendo: filtrar y que el Excel traiga
            // igual las 300 órdenes del año es una sorpresa desagradable.
            if (f.filtradas.length === 0) return;
            const rows = f.filtradas.map(o => ({
              ID: o.id,
              Proveedor: suppliers.find(s => s.id === o.supplierId)?.name ?? o.supplierId,
              Estado: STATUS_LABELS[o.status as PurchaseStatus] ?? o.status,
              Comprobante: o.invoiceNumber ?? "",
              "Total (S/)": o.total,
              "Flete (S/)": o.flete ?? 0,
              Fecha: formatDateNumeric(o.createdAt),
              "Prometida": o.deliveryDate ? formatDateNumeric(o.deliveryDate) : "",
              "Llegó": o.receivedDate ? formatDateNumeric(o.receivedDate) : "",
              "La pidió": o.createdBy ?? "",
              "La recibió": o.receivedBy ?? "",
              Notas: o.notes ?? "",
            }));
            exportToExcel(rows, `compras-${new Date().toISOString().slice(0, 10)}`, "Compras");
          }}
          className="inline-flex items-center gap-2 h-11 px-4 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-semibold text-[var(--data-success-500)] hover:bg-primary/10 dark:hover:bg-[var(--data-success-500)]/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Exportar compras a Excel"
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Excel</span>
        </button>
        {/* Mejora 16: Comparar cotizaciones completas */}
        <QuotationComparator orders={orders} suppliers={suppliers} />
      </div>
    </>
  );
}
