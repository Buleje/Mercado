import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CotizacionesDB } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";
import { logAudit } from "@/lib/audit-logger";

const UpdateCotizacionSchema = z.object({
  status: z.enum(["BORRADOR", "ENVIADA", "ACEPTADA", "RECHAZADA", "VENCIDA", "CONVERTIDA"]).optional(),
  notas: z.string().max(2000).optional(),
  validoHasta: z.string().datetime({ offset: true }).or(z.string().min(10)).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  try {
    const cotizacion = await CotizacionesDB.getById(id, auth.tenantId);
    if (!cotizacion) {
      return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
    }
    return NextResponse.json(cotizacion);
  } catch (e) {
    console.error("[cotizaciones] GET by id error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  const raw = await req.json();
  const parsed = UpdateCotizacionSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  try {
    const updated = await CotizacionesDB.update(id, auth.tenantId, {
      status: parsed.data.status,
      notas: parsed.data.notas,
      validoHasta: parsed.data.validoHasta ? new Date(parsed.data.validoHasta) : undefined,
    });
    if (!updated) {
      return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
    }

    logAudit({
      req,
      action: "UPDATE",
      entity: "Order",
      entityId: id,
      detail: `Cotización ${updated.numero} actualizada: ${JSON.stringify(parsed.data)}`,
      user: auth.username,
      tenantId: auth.tenantId,
    });

    return NextResponse.json(updated);
  } catch (e) {
    console.error("[cotizaciones] PATCH error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  try {
    const deleted = await CotizacionesDB.delete(id, auth.tenantId);
    if (!deleted) {
      return NextResponse.json(
        { error: "Cotización no encontrada o no está en estado BORRADOR" },
        { status: 404 }
      );
    }

    logAudit({
      req,
      action: "DELETE",
      entity: "Order",
      entityId: id,
      detail: `Cotización eliminada`,
      user: auth.username,
      tenantId: auth.tenantId,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[cotizaciones] DELETE error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
