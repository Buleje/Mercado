/**
 * Lo que baja «Importar y exportar»: los datos crudos de cada módulo (CSV o
 * Excel) y el historial de importaciones (reconstruido del audit log). Movido
 * tal cual desde `ImportExportTab.tsx` (11-10) para que la vista quede ≤300.
 */
import type { ElementType } from "react";
import { FileText, Package, ShoppingCart, Truck, DollarSign, Users } from "@buleje/design-system/icons";
import type { ActivityEntry } from "@/app/api/activity-log/route";
import { formatDate } from "@/lib/format";
import { decodeExpenseDescription } from "@/lib/expense-meta";
import { diaDelGasto } from "@/lib/gastos/lista-gastos";

export type ExportModule = { id: string; label: string; icon: ElementType; hint: string };
export type ImportRecord = { id: string; module: string; filename: string; records: number; status: "success" | "partial" | "error"; date: string; errors: number };

export const EXPORT_MODULES: ExportModule[] = [
  { id: "productos", label: "Productos", icon: Package, hint: "Nombre, categoría, precio, stock y código de barras" },
  { id: "clientes", label: "Clientes", icon: Users, hint: "Nombre, teléfono, ubicación, puntos y nivel" },
  { id: "pedidos", label: "Pedidos", icon: ShoppingCart, hint: "Cliente, total, estado y pago de cada pedido" },
  { id: "ventas", label: "Ventas", icon: DollarSign, hint: "Las ventas del mostrador" },
  { id: "inventario", label: "Movimientos de inventario", icon: Package, hint: "Producto, tipo y cantidad de cada movimiento" },
  { id: "proveedores", label: "Proveedores", icon: Truck, hint: "Nombre, RUC y contacto" },
  { id: "gastos", label: "Gastos", icon: FileText, hint: "Cada gasto con su fecha y categoría" },
];

export function fmtDate(iso: string) { return formatDate(iso); }

/** El historial no tiene tabla propia — se reconstruye del audit log real
 *  (`logActivity("Importar", ...)` en cada endpoint de importación, hoy sólo
 *  `/api/products/import`). El detail es texto libre por diseño del audit
 *  log genérico; acá se parsea el único formato que los endpoints escriben. */
const HISTORY_RE = /^Importaci[oó]n Excel "([^"]*)":\s*(\d+)\s+creados,\s*(\d+)\s+errores/;
export function parseImportRecord(entry: ActivityEntry): ImportRecord | null {
  const m = HISTORY_RE.exec(entry.detail);
  if (!m) return null;
  const records = Number(m[2]);
  const errors = Number(m[3]);
  return {
    id: entry.id,
    module: entry.entity,
    filename: m[1] || "(sin nombre)",
    records,
    errors,
    status: errors === 0 ? "success" : records > 0 ? "partial" : "error",
    date: entry.createdAt,
  };
}

// Fetch real data and return CSV rows per module
export async function fetchModuleData(moduleId: string): Promise<Record<string, unknown>[]> {
  if (moduleId === "productos") {
    const res = await fetch("/api/products");
    if (!res.ok) return [];
    const data = await res.json() as Record<string, unknown>[];
    return data.map(p => ({
      id: p.id, nombre: p.name, categoria: p.category, precio: p.price,
      unidad: p.unit, stock: p.stock ?? "", stock_min: p.stockMin ?? "",
      activo: p.active !== false ? "sí" : "no", badge: p.badge ?? "",
      codigo_barras: p.barcode ?? "",
    }));
  }
  if (moduleId === "clientes") {
    const res = await fetch("/api/customers");
    if (!res.ok) return [];
    const data = await res.json() as { customers?: Record<string, unknown>[] } | Record<string, unknown>[];
    const list = Array.isArray(data) ? data : ((data as { customers?: Record<string, unknown>[] }).customers ?? []);
    return list.map(c => ({
      nombre: c.name, teléfono: c.phone, ubicacion: c.location ?? "",
      puntos: c.loyaltyPoints ?? 0, nivel: c.loyaltyTier ?? "bronce",
      total_gastado: c.totalSpent ?? 0, credito: c.creditBalance ?? 0,
      registrado: c.createdAt ? String(c.createdAt).slice(0, 10) : "",
    }));
  }
  if (moduleId === "pedidos") {
    const res = await fetch("/api/orders");
    if (!res.ok) return [];
    const data = await res.json() as { orders?: Record<string, unknown>[] } | Record<string, unknown>[];
    const list = Array.isArray(data) ? data : ((data as { orders?: Record<string, unknown>[] }).orders ?? []);
    return list.map(o => ({
      id: o.id, cliente: (o.customer as Record<string, unknown>)?.name ?? "", teléfono: (o.customer as Record<string, unknown>)?.phone ?? "",
      total: o.total, estado: o.status, pago: o.paymentMethod ?? "",
      fecha: o.createdAt ? String(o.createdAt).slice(0, 10) : "",
      num_productos: Array.isArray(o.items) ? o.items.length : 0,
    }));
  }
  if (moduleId === "inventario") {
    const res = await fetch("/api/inventory-movements");
    if (!res.ok) return [];
    const data = await res.json() as Record<string, unknown>[];
    return data.map(m => ({
      id: m.id, producto_id: m.productId, tipo: m.type,
      cantidad: m.quantity, notas: m.notes ?? "",
      fecha: m.createdAt ? String(m.createdAt).slice(0, 10) : "",
    }));
  }
  if (moduleId === "ventas") {
    const res = await fetch("/api/sales");
    if (!res.ok) return [];
    const data = await res.json() as Record<string, unknown>[];
    return data.map(s => {
      const total = Number(s.total) || 0;
      const totalCogs = Number(s.totalCogs) || 0;
      const margin = total - totalCogs;
      return {
        id: s.id,
        fecha: s.createdAt ? String(s.createdAt).slice(0, 10) : "",
        num_productos: Array.isArray(s.items) ? s.items.length : 0,
        total: total.toFixed(2),
        costo_total: totalCogs.toFixed(2),
        margen: margin.toFixed(2),
        margen_pct: total > 0 ? ((margin / total) * 100).toFixed(1) + "%" : "0%",
        metodo_pago: s.payment ?? "",
        comprobante: s.comprobanteTipo ?? "ticket",
        descuento: s.descuentoMonto ?? 0,
        cajero: s.cashierId ?? "",
        cliente: s.customerPhone ?? "",
      };
    });
  }
  // Antes (hasta 11-10) devolvían siempre vacío («no dedicated API yet») y el
  // botón decía «No hay datos»: las APIs existen.
  if (moduleId === "proveedores") {
    const res = await fetch("/api/suppliers");
    if (!res.ok) return [];
    const data = await res.json() as unknown;
    const list = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
    return list.map(p => ({ nombre: p.name, ruc: p.ruc ?? "", teléfono: p.phone ?? "", correo: p.email ?? "" }));
  }
  if (moduleId === "gastos") {
    /* Sin las plantillas de gasto fijo (son el catálogo, no gastos hechos), sin el `---META---`
       interno en la descripción y con el día de Lima (reviewer 11-10). */
    const res = await fetch("/api/expenses?recurring=false");
    if (!res.ok) return [];
    const data = await res.json() as unknown;
    const list = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
    return list
      .filter(g => g.recurring !== true)
      .map(g => ({
        fecha: diaDelGasto(g.date as string | null | undefined),
        categoría: g.category ?? "",
        descripción: decodeExpenseDescription(String(g.description ?? "")).description,
        monto: g.amount,
      }));
  }
  return [];
}

export function downloadExcel(rows: Record<string, unknown>[], filename: string) {
  if (rows.length === 0) return;
  const keys = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return s.includes("\t") || s.includes("\n") ? `"${s}"` : s;
  };
  const tsv =
    keys.join("\t") + "\n" +
    rows.map(r => keys.map(k => escape(r[k])).join("\t")).join("\n");
  // .xls with tab-separated content opens directly in Excel
  const blob = new Blob([tsv], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}
