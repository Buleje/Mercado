import { NextRequest, NextResponse } from "next/server";
import { NotificationCenterDB, visibilidadDeRol } from "@/lib/db/notification-center.db";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * PATCH /api/notification-center/[id]/read
 *
 * Marca una notificación específica como leída, sólo si ese rol la ve
 * (mismo filtro que la lista): la que no ve da 404, como la de otro negocio.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const _rl = await applyRateLimit(req, "MODERATE", "notification-center-X-read"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    // updateMany con id + tenantId + filtro del rol en el WHERE: aislamiento de
    // negocio y de rol en la misma escritura.
    const cambiadas = await NotificationCenterDB.marcarLeida(auth.tenantId, id, visibilidadDeRol(auth.role));

    if (cambiadas === 0) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
