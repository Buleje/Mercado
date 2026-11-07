/**
 * GET /api/admin/comprobantes/conciliacion?desde&hasta — Análisis y
 * conciliación documental (N08): en el período, comprobantes por estado,
 * notas por motivo, neto, pedidos con y sin comprobante, ventas del mostrador
 * por tipo de papel y las diferencias fila por fila.
 *
 * Sólo lectura. Emitido, aceptado y cobrado van por separado; lo fiado no se
 * presenta como plata disponible. Sin fechas = desde el primer documento.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { ComprobantesSeguimientoDB } from "@/lib/db/comprobantes-seguimiento.db";
import { rangoDeParams } from "@/lib/comprobantes/periodo";

const ROLES = ["admin"] as const;

export async function GET(req: NextRequest) {
  const rl = applyRateLimit(req, "MODERATE", "comprobantes-conciliacion");
  if (rl) return rl;
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  const rango = rangoDeParams(req.nextUrl.searchParams);
  if (!rango) return NextResponse.json({ error: "Fechas inválidas: «desde» va antes que «hasta»." }, { status: 400 });
  try {
    return NextResponse.json({ conciliacion: await ComprobantesSeguimientoDB.conciliacion(auth.tenantId, rango) });
  } catch (e) {
    logger.error("[comprobantes] conciliacion GET", { err: e instanceof Error ? e.message : String(e), tenantId: auth.tenantId });
    return NextResponse.json({ error: "No se pudo armar la conciliación" }, { status: 503 });
  }
}
