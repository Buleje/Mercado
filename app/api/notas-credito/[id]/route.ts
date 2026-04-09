import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { NotasCreditoDB } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";
import { logAudit } from "@/lib/audit-logger";

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
    console.error("[notas-credito] GET by id error:", e);
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
    console.error("[notas-credito] PATCH error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
