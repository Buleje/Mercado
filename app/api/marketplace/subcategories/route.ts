import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { logger } from "@/lib/logger";

/**
 * GET /api/marketplace/subcategories?category=<categoryId>&store=<storeSlug>
 *
 * Devuelve subcategorías visibles del marketplace.
 *  - Sin `category`: devuelve todas las subcategorías de todas las categorías visibles.
 *  - Con `category`: filtra por categoría padre.
 *  - Con `store`: además filtra a las subcategorías vinculadas a esa tienda.
 *
 * Storage: `lib/data/marketplace-categories.json`.
 */

const STORE_PATH = join(process.cwd(), "lib", "data", "marketplace-categories.json");

interface SubCategoryRecord {
  id: string;
  label: string;
  description?: string;
  imageUrl?: string | null;
  active?: boolean;
  linkedStoreSlugs?: string[];
}

interface CategoryRecord {
  label: string;
  description: string;
  imageUrl: string | null;
  active: boolean;
  subcategories?: SubCategoryRecord[];
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const categoryFilter = url.searchParams.get("category")?.trim() || null;
    const storeFilter = url.searchParams.get("store")?.trim() || null;

    let data: Record<string, CategoryRecord> = {};
    try {
      const raw = await readFile(STORE_PATH, "utf8");
      data = JSON.parse(raw);
    } catch {
      data = {};
    }

    const out: Array<{
      id: string;
      categoryId: string;
      categoryLabel: string;
      label: string;
      description: string;
      imageUrl: string | null;
      linkedStoreSlugs: string[];
    }> = [];

    for (const [categoryId, cat] of Object.entries(data)) {
      if (cat.active === false) continue;
      if (categoryFilter && categoryFilter !== "todos" && categoryFilter !== categoryId) continue;
      const subs = Array.isArray(cat.subcategories) ? cat.subcategories : [];
      for (const s of subs) {
        if (s.active === false) continue;
        const linked = s.linkedStoreSlugs ?? [];
        if (storeFilter && !linked.includes(storeFilter)) continue;
        out.push({
          id: s.id,
          categoryId,
          categoryLabel: cat.label,
          label: s.label,
          description: s.description ?? "",
          imageUrl: s.imageUrl ?? null,
          linkedStoreSlugs: linked,
        });
      }
    }

    return NextResponse.json(
      { subcategories: out },
      {
        headers: {
          "Cache-Control": "public, max-age=10, stale-while-revalidate=60",
        },
      },
    );
  } catch (err) {
    logger.warn("[/api/marketplace/subcategories] failed", { error: String(err) });
    return NextResponse.json({ subcategories: [] }, { status: 200 });
  }
}
