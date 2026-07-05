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

const PatchBodySchema = z.object({
  userId: z.string().min(1),
  action: z.enum(["cancel", "extend"]),
  months: z.coerce.number().int().min(1).max(24).optional(),
  reason: z.string().max(500).optional(),
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

/**
 * PATCH /api/admin/socio/members
 * Body: { userId, action: "cancel" | "extend", months?, reason? }
 *
 * Acciones de admin sobre una membresía Socio Buleje. `cancel` la cancela de
 * inmediato; `extend` suma `months` meses al período. Requiere rol admin.
 */
export async function PATCH(req: NextRequest) {
  const traceId = newTraceId();
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const raw = await req.json().catch(() => null);
    const parsed = PatchBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Parámetros inválidos", details: parsed.error.flatten(), traceId } },
        { status: 400 },
      );
    }

    const { userId, action, months, reason } = parsed.data;
    let member;
    if (action === "cancel") {
      member = await SocioBulejeDB.cancel(auth.tenantId, userId, reason, true);
    } else {
      if (!months) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "Falta 'months' para extender", traceId } },
          { status: 400 },
        );
      }
      member = await SocioBulejeDB.extendPeriod(auth.tenantId, userId, months);
    }

    if (!member) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Miembro no encontrado", traceId } },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, member, traceId });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    logger.warn("[api/admin/socio/members PATCH] error", {
      traceId,
      tenantId: auth.tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(payload, { status });
  }
}
