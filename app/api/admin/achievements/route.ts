/**
 * /api/admin/achievements
 *
 * GET — devuelve los logros desbloqueados del tenant (Record<id, fechaISO>).
 * PUT — merge: agrega los nuevos al objeto actual (no reemplaza todo).
 *
 * Persistencia: Settings.storeTheme.achievements (sub-objeto JSON).
 * Eligimos esta ruta en vez de crear modelo Prisma nuevo para no requerir
 * migration de Supabase (que está pendiente). Cuando se aplique migrate,
 * mover a una tabla AdminAchievement dedicada.
 *
 * SECURITY 2026-05-07: requireAdmin (admin/owner/manager) + applyRateLimit.
 *
 * Reemplaza el patron viejo de localStorage[`achievements:${slug}`] que
 * mezclaba achievements entre dispositivos del mismo dueño y se perdia al
 * limpiar cache.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { SettingsDB } from "@/lib/db/settings.db";
import { logger } from "@/lib/logger";
import { assertCsrf } from "@/lib/auth/csrf";

const PutBodySchema = z.object({
  achievements: z.record(z.string(), z.string()),
});

export async function GET(req: NextRequest) {
  const _rl = applyRateLimit(req, "GENEROUS", "achievements-get");
  if (_rl) return _rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;

  const auth = await requireAdmin(req, ["admin", "owner", "manager", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const settings = await SettingsDB.get(auth.tenantId);
    const theme = (settings?.storeTheme ?? {}) as Record<string, unknown>;
    const raw = (theme.achievements as Record<string, unknown> | undefined) ?? {};
    // Sanitize: solo strings -> strings.
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof k === "string" && typeof v === "string") clean[k] = v;
    }
    return NextResponse.json({ achievements: clean });
  } catch (err) {
    logger.error("[achievements GET] failed", { err: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ achievements: {} });
  }
}

export async function PUT(req: NextRequest) {
  const _rl = applyRateLimit(req, "MODERATE", "achievements-put");
  if (_rl) return _rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;

  const auth = await requireAdmin(req, ["admin", "owner", "manager", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try { body = await req.json(); } catch { body = {}; }
  const parsed = PutBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const current = await SettingsDB.get(auth.tenantId);
    const theme = (current?.storeTheme ?? {}) as Record<string, unknown>;
    const existing = (theme.achievements as Record<string, string> | undefined) ?? {};
    // Merge: solo escribir IDs nuevos, no pisar fechas viejas.
    const merged: Record<string, string> = { ...existing };
    for (const [k, v] of Object.entries(parsed.data.achievements)) {
      if (!merged[k]) merged[k] = v;
    }

    await SettingsDB.set(
      {
        ...current,
        storeTheme: { ...theme, achievements: merged } as never,
      },
      auth.tenantId,
    );

    logger.info("[achievements PUT] merged", {
      tenantId: auth.tenantId,
      total: Object.keys(merged).length,
      newCount: Object.keys(merged).length - Object.keys(existing).length,
    });

    return NextResponse.json({ achievements: merged });
  } catch (err) {
    logger.error("[achievements PUT] failed", { err: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
