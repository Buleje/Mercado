import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import {
  PLATFORM_CONFIG_KEYS,
  flatToNested,
  nestedToFlat,
  type PlatformConfig,
} from "@/lib/platform-config";
import { applyRateLimit } from "@/lib/rate-limit";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { assertCsrf } from "@/lib/auth/csrf";

/**
 * GET /api/superadmin/platform-config
 *   Devuelve config completa + defaults aplicados.
 *
 * PATCH /api/superadmin/platform-config
 *   Body: parcial del PlatformConfig anidado. Sólo claves whitelisted
 *   se persisten — el resto se ignora silenciosamente.
 *
 * Auth: middleware ya validó cookie buleje-platform-sess.
 */

export async function GET() {
  const all = await PlatformSettingsDB.getAll();
  // Filtramos solo las keys que sabemos manejar (defensivo).
  const flat: Record<string, unknown> = {};
  for (const k of Object.keys(PLATFORM_CONFIG_KEYS)) {
    if (k in all) flat[k] = all[k];
  }
  const config = flatToNested(flat);
  return NextResponse.json({ config });
}

const ColorSchema = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).or(z.literal("")).nullable();
// Acepta URL absoluta (https://…), ruta relativa (/brand/logo.png) o vacío.
// Los defaults de marca usan rutas relativas → z.string().url() las rechazaba (400 en round-trip).
const UrlOrNull = z
  .string().trim().max(2048)
  .refine((v) => v === "" || v.startsWith("/") || /^https?:\/\//i.test(v), { message: "Debe ser una URL (https://…) o una ruta (/…)" })
  .nullable();

const ConfigSchema = z.object({
  payment: z.object({
    yapeNumber: z.string().max(20).nullable().optional(),
    yapeHolder: z.string().max(120).nullable().optional(),
    yapeQrUrl: UrlOrNull.optional(),
    plinNumber: z.string().max(20).nullable().optional(),
    plinHolder: z.string().max(120).nullable().optional(),
    plinQrUrl: UrlOrNull.optional(),
    bankName: z.string().max(60).nullable().optional(),
    bankAccount: z.string().max(40).nullable().optional(),
    bankAccountCCI: z.string().max(40).nullable().optional(),
    bankHolder: z.string().max(120).nullable().optional(),
  }).partial().optional(),
  brand: z.object({
    name: z.string().min(1).max(60).optional(),
    tagline: z.string().max(140).nullable().optional(),
    logoUrl: UrlOrNull.optional(),
    faviconUrl: UrlOrNull.optional(),
    primaryColor: ColorSchema.optional(),
    secondaryColor: ColorSchema.optional(),
  }).partial().optional(),
  support: z.object({
    whatsappNumber: z.string().max(20).nullable().optional(),
    supportEmail: z.string().email().or(z.literal("")).nullable().optional(),
    supportPhone: z.string().max(20).nullable().optional(),
    addressLine: z.string().max(200).nullable().optional(),
    city: z.string().max(80).nullable().optional(),
  }).partial().optional(),
  seo: z.object({
    metaDescription: z.string().max(300).nullable().optional(),
    ogImageUrl: UrlOrNull.optional(),
  }).partial().optional(),
});

export async function PATCH(req: NextRequest) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "STRICT", "superadmin-platform-config"); if (_rl) return _rl;
  // Defense-in-depth: validar sesion superadmin independiente del middleware
  const _auth = await requirePlatformAPI(req);
  if (_auth instanceof NextResponse) return _auth;
  const platformUser = _auth.username;

  let body: unknown;
  try { body = await req.json(); } catch { body = {}; }
  const parsed = ConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const flat = nestedToFlat(parsed.data as Partial<PlatformConfig>);
  // Normalizamos strings vacíos a null para que el storefront sepa
  // "no configurado" sin tener que chequear ambos.
  const normalized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(flat)) {
    normalized[k] = typeof v === "string" && v.trim() === "" ? null : v;
  }

  if (Object.keys(normalized).length === 0) {
    return NextResponse.json({ ok: true, updated: 0 });
  }

  await PlatformSettingsDB.setMany(normalized, platformUser);
  return NextResponse.json({ ok: true, updated: Object.keys(normalized).length });
}
