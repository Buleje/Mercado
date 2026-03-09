"use client";

import { useState, useCallback } from "react";
import { FileText, Loader2, Download, BarChart3, Package, Users, DollarSign } from "lucide-react";

type ReportType = "ventas" | "inventario" | "clientes" | "financiero";

const REPORTS: { type: ReportType; label: string; desc: string; icon: typeof BarChart3 }[] = [
  { type: "ventas", label: "Reporte de Ventas", desc: "Resumen de ventas por período con totales y productos más vendidos", icon: BarChart3 },
  { type: "inventario", label: "Reporte de Inventario", desc: "Estado actual del inventario, stock bajo y valor total", icon: Package },
  { type: "clientes", label: "Reporte de Clientes", desc: "Base de clientes, frecuencia de compra y lealtad", icon: Users },
  { type: "financiero", label: "Reporte Financiero", desc: "Ingresos, costos, cuentas por pagar y rentabilidad", icon: DollarSign },
];

export default function ReportsTab() {
  const [generating, setGenerating] = useState<ReportType | null>(null);

  const fetchData = useCallback(async (type: ReportType) => {
    const endpoints: Record<ReportType, string[]> = {
      ventas: ["/api/sales?limit=200", "/api/products"],
      inventario: ["/api/products"],
      clientes: ["/api/customers"],
      financiero: ["/api/sales?limit=200", "/api/payables", "/api/products"],
    };
    const results = await Promise.all(endpoints[type].map(url => fetch(url).then(r => r.json()).catch(() => [])));
    return results;
  }, []);

  const generateCSV = useCallback(async (type: ReportType) => {
    setGenerating(type);
    try {
      const data = await fetchData(type);
      let csv = "";
      const now = new Date().toLocaleDateString("es-PE");

      if (type === "ventas") {
        const [sales, products] = data;
        const productMap = Object.fromEntries((products || []).map((p: { id: number; name: string }) => [p.id, p.name]));
        const total = (sales || []).reduce((s: number, sale: { total: number }) => s + sale.total, 0);
        csv = `Reporte de Ventas - ${now}\n\n`;
        csv += `Total Ventas,${(sales || []).length}\nMonto Total,"S/${total.toFixed(2)}"\n\n`;
        csv += `ID,Fecha,Total,Método Pago,Productos\n`;
        (sales || []).forEach((s: { id: string; createdAt: string; total: number; paymentMethod?: string; items?: { productId: number; quantity: number }[] }) => {
          const items = (s.items || []).map((i: { productId: number; quantity: number }) => `${productMap[i.productId] || i.productId} x${i.quantity}`).join("; ");
          csv += `${s.id.slice(-8)},${new Date(s.createdAt).toLocaleDateString()},S/${s.total.toFixed(2)},${s.paymentMethod || "efectivo"},"${items}"\n`;
        });
      } else if (type === "inventario") {
        const [products] = data;
        const totalValue = (products || []).reduce((s: number, p: { price: number; stock: number }) => s + p.price * p.stock, 0);
        const lowStock = (products || []).filter((p: { stock: number; minStock?: number }) => p.stock <= (p.minStock || 5));
        csv = `Reporte de Inventario - ${now}\n\n`;
        csv += `Total Productos,${(products || []).length}\nValor Total Inventario,"S/${totalValue.toFixed(2)}"\nProductos Stock Bajo,${lowStock.length}\n\n`;
        csv += `ID,Nombre,Categoría,Precio,Stock,Min Stock,Valor\n`;
        (products || []).forEach((p: { id: number; name: string; category?: string; price: number; stock: number; minStock?: number }) => {
          csv += `${p.id},"${p.name}",${p.category || ""},S/${p.price.toFixed(2)},${p.stock},${p.minStock || 5},S/${(p.price * p.stock).toFixed(2)}\n`;
        });
      } else if (type === "clientes") {
        const [customers] = data;
        csv = `Reporte de Clientes - ${now}\n\n`;
        csv += `Total Clientes,${(customers || []).length}\n\n`;
        csv += `Teléfono,Nombre,Dirección,Total Gastado,Puntos,Nivel\n`;
        (customers || []).forEach((c: { phone: string; name: string; address?: string; totalSpent?: number; loyaltyPoints?: number; loyaltyTier?: string }) => {
          csv += `${c.phone},"${c.name}","${c.address || ""}",S/${(c.totalSpent || 0).toFixed(2)},${c.loyaltyPoints || 0},${c.loyaltyTier || "Nuevo"}\n`;
        });
      } else {
        const [sales, payables, products] = data;
        const totalIncome = (sales || []).reduce((s: number, sale: { total: number }) => s + sale.total, 0);
        const totalPayables = (payables || []).reduce((s: number, p: { amount: number; paidAmount: number }) => s + (p.amount - (p.paidAmount || 0)), 0);
        const inventoryValue = (products || []).reduce((s: number, p: { price: number; stock: number }) => s + p.price * p.stock, 0);
        csv = `Reporte Financiero - ${now}\n\n`;
        csv += `Ingresos por Ventas,"S/${totalIncome.toFixed(2)}"\nCuentas por Pagar,"S/${totalPayables.toFixed(2)}"\nValor Inventario,"S/${inventoryValue.toFixed(2)}"\n`;
      }

      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reporte-${type}-${now.replace(/\//g, "-")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
    setGenerating(null);
  }, [fetchData]);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2"><FileText className="h-6 w-6 text-primary" />Reportes</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {REPORTS.map(r => {
          const Icon = r.icon;
          const isGenerating = generating === r.type;
          return (
            <div key={r.type} className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-6 flex flex-col">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-xl bg-primary/10"><Icon className="h-6 w-6 text-primary" /></div>
                <h3 className="font-extrabold text-gray-900 dark:text-foreground">{r.label}</h3>
              </div>
              <p className="text-sm text-gray-500 dark:text-muted flex-1">{r.desc}</p>
              <button onClick={() => generateCSV(r.type)} disabled={!!generating} className="mt-4 flex items-center justify-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-primary/90 transition disabled:opacity-50">
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {isGenerating ? "Generando..." : "Descargar CSV"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
