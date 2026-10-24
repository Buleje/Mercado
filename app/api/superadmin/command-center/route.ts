import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { getCommandCenter } from "@/lib/db/command-center.db";
import { logger } from "@/lib/logger";

/**
 * GET /api/superadmin/command-center — cockpit del operador (Brandon 2026-06-19):
 * todo lo que necesita atención AHORA, en vivo, con su severidad y salto directo.
 */
export async function GET(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;
  try {
    return NextResponse.json(await getCommandCenter(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    logger.error("[superadmin/command-center] GET", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
