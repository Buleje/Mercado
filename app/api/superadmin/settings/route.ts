import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { DEFAULT_PLAN_PRICES } from "@/lib/plans";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";

/**
 * /api/superadmin/settings
 *
 * GET  — devuelve TODAS las platform settings (key → value).
 *        "plan-prices" siempre sale de plan-tiers (un solo precio por plan,
 *        2026-10-09): ya no se guarda acá (POST lo rechaza o lo ignora).
 *
 * POST — upserta 1 o N settings:
 *        · body = { key, value, updatedBy? }            → 1 setting
 *        · body = { settings: {...}, updatedBy? }       → N settings
 *
 * Auth: `getPlatformSession()` (NO requireAdmin — superadmin ≠ tenant admin).
 * Validación: Zod `.safeParse()` (regla CLAUDE.md #2).
 * Cache: PlatformSettingsDB invalida el prefix tras cada write.
 *
 * Fix del bug MRR fake 2026-04-09.
 */

async function requirePlatform(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getPlatformSession(token);
}

// ── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const rateLimited = applyRateLimit(req, "GENEROUS", "sa-settings-get");
  if (rateLimited) return rateLimited;

  const session = await requirePlatform(req);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const settings = await PlatformSettingsDB.getAll();

  // Un solo precio por plan (2026-10-09): siempre el de `plan-tiers`, el mismo
  // que cobra Facturación y ve el cliente. Una fila vieja de "plan-prices" en
  // la base ya no manda (no la lee nadie).
  settings["plan-prices"] = { ...DEFAULT_PLAN_PRICES };

  return NextResponse.json({ settings });
}

// ── POST ────────────────────────────────────────────────────────────────────

// Shape 1: upsert de 1 setting
const SingleSettingSchema = z.object({
  key: z.string().min(1).max(128),
  value: z.unknown(),
  updatedBy: z.string().optional(),
});

// Shape 2: upsert batch
const BatchSettingsSchema = z.object({
  settings: z.record(z.string(), z.unknown()),
  updatedBy: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const rateLimited = applyRateLimit(req, "MODERATE", "sa-settings-post");
  if (rateLimited) return rateLimited;

  const session = await requirePlatform(req);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const updatedBy = session.username;

  // ── Shape 1: single setting ──
  const single = SingleSettingSchema.safeParse(body);
  if (single.success) {
    const { key, value } = single.data;

    // Validación fuerte para "plan-prices" — nunca dejar que un payload
    // malformado rompa el cálculo del MRR en toda la plataforma.
    if (key === "plan-prices") {
      return NextResponse.json(
        {
          error: "plan_prices_fijos",
          message: "El precio de cada plan es uno solo (el que ve el cliente) y se cambia en la tabla de planes, no acá.",
        },
        { status: 409 },
      );
    }

    await PlatformSettingsDB.set(key, value, updatedBy);
    // Esta ruta escribe las MISMAS keys que /platform-config, así que revalida
    // el mismo tag: el root layout lee la marca desde ese caché.
    revalidateTag("platform-config", "max");
    return NextResponse.json({ ok: true, key, value });
  }

  // ── Shape 2: batch settings ──
  const batch = BatchSettingsSchema.safeParse(body);
  if (batch.success) {
    const sanitized: Record<string, unknown> = { ...batch.data.settings };

    // "plan-prices" ya no se guarda: un solo precio por plan (plan-tiers). Si
    // un cliente viejo lo manda en el lote, se ignora y se guarda el resto.
    delete sanitized["plan-prices"];

    await PlatformSettingsDB.setMany(sanitized, updatedBy);
    revalidateTag("platform-config", "max");
    return NextResponse.json({ ok: true, keys: Object.keys(sanitized) });
  }

  return NextResponse.json(
    {
      error: "invalid_body",
      expected: "{ key, value } OR { settings: { key: value, ... } }",
    },
    { status: 400 },
  );
}
