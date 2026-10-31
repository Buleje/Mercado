import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { SettingsDB } from "@/lib/db/settings.db";
import { CLAVE_CIERRE_A_CIEGAS, ROLES_VEN_ESPERADO, cierreACiegasActivo, cuentaACiegas } from "@/lib/pos/cierre-a-ciegas";

/**
 * Cierre a ciegas (Toast «blind close»), ver `lib/pos/cierre-a-ciegas.ts`.
 *
 * GET — para las pantallas de conteo: `{ activo, ciego }`; `ciego` = esta
 *   sesión cuenta sin ver lo esperado (encendido y no es dueño ni admin).
 * PUT `{ activo }` — Configuración › Cobros › Caja; sólo dueño y admin.
 *
 * Vive en `Settings.featureFlagsJson` (sin schema); apagado por defecto.
 */

const ROLES_CAJA = ["admin", "owner", "manager", "cajero"] as const;

export async function GET(req: NextRequest) {
  const _rl = applyRateLimit(req, "SHELL_POLL", "pos-cierre-a-ciegas");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, ROLES_CAJA);
  if (auth instanceof NextResponse) return auth;
  try {
    const activo = cierreACiegasActivo(await SettingsDB.getFeatureFlags(auth.tenantId));
    return NextResponse.json({ activo, ciego: cuentaACiegas(activo, auth.role) });
  } catch (e) {
    logger.error("[pos/cierre-a-ciegas] GET", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

const PutSchema = z.object({ activo: z.boolean() });

export async function PUT(req: NextRequest) {
  const _rl = applyRateLimit(req, "MODERATE", "pos-cierre-a-ciegas-put");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, [...ROLES_VEN_ESPERADO]);
  if (auth instanceof NextResponse) return auth;

  const parsed = PutSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  try {
    await SettingsDB.pisarClavesFlags(auth.tenantId, { [CLAVE_CIERRE_A_CIEGAS]: parsed.data.activo });
    void logActivity(
      "update",
      "settings",
      `Cierre a ciegas ${parsed.data.activo ? "encendido" : "apagado"}`,
      CLAVE_CIERRE_A_CIEGAS,
      auth.username,
      undefined,
      auth.tenantId,
    ).catch((err) => logger.warn("[pos/cierre-a-ciegas] activity", { err: String(err) }));
    return NextResponse.json({ activo: parsed.data.activo });
  } catch (e) {
    logger.error("[pos/cierre-a-ciegas] PUT", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo guardar" }, { status: 503 });
  }
}
