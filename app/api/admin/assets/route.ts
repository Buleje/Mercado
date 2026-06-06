import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { AssetsDB } from "@/lib/db/assets.db";
import { logger } from "@/lib/logger";
import { assertCsrf } from "@/lib/auth/csrf";

/**
 * Activos & Maquinaria (MVP) — Brandon 2026-06-06.
 * GET  /api/admin/assets         → lista con stats de rentabilidad
 * POST /api/admin/assets         → crea un activo
 */

const CreateBody = z.object({
  name:          z.string().min(1).max(120),
  type:          z.string().min(1).max(40),
  plate:         z.string().max(40).optional().nullable(),
  imageUrl:      z.string().max(600).optional().nullable(),
  purchaseValue: z.number().min(0).max(99999999).optional().nullable(),
  status:        z.enum(["operativo", "mantenimiento", "parado"]).optional(),
  hourlyRate:    z.number().min(0).max(999999).optional().nullable(),
  rateUnit:      z.enum(["hora", "dia", "m3", "viaje"]).optional(),
  capacityPerDay: z.number().int().min(1).max(24).optional().nullable(),
  notes:         z.string().max(1000).optional().nullable(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;
  const includeInactive = req.nextUrl.searchParams.get("includeInactive") === "true";
  try {
    const data = await AssetsDB.listWithStats(auth.tenantId, { includeInactive });
    return NextResponse.json({ data });
  } catch (err) {
    logger.error("[assets] list failed", { err: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = CreateBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const asset = await AssetsDB.create(auth.tenantId, parsed.data);
    return NextResponse.json({ data: asset }, { status: 201 });
  } catch (err) {
    logger.error("[assets] create failed", { err: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
