import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { ImageBankDB } from "@/lib/db/image-bank.db";
import { logger } from "@/lib/logger";

/**
 * GET /api/admin/image-bank
 *   Read-only para tenants — devuelve solo los items con imageUrl no vacía
 *   (los placeholders del seed con imageUrl="" se filtran).
 *
 * @global-catalog ok — Brandon 2026-05-16 (audit Info): igual que
 * variant-catalog, ImageBank es un catálogo cross-tenant curado por el
 * superadmin. Todos los tenants leen el mismo banco. Mutación solo desde
 * /api/superadmin/image-bank.
 */

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req, ["admin", "almacenero"]);
    if (auth instanceof NextResponse) return auth;
    const all = await ImageBankDB.list();
    // Filtra items sin imagen para no mostrarle al admin del tenant placeholders vacíos
    const withImages = all
      .map((cat) => ({ ...cat, items: cat.items.filter((it) => it.imageUrl && it.imageUrl.trim() !== "") }))
      .filter((cat) => cat.items.length > 0);
    return NextResponse.json({ categories: withImages });

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
