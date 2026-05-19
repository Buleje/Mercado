import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { FiadosDB, FiadoConflictError } from "@/lib/db/fiados.db";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";

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
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "fiados-cobrar"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const tenantId = auth.tenantId;

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

    const result = await FiadosDB.cobrarPorCliente(tenantId, customerPhone, monto, notas);

    if (result.payments.length === 0) {
      return NextResponse.json(
        { error: "No hay fiados activos para este cliente" },
        { status: 404 }
      );
    }

    // Score crediticio fire-and-forget — refleja en tiempo real la mejora
    // por pago. Antes solo se actualizaba via cron semanal (gap del audit).
    import("@/lib/credit/scoring-engine")
      .then(({ updateCreditProfile }) => updateCreditProfile(tenantId, customerPhone))
      .catch((err) => logger.warn("[fiados/cobrar] updateCreditProfile failed", { customerPhone, err: String(err) }));

    return NextResponse.json({
      success: true,
      totalCobrado: result.totalCobrado,
      payments: result.payments,
      remaining: result.remaining,
    });
  } catch (e) {
    // Audit 2026-05-17 P1-3: race-condition de Prisma → 409 Conflict.
    if (e instanceof FiadoConflictError) {
      return NextResponse.json(
        { error: e.message, code: "FIADO_CONFLICT", retryable: true },
        { status: 409 }
      );
    }
    logger.error("[Fiados Cobrar] unexpected error", { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
