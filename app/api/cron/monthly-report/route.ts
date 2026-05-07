import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";
import { toNumOrZero } from "@/lib/decimal-utils";
import nodemailer from "nodemailer";

/**
 * GET /api/cron/monthly-report
 *
 * Genera el reporte mensual del mes anterior y lo envía por email al ownerEmail
 * del Tenant principal. También puede ser invocado manualmente desde el panel.
 *
 * Vercel cron: "0 6 1 * *" (día 1 de cada mes a las 06:00 UTC)
 * Autorización: Bearer <CRON_SECRET>
 *
 * Query opcional: ?tenantId=xxx&year=2024&month=3   (para forzar mes/año)
 */

// ── Tipos internos ──────────────────────────────────────────────────────────

interface TopProduct {
  name:     string;
  revenue:  number;
  quantity: number;
}

interface TopCustomer {
  name:  string;
  phone: string;
  total: number;
}

interface ReportData {
  tenantId:       string;
  tenantName:     string;
  period:         string; // "Marzo 2025"
  year:           number;
  month:          number; // 1-12
  ingresos:       number;
  gastos:         number;
  utilidad:       number;
  margenPct:      number;
  topProductos:   TopProduct[];
  topClientes:    TopCustomer[];
  fiadosTotal:    number;
  fiadosCobrados: number;
  fiadosVencidos: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

function fmt(n: number): string {
  return `S/ ${n.toFixed(2)}`;
}

// ── Construcción del reporte ─────────────────────────────────────────────────

async function buildMonthlyReport(
  tenantId: string,
  year: number,
  month: number, // 1-12
): Promise<ReportData> {
  const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const endDate   = new Date(year, month,     0, 23, 59, 59, 999); // último día del mes

  const tenant = await prisma.tenant.findUnique({
    where:  { id: tenantId },
    select: { name: true, ownerEmail: true },
  });

  const tenantName = tenant?.name ?? tenantId;
  const period     = `${MONTH_NAMES[month - 1]} ${year}`;

  // Ventas e ingresos (pedidos entregados)
  const orders = await prisma.order.findMany({
    where: {
      tenantId,
      createdAt: { gte: startDate, lte: endDate },
      status:    { not: "cancelado" },
    },
    include: {
      items:    true,
      customer: { select: { name: true, phone: true } },
    },
  });

  const ingresos = orders.reduce((sum, o) => sum + toNumOrZero(o.total), 0);

  // Gastos operativos del mes
  const expenses = await prisma.expense.findMany({
    where: {
      tenantId,
      date: { gte: startDate, lte: endDate },
    },
    select: { amount: true },
  });
  const gastos   = expenses.reduce((sum, e) => sum + toNumOrZero(e.amount), 0);
  const utilidad = ingresos - gastos;
  const margenPct = ingresos > 0 ? (utilidad / ingresos) * 100 : 0;

  // Top 10 productos por revenue
  const productRevMap = new Map<string, { revenue: number; quantity: number }>();
  for (const order of orders) {
    for (const item of order.items) {
      const key  = item.name;
      const prev = productRevMap.get(key) ?? { revenue: 0, quantity: 0 };
      productRevMap.set(key, {
        revenue:  prev.revenue  + toNumOrZero(item.price) * item.quantity,
        quantity: prev.quantity + item.quantity,
      });
    }
  }
  const topProductos: TopProduct[] = [...productRevMap.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // Top 5 clientes por gasto
  const clienteMap = new Map<string, { name: string; phone: string; total: number }>();
  for (const order of orders) {
    if (!order.customer) continue;
    const key  = order.customer.phone;
    const prev = clienteMap.get(key) ?? { name: order.customer.name, phone: key, total: 0 };
    clienteMap.set(key, { ...prev, total: prev.total + toNumOrZero(order.total) });
  }
  const topClientes: TopCustomer[] = [...clienteMap.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // Fiados del mes
  const fiadosSummary = await prisma.fiado.aggregate({
    where: { tenantId, createdAt: { gte: startDate, lte: endDate } },
    _sum:  { total: true, saldo: true },
  });
  const fiadosTotal    = toNumOrZero(fiadosSummary._sum.total);
  const fiadosSaldoPendiente = toNumOrZero(fiadosSummary._sum.saldo);
  const fiadosCobrados = fiadosTotal - fiadosSaldoPendiente;

  const fiadosVencidosCount = await prisma.fiado.count({
    where: {
      tenantId,
      status:    "VENCIDO",
      createdAt: { gte: startDate, lte: endDate },
    },
  });

  return {
    tenantId,
    tenantName,
    period,
    year,
    month,
    ingresos,
    gastos,
    utilidad,
    margenPct,
    topProductos,
    topClientes,
    fiadosTotal,
    fiadosCobrados,
    fiadosVencidos: fiadosVencidosCount,
  };
}

// ── Generación del PDF con jsPDF ─────────────────────────────────────────────

async function generatePdfBuffer(report: ReportData): Promise<Buffer> {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc     = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const primary = [45, 106, 79] as [number, number, number];   // var(--accent)
  const dark    = [30, 30, 30]  as [number, number, number];

  let y = 20;

  // ── Encabezado ──────────────────────────────────────────────────────────
  doc.setFillColor(...primary);
  doc.rect(0, 0, 210, 35, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Reporte Mensual", 15, 15);

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(report.tenantName, 15, 23);
  doc.text(`Periodo: ${report.period}`, 15, 30);

  // ── KPIs ────────────────────────────────────────────────────────────────
  y = 48;
  doc.setTextColor(...dark);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("Resumen Financiero", 15, y);
  y += 8;

  const kpis = [
    ["Ingresos totales",  fmt(report.ingresos)],
    ["Gastos operativos", fmt(report.gastos)],
    ["Utilidad neta",     fmt(report.utilidad)],
    ["Margen %",          `${report.margenPct.toFixed(1)}%`],
  ];

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  for (const [label, value] of kpis) {
    doc.text(label,  15, y);
    doc.setFont("helvetica", "bold");
    doc.text(value, 100, y);
    doc.setFont("helvetica", "normal");
    y += 7;
  }
  y += 5;

  // ── Top 10 productos ────────────────────────────────────────────────────
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...dark);
  doc.text("Top 10 Productos por Ventas", 15, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    head:   [["Producto", "Cantidad", "Revenue"]],
    body:   report.topProductos.map((p) => [p.name, p.quantity, fmt(p.revenue)]),
    theme:  "striped",
    headStyles: { fillColor: primary },
    styles:     { fontSize: 9 },
    margin:     { left: 15, right: 15 },
  });

  y = (doc as typeof doc & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  // ── Top 5 clientes ──────────────────────────────────────────────────────
  if (y > 230) { doc.addPage(); y = 20; }

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...dark);
  doc.text("Top 5 Clientes", 15, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    head:   [["Cliente", "Teléfono", "Total gastado"]],
    body:   report.topClientes.map((c) => [c.name, c.phone, fmt(c.total)]),
    theme:  "striped",
    headStyles: { fillColor: primary },
    styles:     { fontSize: 9 },
    margin:     { left: 15, right: 15 },
  });

  y = (doc as typeof doc & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  // ── Resumen fiados ──────────────────────────────────────────────────────
  if (y > 240) { doc.addPage(); y = 20; }

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...dark);
  doc.text("Resumen de Fiados", 15, y);
  y += 8;

  const fiadoRows = [
    ["Total fiado en el mes", fmt(report.fiadosTotal)],
    ["Cobrado",               fmt(report.fiadosCobrados)],
    ["Vencidos (cantidad)",   String(report.fiadosVencidos)],
  ];
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  for (const [label, value] of fiadoRows) {
    doc.text(label,  15, y);
    doc.setFont("helvetica", "bold");
    doc.text(value, 100, y);
    doc.setFont("helvetica", "normal");
    y += 7;
  }

  // ── Pie de página ───────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Generado por Buleje · ${new Date().toLocaleDateString("es-PE")} · Pág. ${i}/${pageCount}`,
      15,
      290,
    );
  }

  return Buffer.from(doc.output("arraybuffer"));
}

// ── Envío por email ──────────────────────────────────────────────────────────

async function sendReportEmail(
  toEmail:    string,
  report:     ReportData,
  pdfBuffer:  Buffer,
): Promise<void> {
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  if (!smtpUser || !smtpPass) {
    logger.warn("[cron/monthly-report] SMTP no configurado — email omitido");
    return;
  }

  const transporter = nodemailer.createTransport({
    host:   "smtp.gmail.com",
    port:   587,
    secure: false,
    auth:   { user: smtpUser, pass: smtpPass },
  });

  await transporter.sendMail({
    from:    `"Buleje" <${smtpUser}>`,
    to:      toEmail,
    subject: `Reporte mensual ${report.period} — ${report.tenantName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
        <div style="background:var(--accent);padding:20px 24px;border-radius:8px 8px 0 0;">
          <h2 style="color:#fff;margin:0;">Reporte Mensual — ${report.period}</h2>
          <p style="color:#a8d5ba;margin:4px 0 0;">${report.tenantName}</p>
        </div>
        <div style="padding:20px 24px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 8px 8px;">
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:6px 0;color:#555;">Ingresos</td>
                <td style="text-align:right;font-weight:bold;color:var(--accent);">${fmt(report.ingresos)}</td></tr>
            <tr><td style="padding:6px 0;color:#555;">Gastos</td>
                <td style="text-align:right;font-weight:bold;color:#dc2626;">${fmt(report.gastos)}</td></tr>
            <tr style="border-top:1px solid #e0e0e0;">
                <td style="padding:8px 0;font-weight:bold;">Utilidad</td>
                <td style="text-align:right;font-weight:bold;color:var(--accent);font-size:16px;">${fmt(report.utilidad)}</td></tr>
            <tr><td style="padding:4px 0;color:#555;">Margen</td>
                <td style="text-align:right;">${report.margenPct.toFixed(1)}%</td></tr>
          </table>
          <p style="font-size:13px;color:#666;margin-top:16px;">
            Se adjunta el reporte completo en PDF con top productos, clientes y resumen de fiados.
          </p>
        </div>
      </div>
    `,
    attachments: [
      {
        filename:    `reporte-${report.year}-${String(report.month).padStart(2, "0")}.pdf`,
        content:     pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
}

// ── Route Handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth   = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url      = new URL(req.url);
    const tenantId = url.searchParams.get("tenantId") ?? "main";

    // Mes anterior por defecto (o forzado por query params)
    const now          = new Date();
    const defaultYear  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const defaultMonth = now.getMonth() === 0 ? 12 : now.getMonth(); // getMonth() es 0-indexed

    const year  = parseInt(url.searchParams.get("year")  ?? String(defaultYear),  10);
    const month = parseInt(url.searchParams.get("month") ?? String(defaultMonth), 10);

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: "year y month inválidos" }, { status: 400 });
    }

    logger.info("[cron/monthly-report] Iniciando generación", { tenantId, year, month });

    const report = await buildMonthlyReport(tenantId, year, month);

    // Generar PDF
    const pdfBuffer = await generatePdfBuffer(report);

    // Obtener email del owner para envío
    const tenant = await prisma.tenant.findUnique({
      where:  { id: tenantId },
      select: { ownerEmail: true },
    });

    const ownerEmail = tenant?.ownerEmail ?? process.env.NOTIFY_EMAIL ?? process.env.SMTP_USER;

    if (ownerEmail) {
      await sendReportEmail(ownerEmail, report, pdfBuffer);
      logger.info("[cron/monthly-report] Email enviado", { to: ownerEmail });
    }

    logActivity(
      "generate",
      "monthly_report",
      `Reporte mensual ${report.period} generado — ingresos S/${report.ingresos.toFixed(2)}`,
      undefined,
      "cron",
    ).catch(() => {});

    return NextResponse.json({
      ok:         true,
      period:     report.period,
      tenantId,
      ingresos:   report.ingresos,
      gastos:     report.gastos,
      utilidad:   report.utilidad,
      emailSent:  !!ownerEmail,
      pdfSize:    pdfBuffer.byteLength,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    logger.error("[cron/monthly-report] Error fatal", { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
