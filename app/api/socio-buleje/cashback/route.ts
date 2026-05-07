import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { CashbackHistoryQuerySchema } from "@/lib/validators/socio-buleje";
import { SocioBulejeDB } from "@/lib/db/socio-buleje.db";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logger } from "@/lib/logger";

/**
 * GET /api/socio-buleje/cashback?userId=...&limit=20
 *
 * Devuelve historial de cashback (ledger append-only) + balance actual. ADR-078.
 */
export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const { searchParams } = new URL(req.url);
    const parsed = CashbackHistoryQuerySchema.safeParse({
      userId: searchParams.get("userId"),
      limit: searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Parámetros inválidos", details: parsed.error.flatten(), traceId } },
        { status: 400 },
      );
    }

    const tenantId = req.headers.get("x-tenant-id") ?? "main";
    const { userId, limit } = parsed.data;

    // SECURITY/CRITICAL 2026-05-06 (pentest H002): autorización obligatoria.
    // Antes el endpoint era anónimo — atacante con userId target leía
    // balance + ledger de cualquier víctima. Exige customer-session con
    // phone matching el userId, o admin del tenant.
    const { CUSTOMER_SESSION, getCustomerPayload } = await import("@/lib/auth/customer-session");
    const { tryAdmin } = await import("@/lib/require-admin");
    const admin = await tryAdmin(req);
    let authorized = false;
    if (admin && admin.tenantId === tenantId) {
      authorized = true;
    } else {
      const sessionToken = req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)?.value;
      if (sessionToken) {
        const payload = await getCustomerPayload(sessionToken);
        const sessionId = (payload?.customerId ?? "").replace(/\D/g, "");
        const queryId = String(userId).replace(/\D/g, "");
        if (sessionId && sessionId === queryId) authorized = true;
      }
    }
    if (!authorized) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const [entries, balance] = await Promise.all([
      SocioBulejeDB.getCashbackHistory(tenantId, userId, limit ?? 20),
      SocioBulejeDB.getCashbackBalance(tenantId, userId),
    ]);

    return NextResponse.json({ ok: true, entries, balance, traceId });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    logger.warn("[api/socio-buleje/cashback] error", {
      traceId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(payload, { status });
  }
}
