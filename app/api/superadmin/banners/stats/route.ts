import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { PROMO_BANNER_STATS_PATH } from "@/lib/promo-banner-stats-path";

/**
 * GET /api/superadmin/banners/stats  (banners v2 F3)
 * Devuelve { [bannerId]: { impressions, clicks } } para que el studio muestre
 * el rendimiento por banner. Solo superadmin.
 */
const STATS_PATH = PROMO_BANNER_STATS_PATH;

export async function GET(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token || !(await getPlatformSession(token))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const raw = await readFile(STATS_PATH, "utf8");
    return NextResponse.json({ stats: JSON.parse(raw) });
  } catch {
    return NextResponse.json({ stats: {} });
  }
}
