import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { SettingsDB } from "@/lib/db/settings.db";
import { resolveTenantSlugToId } from "@/lib/resolve-tenant";
import { parseSalesChannels } from "@/lib/types/sales-channels";

/**
 * El storefront lee Settings por el tenantId CANÓNICO (CUID), mientras que la
 * sesión admin puede traer el slug legacy (ej. "main"). Resolvemos para
 * leer/escribir en la MISMA fila que `/t/<slug>` lee — si no, el pixel se
 * guarda en una fila huérfana y nunca se inyecta. (Bug verificado 2026-06-30.)
 */
async function canonicalTenantId(raw: string): Promise<string> {
  return (await resolveTenantSlugToId(raw).catch(() => null)) || raw;
}

/**
 * /api/admin/sales-channels — config de canales de venta social (TikTok + Meta)
 * del negocio. La config se guarda en Settings.storeTheme.salesChannels y los
 * pixels se inyectan en el storefront.
 */

const Id = z.string().trim().max(120);
const BodySchema = z.object({
  meta: z.object({
    connected: z.boolean(),
    pixelId: Id,
    capiToken: z.string().trim().max(400),
    catalogId: Id,
  }),
  tiktok: z.object({
    connected: z.boolean(),
    pixelId: Id,
    catalogId: Id,
  }),
  // Google Analytics 4 (G-XXXXXXXXXX). Vive en el MISMO storeTheme.analyticsId
  // que Config→Settings y el customizer — single source of truth. Opcional para
  // no romper clientes que solo mandan meta/tiktok. El injector valida el formato.
  analyticsId: z.string().trim().max(40).optional(),
});

export async function GET(req: NextRequest) {
  const rl = applyRateLimit(req, "MODERATE", "admin-sales-channels:get");
  if (rl) return rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const tenantId = await canonicalTenantId(auth.tenantId);
    const channels = await SettingsDB.getSalesChannels(tenantId);
    const theme = await SettingsDB.getStoreThemeJson(tenantId);
    const analyticsId = typeof theme?.analyticsId === "string" ? theme.analyticsId : "";
    return NextResponse.json({ channels, analyticsId });
  } catch (e) {
    logger.error("[admin/sales-channels] GET error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const rl = applyRateLimit(req, "MODERATE", "admin-sales-channels:patch");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    // `connected` se deriva: un canal está conectado si tiene su Pixel ID seteado.
    const config = parseSalesChannels({
      meta: { ...parsed.data.meta, connected: parsed.data.meta.pixelId.trim().length > 0 },
      tiktok: { ...parsed.data.tiktok, connected: parsed.data.tiktok.pixelId.trim().length > 0 },
    });
    const tenantId = await canonicalTenantId(auth.tenantId);
    // Espejamos los Pixel IDs a las claves que el storefront YA lee:
    // - `storeTheme.pixelId`     → lo inyecta components/store/TenantAnalytics (/t/<slug>)
    // - `storeTheme.tiktokPixelId` → lo inyecta el mismo componente (TikTok, abajo)
    // - `storeTheme.analyticsId`   → GA4, misma clave que Config/customizer (single source)
    // Además guardamos el blob `salesChannels` (config completa + ruta subdominio).
    const patch: Record<string, unknown> = {
      salesChannels: config,
      pixelId: config.meta.pixelId,
      tiktokPixelId: config.tiktok.pixelId,
    };
    // Solo tocamos analyticsId si el cliente lo mandó — así no pisamos el GA4
    // configurado desde Settings cuando otro caller manda solo meta/tiktok.
    if (parsed.data.analyticsId !== undefined) patch.analyticsId = parsed.data.analyticsId;
    await SettingsDB.patchStoreThemeJson(tenantId, patch);
    return NextResponse.json({ channels: config, analyticsId: parsed.data.analyticsId ?? "" });
  } catch (e) {
    logger.error("[admin/sales-channels] PATCH error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
