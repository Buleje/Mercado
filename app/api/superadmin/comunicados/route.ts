import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { getComunicadosSegments } from "@/lib/db/comunicados.db";
import { logger } from "@/lib/logger";

/**
 * GET /api/superadmin/comunicados — segmentos inteligentes para comunicados
 * (Brandon 2026-06-19): a quién mandarle un mensaje. El envío lo hace el
 * broadcast existente (/api/superadmin/chat/broadcast) con los tenantIds.
 */
export async function GET(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;
  try {
    return NextResponse.json({ segments: await getComunicadosSegments(), generatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    logger.error("[superadmin/comunicados] GET", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
