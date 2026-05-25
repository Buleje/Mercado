import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";

const PatchSchema = z.object({
  notas: z.string().max(1000).nullable().optional(),
  cancelar: z.boolean().optional(),
});

// GET /api/adelantos/[id]
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const adelanto = await AdelantosDB.getById(auth.tenantId, id);
    if (!adelanto) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json(adelanto);
  } catch (e) {
    logger.error("[adelantos/id] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

// PATCH /api/adelantos/[id] — editar notas o cancelar
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "adelantos"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const parsed = PatchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) }, { status: 400 });
    }
    const updated = parsed.data.cancelar
      ? await AdelantosDB.cancel(auth.tenantId, id)
      : await AdelantosDB.updateNotas(auth.tenantId, id, parsed.data.notas ?? null);
    if (!updated) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    logActivity(parsed.data.cancelar ? "Cancelar" : "Editar", "adelanto", `Adelanto ${id}`, id, auth.username).catch((err) => logger.error("[adelantos] logActivity failed", { error: String(err) }));
    return NextResponse.json(updated);
  } catch (e) {
    logger.error("[adelantos/id] PATCH error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

// DELETE /api/adelantos/[id] — soft-cancel (no borra historial)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "adelantos"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const cancelled = await AdelantosDB.cancel(auth.tenantId, id);
    if (!cancelled) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    logActivity("Cancelar", "adelanto", `Adelanto ${id} cancelado`, id, auth.username).catch((err) => logger.error("[adelantos] logActivity failed", { error: String(err) }));
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[adelantos/id] DELETE error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
