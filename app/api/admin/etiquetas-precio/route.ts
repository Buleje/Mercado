import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { EtiquetasPrecioDB } from "@/lib/db/etiquetas-precio.db";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { DIAS_PRECIO_ANTERIOR } from "@/lib/etiquetas/precio";

/**
 * GET /api/admin/etiquetas-precio — lo que necesita la pantalla de etiquetas
 * de precio: los productos vendibles (activos, sin servicios) con su precio
 * BASE —el mismo que cobra la caja; los precios por cliente no van en la
 * góndola— y el último cambio de precio de cada uno en los últimos 31 días.
 *
 * Sólo lectura. El tenant sale de la sesión, nunca del header.
 */
export async function GET(req: NextRequest) {
  const limitado = applyRateLimit(req, "MODERATE", "admin-etiquetas-precio");
  if (limitado) return limitado;
  const auth = await requireAdmin(req, ["admin", "owner", "manager", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const desde = new Date(Date.now() - (DIAS_PRECIO_ANTERIOR + 1) * 24 * 3600 * 1000);
    // Sin caché a propósito: el precio impreso tiene que ser el que cobra la caja AHORA.
    const [productos, cambios] = await Promise.all([
      EtiquetasPrecioDB.productosEtiquetables(auth.tenantId),
      EtiquetasPrecioDB.ultimosCambiosDesde(auth.tenantId, desde),
    ]);
    const ids = new Set(productos.map((p) => p.id));
    const vigentes = Object.fromEntries(Object.entries(cambios).filter(([id]) => ids.has(Number(id))));
    return NextResponse.json(
      { productos, cambios: vigentes, ahora: new Date().toISOString() },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    logger.error("[etiquetas-precio] GET failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "No pudimos leer tus productos. Prueba de nuevo." }, { status: 500 });
  }
}
