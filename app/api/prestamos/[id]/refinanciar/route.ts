import { NextRequest, NextResponse } from "next/server";
import { PrestamosDB } from "@/lib/db/prestamos.db";
import { requireAdmin } from "@/lib/require-admin";
import { ROLES_PRESTAMOS } from "@/lib/prestamos/roles";
// El contrato vive con el armador del cuerpo que usa el modal (mismos nombres).
import { RefinanciarSchema } from "@/lib/prestamos/refinanciar";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";

// POST /api/prestamos/[id]/refinanciar — refinance active loan
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "prestamos-X-refinanciar"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ROLES_PRESTAMOS);
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

    const existing = await PrestamosDB.getById(auth.tenantId, id);
    if (!existing || existing.tenantId !== auth.tenantId) {
      return NextResponse.json({ error: "Préstamo no encontrado" }, { status: 404 });
    }

    if (existing.status !== "ACTIVO") {
      return NextResponse.json(
        { error: "Solo se pueden refinanciar préstamos activos" },
        { status: 422 },
      );
    }

    const updated = await PrestamosDB.refinanciar(auth.tenantId, id, parsed.data);
    if (!updated) {
      return NextResponse.json({ error: "Error al refinanciar" }, { status: 500 });
    }

    logActivity(
      "Refinanciar", "prestamo",
      `Préstamo ${id.slice(-6)} refinanciado: ${parsed.data.nuevasCuotas} cuotas`,
      id, auth.username,
    ).catch((err) => logger.error("[prestamos/refinanciar] logActivity failed", { error: String(err) }));

    return NextResponse.json(updated);
  } catch (e) {
    logger.error("[prestamos/id/refinanciar] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
