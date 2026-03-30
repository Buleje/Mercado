export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { GuiasRemisionDB } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const sp = req.nextUrl.searchParams;
    const csv = await GuiasRemisionDB.exportCSV(auth.tenantId, {
      status: sp.get("status") ?? undefined,
      from: sp.get("from") ?? undefined,
      to: sp.get("to") ?? undefined,
    });

    const filename = `guias-remision-${new Date().toISOString().slice(0, 10)}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    console.error("[guias-remision/exportar] GET error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
