import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { AssetsDB } from "@/lib/db/assets.db";
import { logger } from "@/lib/logger";
import { assertCsrf } from "@/lib/auth/csrf";

/**
 * GET  /api/admin/assets/[id]/inspections  → historial de checklists
 * POST /api/admin/assets/[id]/inspections  → guarda un checklist pre/post alquiler
 */

const CreateBody = z.object({
  kind:   z.enum(["salida", "retorno"]).optional(),
  client: z.string().max(150).optional().nullable(),
  hours:  z.number().min(0).max(9999999).optional().nullable(),
  items:  z.array(z.object({ label: z.string().max(120), ok: z.boolean() })).max(40),
  notes:  z.string().max(1000).optional().nullable(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    if (!(await AssetsDB.assertOwned(auth.tenantId, id))) return NextResponse.json({ error: "Activo no encontrado" }, { status: 404 });
    const data = await AssetsDB.listInspections(auth.tenantId, id);
    return NextResponse.json({ data });
  } catch (err) {
    logger.error("[assets] inspections list failed", { err: String(err), id });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = CreateBody.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  try {
    if (!(await AssetsDB.assertOwned(auth.tenantId, id))) return NextResponse.json({ error: "Activo no encontrado" }, { status: 404 });
    const row = await AssetsDB.addInspection(auth.tenantId, { assetId: id, ...parsed.data });
    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    logger.error("[assets] inspection create failed", { err: String(err), id });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
