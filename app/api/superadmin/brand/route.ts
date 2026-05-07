import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { getPlatformBrand, savePlatformBrand, type PlatformBrand } from "@/lib/platform-brand";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * GET/PATCH /api/superadmin/brand — gestiona la marca de la plataforma.
 *
 * GET: devuelve toda la marca (con event mode tal cual está, no resuelto).
 * PATCH: deep-merge del payload con lo guardado. Permite tocar cualquier
 *        sub-objeto (identity, logos, colors, contact, socials, seo, legal,
 *        eventMode) sin enviar todo.
 */

async function requireSession(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return await getPlatformSession(token);
}

export async function GET(req: NextRequest) {
  if (!(await requireSession(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const brand = await getPlatformBrand();
    return NextResponse.json(brand);
  } catch (err) {
    logger.error("[superadmin/brand GET]", { error: String(err) });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

const HexColor = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i, "Color debe ser hex (#RRGGBB)")
  .nullable()
  .or(z.literal(""))
  .transform((v) => (v === "" ? null : v));

const ImagePath = z
  .string()
  .max(500)
  .nullable()
  .or(z.literal(""))
  .refine((v) => v === null || v === "" || /^(https?:\/\/|\/)/.test(v), {
    message: "Debe ser URL https:// o path /uploads/...",
  })
  .transform((v) => (v === "" ? null : v));

const BrandSchema = z.object({
  identity: z
    .object({
      name: z.string().min(1).max(60).optional(),
      tagline: z.string().max(120).optional(),
      description: z.string().max(500).optional(),
      since: z.string().max(20).optional(),
      city: z.string().max(60).optional(),
      country: z.string().max(60).optional(),
    })
    .optional(),
  logos: z
    .object({
      logoLight: ImagePath.optional(),
      logoDark: ImagePath.optional(),
      logoSquare: ImagePath.optional(),
      favicon: ImagePath.optional(),
      ogImage: ImagePath.optional(),
    })
    .optional(),
  colors: z
    .object({
      primary: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
      secondary: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
      accent: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
      danger: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
      success: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
    })
    .optional(),
  typography: z
    .object({
      fontFamily: z.string().max(40).optional(),
      fontDisplay: z.string().max(40).optional(),
    })
    .optional(),
  contact: z
    .object({
      email: z.string().max(120).optional(),
      phone: z.string().max(40).optional(),
      whatsapp: z.string().max(40).optional(),
      address: z.string().max(200).optional(),
      supportHours: z.string().max(120).optional(),
    })
    .optional(),
  socials: z
    .object({
      instagram: z.string().max(200).optional(),
      facebook: z.string().max(200).optional(),
      tiktok: z.string().max(200).optional(),
      x: z.string().max(200).optional(),
      youtube: z.string().max(200).optional(),
    })
    .optional(),
  seo: z
    .object({
      metaTitle: z.string().max(70).optional(),
      metaDescription: z.string().max(180).optional(),
      ogTitle: z.string().max(80).optional(),
      ogDescription: z.string().max(200).optional(),
    })
    .optional(),
  legal: z
    .object({
      legalName: z.string().max(120).optional(),
      ruc: z.string().max(20).optional(),
      termsUrl: z.string().max(200).optional(),
      privacyUrl: z.string().max(200).optional(),
      cookiesUrl: z.string().max(200).optional(),
    })
    .optional(),
  eventMode: z
    .object({
      active: z.boolean().optional(),
      name: z.string().max(60).optional(),
      logoLight: ImagePath.optional(),
      logoDark: ImagePath.optional(),
      primaryColor: HexColor.optional(),
      accentColor: HexColor.optional(),
      startsAt: z.string().nullable().optional(),
      endsAt: z.string().nullable().optional(),
    })
    .optional(),
});

function deepMerge(base: PlatformBrand, patch: Record<string, unknown>): PlatformBrand {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const baseV = (base as Record<string, unknown>)[k];
    if (v && typeof v === "object" && !Array.isArray(v) && baseV && typeof baseV === "object") {
      out[k] = deepMerge(baseV as PlatformBrand, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out as PlatformBrand;
}

export async function PATCH(req: NextRequest) {
  const _rl = await applyRateLimit(req, "GENEROUS", "superadmin-brand"); if (_rl) return _rl;
  if (!(await requireSession(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch((err) => {
    logger.warn("[superadmin/brand PATCH] invalid json", { error: String(err) });
    return null;
  });
  if (!body) return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  const parsed = BrandSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const current = await getPlatformBrand();
    const merged = deepMerge(current, parsed.data as Record<string, unknown>);
    await savePlatformBrand(merged);
    return NextResponse.json({ ok: true, brand: merged });
  } catch (err) {
    logger.error("[superadmin/brand PATCH]", { error: String(err) });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
