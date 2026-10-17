import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { AdminDevicesDB } from "@/lib/db/admin-devices.db";
import { logger } from "@/lib/logger";

/**
 * GET /api/admin/security/devices
 *
 * Dispositivos/IP desde donde ingresó el admin (para "Último acceso" y la lista
 * de dispositivos conocidos en Configuración → Seguridad). Solo la propia cuenta.
 */
export async function GET(req: NextRequest) {
  const _rl = applyRateLimit(req, "MODERATE", "admin-security-devices");
  if (_rl) return _rl;

  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const devices = await AdminDevicesDB.listByUser(auth.tenantId, auth.username);
    return NextResponse.json({ devices });
  } catch (err) {
    logger.error("[admin/security/devices] error", { error: String(err) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
