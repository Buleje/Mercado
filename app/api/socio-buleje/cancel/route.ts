import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { CancelBodySchema } from "@/lib/validators/socio-buleje";
import { SocioBulejeDB } from "@/lib/db/socio-buleje.db";

/**
 * POST /api/socio-buleje/cancel
 *
 * Cancela una membership. El beneficio sigue activo hasta endDate.
 * Body: { userId, reason? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = CancelBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const tenantId = req.headers.get("x-tenant-id") ?? "main";
    const { userId } = parsed.data;
    const membership = await SocioBulejeDB.cancel(tenantId, userId);

    if (!membership) {
      return NextResponse.json({ error: "Membership no encontrada" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, membership });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
