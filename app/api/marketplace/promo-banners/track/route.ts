import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod/v4";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { PROMO_BANNER_STATS_PATH } from "@/lib/promo-banner-stats-path";

/**
 * POST /api/marketplace/promo-banners/track  (banners v2 F3 — analytics)
 *
 * Registra impresiones (batch) y clicks (single) de banners. Storage MVP:
 * `lib/data/promo-banner-stats.json` ({ [bannerId]: { impressions, clicks } }).
 * Fire-and-forget desde el cliente (sendBeacon). Tráfico Pucallpa = bajo; el
 * read-modify-write es aceptable a esta escala. Para escala mayor → mover a
 * tabla con increment atómico (anotado en project_banners_v2).
 */

// Brandon 2026-06-12: en /tmp (fuera del árbol que vigila Turbopack) para no
// disparar Fast Refresh en cada impresión → ver lib/promo-banner-stats-path.ts.
const STATS_PATH = PROMO_BANNER_STATS_PATH;
// id de banner: alfanumérico + guiones, máx 200 (evita inyección de claves raras).
const ID_RE = /^[a-zA-Z0-9_-]{1,200}$/;

const BodySchema = z.object({
  event: z.enum(["impression", "click"]),
  bannerId: z.string().optional(),
  bannerIds: z.array(z.string()).max(20).optional(),
});

type Stats = Record<string, { impressions: number; clicks: number }>;

export async function POST(req: NextRequest) {
  const rl = applyRateLimit(req, "GENEROUS", "banner-track");
  if (rl) return rl;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 204 });

  const { event } = parsed.data;
  const ids = (parsed.data.bannerIds ?? (parsed.data.bannerId ? [parsed.data.bannerId] : []))
    .filter((id) => ID_RE.test(id))
    .slice(0, 20);
  if (ids.length === 0) return new NextResponse(null, { status: 204 });

  try {
    let stats: Stats = {};
    try {
      stats = JSON.parse(await readFile(STATS_PATH, "utf8")) as Stats;
    } catch { /* archivo vacío/ausente → {} */ }

    for (const id of ids) {
      const cur = stats[id] ?? { impressions: 0, clicks: 0 };
      if (event === "impression") cur.impressions += 1;
      else cur.clicks += 1;
      stats[id] = cur;
    }
    await writeFile(STATS_PATH, JSON.stringify(stats), "utf8");
  } catch (err) {
    logger.warn("[banner-track]", { event, error: String(err) });
    // No bloquear el cliente — es fire-and-forget.
  }
  return new NextResponse(null, { status: 204 });
}
