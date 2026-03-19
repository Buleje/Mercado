/**
 * Export Utilities — converts table data to CSV / JSON download
 */

export function exportToCSV(data: Record<string, unknown>[], filename: string): void {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const rows = data.map(row =>
    headers.map(h => {
      const val = row[h];
      if (val === null || val === undefined) return "";
      const str = String(val);
      return str.includes(",") || str.includes('"') || str.includes("\n")
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    }).join(",")
  );
  const csv = [headers.join(","), ...rows].join("\n");
  downloadBlob(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }), filename + ".csv");
}

export function exportToJSON(data: unknown, filename: string): void {
  const json = JSON.stringify(data, null, 2);
  downloadBlob(new Blob([json], { type: "application/json" }), filename + ".json");
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Format a product list for export */
export function formatProductsForExport(products: {
  id: number; name: string; category: string; price: number;
  costPrice?: number; stock: number; stockMin?: number; unit: string; active: boolean;
}[]) {
  return products.map(p => ({
    ID: p.id,
    Nombre: p.name,
    Categoría: p.category,
    "Precio (S/)": p.price,
    "Costo (S/)": p.costPrice ?? "",
    Stock: p.stock,
    "Stock Mínimo": p.stockMin ?? 0,
    Unidad: p.unit,
    Activo: p.active ? "Sí" : "No",
  }));
}

/** Format an orders list for export */
export function formatOrdersForExport(orders: {
  id: string | number; createdAt: string; status: string;
  total: number; paymentMethod?: string;
  customer: { name?: string; phone?: string };
  items: { name: string; quantity: number; price: number }[];
}[]) {
  return orders.map(o => ({
    "ID Pedido": o.id,
    Fecha: new Date(o.createdAt).toLocaleDateString("es-PE"),
    Estado: o.status,
    Cliente: o.customer?.name ?? "",
    Teléfono: o.customer?.phone ?? "",
    "Total (S/)": o.total,
    "Método Pago": o.paymentMethod ?? "efectivo",
    Productos: o.items.map(i => `${i.quantity}x ${i.name}`).join(" | "),
  }));
}

/** Format customers for export */
export function formatCustomersForExport(customers: {
  phone: string; name: string; location?: string; createdAt?: string;
}[], stats: Map<string, { orderCount: number; totalSpent: number }>) {
  return customers.map(c => {
    const s = stats.get(c.phone);
    return {
      Nombre: c.name,
      Teléfono: c.phone,
      Dirección: c.location ?? "",
      Pedidos: s?.orderCount ?? 0,
      "Total Gastado (S/)": s?.totalSpent.toFixed(2) ?? "0.00",
      "Registrado el": c.createdAt ? new Date(c.createdAt).toLocaleDateString("es-PE") : "",
    };
  });
}
