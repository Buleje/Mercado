"use client";

import { useState, type ReactNode } from "react";
import { History, Download, BarChart3 } from "@buleje/design-system/icons";
import type { PurchaseStatus } from "@/lib/jsondb";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import { exportToExcel } from "@/lib/export-excel";
import { formatDateNumeric } from "@/lib/format";
import { QuotationComparator } from "@/components/admin/compras/SupplierPriceComparison";
import { STATUS_LABELS } from "@/components/admin/ordenes-compra/oc-compartido";
import type { OrdenesCompra } from "@/components/admin/ordenes-compra/hooks/use-ordenes-compra";

/**
 * Lo secundario de Órdenes de compra, para el «Más» de la cabecera: historial por
 * proveedor, comparar cotizaciones y Excel. Antes eran tres botones sueltos en
 * la tarjeta-cabecera. El comparador se abre controlado (sin su botón propio).
 */
export function useMenuOrdenes(oc: OrdenesCompra): { acciones: MenuAccion[]; comparador: ReactNode } {
  const { orders, suppliers, showSupplierHistory, setShowSupplierHistory, f } = oc;
  const [comparar, setComparar] = useState(false);

  const exportar = () => {
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
  };

  const acciones: MenuAccion[] = [
    {
      id: "historial",
      label: "Historial por proveedor",
      hint: "Cuánto le compras a cada uno, sus productos y los últimos 6 meses",
      icon: History,
      activo: showSupplierHistory,
      onSelect: () => setShowSupplierHistory(v => !v),
    },
    {
      id: "comparar",
      label: "Comparar cotizaciones",
      hint: "Hasta 3 órdenes lado a lado, producto por producto",
      icon: BarChart3,
      disabled: orders.length < 2,
      onSelect: () => setComparar(true),
    },
    {
      id: "excel",
      label: "Descargar Excel",
      hint: `${f.filtradas.length} ${f.filtradas.length === 1 ? "orden" : "órdenes"}, con los filtros puestos`,
      icon: Download,
      disabled: f.filtradas.length === 0,
      onSelect: exportar,
    },
  ];

  const comparador = comparar ? (
    <QuotationComparator orders={orders} suppliers={suppliers} abierto onCerrar={() => setComparar(false)} />
  ) : null;

  return { acciones, comparador };
}
