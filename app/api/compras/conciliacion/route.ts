import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { withDbRetry } from "@/lib/db-retry";
import { logger } from "@/lib/logger";
import { limaDateKey, startOfLimaMonth } from "@/lib/utils";
import { diasEntre } from "@/lib/compras/ciclo-oc";
import { ComprasConciliacionDB } from "@/lib/db/compras-conciliacion.db";

const DIA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Query = z.object({
  desde: DIA.optional(),
  hasta: DIA.optional(),
  proveedor: z.string().min(1).max(100).optional(),
});

/**
 * GET /api/compras/conciliacion?desde=AAAA-MM-DD&hasta=AAAA-MM-DD&proveedor=<id>
 * — conciliación de documentos (N04): por orden, lo pedido, lo que llegó y se
 * aceptó, la factura, la cuenta y lo pagado, con qué no cuadra y de qué papel
 * sale. Por defecto, del 1.º del mes de hace dos meses a hoy (día de Lima).
 * Sólo lectura y sin caché: nada se paga ni se une desde aquí. Mismo permiso
 * que Por pagar (la plata la ven admin, dueño y encargado).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const parsed = Query.safeParse({
    desde: sp.get("desde") || undefined,
    hasta: sp.get("hasta") || undefined,
    proveedor: sp.get("proveedor") || undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "Revisa las fechas del período." }, { status: 400 });

  const hasta = parsed.data.hasta ?? limaDateKey();
  const desde = parsed.data.desde ?? limaDateKey(new Date(startOfLimaMonth(-2)));
  const dias = diasEntre(desde, hasta);
  if (!Number.isFinite(dias) || dias < 0) return NextResponse.json({ error: "La fecha de inicio va antes que la de fin." }, { status: 400 });
  if (dias > 366) return NextResponse.json({ error: "Elige un período de hasta un año." }, { status: 400 });

  try {
    const r = await withDbRetry(() => ComprasConciliacionDB.conciliacion(auth.tenantId, { desde, hasta, proveedorId: parsed.data.proveedor ?? null }));
    return NextResponse.json(r);
  } catch (e) {
    logger.error("[compras/conciliacion] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No pudimos armar la conciliación. Prueba de nuevo." }, { status: 503 });
  }
}
