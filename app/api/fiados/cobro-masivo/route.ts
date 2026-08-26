import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { FiadosDB, FiadoConflictError } from "@/lib/db/fiados.db";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";

const PaymentItemSchema = z.object({
  fiadoId: z.string().min(1),
  monto: z.number().positive(),
});

const CobroMasivoSchema = z.object({
  payments: z
    .array(PaymentItemSchema)
    .min(1)
    .max(50)
    // Audit 2026-08-26: un fiadoId repetido en el mismo lote hacía que ambas
    // entradas decrementaran contra el mismo saldo prefetcheado (TOCTOU) —
    // rechazarlo acá es la señal más clara para el cajero, en vez de dejar
    // que la segunda ocurrencia falle silenciosa contra el guard de la DB.
    .refine(
      (payments) => new Set(payments.map((p) => p.fiadoId)).size === payments.length,
      { message: "Un mismo fiado no puede repetirse en el mismo cobro masivo" },
    ),
  notas: z.string().max(500).optional(),
});

/**
 * POST /api/fiados/cobro-masivo
 * Process batch payment across multiple fiados in a single transaction.
 *
 * Audit 2026-05-17 P1-5: toda la lógica de transacción migrada a
 * FiadosDB.cobroMasivo (regla #1 CLAUDE.md — no prisma directo en routes).
 * P1-3: races detectadas como 409 Conflict (no 503).
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
    const results = await FiadosDB.cobroMasivo(tenantId, payments, notas);
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
    if (e instanceof FiadoConflictError) {
      return NextResponse.json(
        { error: e.message, code: "FIADO_CONFLICT", retryable: true },
        { status: 409 },
      );
    }
    logger.error("[fiados/cobro-masivo] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al procesar el cobro masivo" },
      { status: 500 },
    );
  }
}
