import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { withApiHandler } from "@/lib/api-handler";
import { CamarasMarcadoresDB } from "@/lib/db/camaras-marcadores.db";
import { idsDeParam, queryALaVistaSchema } from "@/lib/camaras/marcadores";

/**
 * GET /api/admin/camaras/trozas-a-la-vista?dia=AAAA-MM-DD[&pasada=ISO][&m=3,7,12]
 * (ADR-480) — las trozas que la cámara vio ese día (o en una pasada), con la
 * troza de cada marcador, si se puede apartar y por qué no.
 *
 * Sólo lectura. La usan Cámaras › Hoy y el paso «Desde la cámara» del lote
 * mixto (`m` = los marcadores elegidos en «Consumir»). Admin, dueño y
 * almacenero; el negocio sale del JWT.
 */
export const GET = withApiHandler("camaras-trozas-a-la-vista", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner", "almacenero"]);
  if (auth instanceof NextResponse) return auth;
  const sp = req.nextUrl.searchParams;
  const q = queryALaVistaSchema.safeParse({
    dia: sp.get("dia") ?? "",
    pasada: sp.get("pasada") ?? undefined,
    m: sp.get("m") ?? undefined,
  });
  if (!q.success)
    return NextResponse.json(
      { error: "validation_error", message: "Indica el día (AAAA-MM-DD) y, si quieres, la pasada y los marcadores." },
      { status: 400 },
    );
  const r = await CamarasMarcadoresDB.aLaVista(auth.tenantId, {
    dia: q.data.dia,
    pasada: q.data.pasada,
    m: idsDeParam(q.data.m),
  });
  return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
});
