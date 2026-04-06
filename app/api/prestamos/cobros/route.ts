export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { PrestamosDB } from "@/lib/db/prestamos.db";
import { toErrorPayload } from "@/lib/api-error";

// GET /api/prestamos/cobros — returns upcoming and overdue cuotas
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const url = new URL(req.url);
    const dias = parseInt(url.searchParams.get("dias") ?? "30", 10);

    const data = await PrestamosDB.getCuotasProximas(auth.tenantId, dias);
    return NextResponse.json(data);
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}
