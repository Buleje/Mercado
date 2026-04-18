import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { StatusQuerySchema } from "@/lib/validators/socio-buleje";
import { SocioBulejeDB } from "@/lib/db/socio-buleje.db";

/**
 * GET /api/socio-buleje/status?userId=...
 *
 * Devuelve el estado actual de la membership del usuario (o null si no tiene).
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = StatusQuerySchema.safeParse({ userId: searchParams.get("userId") });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Parámetros inválidos", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const tenantId = req.headers.get("x-tenant-id") ?? "main";
    const { userId } = parsed.data;
    const membership = await SocioBulejeDB.getMembership(tenantId, userId);

    return NextResponse.json({ ok: true, membership });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
