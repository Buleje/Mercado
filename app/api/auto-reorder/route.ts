import { NextResponse, type NextRequest } from "next/server";
import { AutoReorderDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const lowStock = await AutoReorderDB.getLowStockProducts();
    return NextResponse.json(lowStock);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[auto-reorder] GET error", msg);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
