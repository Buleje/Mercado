import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { logger } from "@/lib/logger";
import { isBannerLive, type PromoBanner } from "@/lib/promo-banners";

/**
 * GET /api/marketplace/promo-banners?slot=tiendas-hero
 *
 * Devuelve banners promocionales por slot. Storage: file `lib/data/promo-banners.json`.
 */

const STORE_PATH = join(process.cwd(), "lib", "data", "promo-banners.json");

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const slot = url.searchParams.get("slot") ?? "tiendas-hero";

  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const all = JSON.parse(raw) as Record<string, unknown>;
    const list = (Array.isArray(all[slot]) ? all[slot] : []) as PromoBanner[];
    // banners v2 F2: el GET público solo entrega banners VIGENTES (activos +
    // dentro de la ventana de programación). El editor superadmin usa otro
    // endpoint que devuelve todos. Así la programación se respeta en cualquier
    // display sin lógica duplicada por slot.
    const banners = list.filter((b) => isBannerLive(b));
    return NextResponse.json(
      { slot, banners },
      {
        headers: {
          "Cache-Control": "public, max-age=60, stale-while-revalidate=600",
        },
      },
    );
  } catch (err) {
    logger.warn("[promo-banners GET]", { slot, error: String(err) });
    return NextResponse.json({ slot, banners: [] });
  }
}
