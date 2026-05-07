import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { NotasCreditoDB } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";
import { logAudit } from "@/lib/audit-logger";
import { logger } from "@/lib/logger";

const UpdateNotaCreditoSchema = z.object({
  status: z.enum(["BORRADOR", "EMITIDA", "ANULADA"]),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  try {
    const nota = await NotasCreditoDB.getById(id, auth.tenantId);
    if (!nota) {
      return NextResponse.json({ error: "Nota de crédito no encontrada" }, { status: 404 });
    }
    return NextResponse.json(nota);
  } catch (e) {
    logger.error("[notas-credito] GET by id error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  const raw = await req.json();
  const parsed = UpdateNotaCreditoSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  try {
    // SECURITY 2026-05-06 (pentest H7): validar transición de estado.
    // Antes EMITIDA → BORRADOR permitía revertir y re-emitir → duplicar
    // comprobante SUNAT. ANULADA es terminal, no debe cambiar.
    const current = await NotasCreditoDB.getById(id, auth.tenantId);
    if (!current) {
      return NextResponse.json({ error: "Nota de crédito no encontrada" }, { status: 404 });
    }
    const nextStatus = parsed.data.status;
    const VALID_TRANSITIONS: Record<string, string[]> = {
      BORRADOR: ["EMITIDA", "ANULADA"],
      EMITIDA: ["ANULADA"],
      ANULADA: [],
    };
    const allowed = VALID_TRANSITIONS[current.status] ?? [];
    if (!allowed.includes(nextStatus) && current.status !== nextStatus) {
      return NextResponse.json(
        { error: `Transición no permitida: ${current.status} → ${nextStatus}` },
        { status: 409 },
      );
    }

    const updated = await NotasCreditoDB.updateStatus(id, auth.tenantId, parsed.data.status);
    if (!updated) {
      return NextResponse.json({ error: "Nota de crédito no encontrada" }, { status: 404 });
    }

    logAudit({
      req,
      action: "UPDATE",
      entity: "Order",
      entityId: id,
      detail: `Nota de crédito ${updated.numero} cambió a status ${parsed.data.status}`,
      user: auth.username,
      tenantId: auth.tenantId,
    });

    return NextResponse.json(updated);
  } catch (e) {
    logger.error("[notas-credito] PATCH error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
