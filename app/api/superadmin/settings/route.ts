import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { DEFAULT_PLAN_PRICES, type PlanId } from "@/lib/plans";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";

/**
 * /api/superadmin/settings
 *
 * GET  — devuelve TODAS las platform settings (key → value).
 *        Si "plan-prices" no existe aún, devuelve los defaults canónicos
 *        para que el formulario del superadmin tenga algo que editar.
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

  // Seed en caliente: si no hay "plan-prices" todavía (migración no corrida o
  // fresh install), devolvemos los defaults para que el frontend tenga algo que
  // mostrar. No escribimos — el primer POST persiste el row.
  if (!settings["plan-prices"]) {
    settings["plan-prices"] = { ...DEFAULT_PLAN_PRICES };
  }

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

const PlanPricesSchema = z.object({
  free: z.number().min(0).max(100_000),
  pro: z.number().min(0).max(100_000),
  business: z.number().min(0).max(100_000),
  enterprise: z.number().min(0).max(100_000),
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
      const priceCheck = PlanPricesSchema.safeParse(value);
      if (!priceCheck.success) {
        return NextResponse.json(
          { error: "invalid_plan_prices", detail: priceCheck.error.flatten() },
          { status: 400 },
        );
      }
      await PlatformSettingsDB.set("plan-prices", priceCheck.data, updatedBy);
      return NextResponse.json({ ok: true, key, value: priceCheck.data });
    }

    await PlatformSettingsDB.set(key, value, updatedBy);
    return NextResponse.json({ ok: true, key, value });
  }

  // ── Shape 2: batch settings ──
  const batch = BatchSettingsSchema.safeParse(body);
  if (batch.success) {
    const sanitized: Record<string, unknown> = { ...batch.data.settings };

    // Si el batch incluye "plan-prices", valídalo antes de tocar la DB.
    if ("plan-prices" in sanitized) {
      const priceCheck = PlanPricesSchema.safeParse(sanitized["plan-prices"]);
      if (!priceCheck.success) {
        return NextResponse.json(
          { error: "invalid_plan_prices", detail: priceCheck.error.flatten() },
          { status: 400 },
        );
      }
      sanitized["plan-prices"] = priceCheck.data satisfies Record<PlanId, number>;
    }

    await PlatformSettingsDB.setMany(sanitized, updatedBy);
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
