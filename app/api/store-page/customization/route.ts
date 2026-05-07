import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { StorePageDB } from "@/lib/db/store-page.db";
import { logger } from "@/lib/logger";
import { withDbRetry } from "@/lib/db-retry";
import { applyRateLimit } from "@/lib/rate-limit";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color hex inválido");

const UpsertSchema = z.object({
  published: z.boolean().optional(),
  heroTitle: z.string().max(200).nullable().optional(),
  heroSubtitle: z.string().max(400).nullable().optional(),
  heroImageUrl: z.string().max(500).nullable().optional(),
  heroCtaLabel: z.string().max(80).nullable().optional(),
  heroCtaUrl: z.string().max(500).nullable().optional(),
  primaryColor: hexColor.optional(),
  accentColor: hexColor.optional(),
  aboutTitle: z.string().max(200).nullable().optional(),
  aboutBody: z.string().max(4000).nullable().optional(),
  whatsappPhone: z.string().max(20).nullable().optional(),
  contactEmail: z.string().email().max(200).nullable().optional(),
  address: z.string().max(400).nullable().optional(),
  metaTitle: z.string().max(200).nullable().optional(),
  metaDescription: z.string().max(400).nullable().optional(),
  ogImageUrl: z.string().max(500).nullable().optional(),
  footerHtml: z.string().max(4000).nullable().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  try {
    const page = await withDbRetry(() =>
      StorePageDB.getCustomization(auth.tenantId),
    );
    return NextResponse.json(page);
  } catch (e) {
    logger.error("[store-page/customization] GET error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: "Error al leer la página" },
      { status: 503 },
    );
  }
}

export async function PUT(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "store-page-customization"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const raw = await req.json().catch(() => null);
  const parsed = UpsertSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const page = await StorePageDB.upsertCustomization(auth.tenantId, parsed.data);
    logger.info("[store-page/customization] updated", {
      tenantId: auth.tenantId,
      username: auth.username,
    });
    return NextResponse.json(page);
  } catch (e) {
    logger.error("[store-page/customization] PUT error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: "Error al guardar la página" },
      { status: 503 },
    );
  }
}
