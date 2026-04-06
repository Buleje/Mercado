export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-logger";
import { withDbRetry } from "@/lib/db-retry";

const CreateMovementSchema = z.object({
  cashRegisterId: z.string().min(1),
  type: z.enum(["ingreso", "egreso"]),
  amount: z.number().positive(),
  motivo: z.string().max(200).optional(),
  descripcion: z.string().max(500).optional(),
});

// POST /api/cash-registers/movements — register manual cash movement
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const raw = await req.json();
    const parsed = CreateMovementSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", issues: parsed.error.issues.map(i => i.message) },
        { status: 400 },
      );
    }

    const { cashRegisterId, type, amount, motivo, descripcion } = parsed.data;

    // Verify the cash register exists and belongs to tenant
    const register = await withDbRetry(() => prisma.cashRegister.findFirst({
      where: { id: cashRegisterId, tenantId: auth.tenantId, status: "abierta" },
    }));

    if (!register) {
      return NextResponse.json(
        { error: "Caja no encontrada o no esta abierta" },
        { status: 404 },
      );
    }

    const description = [motivo, descripcion].filter(Boolean).join(" — ") || (type === "ingreso" ? "Ingreso manual" : "Egreso manual");

    const movement = await withDbRetry(() => prisma.cashMovement.create({
      data: {
        cashRegisterId,
        type,
        amount,
        method: "efectivo",
        description,
      },
    }));

    logActivity(
      "Crear", "movimiento_caja",
      `${type === "ingreso" ? "Ingreso" : "Egreso"} manual de S/${amount.toFixed(2)} — ${description}`,
      movement.id, auth.username,
    ).catch(() => {});

    return NextResponse.json(movement, { status: 201 });
  } catch (e) {
    console.error("[cash-movements] POST error", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

// GET /api/cash-registers/movements — list movements for current open register
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const cashRegisterId = searchParams.get("cashRegisterId");

    const where: Record<string, unknown> = {};

    if (cashRegisterId) {
      where.cashRegisterId = cashRegisterId;
    } else {
      // Find current open register
      const openRegister = await withDbRetry(() => prisma.cashRegister.findFirst({
        where: { tenantId: auth.tenantId, status: "abierta" },
      }));
      if (!openRegister) {
        return NextResponse.json([]);
      }
      where.cashRegisterId = openRegister.id;
    }

    const movements = await withDbRetry(() => prisma.cashMovement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
    }));

    return NextResponse.json(movements);
  } catch (e) {
    console.error("[cash-movements] GET error", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
