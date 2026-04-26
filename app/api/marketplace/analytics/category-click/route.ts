import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { logger } from "@/lib/logger";

/**
 * POST /api/marketplace/analytics/category-click
 *
 * Trackea click por categoría principal. Storage simple en file system
 * (mismo patrón que `promo-banners.json`). El superadmin puede consumir
 * este JSON desde `/api/superadmin/marketplace/categories/analytics`
 * (endpoint de lectura).
 *
 * Estructura: { [categoryId]: { count: number, lastClickAt: string } }
 */

const STORE_PATH = join(
  process.cwd(),
  "lib",
  "data",
  "marketplace-category-clicks.json",
);

const PostSchema = z.object({
  categoryId: z.string().min(1).max(64),
  ts: z.number().int().optional(),
});

type Stats = Record<string, { count: number; lastClickAt: string }>;

async function load(): Promise<Stats> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    return JSON.parse(raw) as Stats;
  } catch {
    return {};
  }
}

async function save(s: Stats): Promise<void> {
  await writeFile(STORE_PATH, JSON.stringify(s, null, 2), "utf8");
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch((err) => {
    logger.warn("[category-click] body parse failed", { error: String(err) });
    return null;
  });
  if (!body) return NextResponse.json({ ok: true }); // silencioso
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: true });

  // Fire-and-forget — nunca falla el client. Logueamos errores y devolvemos 200.
  try {
    const stats = await load();
    const cur = stats[parsed.data.categoryId] ?? {
      count: 0,
      lastClickAt: "",
    };
    cur.count += 1;
    cur.lastClickAt = new Date(parsed.data.ts ?? Date.now()).toISOString();
    stats[parsed.data.categoryId] = cur;
    await save(stats);
  } catch (err) {
    logger.warn("[category-click] failed", { error: String(err) });
  }
  return NextResponse.json({ ok: true });
}

export async function GET() {
  // Endpoint público read-only para que el front pueda mostrar
  // "Las más populares" si querés. Por ahora superadmin lo consume.
  try {
    const stats = await load();
    return NextResponse.json({ stats });
  } catch {
    return NextResponse.json({ stats: {} });
  }
}
