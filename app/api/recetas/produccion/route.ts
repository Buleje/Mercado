import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// GET /api/recetas/produccion — list all production batches
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const lotes = await prisma.produccionLote.findMany({
      where: { tenantId: auth.tenantId },
      include: { receta: { select: { id: true, nombre: true } } },
      orderBy: { producidoEn: "desc" },
      take: 200,
    });

    const mapped = lotes.map((l) => ({
      id: l.id,
      recetaId: l.recetaId,
      recetaNombre: l.receta.nombre,
      cantidad: Number(l.cantidad),
      costoReal: Number(l.costoReal),
      notas: l.notas,
      producidoEn: l.producidoEn.toISOString(),
      createdAt: l.producidoEn.toISOString(),
    }));

    return NextResponse.json(mapped);
  } catch (e) {
    logger.error("[recetas/produccion] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
