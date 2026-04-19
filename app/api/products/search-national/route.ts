import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

/**
 * GET /api/products/search-national?q=arroz&limit=8
 * Search Open Food Facts by product name (text search).
 * Returns compact results for autocomplete.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "8") || 8, 20);

  if (query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const url = new URL("https://world.openfoodfacts.org/cgi/search.pl");
    url.searchParams.set("search_terms", query);
    url.searchParams.set("search_simple", "1");
    url.searchParams.set("action", "process");
    url.searchParams.set("json", "true");
    url.searchParams.set("page_size", String(limit));
    url.searchParams.set("fields", "product_name,product_name_es,brands,image_front_small_url,image_url,categories_tags,quantity,code");

    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "Buleje/1.0 (contact@buleje.pe)" },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return NextResponse.json({ results: [] });
    }

    const data = await res.json();
    const products = Array.isArray(data.products) ? data.products : [];

    const results = products
      .filter((p: Record<string, unknown>) => p.product_name || p.product_name_es)
      .map((p: Record<string, unknown>) => ({
        name: (p.product_name_es as string) || (p.product_name as string) || "",
        brand: (p.brands as string) || "",
        image: (p.image_front_small_url as string) || (p.image_url as string) || "",
        barcode: (p.code as string) || "",
        category: extractCategory((p.categories_tags as string[]) ?? []),
        quantity: (p.quantity as string) || "",
        unit: extractUnit((p.quantity as string) || ""),
      }));

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}

function extractCategory(tags: string[]): string {
  const first = tags[0]?.replace("en:", "").replace("es:", "") ?? "";
  const lower = first.toLowerCase();
  if (lower.includes("fruit") || lower.includes("vegetab") || lower.includes("frut") || lower.includes("verdur")) return "frutas-verduras";
  if (lower.includes("meat") || lower.includes("carn")) return "carnes";
  if (lower.includes("dairy") || lower.includes("lact") || lower.includes("milk") || lower.includes("leche")) return "lacteos";
  if (lower.includes("beverage") || lower.includes("drink") || lower.includes("bebid") || lower.includes("water") || lower.includes("juice")) return "bebidas";
  if (lower.includes("clean") || lower.includes("limpi")) return "limpieza";
  return "abarrotes";
}

function extractUnit(qty: string): string {
  const lower = qty.toLowerCase();
  if (lower.includes("kg")) return "kg";
  if (lower.includes("g") && !lower.includes("kg")) return "unidad";
  if (lower.includes("ml")) return "botella";
  if (lower.includes("l")) return "litro";
  return "unidad";
}
