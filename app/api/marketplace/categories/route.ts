import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/marketplace/categories
 *
 * Devuelve las categorías principales del marketplace + su imagen
 * (gestionada desde superadmin/marketplace > Categorías).
 *
 * Storage: `lib/data/marketplace-categories.json` (mismo patrón que
 * promo-banners). Cuando haya tabla Prisma migrada, reemplazar.
 */

const STORE_PATH = join(process.cwd(), "lib", "data", "marketplace-categories.json");

const FALLBACK = {
  restaurante: { label: "Restaurantes", description: "Sabor de la casa", imageUrl: null, active: true },
  bodega: { label: "Bodegas", description: "Lo de siempre, cerca", imageUrl: null, active: true },
  fruteria: { label: "Mercado", description: "Frescos del día", imageUrl: null, active: true },
  farmacia: { label: "Farmacias", description: "Tu botiquín", imageUrl: null, active: true },
  ferreteria: { label: "Ferreterías", description: "Para reparar y construir", imageUrl: null, active: true },
  polleria: { label: "Pollerías", description: "Brasa de barrio", imageUrl: null, active: true },
  panaderia: { label: "Panaderías", description: "Recién horneado", imageUrl: null, active: true },
  licoreria: { label: "Licorerías", description: "Para la reunión", imageUrl: null, active: true },
  carniceria: { label: "Carnicerías", description: "Cortes frescos", imageUrl: null, active: true },
  minimarket: { label: "Minimarkets", description: "Todo en un lugar", imageUrl: null, active: true },
  tecnologia: { label: "Tecnología", description: "Gadgets & accesorios", imageUrl: null, active: true },
} as const;

type CategoryRecord = {
  label: string;
  description: string;
  imageUrl: string | null;
  active: boolean;
};

export async function GET(req: NextRequest) {
  const rl = applyRateLimit(req, "GENEROUS", "marketplace-categories");
  if (rl) return rl;
  try {
    let data: Record<string, CategoryRecord> = FALLBACK as unknown as Record<string, CategoryRecord>;
    try {
      const raw = await readFile(STORE_PATH, "utf8");
      data = JSON.parse(raw);
    } catch {
      // file missing — usa fallback
    }
    const categories = Object.entries(data)
      .filter(([, v]) => v.active !== false)
      .map(([id, v]) => ({
        id,
        label: v.label,
        description: v.description,
        imageUrl: v.imageUrl,
      }));
    return NextResponse.json(
      { categories },
      {
        headers: {
          // Refresh rápido (10s) para que cambios desde superadmin
          // se reflejen casi al instante. SWR 60s libera DB.
          "Cache-Control": "public, max-age=10, stale-while-revalidate=60",
        },
      },
    );
  } catch (err) {
    logger.warn("[/api/marketplace/categories] failed", { error: String(err) });
    return NextResponse.json(
      { categories: Object.entries(FALLBACK).map(([id, v]) => ({ id, ...v })) },
      { status: 200 },
    );
  }
}
