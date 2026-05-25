import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";

const UpdateSchema = z.object({
  nombre: z.string().min(1).max(200),
  documento: z.string().max(20).optional(),
  telefono: z.string().max(20).optional(),
  notas: z.string().max(500).optional(),
  limiteCredito: z.number().positive().max(9_999_999).nullable().optional(),
});

// PATCH /api/adelantos/beneficiarios/[id] — editar persona
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "adelantos-benef"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const { id } = await params;
    const parsed = UpdateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) }, { status: 400 });
    }
    const benef = await AdelantosDB.updateBeneficiario(auth.tenantId, id, parsed.data);
    if (!benef) return NextResponse.json({ error: "Persona no encontrada" }, { status: 404 });
    logActivity("Actualizar", "adelanto", `Beneficiario ${benef.nombre}`, benef.id, auth.username).catch((err) => logger.error("[adelantos] logActivity failed", { error: String(err) }));
    return NextResponse.json(benef);
  } catch (e) {
    logger.error("[adelantos/beneficiarios/id] PATCH error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

// DELETE /api/adelantos/beneficiarios/[id] — eliminar persona (bloquea si tiene adelantos)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "adelantos-benef"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const { id } = await params;
    const res = await AdelantosDB.deleteBeneficiario(auth.tenantId, id);
    if (!res.ok) {
      if (res.reason === "not_found") return NextResponse.json({ error: "Persona no encontrada" }, { status: 404 });
      return NextResponse.json({ error: "No se puede eliminar: la persona tiene adelantos registrados." }, { status: 409 });
    }
    logActivity("Eliminar", "adelanto", `Beneficiario ${id}`, id, auth.username).catch((err) => logger.error("[adelantos] logActivity failed", { error: String(err) }));
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[adelantos/beneficiarios/id] DELETE error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
