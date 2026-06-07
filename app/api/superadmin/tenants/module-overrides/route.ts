import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import {
  TENANT_OVERRIDE_KEY_PREFIX,
  type TenantModuleOverrides,
} from "@/lib/tenant-module-overrides";

/**
 * GET /api/superadmin/tenants/module-overrides
 *   Bulk: cuántos módulos forzados tiene cada tenant. La tabla de
 *   /superadmin/tenants lo usa para pintar la columna "Módulos" sin
 *   disparar N requests (1 sola lectura del PlatformSetting store, cacheada).
 *
 * Respuesta: { counts: { [tenantId]: number } } — solo tenants CON override.
 */
export async function GET(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const all = await PlatformSettingsDB.getAll();
  const counts: Record<string, number> = {};
  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith(TENANT_OVERRIDE_KEY_PREFIX)) continue;
    const tenantId = key.slice(TENANT_OVERRIDE_KEY_PREFIX.length);
    const n = Object.keys((value as TenantModuleOverrides | null)?.overrides ?? {}).length;
    if (n > 0) counts[tenantId] = n;
  }
  return NextResponse.json({ counts });
}
