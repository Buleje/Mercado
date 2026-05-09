import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { autoEarnLoyaltyPoints } from "@/lib/loyalty/auto-earn";
import { logActivity } from "@/lib/activity-logger";
import { toErrorPayload, newTraceId, ApiError } from "@/lib/api-error";
import { applyRateLimit } from "@/lib/rate-limit";

// ── Schema de validación ─────────────────────────────────────────────────────

const AutoEarnBodySchema = z.object({
  /** Teléfono normalizado del cliente (PK en Customer). */
  customerId: z.string().min(5, "customerId debe tener al menos 5 caracteres"),
  /** ID de la orden que originó el earning. */
  orderId: z.string().min(1, "orderId requerido"),
  /** Total de la orden en soles. Debe ser positivo. */
  orderTotal: z.number().positive("orderTotal debe ser mayor a 0"),
});

// ── POST /api/loyalty/auto-earn ───────────────────────────────────────────────

/**
 * Acredita puntos de lealtad por una compra completada.
 *
 * Requiere rol admin o cajero (quienes procesan órdenes).
 * La lógica de negocio (mínimo S/5, 1 pto/S/1, anti-duplicación) vive en
 * lib/loyalty/auto-earn.ts — este handler es solo la capa HTTP.
 *
 * Response 200:
 *   { pointsEarned, newBalance, previousTier, currentTier, tierUpgrade, transactionId }
 *
 * Response 204 (sin cuerpo):
 *   Cuando la compra no califica para puntos (monto < mínimo o ya acreditado).
 */
export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "loyalty-auto-earn"); if (_rl) return _rl;
  const traceId = newTraceId();

  try {
    // ── 1. Auth ──────────────────────────────────────────────────────────────
    const auth = await requireAdmin(req, ["admin", "cajero"]);
    if (auth instanceof NextResponse) return auth;

    // ── 2. Validación Zod (safeParse, nunca parse) ───────────────────────────
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json(
        { error: "JSON inválido", traceId },
        { status: 400 },
      );
    }

    const parsed = AutoEarnBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues, traceId },
        { status: 400 },
      );
    }

    const { customerId, orderId, orderTotal } = parsed.data;

    // ── 3. Lógica de negocio (DB class, nunca Prisma directo) ─────────────────
    const result = await autoEarnLoyaltyPoints(
      auth.tenantId,
      customerId,
      orderId,
      orderTotal,
    );

    // Sin puntos que acreditar (monto bajo o ya acreditado) → 204 No Content.
    if (!result) {
      return new NextResponse(null, { status: 204 });
    }

    // ── 4. Log de actividad fire-and-forget (CLAUDE.md regla #7) ─────────────
    logActivity(
      "loyalty_auto_earn_api",
      "Order",
      `Auto-earn: +${result.pointsEarned} pts para ${customerId.slice(-4)} — orden ${orderId.slice(-6)}`,
      orderId,
      auth.username ?? "system",
      req.headers.get("x-request-id") ?? undefined,
      auth.tenantId,
    ).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });

    return NextResponse.json({
      pointsEarned: result.pointsEarned,
      newBalance: result.newBalance,
      previousTier: result.previousTier,
      currentTier: result.currentTier,
      tierUpgrade: result.tierUpgrade,
      transactionId: result.transactionId,
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json(err.toPayload(traceId), { status: err.httpStatus });
    }
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
