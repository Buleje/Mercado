import { NextRequest, NextResponse } from "next/server";
import { NotificationCenterDB, visibilidadDeRol } from "@/lib/db/notification-center.db";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * PATCH /api/notification-center/read-all
 *
 * Marca como leídas todas las que ESTE rol ve en la campana (mismo filtro que
 * la lista): el «marcar todas» del cajero no apaga los avisos de Cámaras ni los
 * HIGH del dueño.
 */
export async function PATCH(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "notification-center-read-all"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const tenantId = auth.tenantId;

  try {
    const updated = await NotificationCenterDB.marcarTodasLeidas(tenantId, visibilidadDeRol(auth.role));

    return NextResponse.json({ ok: true, updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
