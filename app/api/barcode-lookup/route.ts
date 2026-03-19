export const dynamic = 'force-dynamic'
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

// Lookup product info by barcode using Open Food Facts API
// (covers many Peruvian national products with EAN-13 barcodes)
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });

  // Sanitize: only digits allowed
  const sanitized = code.replace(/\D/g, "");
  if (!sanitized || sanitized.length < 8 || sanitized.length > 14) {
    return NextResponse.json({ error: "invalid barcode" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(sanitized)}.json`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return NextResponse.json({ found: false });

    const data = await res.json();
    if (data.status !== 1 || !data.product) {
      return NextResponse.json({ found: false });
    }

    const p = data.product;
    return NextResponse.json({
      found: true,
      barcode: sanitized,
      name: p.product_name || p.product_name_es || "",
      brand: p.brands || "",
      category: p.categories_tags?.[0]?.replace("en:", "") || "",
      image: p.image_front_small_url || p.image_url || "",
      quantity: p.quantity || "",
      unit: p.quantity ? extractUnit(p.quantity) : "und",
    });
  } catch {
    return NextResponse.json({ found: false });
  }
}

function extractUnit(qty: string): string {
  const lower = qty.toLowerCase();
  if (lower.includes("kg")) return "kg";
  if (lower.includes("g") && !lower.includes("kg")) return "g";
  if (lower.includes("l") || lower.includes("ml")) return lower.includes("ml") ? "ml" : "L";
  return "und";
}
