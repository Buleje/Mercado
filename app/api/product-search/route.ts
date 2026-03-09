export const dynamic = 'force-dynamic'
import { NextResponse } from "next/server";

// Search Open Food Facts by product name (national product database)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ products: [] });

  // Allow letters, numbers, accented chars, spaces and basic punctuation only
  const safe = q.replace(/[^a-zA-Z0-9Ã¡Ã©Ã­Ã³ÃºÃ¼Ã±ÃÃ‰ÃÃ“ÃšÃœÃ‘\s\-.]/g, "").slice(0, 80);
  if (!safe) return NextResponse.json({ products: [] });

  try {
    const url =
      `https://world.openfoodfacts.org/cgi/search.pl` +
      `?search_terms=${encodeURIComponent(safe)}` +
      `&search_simple=1&action=process&json=1&page_size=8` +
      `&fields=product_name,product_name_es,brands,image_front_small_url,image_url,quantity,code`;

    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return NextResponse.json({ products: [] });

    const data = await res.json();

    type RawProduct = {
      product_name?: string;
      product_name_es?: string;
      brands?: string;
      image_front_small_url?: string;
      image_url?: string;
      quantity?: string;
      code?: string;
    };

    const products = ((data.products ?? []) as RawProduct[])
      .filter((p) => p.product_name || p.product_name_es)
      .slice(0, 8)
      .map((p) => ({
        name: p.product_name_es || p.product_name || "",
        brand: p.brands || "",
        barcode: p.code || "",
        image: p.image_front_small_url || p.image_url || "",
        quantity: p.quantity || "",
        unit: extractUnit(p.quantity || ""),
      }));

    return NextResponse.json({ products });
  } catch {
    return NextResponse.json({ products: [] });
  }
}

function extractUnit(qty: string): string {
  const lower = qty.toLowerCase();
  if (lower.includes("kg")) return "kg";
  if (lower.includes("g") && !lower.includes("kg")) return "g";
  if (lower.includes("ml")) return "ml";
  if (lower.includes("l")) return "L";
  return "und";
}
