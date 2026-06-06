import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { AssetsDB } from "@/lib/db/assets.db";
import { logger } from "@/lib/logger";
import { assertCsrf } from "@/lib/auth/csrf";

/**
 * PATCH  /api/admin/assets/[id]/maintenance/[mid]
 *   { action: "complete", atHours?: number }  → marca como hecho (resetea contador)
 *   { action: "update", title?, intervalHours?, intervalDays?, notes?, active? }
 * DELETE /api/admin/assets/[id]/maintenance/[mid]  → elimina el plan
 */

const Body = z.union([
  z.object({ action: z.literal("complete"), atHours: z.number().min(0).max(9999999).optional().nullable() }),
  z.object({
    action: z.literal("update"),
    title: z.string().min(1).max(120).optional(),
    intervalHours: z.number().int().min(1).max(100000).optional().nullable(),
    intervalDays: z.number().int().min(1).max(3650).optional().nullable(),
    notes: z.string().max(1000).optional().nullable(),
    active: z.boolean().optional(),
  }),
]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; mid: string }> }) {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;
  const { mid } = await params;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  try {
    let ok = false;
    if (parsed.data.action === "complete") {
      ok = await AssetsDB.completeMaintenance(auth.tenantId, mid, parsed.data.atHours ?? null);
    } else {
      const { action: _a, ...rest } = parsed.data;
      ok = await AssetsDB.updateMaintenance(auth.tenantId, mid, rest);
    }
    if (!ok) return NextResponse.json({ error: "Mantenimiento no encontrado" }, { status: 404 });
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    logger.error("[assets] maintenance update failed", { err: String(err), mid });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; mid: string }> }) {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const { mid } = await params;
  try {
    const ok = await AssetsDB.removeMaintenance(auth.tenantId, mid);
    if (!ok) return NextResponse.json({ error: "Mantenimiento no encontrado" }, { status: 404 });
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    logger.error("[assets] maintenance delete failed", { err: String(err), mid });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
