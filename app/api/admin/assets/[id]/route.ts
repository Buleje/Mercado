import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { AssetsDB } from "@/lib/db/assets.db";
import { logger } from "@/lib/logger";
import { assertCsrf } from "@/lib/auth/csrf";

/**
 * PATCH  /api/admin/assets/[id]  → edita un activo
 * DELETE /api/admin/assets/[id]  → elimina un activo (y sus movimientos vía FK cascade)
 */

const UpdateBody = z.object({
  name:          z.string().min(1).max(120).optional(),
  type:          z.string().min(1).max(40).optional(),
  plate:         z.string().max(40).optional().nullable(),
  imageUrl:      z.string().max(600).optional().nullable(),
  purchaseValue: z.number().min(0).max(99999999).optional().nullable(),
  status:        z.enum(["operativo", "mantenimiento", "parado"]).optional(),
  hourlyRate:    z.number().min(0).max(999999).optional().nullable(),
  rateUnit:      z.enum(["hora", "dia", "m3", "viaje"]).optional(),
  capacityPerDay: z.number().int().min(1).max(24).optional().nullable(),
  notes:         z.string().max(1000).optional().nullable(),
  active:        z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = UpdateBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const asset = await AssetsDB.update(auth.tenantId, id, parsed.data);
    if (!asset) return NextResponse.json({ error: "Activo no encontrado" }, { status: 404 });
    return NextResponse.json({ data: asset });
  } catch (err) {
    logger.error("[assets] update failed", { err: String(err), id });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const ok = await AssetsDB.remove(auth.tenantId, id);
    if (!ok) return NextResponse.json({ error: "Activo no encontrado" }, { status: 404 });
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    logger.error("[assets] delete failed", { err: String(err), id });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
