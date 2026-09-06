"use client";

import { CardTitle, SectionTitle } from "@buleje/design-system";
import { useState, useCallback } from "react";
import { FileText, Loader2, Download, BarChart3, Package, Users, DollarSign, Clock, TrendingUp, Printer, Database, CalendarDays } from "@buleje/design-system/icons";

type ReportType = "ventas" | "inventario" | "clientes" | "financiero" | "horas-pico" | "margen" | "metricas-completas" | "informe-mensual";

const REPORTS: { type: ReportType; label: string; desc: string; icon: typeof BarChart3; pdfOnly?: boolean }[] = [
  { type: "informe-mensual", label: "Informe Mensual de Gestión", desc: "Resumen ejecutivo mensual completo: ventas, márgenes, clientes, inventario y cuentas por pagar", icon: CalendarDays, pdfOnly: true },
  { type: "ventas", label: "Reporte de Ventas", desc: "Resumen de ventas por período con totales y productos más vendidos", icon: BarChart3 },
  { type: "inventario", label: "Reporte de Inventario", desc: "Estado actual del inventario, stock bajo y valor total", icon: Package },
  { type: "clientes", label: "Reporte de Clientes", desc: "Base de clientes, frecuencia de compra y lealtad", icon: Users },
  { type: "financiero", label: "Reporte Financiero", desc: "Ingresos, costos, cuentas por pagar y rentabilidad", icon: DollarSign },
  { type: "horas-pico", label: "Horas Pico de Ventas", desc: "Análisis de horarios con mayor afluencia de ventas", icon: Clock },
  { type: "margen", label: "Top Productos por Margen", desc: "Los 10 productos con mayor margen de ganancia", icon: TrendingUp },
  { type: "metricas-completas", label: "Métricas Completas", desc: "Export completo de todas las métricas del negocio (CSV/JSON)", icon: Database },
];

export default function ReportsTab() {
  const [generating, setGenerating] = useState<ReportType | null>(null);

  const fetchData = useCallback(async (type: ReportType) => {
    const endpoints: Record<ReportType, string[]> = {
      ventas: ["/api/sales?limit=200", "/api/products"],
      inventario: ["/api/products"],
      clientes: ["/api/customers"],
      financiero: ["/api/sales?limit=200", "/api/payables", "/api/products"],
      "horas-pico": ["/api/sales?limit=500"],
      margen: ["/api/products", "/api/sales?limit=500"],
      "metricas-completas": ["/api/sales?limit=1000", "/api/products", "/api/customers", "/api/payables", "/api/suppliers", "/api/orders?limit=1000"],
      "informe-mensual": ["/api/sales?limit=500", "/api/orders?limit=500", "/api/products", "/api/customers", "/api/payables"],
    };
    const results = await Promise.all(endpoints[type].map(url => fetch(url).then(r => r.ok ? r.json() : []).catch(() => [])));
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
          csv += `${s.id.slice(-8)},${new Date(s.createdAt).toLocaleDateString()},S/${Number(s.total).toFixed(2)},${s.paymentMethod || "efectivo"},"${items}"\n`;
        });
      } else if (type === "inventario") {
        const [products] = data;
        const totalValue = (products || []).reduce((s: number, p: { price: number; stock: number }) => s + p.price * p.stock, 0);
        const lowStock = (products || []).filter((p: { stock: number; minStock?: number }) => p.stock <= (p.minStock || 5));
        csv = `Reporte de Inventario - ${now}\n\n`;
        csv += `Total Productos,${(products || []).length}\nValor Total Inventario,"S/${totalValue.toFixed(2)}"\nProductos Stock Bajo,${lowStock.length}\n\n`;
        csv += `ID,Nombre,Categoría,Precio,Stock,Min Stock,Valor\n`;
        (products || []).forEach((p: { id: number; name: string; category?: string; price: number; stock: number; minStock?: number }) => {
          csv += `${p.id},"${p.name}",${p.category || ""},S/${Number(p.price).toFixed(2)},${p.stock},${p.minStock || 5},S/${(p.price * p.stock).toFixed(2)}\n`;
        });
      } else if (type === "clientes") {
        const [customers] = data;
        csv = `Reporte de Clientes - ${now}\n\n`;
        csv += `Total Clientes,${(customers || []).length}\n\n`;
        csv += `Teléfono,Nombre,Dirección,Total Gastado,Puntos,Nivel\n`;
        (customers || []).forEach((c: { phone: string; name: string; address?: string; totalSpent?: number; loyaltyPoints?: number; loyaltyTier?: string }) => {
          csv += `${c.phone},"${c.name}","${c.address || ""}",S/${(c.totalSpent || 0).toFixed(2)},${c.loyaltyPoints || 0},${c.loyaltyTier || "Nuevo"}\n`;
        });
      } else if (type === "horas-pico") {
        const [sales] = data;
        const hourCounts: Record<number, { count: number; total: number }> = {};
        const dayCounts: Record<number, { count: number; total: number }> = {};
        const dayNames = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
        
        (sales || []).forEach((s: { createdAt: string; total: number }) => {
          const date = new Date(s.createdAt);
          const hour = date.getHours();
          const day = date.getDay();
          hourCounts[hour] = hourCounts[hour] || { count: 0, total: 0 };
          hourCounts[hour].count++;
          hourCounts[hour].total += s.total;
          dayCounts[day] = dayCounts[day] || { count: 0, total: 0 };
          dayCounts[day].count++;
          dayCounts[day].total += s.total;
        });
        
        const hourData = Object.entries(hourCounts).map(([h, d]) => ({ hour: parseInt(h), ...d })).sort((a, b) => b.count - a.count);
        const dayData = Object.entries(dayCounts).map(([d, data]) => ({ day: parseInt(d), ...data })).sort((a, b) => b.count - a.count);
        
        csv = `Reporte de Horas Pico - ${now}\n\n`;
        csv += `Análisis por Hora\nHora,Cantidad Ventas,Monto Total\n`;
        hourData.forEach(h => {
          csv += `${h.hour}:00,${h.count},S/${Number(h.total).toFixed(2)}\n`;
        });
        csv += `\nAnálisis por Día de la Semana\nDía,Cantidad Ventas,Monto Total\n`;
        dayData.forEach(d => {
          csv += `${dayNames[d.day]},${d.count},S/${Number(d.total).toFixed(2)}\n`;
        });
      } else if (type === "margen") {
        const [products, sales] = data;
        const productStats: Record<number, { name: string; units: number; revenue: number; cost: number }> = {};
        
        (sales || []).forEach((s: { items?: { productId: number; quantity: number; price: number }[] }) => {
          (s.items || []).forEach((item: { productId: number; quantity: number; price: number }) => {
            const product = (products || []).find((p: { id: number }) => p.id === item.productId);
            if (!product) return;
            if (!productStats[item.productId]) {
              productStats[item.productId] = { name: product.name, units: 0, revenue: 0, cost: 0 };
            }
            const costPrice = product.costPrice || product.price * 0.7;
            productStats[item.productId].units += item.quantity;
            productStats[item.productId].revenue += item.price * item.quantity;
            productStats[item.productId].cost += costPrice * item.quantity;
          });
        });
        
        const topMargin = Object.entries(productStats)
          .map(([id, stats]) => ({ id: parseInt(id), ...stats, margin: stats.revenue - stats.cost }))
          .sort((a, b) => b.margin - a.margin)
          .slice(0, 10);
        
        csv = `Reporte de Top 10 por Margen - ${now}\n\n`;
        csv += `Producto,Unidades Vendidas,Ingresos,Costo,Margen,% Margen\n`;
        topMargin.forEach(p => {
          const marginPct = p.revenue > 0 ? ((p.margin / p.revenue) * 100).toFixed(1) : "0.0";
          csv += `"${p.name}",${p.units},S/${Number(p.revenue).toFixed(2)},S/${Number(p.cost).toFixed(2)},S/${Number(p.margin).toFixed(2)},${marginPct}%\n`;
        });
      } else if (type === "metricas-completas") {
        // FASE 6.4: Full Business Metrics Export
        const [sales, products, customers, payables, suppliers, orders] = data;
        
        csv = `BULEJE ERP - METRICAS COMPLETAS DEL NEGOCIO\n`;
        csv += `Generado: ${new Date().toLocaleString("es-PE")}\n\n`;
        
        // === EXECUTIVE SUMMARY ===
        csv += `=== RESUMEN EJECUTIVO ===\n\n`;
        const totalRevenue = (sales || []).reduce((s: number, sale: { total: number }) => s + sale.total, 0);
        const totalOrders = (orders || []).filter((o: { status: string }) => o.status !== "cancelado").length;
        const totalCustomers = (customers || []).length;
        const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
        csv += `Ingresos Totales,S/${totalRevenue.toFixed(2)}\n`;
        csv += `Pedidos/Ventas Totales,${totalOrders + (sales || []).length}\n`;
        csv += `Total Clientes,${totalCustomers}\n`;
        csv += `Valor Promedio Pedido,S/${avgOrderValue.toFixed(2)}\n\n`;
        
        // === REVENUE BREAKDOWN ===
        csv += `=== INGRESOS POR CATEGORIA ===\n`;
        csv += `Categoría,Ventas,% del Total\n`;
        const categoryRevenue = new Map<string, number>();
        (sales || []).forEach((s: { items?: { productId: number; price: number; quantity: number }[] }) => {
          (s.items || []).forEach((item: { productId: number; price: number; quantity: number }) => {
            const product = (products || []).find((p: { id: number }) => p.id === item.productId);
            const category = product?.category || "Sin categoría";
            categoryRevenue.set(category, (categoryRevenue.get(category) || 0) + (item.price * item.quantity));
          });
        });
        [...categoryRevenue.entries()].sort((a, b) => b[1] - a[1]).forEach(([cat, rev]) => {
          const pct = totalRevenue > 0 ? ((rev / totalRevenue) * 100).toFixed(1) : "0.0";
          csv += `${cat},S/${rev.toFixed(2)},${pct}%\n`;
        });
        csv += `\n`;
        
        // === REVENUE BY PAYMENT METHOD ===
        csv += `=== INGRESOS POR METODO DE PAGO ===\n`;
        csv += `Método,Ventas,% del Total\n`;
        const paymentRevenue = new Map<string, number>();
        (sales || []).forEach((s: { payment?: string; total: number }) => {
          const method = s.payment || "efectivo";
          paymentRevenue.set(method, (paymentRevenue.get(method) || 0) + s.total);
        });
        (orders || []).filter((o: { status: string }) => o.status !== "cancelado").forEach((o: { paymentMethod?: string; total: number }) => {
          const method = o.paymentMethod || "efectivo";
          paymentRevenue.set(method, (paymentRevenue.get(method) || 0) + o.total);
        });
        [...paymentRevenue.entries()].sort((a, b) => b[1] - a[1]).forEach(([method, rev]) => {
          const pct = totalRevenue > 0 ? ((rev / totalRevenue) * 100).toFixed(1) : "0.0";
          csv += `${method},S/${rev.toFixed(2)},${pct}%\n`;
        });
        csv += `\n`;
        
        // === PRODUCTS ===
        csv += `=== PRODUCTOS ===\n`;
        csv += `Total Productos,${(products || []).length}\n`;
        csv += `Productos Activos,${(products || []).filter((p: { active: boolean }) => p.active).length}\n`;
        const totalStockValue = (products || []).reduce((s: number, p: { price: number; stock: number }) => s + (p.price * (p.stock || 0)), 0);
        csv += `Valor Total Inventario,S/${totalStockValue.toFixed(2)}\n`;
        const lowStock = (products || []).filter((p: { stock: number; stockMin?: number }) => (p.stock || 0) <= (p.stockMin || 5));
        csv += `Productos con Stock Bajo,${lowStock.length}\n`;
        const outOfStock = (products || []).filter((p: { stock: number }) => (p.stock || 0) === 0);
        csv += `Productos Agotados,${outOfStock.length}\n\n`;
        
        csv += `Top 10 Productos Más Vendidos\n`;
        csv += `Producto,Unidades,Ingresos\n`;
        const productSales = new Map<number, { name: string; units: number; revenue: number }>();
        (sales || []).forEach((s: { items?: { productId: number; quantity: number; price: number }[] }) => {
          (s.items || []).forEach((item: { productId: number; quantity: number; price: number }) => {
            const product = (products || []).find((p: { id: number }) => p.id === item.productId);
            if (!product) return;
            const existing = productSales.get(item.productId) || { name: product.name, units: 0, revenue: 0 };
            existing.units += item.quantity;
            existing.revenue += item.price * item.quantity;
            productSales.set(item.productId, existing);
          });
        });
        [...productSales.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10).forEach(p => {
          csv += `"${p.name}",${p.units},S/${Number(p.revenue).toFixed(2)}\n`;
        });
        csv += `\n`;
        
        // === CUSTOMERS ===
        csv += `=== CLIENTES ===\n`;
        csv += `Total Clientes,${totalCustomers}\n`;
        const newCustomersLast30 = (customers || []).filter((c: { createdAt: string }) => {
          const created = new Date(c.createdAt);
          const days = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
          return days <= 30;
        }).length;
        csv += `Clientes Nuevos (últimos 30 días),${newCustomersLast30}\n\n`;
        
        // === ORDERS ===
        csv += `=== PEDIDOS ===\n`;
        csv += `Total Pedidos,${(orders || []).length}\n`;
        const ordersByStatus = new Map<string, number>();
        (orders || []).forEach((o: { status: string }) => {
          ordersByStatus.set(o.status, (ordersByStatus.get(o.status) || 0) + 1);
        });
        [...ordersByStatus.entries()].forEach(([status, count]) => {
          csv += `${status},${count}\n`;
        });
        csv += `\n`;
        
        // === INVENTORY ===
        csv += `=== GESTION DE INVENTARIO ===\n`;
        csv += `Valor Total Inventario,S/${totalStockValue.toFixed(2)}\n`;
        const totalCostValue = (products || []).reduce((s: number, p: { costPrice?: number; price: number; stock: number }) => s + ((p.costPrice || p.price * 0.7) * (p.stock || 0)), 0);
        csv += `Costo Total Inventario,S/${totalCostValue.toFixed(2)}\n`;
        const inventoryMargin = totalStockValue > 0 ? ((totalStockValue - totalCostValue) / totalStockValue * 100).toFixed(1) : "0.0";
        csv += `Margen Promedio Inventario,${inventoryMargin}%\n\n`;
        
        // === CASH FLOW ===
        csv += `=== FLUJO DE CAJA ===\n`;
        csv += `Ingresos,S/${totalRevenue.toFixed(2)}\n`;
        const totalPurchases = (payables || []).reduce((s: number, p: { amount: number }) => s + p.amount, 0);
        csv += `Compras/Gastos,S/${totalPurchases.toFixed(2)}\n`;
        csv += `Balance,S/${(totalRevenue - totalPurchases).toFixed(2)}\n`;
        const totalPayablesPending = (payables || []).reduce((s: number, p: { amount: number; paidAmount?: number }) => s + (p.amount - (p.paidAmount || 0)), 0);
        csv += `Cuentas por Pagar Pendientes,S/${totalPayablesPending.toFixed(2)}\n\n`;
        
        // === SUPPLIERS ===
        csv += `=== PROVEEDORES ===\n`;
        csv += `Total Proveedores,${(suppliers || []).length}\n`;
        const overduePayables = (payables || []).filter((p: { dueDate: string; amount: number; paidAmount?: number }) => {
          return new Date(p.dueDate) < new Date() && p.amount > (p.paidAmount || 0);
        }).length;
        csv += `Pagos Vencidos,${overduePayables}\n\n`;
        
        // === PERFORMANCE ===
        csv += `=== METRICAS DE DESEMPEÑO ===\n`;
        const completedOrders = (orders || []).filter((o: { status: string }) => o.status === "entregado").length;
        const conversionRate = totalOrders > 0 ? ((completedOrders / totalOrders) * 100).toFixed(1) : "0.0";
        csv += `Tasa de Conversión (Pedidos Entregados),${conversionRate}%\n`;
        const cancelledOrders = (orders || []).filter((o: { status: string }) => o.status === "cancelado").length;
        const cancellationRate = totalOrders > 0 ? ((cancelledOrders / totalOrders) * 100).toFixed(1) : "0.0";
        csv += `Tasa de Cancelación,${cancellationRate}%\n`;
        csv += `Valor Promedio de Orden,S/${avgOrderValue.toFixed(2)}\n\n`;
        
        csv += `=== FIN DEL REPORTE ===\n`;
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

  const generatePDF = useCallback(async (type: ReportType) => {
    setGenerating(type);
    try {
      const data = await fetchData(type);
      const now = new Date().toLocaleDateString("es-PE");
      let html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Reporte ${type}</title>
          <style>
            @media print {
              @page { margin: 1cm; }
              body { margin: 0; }
            }
            body {
              font-family: system-ui, -apple-system, sans-serif;
              padding: 20px;
              max-width: 800px;
              margin: 0 auto;
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
              border-bottom: 3px solid #2563eb;
              padding-bottom: 15px;
            }
            .header h1 {
              margin: 0;
              color: #121f17;
              font-size: 28px;
            }
            .header .date {
              color: #64748b;
              margin-top: 5px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 20px;
            }
            th {
              background: #2563eb;
              color: white;
              padding: 12px;
              text-align: left;
              font-weight: 600;
            }
            td {
              padding: 10px 12px;
              border-bottom: 1px solid #e2e8f0;
            }
            tr:nth-child(even) {
              background: #f8fafc;
            }
            .summary {
              background: #f1f5f9;
              padding: 15px;
              border-radius: 8px;
              margin-bottom: 20px;
            }
            .summary-item {
              display: flex;
              justify-content: space-between;
              margin: 8px 0;
            }
            .summary-label {
              font-weight: 600;
              color: #475569;
            }
            .summary-value {
              color: #121f17;
              font-weight: 700;
            }
            h2 {
              color: #121f17;
              margin-top: 30px;
              margin-bottom: 15px;
              font-size: 18px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Buleje</h1>
            <div class="date">${now}</div>
          </div>
      `;

      if (type === "ventas") {
        const [sales, products] = data;
        const productMap = Object.fromEntries((products || []).map((p: { id: number; name: string }) => [p.id, p.name]));
        const total = (sales || []).reduce((s: number, sale: { total: number }) => s + sale.total, 0);
        html += `<h2>Reporte de Ventas</h2>`;
        html += `<div class="summary">
          <div class="summary-item"><span class="summary-label">Total Ventas:</span><span class="summary-value">${(sales || []).length}</span></div>
          <div class="summary-item"><span class="summary-label">Monto Total:</span><span class="summary-value">S/${total.toFixed(2)}</span></div>
        </div>`;
        html += `<table><thead><tr><th>ID</th><th>Fecha</th><th>Total</th><th>Método Pago</th><th>Productos</th></tr></thead><tbody>`;
        (sales || []).forEach((s: { id: string; createdAt: string; total: number; paymentMethod?: string; items?: { productId: number; quantity: number }[] }) => {
          const items = (s.items || []).map((i: { productId: number; quantity: number }) => `${productMap[i.productId] || i.productId} x${i.quantity}`).join(", ");
          html += `<tr><td>${s.id.slice(-8)}</td><td>${new Date(s.createdAt).toLocaleDateString()}</td><td>S/${Number(s.total).toFixed(2)}</td><td>${s.paymentMethod || "efectivo"}</td><td>${items}</td></tr>`;
        });
        html += `</tbody></table>`;
      } else if (type === "inventario") {
        const [products] = data;
        const totalValue = (products || []).reduce((s: number, p: { price: number; stock: number }) => s + p.price * p.stock, 0);
        const lowStock = (products || []).filter((p: { stock: number; minStock?: number }) => p.stock <= (p.minStock || 5));
        html += `<h2>Reporte de Inventario</h2>`;
        html += `<div class="summary">
          <div class="summary-item"><span class="summary-label">Total Productos:</span><span class="summary-value">${(products || []).length}</span></div>
          <div class="summary-item"><span class="summary-label">Valor Total:</span><span class="summary-value">S/${totalValue.toFixed(2)}</span></div>
          <div class="summary-item"><span class="summary-label">Stock Bajo:</span><span class="summary-value">${lowStock.length}</span></div>
        </div>`;
        html += `<table><thead><tr><th>ID</th><th>Nombre</th><th>Categoría</th><th>Precio</th><th>Stock</th><th>Min Stock</th><th>Valor</th></tr></thead><tbody>`;
        (products || []).forEach((p: { id: number; name: string; category?: string; price: number; stock: number; minStock?: number }) => {
          html += `<tr><td>${p.id}</td><td>${p.name}</td><td>${p.category || ""}</td><td>S/${Number(p.price).toFixed(2)}</td><td>${p.stock}</td><td>${p.minStock || 5}</td><td>S/${(p.price * p.stock).toFixed(2)}</td></tr>`;
        });
        html += `</tbody></table>`;
      } else if (type === "clientes") {
        const [customers] = data;
        html += `<h2>Reporte de Clientes</h2>`;
        html += `<div class="summary"><div class="summary-item"><span class="summary-label">Total Clientes:</span><span class="summary-value">${(customers || []).length}</span></div></div>`;
        html += `<table><thead><tr><th>Teléfono</th><th>Nombre</th><th>Dirección</th><th>Total Gastado</th><th>Puntos</th><th>Nivel</th></tr></thead><tbody>`;
        (customers || []).forEach((c: { phone: string; name: string; address?: string; totalSpent?: number; loyaltyPoints?: number; loyaltyTier?: string }) => {
          html += `<tr><td>${c.phone}</td><td>${c.name}</td><td>${c.address || ""}</td><td>S/${(c.totalSpent || 0).toFixed(2)}</td><td>${c.loyaltyPoints || 0}</td><td>${c.loyaltyTier || "Nuevo"}</td></tr>`;
        });
        html += `</tbody></table>`;
      } else if (type === "financiero") {
        const [sales, payables, products] = data;
        const totalIncome = (sales || []).reduce((s: number, sale: { total: number }) => s + sale.total, 0);
        const totalPayables = (payables || []).reduce((s: number, p: { amount: number; paidAmount: number }) => s + (p.amount - (p.paidAmount || 0)), 0);
        const inventoryValue = (products || []).reduce((s: number, p: { price: number; stock: number }) => s + p.price * p.stock, 0);
        html += `<h2>Reporte Financiero</h2>`;
        html += `<div class="summary">
          <div class="summary-item"><span class="summary-label">Ingresos por Ventas:</span><span class="summary-value">S/${totalIncome.toFixed(2)}</span></div>
          <div class="summary-item"><span class="summary-label">Cuentas por Pagar:</span><span class="summary-value">S/${totalPayables.toFixed(2)}</span></div>
          <div class="summary-item"><span class="summary-label">Valor Inventario:</span><span class="summary-value">S/${inventoryValue.toFixed(2)}</span></div>
        </div>`;
      } else if (type === "horas-pico") {
        const [sales] = data;
        const hourCounts: Record<number, { count: number; total: number }> = {};
        const dayCounts: Record<number, { count: number; total: number }> = {};
        const dayNames = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
        
        (sales || []).forEach((s: { createdAt: string; total: number }) => {
          const date = new Date(s.createdAt);
          const hour = date.getHours();
          const day = date.getDay();
          hourCounts[hour] = hourCounts[hour] || { count: 0, total: 0 };
          hourCounts[hour].count++;
          hourCounts[hour].total += s.total;
          dayCounts[day] = dayCounts[day] || { count: 0, total: 0 };
          dayCounts[day].count++;
          dayCounts[day].total += s.total;
        });
        
        const hourData = Object.entries(hourCounts).map(([h, d]) => ({ hour: parseInt(h), ...d })).sort((a, b) => b.count - a.count);
        const dayData = Object.entries(dayCounts).map(([d, data]) => ({ day: parseInt(d), ...data })).sort((a, b) => b.count - a.count);
        
        html += `<h2>Horas Pico de Ventas</h2>`;
        html += `<h3 style="font-size: 16px; color: #475569; margin-top: 20px;">Análisis por Hora</h3>`;
        html += `<table><thead><tr><th>Hora</th><th>Cantidad Ventas</th><th>Monto Total</th></tr></thead><tbody>`;
        hourData.forEach(h => {
          html += `<tr><td>${h.hour}:00</td><td>${h.count}</td><td>S/${Number(h.total).toFixed(2)}</td></tr>`;
        });
        html += `</tbody></table>`;
        html += `<h3 style="font-size: 16px; color: #475569; margin-top: 30px;">Análisis por Día de la Semana</h3>`;
        html += `<table><thead><tr><th>Día</th><th>Cantidad Ventas</th><th>Monto Total</th></tr></thead><tbody>`;
        dayData.forEach(d => {
          html += `<tr><td>${dayNames[d.day]}</td><td>${d.count}</td><td>S/${Number(d.total).toFixed(2)}</td></tr>`;
        });
        html += `</tbody></table>`;
      } else if (type === "margen") {
        const [products, sales] = data;
        const productStats: Record<number, { name: string; units: number; revenue: number; cost: number }> = {};
        
        (sales || []).forEach((s: { items?: { productId: number; quantity: number; price: number }[] }) => {
          (s.items || []).forEach((item: { productId: number; quantity: number; price: number }) => {
            const product = (products || []).find((p: { id: number }) => p.id === item.productId);
            if (!product) return;
            if (!productStats[item.productId]) {
              productStats[item.productId] = { name: product.name, units: 0, revenue: 0, cost: 0 };
            }
            const costPrice = product.costPrice || product.price * 0.7;
            productStats[item.productId].units += item.quantity;
            productStats[item.productId].revenue += item.price * item.quantity;
            productStats[item.productId].cost += costPrice * item.quantity;
          });
        });
        
        const topMargin = Object.entries(productStats)
          .map(([id, stats]) => ({ id: parseInt(id), ...stats, margin: stats.revenue - stats.cost }))
          .sort((a, b) => b.margin - a.margin)
          .slice(0, 10);
        
        html += `<h2>Top 10 Productos por Margen</h2>`;
        html += `<table><thead><tr><th>Producto</th><th>Unidades Vendidas</th><th>Ingresos</th><th>Costo</th><th>Margen</th><th>% Margen</th></tr></thead><tbody>`;
        topMargin.forEach(p => {
          const marginPct = p.revenue > 0 ? ((p.margin / p.revenue) * 100).toFixed(1) : "0.0";
          html += `<tr><td>${p.name}</td><td>${p.units}</td><td>S/${Number(p.revenue).toFixed(2)}</td><td>S/${Number(p.cost).toFixed(2)}</td><td>S/${Number(p.margin).toFixed(2)}</td><td>${marginPct}%</td></tr>`;
        });
        html += `</tbody></table>`;
      } else if (type === "informe-mensual") {
        const [sales, orders, products, customers, payables] = data;
        const thisMonth = new Date();
        const monthLabel = thisMonth.toLocaleDateString("es-PE", { month: "long", year: "numeric" });

        // Revenue
        const allSales = [...(sales || []), ...(orders || []).filter((o: { status: string }) => o.status !== "cancelado")];
        const totalRevenue = (sales || []).reduce((s: number, x: { total: number }) => s + x.total, 0)
          + (orders || []).filter((o: { status: string }) => o.status === "entregado").reduce((s: number, x: { total: number }) => s + x.total, 0);
        void allSales;
        const avgOrder = (sales || []).length + (orders || []).filter((o: { status: string }) => o.status !== "cancelado").length > 0
          ? totalRevenue / ((sales || []).length + (orders || []).filter((o: { status: string }) => o.status !== "cancelado").length)
          : 0;

        // Top products
        const productMap = Object.fromEntries((products || []).map((p: { id: number; name: string; category?: string; costPrice?: number; price: number }) => [p.id, p]));
        const productSales = new Map<number, { name: string; units: number; revenue: number; cost: number }>();
        (sales || []).forEach((s: { items?: { productId: number; quantity: number; price: number }[] }) => {
          (s.items || []).forEach((item: { productId: number; quantity: number; price: number }) => {
            const p = productMap[item.productId];
            if (!p) return;
            const cur = productSales.get(item.productId) || { name: p.name, units: 0, revenue: 0, cost: 0 };
            cur.units += item.quantity;
            cur.revenue += item.price * item.quantity;
            cur.cost += (p.costPrice || p.price * 0.7) * item.quantity;
            productSales.set(item.productId, cur);
          });
        });
        const topProducts = [...productSales.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8);

        // Payables
        const overdueAmt = (payables || []).filter((p: { dueDate: string; status: string }) => new Date(p.dueDate) < thisMonth && p.status !== "pagado")
          .reduce((s: number, p: { amount: number; paidAmount?: number }) => s + (p.amount - (p.paidAmount || 0)), 0);
        const totalPendingPayables = (payables || []).filter((p: { status: string }) => p.status !== "pagado")
          .reduce((s: number, p: { amount: number; paidAmount?: number }) => s + (p.amount - (p.paidAmount || 0)), 0);

        // Stock
        const lowStockProducts = (products || []).filter((p: { stock?: number; stockMin?: number }) => (p.stock || 0) <= (p.stockMin || 5));
        const inventoryValue = (products || []).reduce((s: number, p: { price: number; stock?: number }) => s + p.price * (p.stock || 0), 0);

        // Customers
        const newThisMonthCustomers = (customers || []).filter((c: { createdAt?: string }) => {
          if (!c.createdAt) return false;
          const d = new Date(c.createdAt);
          return d.getMonth() === thisMonth.getMonth() && d.getFullYear() === thisMonth.getFullYear();
        }).length;

        html += `
        <style>.tag{display:inline-block;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;}.green{background:#dcfce7;color:#166534;}.red{background:#fee2e2;color:#991b1b;}.blue{background:#dbeafe;color:#1e40af;}.amber{background:#fff1ef;color:#842e25;}</style>
        <h2 style="color:#2563eb;font-size:22px;margin-bottom:5px;">📊 Informe Mensual de Gestión</h2>
        <p style="color:#64748b;font-size:14px;margin-top:0;">${monthLabel} — Buleje</p>
        <hr style="border:none;border-top:2px solid #2563eb;margin:15px 0;" />

        <h3 style="color:#121f17;margin-top:20px;">💰 Resumen Financiero</h3>
        <div class="summary">
          <div class="summary-item"><span class="summary-label">Ingresos totales:</span><span class="summary-value" style="color:#16a34a;">S/${totalRevenue.toFixed(2)}</span></div>
          <div class="summary-item"><span class="summary-label">Valor promedio de pedido:</span><span class="summary-value">S/${avgOrder.toFixed(2)}</span></div>
          <div class="summary-item"><span class="summary-label">Valor del inventario:</span><span class="summary-value">S/${inventoryValue.toFixed(2)}</span></div>
          <div class="summary-item"><span class="summary-label">Cuentas por pagar pendientes:</span><span class="summary-value" style="color:#dc2626;">S/${totalPendingPayables.toFixed(2)}</span></div>
          <div class="summary-item"><span class="summary-label">Pagos vencidos:</span><span class="summary-value" style="color:#dc2626;">S/${overdueAmt.toFixed(2)}</span></div>
        </div>

        <h3 style="color:#121f17;margin-top:25px;">🏆 Top Productos del Período</h3>
        <table><thead><tr><th>#</th><th>Producto</th><th>Unidades</th><th>Ingresos</th><th>Costo</th><th>Margen</th></tr></thead><tbody>
        ${topProducts.map((p, i) => {
          const margin = p.revenue > 0 ? ((p.revenue - p.cost) / p.revenue * 100).toFixed(1) : "0.0";
          return `<tr><td>${i + 1}</td><td>${p.name}</td><td>${p.units}</td><td>S/${Number(p.revenue).toFixed(2)}</td><td>S/${Number(p.cost).toFixed(2)}</td><td>${margin}%</td></tr>`;
        }).join("")}
        </tbody></table>

        <h3 style="color:#121f17;margin-top:25px;">⚠️ Alertas de Inventario</h3>
        ${lowStockProducts.length === 0
          ? '<p style="color:#16a34a;">✅ Todo el inventario está sobre el mínimo.</p>'
          : `<table><thead><tr><th>Producto</th><th>Stock actual</th><th>Stock mínimo</th></tr></thead><tbody>${lowStockProducts.slice(0, 15).map((p: { name: string; stock?: number; stockMin?: number }) => `<tr><td>${p.name}</td><td style="color:#dc2626;font-weight:700;">${p.stock || 0}</td><td>${p.stockMin || 5}</td></tr>`).join("")}</tbody></table>`
        }

        <h3 style="color:#121f17;margin-top:25px;">👥 Clientes</h3>
        <div class="summary">
          <div class="summary-item"><span class="summary-label">Total clientes:</span><span class="summary-value">${(customers || []).length}</span></div>
          <div class="summary-item"><span class="summary-label">Nuevos este mes:</span><span class="summary-value" style="color:#2563eb;">${newThisMonthCustomers}</span></div>
        </div>

        <p style="margin-top:30px;font-size:11px;color:#94a3b8;text-align:center;">Generado automáticamente por el panel Buleje · ${new Date().toLocaleString("es-PE")}</p>
        `;
      }

      html += `
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
        </html>
      `;

      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
      }
    } catch { /* ignore */ }
    setGenerating(null);
  }, [fetchData]);

  return (
    <div className="space-y-3 sm:space-y-6">
      <SectionTitle className="text-xl font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex flex-wrap items-center gap-2"><FileText className="h-6 w-6 text-primary" />Reportes</SectionTitle>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
        {REPORTS.map(r => {
          const Icon = r.icon;
          const isGenerating = generating === r.type;
          const isFullMetrics = r.type === "metricas-completas";
          const isPdfOnly = r.pdfOnly;
          return (
            <div key={r.type} className={r.type === "informe-mensual" ? "sm:col-span-2 bg-[var(--surface-sunken)] border border-[var(--rule-base)] rounded-xl p-3 sm:p-6 flex flex-col" : "bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-3 sm:p-6 flex flex-col"}>
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <div className={r.type === "informe-mensual" ? "p-2 rounded-xl bg-primary/10" : "p-2 rounded-xl bg-primary/10"}>
                  <Icon className={r.type === "informe-mensual" ? "h-6 w-6 text-[var(--data-success-500)]" : "h-6 w-6 text-primary"} />
                </div>
                <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{r.label}</CardTitle>
              </div>
              <p className="text-sm text-[var(--text-secondary)] dark:text-muted flex-1">{r.desc}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {!isPdfOnly && (
                  <button onClick={() => generateCSV(r.type)} disabled={!!generating} className="flex-1 flex flex-wrap items-center justify-center gap-2 bg-primary text-white px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm font-bold hover:bg-primary/90 transition disabled:opacity-50">
                    {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    {isGenerating ? "Generando..." : "CSV"}
                  </button>
                )}
                {!isFullMetrics && (
                  <button onClick={() => generatePDF(r.type)} disabled={!!generating} className={isPdfOnly ? "flex-1 flex items-center justify-center gap-2 bg-primary/10 text-white px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm font-bold hover:bg-primary/10 transition disabled:opacity-50" : "flex-1 flex items-center justify-center gap-2 bg-primary/10 text-white px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm font-bold hover:bg-primary/10 transition disabled:opacity-50"}>
                    {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                    {isGenerating ? "Generando..." : isPdfOnly ? "Generar Informe PDF" : "PDF"}
                  </button>
                )}
              </div>
              {isFullMetrics && (
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted text-center mt-2">
                  💼 Export completo en formato CSV. Ideal para análisis en Excel o importar a otros sistemas.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

