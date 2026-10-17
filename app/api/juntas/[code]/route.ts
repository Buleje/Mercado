import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";
import { resolveTenantIdForRoute } from "@/lib/resolve-tenant";
import { JuntasDB } from "@/lib/db/juntas.db";

/** GET /api/juntas/[code] — progreso de una junta (estado computado on-read). */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  const limited = applyRateLimit(req, "GENEROUS", "juntas-get");
  if (limited) return limited;

  const tenantId = await resolveTenantIdForRoute(req);
  const { code } = await params;
  const junta = await JuntasDB.getByCode(tenantId, code);
  if (!junta) {
    return NextResponse.json({ error: "Junta no encontrada" }, { status: 404 });
  }
  return NextResponse.json({ junta });
}
