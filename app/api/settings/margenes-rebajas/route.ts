import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { SettingsDB } from "@/lib/db/settings.db";
import {
  CLAVE_MARGENES_REBAJAS,
  MARGENES_REBAJAS_POR_DEFECTO,
  MargenesRebajasSchema,
  ROLES_CAMBIAN_MARGENES,
  leerMargenesRebajas,
  pctTexto,
} from "@/lib/precios/margenes-rebajas";

/**
 * «Tu margen mínimo en rebajas» (`lib/precios/margenes-rebajas.ts`).
 *
 * GET — `{ pisoSobreCosto, margenMinimoSugerido, porDefecto }` (en %): los que
 *   usan Análisis › Sugerencias de precio y la IA › Precios en bloque.
 * PUT `{ pisoSobreCosto, margenMinimoSugerido }` — Ajustes › Cobros y
 *   comprobantes; sólo dueño, admin y encargado (los que aplican precios en bloque).
 *
 * Vive en `Settings.featureFlagsJson` (sin schema); sin guardar = 5 % y 15 %.
 */

export async function GET(req: NextRequest) {
  const _rl = applyRateLimit(req, "MODERATE", "settings-margenes-rebajas");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;
  try {
    const margenes = leerMargenesRebajas(await SettingsDB.getFeatureFlags(auth.tenantId));
    return NextResponse.json({ ...margenes, porDefecto: MARGENES_REBAJAS_POR_DEFECTO });
  } catch (e) {
    logger.error("[settings/margenes-rebajas] GET", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function PUT(req: NextRequest) {
  const _rl = applyRateLimit(req, "MODERATE", "settings-margenes-rebajas-put");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  if (!(ROLES_CAMBIAN_MARGENES as readonly string[]).includes(auth.role)) {
    return NextResponse.json({ error: "Sólo el dueño, un admin o el encargado lo cambia." }, { status: 403 });
  }

  const parsed = MargenesRebajasSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const margenes = parsed.data;
  try {
    await SettingsDB.pisarClavesFlags(auth.tenantId, { [CLAVE_MARGENES_REBAJAS]: margenes });
    void logActivity(
      "update",
      "settings",
      `Rebajas: piso costo + ${pctTexto(margenes.pisoSobreCosto)} · margen mínimo ${pctTexto(margenes.margenMinimoSugerido)}`,
      CLAVE_MARGENES_REBAJAS,
      auth.username,
      undefined,
      auth.tenantId,
    ).catch((err) => logger.warn("[settings/margenes-rebajas] activity", { err: String(err) }));
    return NextResponse.json(margenes);
  } catch (e) {
    logger.error("[settings/margenes-rebajas] PUT", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo guardar" }, { status: 503 });
  }
}
