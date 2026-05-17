import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { getOrSet } from "@/lib/cache";

/**
 * Mejora 19: Retorna conteo de documentos pendientes para badges del sidebar.
 * Cotizaciones ENVIADA, GRR BORRADOR, NC BORRADOR.
 *
 * QW5 perf (2026-05-16):
 *  - Antes: 3 COUNT serializados (await await await) → 3 RTT × N tabs × 60s polling
 *  - Ahora: Promise.all + getOrSet TTL 60s → 1 RTT cacheado, max 1 fetch/min/tenant
 *  - Cada tabla envuelta en try/catch porque puede no existir en tenants viejos
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const badges = await getOrSet(`admin:doc-badges:${auth.tenantId}`, 60, async () => {
    const [cotEnviadas, grrBorrador, ncBorrador] = await Promise.all([
      prisma.cotizacion
        .count({ where: { tenantId: auth.tenantId, status: "ENVIADA" } })
        .catch(() => 0),
      prisma.guiaRemision
        .count({ where: { tenantId: auth.tenantId, status: "BORRADOR" } })
        .catch(() => 0),
      prisma.notaCredito
        .count({ where: { tenantId: auth.tenantId, status: "BORRADOR" } })
        .catch(() => 0),
    ]);

    const result: Record<string, number> = {};
    if (cotEnviadas > 0) result["cotizaciones"] = cotEnviadas;
    if (grrBorrador > 0) result["guias-remision"] = grrBorrador;
    if (ncBorrador > 0) result["notas-credito"] = ncBorrador;
    return result;
  });

  return NextResponse.json(badges);
}
