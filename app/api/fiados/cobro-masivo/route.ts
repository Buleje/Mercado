export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-logger";

const PaymentItemSchema = z.object({
  fiadoId: z.string().min(1),
  monto: z.number().positive(),
});

const CobroMasivoSchema = z.object({
  payments: z.array(PaymentItemSchema).min(1).max(50),
  notas: z.string().max(500).optional(),
});

/**
 * POST /api/fiados/cobro-masivo
 * Process batch payment across multiple fiados in a single transaction.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const tenantId = auth.tenantId ?? "main";

  try {
    const raw = await req.json();
    const parsed = CobroMasivoSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", issues: parsed.error.issues.map(i => i.message) },
        { status: 400 },
      );
    }

    const { payments, notas } = parsed.data;
    const results: { fiadoId: string; montoPagado: number; nuevoSaldo: number; status: string }[] = [];

    // Execute all payments in a single transaction
    await prisma.$transaction(async (tx) => {
      for (const payment of payments) {
        // Find the fiado and verify it belongs to this tenant
        const fiado = await tx.fiado.findFirst({
          where: { id: payment.fiadoId, tenantId },
        });

        if (!fiado) {
          throw new Error(`Fiado ${payment.fiadoId.slice(-6)} no encontrado`);
        }

        if (fiado.status !== "ACTIVO" && fiado.status !== "VENCIDO") {
          throw new Error(`Fiado ${payment.fiadoId.slice(-6)} no esta activo`);
        }

        const currentSaldo = Number(fiado.saldo);
        const paymentAmount = Math.min(payment.monto, currentSaldo);
        const newSaldo = currentSaldo - paymentAmount;
        const newStatus = newSaldo <= 0.01 ? "PAGADO" : fiado.status;

        // Update fiado
        await tx.fiado.update({
          where: { id: payment.fiadoId },
          data: {
            saldo: Math.max(0, newSaldo),
            status: newStatus,
          },
        });

        // Create cuota record
        await tx.fiadoCuota.create({
          data: {
            fiadoId: payment.fiadoId,
            monto: paymentAmount,
            pagadoEn: new Date(),
            notas: notas || "Cobro masivo",
          },
        });

        results.push({
          fiadoId: payment.fiadoId,
          montoPagado: paymentAmount,
          nuevoSaldo: Math.max(0, newSaldo),
          status: newStatus,
        });
      }
    });

    const totalCobrado = results.reduce((s, r) => s + r.montoPagado, 0);

    logActivity(
      "Cobro masivo", "fiado",
      `Cobro masivo de ${results.length} fiados por S/${totalCobrado.toFixed(2)}`,
      undefined, auth.username,
    ).catch(() => {});

    return NextResponse.json({
      success: true,
      totalCobrado,
      results,
    });
  } catch (e) {
    console.error("[fiados/cobro-masivo] POST error", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al procesar el cobro masivo" },
      { status: 500 },
    );
  }
}
