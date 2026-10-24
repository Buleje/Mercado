import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { getFeatureAdoption } from "@/lib/db/feature-adoption.db";
import { logger } from "@/lib/logger";

/**
 * GET /api/superadmin/feature-adoption — adopción de funciones por negocio
 * (Brandon 2026-06-19, idea #4): qué módulos usa cada tienda + oportunidades de
 * coaching/upsell. Datos reales derivados de ActivityLog.
 */
export async function GET(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const data = await getFeatureAdoption();
    return NextResponse.json({ ...data, generatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    logger.error("[superadmin/feature-adoption] GET", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
