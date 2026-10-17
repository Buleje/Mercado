import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { IgvDelMesDB } from "@/lib/db/igv-del-mes.db";
import { mesLima, parsearMes } from "@/lib/finance/ingresos-del-periodo";
import { logger } from "@/lib/logger";

/**
 * GET /api/finanzas/igv-del-mes[?mes=YYYY-MM] — el IGV que está REGISTRADO.
 *
 * Sólo lectura. El Resumen de Mi Plata sacaba el IGV multiplicando ventas y
 * gastos por 18/118 y lo presentaba como el dato. Esto devuelve sólo lo que
 * tiene campo propio (comprobantes electrónicos y gastos con su IGV); si no
 * hay nada, la pantalla lo dice. Detalle en `lib/db/igv-del-mes.db.ts`.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const mesParam = new URL(req.url).searchParams.get("mes");
  const mesValido = parsearMes(mesParam);
  if (mesParam && !mesValido) return NextResponse.json({ error: "mes debe ser YYYY-MM" }, { status: 400 });
  // Mes de calendario de Lima, igual que los ingresos (monthly-summary).
  const mes = mesValido ?? mesLima(new Date());

  try {
    return NextResponse.json(await IgvDelMesDB.leer(auth.tenantId, mes));
  } catch (err) {
    logger.error("[finanzas/igv-del-mes] failed", { error: String(err) });
    return NextResponse.json({ error: "No se pudo leer el IGV del mes" }, { status: 500 });
  }
}
