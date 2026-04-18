import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { SocioBulejeDB } from "@/lib/db/socio-buleje.db";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

/**
 * GET /api/admin/socio/members?limit=50&offset=0
 *
 * Lista paginada de miembros Socio Buleje para el panel admin con balances
 * hidratados del ledger. Requiere rol admin. ADR-078.
 */
export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const parsed = ListQuerySchema.safeParse({
      limit: searchParams.get("limit") ?? undefined,
      offset: searchParams.get("offset") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Parámetros inválidos", details: parsed.error.flatten(), traceId } },
        { status: 400 },
      );
    }

    const { limit, offset } = parsed.data;
    const { members, total } = await SocioBulejeDB.listMembers(
      auth.tenantId,
      limit ?? 50,
      offset ?? 0,
    );

    return NextResponse.json({ ok: true, members, total, traceId });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    logger.warn("[api/admin/socio/members] error", {
      traceId,
      tenantId: auth.tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(payload, { status });
  }
}
