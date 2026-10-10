import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit-logger";

// Round 21 P0 (Security): const TENANT="main" hardcoded permitía que un admin
// de tenant B operara sobre rules del tenant "main". Reemplazado por
// auth.tenantId en cada handler (multi-tenant correcto).

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const _rl = await applyRateLimit(req, "MODERATE", "discount-rules-X"); if (_rl) return _rl;
  try {
    const auth = await requireAdmin(req, ["admin"]);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const body = await req.json();

    const rule = await prisma.discountRule.findFirst({ where: { id, tenantId: auth.tenantId } });
    if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // updateMany con tenantId guard previene write cross-tenant si el row
    // existiera con mismo id en otro tenant (defensa en profundidad).
    const result = await prisma.discountRule.updateMany({
      where: { id, tenantId: auth.tenantId },
      data: typeof body.activa === "boolean" ? { activa: body.activa } : {},
    });
    if (result.count === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const updated = await prisma.discountRule.findFirst({
      where: { id, tenantId: auth.tenantId },
    });
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Ley 29733 art. 23-25: registrar modificación de promo (quién/cuándo).
    logAudit({
      req,
      action: "UPDATE",
      entity: "Promotion",
      entityId: id,
      detail: `Regla de descuento "${updated.nombre}" actualizada (activa=${updated.activa})`,
      user: auth.username,
      tenantId: auth.tenantId,
    });

    return NextResponse.json({
      ...updated,
      categorias:  (() => { try { return JSON.parse(updated.categorias); } catch { return []; } })(),
      fechaInicio: updated.fechaInicio.toISOString().slice(0, 10),
      fechaFin:    updated.fechaFin.toISOString().slice(0, 10),
    });
  } catch (e) {
    logger.error("[discount-rules] PATCH error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const _rl = await applyRateLimit(req, "MODERATE", "discount-rules-X"); if (_rl) return _rl;
  try {
    const auth = await requireAdmin(req, ["admin"]);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    // Leer nombre antes de borrar para un detail de auditoría legible.
    const existing = await prisma.discountRule.findFirst({
      where: { id, tenantId: auth.tenantId },
      select: { nombre: true },
    });
    const result = await prisma.discountRule.deleteMany({
      where: { id, tenantId: auth.tenantId },
    });
    if (result.count === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Ley 29733 art. 23-25: registrar eliminación de promo (quién/cuándo).
    logAudit({
      req,
      action: "DELETE",
      entity: "Promotion",
      entityId: id,
      detail: `Regla de descuento "${existing?.nombre ?? id}" eliminada`,
      user: auth.username,
      tenantId: auth.tenantId,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[discount-rules] DELETE error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}
