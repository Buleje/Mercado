import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { CrecimientoNegociosDB } from "@/lib/db/crecimiento-negocios.db";
import { logger } from "@/lib/logger";

/**
 * GET /api/superadmin/tenants/onboarding
 *
 * Activación de negocios (Brandon 2026-06-14). Por negocio, qué hitos de
 * arranque completó para detectar a los estancados. Una tienda mide logo ·
 * productos · primer pedido · primera venta POS; un aserradero (se detecta por
 * sus datos) mide logo · primer ingreso de madera · primera línea del libro CTP
 * · primer lote · primera guía de salida. Todo desde datos reales.
 */
export async function GET(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if ("status" in auth) return auth;

  try {
    return NextResponse.json(await CrecimientoNegociosDB.pasosDeArranque());
  } catch (e) {
    logger.error("[tenants/onboarding] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
