import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { prisma } from "@/lib/prisma";

const CommissionPostSchema = z.object({
  orderId: z.string().min(1, "orderId requerido"),
  storeId: z.string().optional(),
  partnerId: z.string().optional(),
  type: z.string().min(1, "type requerido").max(50),
  amount: z.number().positive("El monto debe ser positivo"),
  rate: z.number().min(0).max(1, "La tasa debe estar entre 0 y 1"),
});

const CommissionSettleSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "Se requiere al menos un id").max(100),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get("storeId");
    const status = searchParams.get("status");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const where: Record<string, unknown> = {};
    if (storeId) where.storeId = storeId;
    if (status) where.status = status;
    if (from || to) {
      where.createdAt = {
        ...(from && { gte: new Date(from) }),
        ...(to && { lte: new Date(to) }),
      };
    }

    const [commissions, aggregates] = await Promise.all([
      prisma.commissionLedger.findMany({
        where,
        orderBy: { createdAt: "desc" },
      }),
      prisma.commissionLedger.groupBy({
        by: ["status"],
        where,
        _sum: { amount: true },
      }),
    ]);

    // Totales agregados por status
    const totals = { totalPending: 0, totalSettled: 0, totalPaid: 0 };
    for (const row of aggregates) {
      const sum = row._sum.amount ?? 0;
      if (row.status === "pending") totals.totalPending = sum;
      else if (row.status === "settled") totals.totalSettled = sum;
      else if (row.status === "paid") totals.totalPaid = sum;
    }

    return NextResponse.json({ data: commissions, totals });
  } catch {
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const raw = await req.json();
    const parsed = CommissionPostSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }

    const commission = await prisma.commissionLedger.create({
      data: { ...parsed.data, tenantId: auth.tenantId },
    });

    logActivity(
      "Crear",
      "commissionLedger",
      `Comisión registrada: ${commission.type} — S/${commission.amount} (orden ${commission.orderId})`,
      commission.id,
      auth.username
    ).catch(() => {});

    return NextResponse.json(commission, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const raw = await req.json();
    const parsed = CommissionSettleSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }

    const { ids } = parsed.data;
    const settledAt = new Date();

    const result = await prisma.commissionLedger.updateMany({
      where: { id: { in: ids }, status: "pending" },
      data: { status: "settled", settledAt },
    });

    logActivity(
      "Liquidar",
      "commissionLedger",
      `${result.count} comisiones liquidadas (ids: ${ids.slice(0, 3).join(", ")}${ids.length > 3 ? "…" : ""})`,
      undefined,
      auth.username
    ).catch(() => {});

    return NextResponse.json({ settled: result.count, settledAt });
  } catch {
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}
