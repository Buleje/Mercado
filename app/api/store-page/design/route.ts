/**
 * /api/store-page/design
 *
 * GET — design tokens del tenant
 * PUT — guarda design tokens (preserva sections existentes)
 *
 * Persistencia: ver lib/store-design-tokens.ts (consolidado en footerHtml).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { StorePageDB } from "@/lib/db/store-page.db";
import { SettingsDB } from "@/lib/db/settings.db";
import { logger } from "@/lib/logger";
import { withDbRetry } from "@/lib/db-retry";
import { applyRateLimit } from "@/lib/rate-limit";
import {
  deserializePageData,
  serializePageData,
  DEFAULT_DESIGN_TOKENS,
  type DesignTokens,
} from "@/lib/store-design-tokens";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color hex inválido");

const DesignSchema = z.object({
  fontFamily:      z.enum(["inter", "playfair", "manrope", "bebas", "quicksand", "raleway"]),
  headingSize:     z.enum(["compact", "regular", "large", "huge"]),
  primaryColor:    hexColor,
  secondaryColor:  hexColor,
  accentColor:     hexColor,
  backgroundColor: hexColor,
  textColor:       hexColor,
  borderRadius:    z.enum(["square", "soft", "rounded", "pill"]),
  shadowStyle:     z.enum(["none", "soft", "medium", "strong"]),
  buttonStyle:     z.enum(["solid", "outline", "gradient", "minimal"]),
  density:         z.enum(["compact", "regular", "spacious"]),
  presetId:        z.string().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  try {
    const page = await withDbRetry(() => StorePageDB.getCustomization(auth.tenantId));
    const data = deserializePageData(page.footerHtml);
    return NextResponse.json({ design: data.design ?? DEFAULT_DESIGN_TOKENS });
  } catch (e) {
    logger.error("[store-page/design] GET error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ design: DEFAULT_DESIGN_TOKENS });
  }
}

export async function PUT(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "store-page-design");
  if (_rl) return _rl;

  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const raw = await req.json().catch(() => null);
  const parsed = DesignSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    // Preservar sections existentes al actualizar design
    const page = await withDbRetry(() => StorePageDB.getCustomization(auth.tenantId));
    const existing = deserializePageData(page.footerHtml);
    const serialized = serializePageData({
      sections: existing.sections,
      design: parsed.data as DesignTokens,
    });
    await withDbRetry(() =>
      StorePageDB.upsertCustomization(auth.tenantId, { footerHtml: serialized }),
    );
    // Write-through al storeTheme (fuente de verdad del storefront): sin esto
    // los colores del tab "Diseño" quedaban pisados por settings.storeTheme y
    // NO se veían en /t/[slug]. Fire-and-forget — no rompe el guardado del diseño.
    await withDbRetry(() =>
      SettingsDB.patchStoreThemeJson(auth.tenantId, {
        primaryColor: parsed.data.primaryColor,
        secondaryColor: parsed.data.secondaryColor,
        accentColor: parsed.data.accentColor,
      }),
    ).catch((err) =>
      logger.warn("[store-page/design] write-through storeTheme falló", {
        err: err instanceof Error ? err.message : String(err),
        tenantId: auth.tenantId,
      }),
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[store-page/design] PUT error", {
      err: e instanceof Error ? e.message : String(e),
      tenantId: auth.tenantId,
    });
    return NextResponse.json({ error: "Error al guardar diseño" }, { status: 503 });
  }
}
