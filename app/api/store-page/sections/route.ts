/**
 * /api/store-page/sections
 *
 * GET — devuelve las secciones + design tokens publicados del tenant
 * PUT — guarda secciones (mantiene design tokens existentes)
 *
 * Persistencia: serializa { sections, design } como JSON en `footerHtml`
 * con prefix `__BULEJE_PAGE_DATA__::`. Back-compat con `__SECTIONS__::`
 * (formato viejo) — al primer write se migra al nuevo formato.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { StorePageDB } from "@/lib/db/store-page.db";
import { logger } from "@/lib/logger";
import { withDbRetry } from "@/lib/db-retry";
import { applyRateLimit } from "@/lib/rate-limit";
import type { Section } from "@/lib/store-sections-types";
import {
  deserializePageData,
  serializePageData,
} from "@/lib/store-design-tokens";

const SectionSchema = z.object({
  id: z.string(),
  type: z.enum(["about", "hours", "payment", "how-to-order", "faq", "benefits", "gallery", "image-text", "cta", "video", "map", "logos", "countdown", "team", "social", "categories"]),
  visible: z.boolean(),
  order: z.number().int(),
  data: z.record(z.string(), z.any()),
});
const PutSchema = z.object({
  sections: z.array(SectionSchema).max(20),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  try {
    const page = await withDbRetry(() => StorePageDB.getCustomization(auth.tenantId));
    const data = deserializePageData(page.footerHtml);
    return NextResponse.json({ sections: data.sections });
  } catch (e) {
    logger.error("[store-page/sections] GET error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Error al leer secciones" }, { status: 503 });
  }
}

export async function PUT(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "store-page-sections");
  if (_rl) return _rl;

  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const raw = await req.json().catch(() => null);
  const parsed = PutSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    // Preservar design tokens existentes al actualizar sections
    const page = await withDbRetry(() => StorePageDB.getCustomization(auth.tenantId));
    const existing = deserializePageData(page.footerHtml);
    const serialized = serializePageData({
      sections: parsed.data.sections as Section[],
      design: existing.design,
    });
    await withDbRetry(() =>
      StorePageDB.upsertCustomization(auth.tenantId, { footerHtml: serialized }),
    );
    return NextResponse.json({ ok: true, count: parsed.data.sections.length });
  } catch (e) {
    logger.error("[store-page/sections] PUT error", {
      err: e instanceof Error ? e.message : String(e),
      tenantId: auth.tenantId,
    });
    return NextResponse.json({ error: "Error al guardar" }, { status: 503 });
  }
}
