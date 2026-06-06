import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { AssetsDB } from "@/lib/db/assets.db";
import { logger } from "@/lib/logger";
import { assertCsrf } from "@/lib/auth/csrf";

/**
 * GET  /api/admin/assets/[id]/maintenance  → planes de mantenimiento + estado
 * POST /api/admin/assets/[id]/maintenance  → crea un plan de mantenimiento
 */

const CreateBody = z.object({
  title:         z.string().min(1).max(120),
  intervalHours: z.number().int().min(1).max(100000).optional().nullable(),
  intervalDays:  z.number().int().min(1).max(3650).optional().nullable(),
  lastDoneHours: z.number().min(0).max(9999999).optional().nullable(),
  lastDoneAt:    z.string().max(40).optional().nullable(),
  notes:         z.string().max(1000).optional().nullable(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    if (!(await AssetsDB.assertOwned(auth.tenantId, id))) return NextResponse.json({ error: "Activo no encontrado" }, { status: 404 });
    const data = await AssetsDB.listMaintenance(auth.tenantId, id);
    return NextResponse.json({ data });
  } catch (err) {
    logger.error("[assets] maintenance list failed", { err: String(err), id });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = CreateBody.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  try {
    if (!(await AssetsDB.assertOwned(auth.tenantId, id))) return NextResponse.json({ error: "Activo no encontrado" }, { status: 404 });
    const row = await AssetsDB.addMaintenance(auth.tenantId, { assetId: id, ...parsed.data });
    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    logger.error("[assets] maintenance create failed", { err: String(err), id });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
