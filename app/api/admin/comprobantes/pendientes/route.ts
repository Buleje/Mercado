/**
 * GET /api/admin/comprobantes/pendientes — la bandeja de Seguimiento (N02 +
 * F56/M58): comprobantes rechazados o sin respuesta de SUNAT, notas en
 * borrador o sin documento, guías sin emitir, cotizaciones por vencer o
 * aceptadas sin pedido y pedidos entregados sin comprobante.
 *
 * Sólo lectura: nada de acá reintenta ni emite. El cajero ve sólo lo de SUNAT
 * (las notas, guías y cotizaciones son pantallas del administrador).
 * → `{ pendientes, generado }`.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { ComprobantesSeguimientoDB } from "@/lib/db/comprobantes-seguimiento.db";

const ROLES = ["admin", "cajero"] as const;
const GESTION = new Set(["admin", "owner", "manager"]);

export async function GET(req: NextRequest) {
  const rl = applyRateLimit(req, "MODERATE", "comprobantes-pendientes");
  if (rl) return rl;
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  try {
    const ahora = Date.now();
    const pendientes = await ComprobantesSeguimientoDB.pendientes(auth.tenantId, {
      ahora,
      soloComprobantes: !GESTION.has(auth.role),
    });
    return NextResponse.json({ pendientes, generado: new Date(ahora).toISOString() });
  } catch (e) {
    logger.error("[comprobantes] pendientes GET", { err: e instanceof Error ? e.message : String(e), tenantId: auth.tenantId });
    return NextResponse.json({ error: "No se pudo armar la bandeja de pendientes" }, { status: 503 });
  }
}
