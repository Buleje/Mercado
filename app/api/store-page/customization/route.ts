import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { StorePageDB } from "@/lib/db/store-page.db";
import { SettingsDB } from "@/lib/db/settings.db";
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

    // Write-through al storeTheme (fuente de verdad del storefront /t/[slug]):
    // replica los campos COMPARTIDOS con "Identidad y tema" (hero textos+imagen,
    // colores, contacto) para que lo editado en "Mi tienda pública" SÍ se vea.
    // El destino del CTA NO se mapea: heroLink es enum en storeTheme vs heroCtaUrl
    // (URL libre) acá — modelos distintos. `!== undefined` permite limpiar (null→"").
    const d = parsed.data;
    const themePatch: Record<string, unknown> = {};
    const mapField = (raw: unknown, key: string) => {
      if (raw !== undefined) themePatch[key] = raw ?? "";
    };
    mapField(d.heroTitle, "heroTitle");
    mapField(d.heroSubtitle, "heroSubtitle");
    mapField(d.heroImageUrl, "heroImage");
    mapField(d.heroCtaLabel, "heroCTA");
    mapField(d.primaryColor, "primaryColor");
    mapField(d.accentColor, "accentColor");
    mapField(d.whatsappPhone, "whatsapp");
    mapField(d.contactEmail, "email");
    mapField(d.address, "address");
    if (Object.keys(themePatch).length > 0) {
      await withDbRetry(() => SettingsDB.patchStoreThemeJson(auth.tenantId, themePatch)).catch(
        (err) =>
          logger.warn("[store-page/customization] write-through storeTheme falló", {
            err: err instanceof Error ? err.message : String(err),
            tenantId: auth.tenantId,
          }),
      );
    }

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
