export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";

const TENANT = "main";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin(req, ["admin"]);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const body = await req.json();

    const rule = await prisma.discountRule.findFirst({ where: { id, tenantId: TENANT } });
    if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const updated = await prisma.discountRule.update({
      where: { id },
      data: {
        ...(typeof body.activa === "boolean" ? { activa: body.activa } : {}),
      },
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
  try {
    const auth = await requireAdmin(req, ["admin"]);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const rule = await prisma.discountRule.findFirst({ where: { id, tenantId: TENANT } });
    if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.discountRule.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[discount-rules] DELETE error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}
