import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { ImageBankDB } from "@/lib/db/image-bank.db";

/**
 * GET /api/admin/image-bank
 *   Read-only para tenants — devuelve solo los items con imageUrl no vacía
 *   (los placeholders del seed con imageUrl="" se filtran).
 */

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;
  const all = await ImageBankDB.list();
  // Filtra items sin imagen para no mostrarle al admin del tenant placeholders vacíos
  const withImages = all
    .map((cat) => ({ ...cat, items: cat.items.filter((it) => it.imageUrl && it.imageUrl.trim() !== "") }))
    .filter((cat) => cat.items.length > 0);
  return NextResponse.json({ categories: withImages });
}
