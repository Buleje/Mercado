import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";

function escapeCSV(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export async function GET(req: NextRequest) {
  const adminCheck = await requireAdmin(req);
  if (adminCheck instanceof NextResponse) return adminCheck;

  const tenantId = adminCheck.tenantId ?? "main";

  const url = req.nextUrl;
  const status = url.searchParams.get("status") || undefined;
  const from = url.searchParams.get("from") || undefined;
  const to = url.searchParams.get("to") || undefined;
  const cursor = url.searchParams.get("cursor") || undefined;
  const limitParam = parseInt(url.searchParams.get("limit") || "500", 10);
  const limit = Math.min(Math.max(limitParam, 1), 2000);

  const where: Record<string, unknown> = { tenantId };
  if (status) where.status = status;
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
  }

  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    include: { items: true },
  });

  const header = "ID,Cliente,Teléfono,Estado,Total,Método de Pago,Fecha,Productos,Notas\n";

  const rows = orders.map((o) => {
    const itemsSummary = o.items
      .map((i: { name: string; quantity: number }) => `${i.name} x${i.quantity}`)
      .join("; ");

    return [
      o.id,
      escapeCSV(o.customerName || ""),
      o.customerPhone || "",
      o.status,
      (o.total ?? 0).toFixed(2),
      o.paymentMethod || "",
      o.createdAt ? new Date(o.createdAt).toISOString() : "",
      escapeCSV(itemsSummary),
      escapeCSV(o.notes || ""),
    ].join(",");
  });

  const csv = header + rows.join("\n");
  const nextCursor = orders.length === limit ? orders[orders.length - 1].id : null;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pedidos-${new Date().toISOString().slice(0, 10)}.csv"`,
      ...(nextCursor ? { "X-Next-Cursor": nextCursor } : {}),
    },
  });
}
