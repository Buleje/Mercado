export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";

// GET /api/sales/export — Export sales as CSV download
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const since = url.searchParams.get("since");
  const until = url.searchParams.get("until");

  const where: Record<string, unknown> = { tenantId: auth.tenantId };
  if (since || until) {
    where.createdAt = {};
    if (since) (where.createdAt as Record<string, unknown>).gte = new Date(since);
    if (until) (where.createdAt as Record<string, unknown>).lte = new Date(until);
  }

  const sales = await prisma.sale.findMany({
    where,
    include: { items: true },
    orderBy: { createdAt: "desc" },
    take: 10000,
  });

  const headers = [
    "id", "fecha", "hora", "num_productos", "total", "costo_total",
    "margen", "margen_pct", "metodo_pago", "monto_pagado", "vuelto",
    "comprobante", "ruc", "descuento", "cajero", "telefono_cliente",
  ];
  const csvRows = [headers.join(",")];

  for (const s of sales) {
    const date = new Date(s.createdAt);
    const total = Number(s.total) || 0;
    const totalCogs = Number(s.totalCogs) || 0;
    const margin = total - totalCogs;
    const marginPct = total > 0 ? ((margin / total) * 100).toFixed(1) : "0";

    const row = [
      s.id,
      date.toISOString().slice(0, 10),
      date.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }),
      s.items.length,
      total.toFixed(2),
      totalCogs.toFixed(2),
      margin.toFixed(2),
      marginPct + "%",
      s.payment ?? "",
      s.amountPaid != null ? Number(s.amountPaid).toFixed(2) : "",
      s.change != null ? Number(s.change).toFixed(2) : "",
      s.comprobanteTipo ?? "ticket",
      s.comprobanteRuc ?? "",
      s.descuentoMonto != null ? Number(s.descuentoMonto).toFixed(2) : "0",
      s.cashierId ?? "",
      s.customerPhone ?? "",
    ].map((val) => {
      const str = String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    csvRows.push(row.join(","));
  }

  const filename = `ventas_${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csvRows.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
