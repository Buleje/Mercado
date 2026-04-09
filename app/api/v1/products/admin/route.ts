/**
 * GET /api/v1/products/admin
 *
 * Endpoint admin-only para listar productos con TODOS los campos
 * (incluyendo costPrice, stock, stockMin, stockMax) y sin filtrar por activo.
 *
 * El endpoint público sigue siendo /api/v1/products que:
 *   - Es soft-auth (anónimo OK)
 *   - Strippea costPrice/stock para anónimos
 *   - Mantiene contrato público (active filter es opt-in)
 *
 * Usar este path desde el panel admin (InventoryTab, etc.) para garantizar
 * que el caller es admin y recibir el shape completo.
 */

import { NextRequest, NextResponse } from "next/server";
import { ProductsDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { withDbRetry } from "@/lib/db-retry";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const category   = searchParams.get("category");
    const search     = searchParams.get("q");
    const onlyActive = searchParams.get("active");
    const limitParam = searchParams.get("limit");
    const pageParam  = searchParams.get("page");

    let products = await withDbRetry(() => ProductsDB.getAll(auth.tenantId));

    if (category && category !== "todos") {
      products = products.filter((p) => p.category === category);
    }
    if (search) {
      const q = search.toLowerCase();
      products = products.filter((p) => p.name.toLowerCase().includes(q));
    }
    if (onlyActive === "true") {
      products = products.filter((p) => p.active !== false);
    }

    const total = products.length;

    if (limitParam) {
      const limit = Math.min(Math.max(parseInt(limitParam, 10) || 20, 1), 200);
      const page  = Math.max(parseInt(pageParam ?? "1", 10) || 1, 1);
      const start = (page - 1) * limit;
      const paged = products.slice(start, start + limit);

      return NextResponse.json(paged, {
        headers: {
          "X-Total-Count": String(total),
          "X-Page":        String(page),
          "X-Limit":       String(limit),
          "X-Total-Pages": String(Math.ceil(total / limit)),
          "Cache-Control": "no-store",
          "X-Api-Version": "v1",
        },
      });
    }

    return NextResponse.json(products, {
      headers: {
        "X-Total-Count": String(total),
        "Cache-Control": "no-store",
        "X-Api-Version": "v1",
      },
    });
  } catch (e) {
    logger.error("[v1/products/admin] GET error", {
      err: e instanceof Error ? e.message : String(e),
      tenantId: auth.tenantId,
    });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
