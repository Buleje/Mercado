export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PrestamosDB } from "@/lib/db/prestamos.db";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";

const RefinanciarSchema = z.object({
  nuevaTasa: z.number().min(0).max(100).optional(),
  nuevasCuotas: z.number().int().min(1).max(120),
  sistema: z.enum(["FRANCES", "ALEMAN", "AMERICANO"]).optional(),
});

// POST /api/prestamos/[id]/refinanciar — refinance active loan
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const raw = await req.json();
    const parsed = RefinanciarSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }

    const existing = await PrestamosDB.getById(id);
    if (!existing || existing.tenantId !== auth.tenantId) {
      return NextResponse.json({ error: "Préstamo no encontrado" }, { status: 404 });
    }

    if (existing.status !== "ACTIVO") {
      return NextResponse.json(
        { error: "Solo se pueden refinanciar préstamos activos" },
        { status: 422 },
      );
    }

    const updated = await PrestamosDB.refinanciar(id, parsed.data);
    if (!updated) {
      return NextResponse.json({ error: "Error al refinanciar" }, { status: 500 });
    }

    logActivity(
      "Refinanciar", "prestamo",
      `Préstamo ${id.slice(-6)} refinanciado: ${parsed.data.nuevasCuotas} cuotas`,
      id, auth.username,
    ).catch(() => {});

    return NextResponse.json(updated);
  } catch (e) {
    logger.error("[prestamos/id/refinanciar] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
