import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";
import { resolveTenantIdForRoute } from "@/lib/resolve-tenant";
import { JuntasDB } from "@/lib/db/juntas.db";
import { customerPhoneFromReq } from "@/lib/junta/customer";

/** POST /api/juntas/[code]/join — el cliente logueado se suma a la junta. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  const limited = applyRateLimit(req, "STRICT", "juntas-join");
  if (limited) return limited;

  const tenantId = await resolveTenantIdForRoute(req);
  const phone = await customerPhoneFromReq(req);
  if (!phone) {
    return NextResponse.json(
      { error: "Inicia sesión para unirte" },
      { status: 401 },
    );
  }

  const { code } = await params;
  try {
    const junta = await JuntasDB.join(tenantId, code, phone);
    return NextResponse.json({ junta });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al unirse";
    const status = /no encontrada/i.test(msg)
      ? 404
      : /venció/i.test(msg)
        ? 400
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
