export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";

const CobrarSchema = z.object({
  customerPhone: z.string().min(1),
  monto: z.number().positive(),
  notas: z.string().max(500).optional(),
});

/**
 * POST /api/fiados/cobrar
 * Convenience route: cobrar fiado by customer phone.
 * Distributes the payment across active fiados oldest-first.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const tenantId = auth.tenantId ?? "main";

  try {
    const raw = await req.json();
    const parsed = CobrarSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }

    const { customerPhone, monto, notas } = parsed.data;
    let remaining = monto;

    // Get active fiados ordered by oldest first
    const fiados = await prisma.fiado.findMany({
      where: { tenantId, customerId: customerPhone, status: "ACTIVO" },
      orderBy: { createdAt: "asc" },
    });

    if (fiados.length === 0) {
      return NextResponse.json(
        { error: "No hay fiados activos para este cliente" },
        { status: 404 }
      );
    }

    const payments: { fiadoId: string; amount: number }[] = [];

    await prisma.$transaction(async (tx) => {
      for (const fiado of fiados) {
        if (remaining <= 0) break;
        const saldo = Number(fiado.saldo);
        const payment = Math.min(remaining, saldo);
        const newSaldo = saldo - payment;

        await tx.fiado.update({
          where: { id: fiado.id },
          data: {
            saldo: newSaldo,
            status: newSaldo <= 0.01 ? "PAGADO" : "ACTIVO",
          },
        });

        // Create cuota record
        await tx.fiadoCuota.create({
          data: {
            fiadoId: fiado.id,
            monto: payment,
            pagadoEn: new Date(),
            notas: notas || `Cobro desde POS`,
          },
        });

        payments.push({ fiadoId: fiado.id, amount: payment });
        remaining -= payment;
      }
    });

    return NextResponse.json({
      success: true,
      totalCobrado: monto - remaining,
      payments,
      remaining: Math.max(0, remaining),
    });
  } catch (e) {
    console.error("[Fiados Cobrar]", e);
    return NextResponse.json(
      { error: "Error al procesar el cobro" },
      { status: 500 }
    );
  }
}
