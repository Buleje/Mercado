import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { FiadosDB } from "@/lib/db/fiados.db";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

const PatchFiadoSchema = z.object({
  status: z.enum(["ACTIVO", "PAGADO", "VENCIDO", "CANCELADO"]),
});

// GET /api/fiados/[id] — fiado detail with cuotas
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const fiado = await FiadosDB.getById(auth.tenantId, id);
    if (!fiado) return NextResponse.json({ error: "Fiado no encontrado" }, { status: 404 });
    if (fiado.tenantId !== auth.tenantId) {
      return NextResponse.json({ error: "Fiado no encontrado" }, { status: 404 });
    }
    return NextResponse.json(fiado);
  } catch (e) {
    logger.error("[fiados/id] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

// PATCH /api/fiados/[id] — update status
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const _rl = await applyRateLimit(req, "MODERATE", "fiados-X"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const raw = await req.json();
    const parsed = PatchFiadoSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }

    const existing = await FiadosDB.getById(auth.tenantId, id);
    if (!existing || existing.tenantId !== auth.tenantId) {
      return NextResponse.json({ error: "Fiado no encontrado" }, { status: 404 });
    }

    const updated = await FiadosDB.updateStatus(auth.tenantId, id, parsed.data.status);
    if (!updated) return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });

    logActivity(
      "Actualizar", "fiado",
      `Fiado ${id.slice(-6)} status -> ${parsed.data.status}`,
      id, auth.username,
    ).catch((err) => logger.error("[fiados] logActivity failed", { error: String(err) }));

    return NextResponse.json(updated);
  } catch (e) {
    logger.error("[fiados/id] PATCH error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
