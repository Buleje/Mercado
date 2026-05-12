import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";

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
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "fiados-cobro-masivo"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const tenantId = auth.tenantId;

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
    const results: { fiadoId: string; montoPagado: number; nuevoSaldo: number; status: string; customerId: string }[] = [];

    // Execute all payments in a single transaction.
    // SECURITY 2026-05-07 (extension Y1): tenantId en update where + decrement
    // atomic en lugar de read-then-write para cerrar races con cobros simultaneos
    // del mismo fiado.
    await prisma.$transaction(async (tx) => {
      for (const payment of payments) {
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

        // Decrement atomico: si dos requests pasan el findFirst con el mismo
        // currentSaldo, el segundo decrement actualiza el saldo ya reducido
        // por el primero — sin sobrescritura.
        await tx.fiado.update({
          where: { id: payment.fiadoId, tenantId },
          data: { saldo: { decrement: paymentAmount } },
        });

        // Re-leer post-decrement para definir status real
        const updated = await tx.fiado.findFirst({
          where: { id: payment.fiadoId, tenantId },
          select: { saldo: true, status: true },
        });
        const finalSaldo = updated ? Number(updated.saldo) : 0;
        const newStatus = finalSaldo <= 0.01 ? "PAGADO" : fiado.status;
        if (newStatus !== fiado.status) {
          await tx.fiado.update({
            where: { id: payment.fiadoId, tenantId },
            data: { status: newStatus },
          });
        }

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
          nuevoSaldo: Math.max(0, finalSaldo),
          status: newStatus,
          customerId: fiado.customerId,
        });
      }
    });

    const totalCobrado = results.reduce((s, r) => s + r.montoPagado, 0);

    // Score crediticio fire-and-forget — actualiza por cada cliente cobrado.
    // Antes solo se actualizaba via cron semanal (gap del audit).
    // customerId en Fiado es el phone (por relation a Customer.phone).
    const uniqueCustomerIds = Array.from(new Set(results.map((r) => r.customerId).filter(Boolean)));
    for (const customerId of uniqueCustomerIds) {
      import("@/lib/credit/scoring-engine")
        .then(({ updateCreditProfile }) => updateCreditProfile(tenantId, customerId))
        .catch((err) => logger.warn("[fiados/cobro-masivo] updateCreditProfile failed", { customerId, err: String(err) }));
    }

    logActivity(
      "Cobro masivo", "fiado",
      `Cobro masivo de ${results.length} fiados por S/${totalCobrado.toFixed(2)}`,
      undefined, auth.username,
    ).catch((err) => logger.warn("[fiados/cobro-masivo] activity log failed", { err: String(err) }));

    return NextResponse.json({
      success: true,
      totalCobrado,
      results,
    });
  } catch (e) {
    logger.error("[fiados/cobro-masivo] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al procesar el cobro masivo" },
      { status: 500 },
    );
  }
}
