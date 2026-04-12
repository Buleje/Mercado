import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { LoyaltyDB } from "@/lib/db/loyalty.db";
import { toErrorPayload, newTraceId, ApiError } from "@/lib/api-error";
import { logger } from "@/lib/logger";

/**
 * GET /api/loyalty/[phone]/history — Historial público de transacciones de lealtad.
 *
 * Endpoint customer-facing con rate-limit estricto. Devuelve las últimas
 * transacciones (earn/redeem) del cliente sin requerir auth de admin.
 *
 * Query params opcionales:
 *   ?limit=20  (max 50)
 *   ?offset=0
 */

const QuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).optional().default(20),
  offset: z.coerce.number().int().nonnegative().optional().default(0),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> },
) {
  const traceId = newTraceId();

  // Rate limit: 30 requests per minute per IP
  const ip = getClientIp(req);
  const { allowed } = rateLimit(`loyalty-history:${ip}`, 30, 60);
  if (!allowed) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Intenta en un minuto.", traceId },
      { status: 429 },
    );
  }

  try {
    const { phone } = await params;
    const tenantId = req.headers.get("x-tenant-id") ?? "main";

    // Validar query params con safeParse (CLAUDE.md regla #2)
    const parsed = QuerySchema.safeParse({
      limit: req.nextUrl.searchParams.get("limit") ?? undefined,
      offset: req.nextUrl.searchParams.get("offset") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Parámetros inválidos", issues: parsed.error.issues, traceId },
        { status: 400 },
      );
    }

    const { limit, offset } = parsed.data;

    // Obtener historial del LoyaltyDB (tenantId primero, CLAUDE.md regla #3)
    const page = await LoyaltyDB.getHistory(tenantId, phone, limit, offset);

    return NextResponse.json({
      phone,
      balance: page.balance,
      transactions: page.transactions,
      total: page.total,
      limit,
      offset,
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json(err.toPayload(traceId), { status: err.httpStatus });
    }
    logger.error("[loyalty/history] GET error", {
      error: err instanceof Error ? err.message : String(err),
      traceId,
    });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
