import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { ProductsDB } from "@/lib/db/products.db";

/**
 * GET /api/admin/whatsapp/products?q= — buscador del "compartir producto" 🛒.
 * Devuelve nombre, precio, unidad e imagen ABSOLUTA (Meta necesita URL pública
 * para el envío por link; relativa = solo fallback de texto).
 */
export async function GET(req: NextRequest) {
  const _rl = applyRateLimit(req, "GENEROUS", "admin-whatsapp-products");
  if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 60);

  try {
    const page = await ProductsDB.getPage({
      tenantId: auth.tenantId,
      search: q || undefined,
      active: true,
      limit: 8,
    });

    const products = page.products.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      unit: p.unit ?? "",
      // Meta solo puede leer URLs públicas absolutas
      imageUrl: p.image && /^https?:\/\//.test(p.image) ? p.image : null,
    }));

    return NextResponse.json({ products });
  } catch (e) {
    logger.error("[admin/whatsapp/products] error", {
      tenantId: auth.tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Error de base de datos" }, { status: 503 });
  }
}
