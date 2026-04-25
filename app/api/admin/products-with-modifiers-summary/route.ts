/**
 * GET /api/admin/products-with-modifiers-summary
 *
 * Devuelve la lista de productos del tenant con conteo de grupos+opciones
 * de modificadores. Usado por VariationsTab admin para listar la sidebar.
 */
import { NextResponse, type NextRequest } from "next/server";
import { withApiHandler } from "@/lib/api-handler";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ProductModifiersDB } from "@/lib/db/product-modifiers.db";

export const GET = withApiHandler(
  "admin-products-with-modifiers-summary",
  async (req: NextRequest) => {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;
    const rl = applyRateLimit(req, "GENEROUS", "products-modifiers-summary");
    if (rl) return rl;

    const products = await ProductModifiersDB.listProductsSummary(auth.tenantId);
    return NextResponse.json({ products });
  },
);
