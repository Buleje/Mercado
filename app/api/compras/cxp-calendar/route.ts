import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { getCxpCalendar } from "@/lib/db/compras-cxp-calendar.db";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const tenantId = auth.tenantId;
  const monthParam = req.nextUrl.searchParams.get("month");

  // Parse month (default: current month)
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth(); // 0-based

  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split("-").map(Number);
    year = y;
    month = m - 1; // Convert to 0-based
  }

  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);

  try {
    const result = await getCxpCalendar(tenantId, monthStart, monthEnd);

    return NextResponse.json(result);
  } catch (e) {
    logger.error("[compras/cxp-calendar] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error obteniendo calendario" }, { status: 500 });
  }
}
