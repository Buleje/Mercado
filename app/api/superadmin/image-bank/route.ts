import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { ImageBankDB } from "@/lib/db/image-bank.db";
import { logger } from "@/lib/logger";

/**
 * GET /api/superadmin/image-bank
 *   Lista todo el banco (categorías + items).
 *
 * POST /api/superadmin/image-bank
 *   Crea una nueva categoría.
 */

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const categories = await ImageBankDB.list();
    return NextResponse.json({ categories });
  } catch (err) {
    logger.error("[image-bank GET] error", { err: String(err) });
    return NextResponse.json({ error: "No se pudo cargar el banco" }, { status: 500 });
  }
}

const CreateCategorySchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json().catch((err) => { logger.warn("[image-bank POST] body parse fail", { err: String(err) }); return null; });
  const parsed = CreateCategorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const category = await ImageBankDB.createCategory(parsed.data);
    return NextResponse.json({ category }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    logger.error("[image-bank POST] error", { err: msg });
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
