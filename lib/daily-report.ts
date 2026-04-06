// ── Types ─────────────────────────────────────────────────────────────────────

export interface DailyReport {
  date: string;
  totalSales: number;
  totalOrders: number;
  averageTicket: number;
  topProducts: Array<{ name: string; quantity: number; revenue: number }>;
  paymentMethods: Record<string, number>;
  pendingDeliveries: number;
  lowStockAlerts: number;
  newCustomers: number;
  cashBalance: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMoney(n: number): string {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Generator ─────────────────────────────────────────────────────────────────

export function generateDailyReportText(report: DailyReport): string {
  const lines: string[] = [];

  // Encabezado
  lines.push(`📊 *Reporte del día — ${report.date}*`);
  lines.push("");

  // Ventas y pedidos
  lines.push(`💰 *Ventas:* ${fmtMoney(report.totalSales)} (${report.totalOrders} pedido${report.totalOrders !== 1 ? "s" : ""})`);
  lines.push(`🧾 *Ticket promedio:* ${fmtMoney(report.averageTicket)}`);
  lines.push("");

  // Top productos
  if (report.topProducts.length > 0) {
    lines.push("🏆 *Top productos:*");
    report.topProducts.slice(0, 5).forEach((p, i) => {
      lines.push(`${i + 1}. ${p.name} — ${p.quantity} uds (${fmtMoney(p.revenue)})`);
    });
    lines.push("");
  }

  // Métodos de pago
  const methods = Object.entries(report.paymentMethods).filter(([, v]) => v > 0);
  if (methods.length > 0) {
    lines.push("💳 *Métodos de pago:*");
    for (const [method, amount] of methods) {
      const label = method.charAt(0).toUpperCase() + method.slice(1);
      lines.push(`• ${label}: ${fmtMoney(amount)}`);
    }
    lines.push("");
  }

  // Alertas
  if (report.lowStockAlerts > 0) {
    lines.push(`⚠️ *Alertas:* ${report.lowStockAlerts} producto${report.lowStockAlerts !== 1 ? "s" : ""} con stock bajo`);
  }
  if (report.pendingDeliveries > 0) {
    lines.push(`🚚 *Deliveries pendientes:* ${report.pendingDeliveries}`);
  }
  if (report.newCustomers > 0) {
    lines.push(`👥 *Clientes nuevos:* ${report.newCustomers}`);
  }
  if (report.lowStockAlerts > 0 || report.pendingDeliveries > 0 || report.newCustomers > 0) {
    lines.push("");
  }

  // Saldo en caja
  lines.push(`💵 *Saldo en caja:* ${fmtMoney(report.cashBalance)}`);
  lines.push("");
  lines.push("_Enviado desde Buleje ERP_");

  return lines.join("\n");
}
