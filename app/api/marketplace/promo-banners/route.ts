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
  const zone = url.searchParams.get("zone")?.trim() || null;

  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const all = JSON.parse(raw) as Record<string, unknown>;
    const list = (Array.isArray(all[slot]) ? all[slot] : []) as PromoBanner[];
    // banners v2 F2: solo banners VIGENTES (activos + ventana de programación).
    // banners v2 F4: + segmentación por zona — un banner sin targetZones se ve
    // en todas; con zonas, solo si la zona del cliente coincide. El editor
    // superadmin usa su propio GET (ve todos). Sin duplicar lógica por slot.
    const banners = list.filter((b) => {
      if (!isBannerLive(b)) return false;
      const zones = b.targetZones ?? [];
      if (zones.length === 0) return true; // sin segmentación = todas
      if (!zone) return true; // cliente sin zona conocida → no ocultamos
      return zones.some((z) => z.toLowerCase() === zone.toLowerCase());
    });
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
