import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { getOrSet } from "@/lib/cache";
import { AdminDocBadgesDB } from "@/lib/db/admin-doc-badges.db";

/**
 * Mejora 19: Retorna conteo de documentos pendientes para badges del sidebar.
 * Cotizaciones ENVIADA, GRR BORRADOR, NC BORRADOR.
 *
 * QW5 perf (2026-05-16):
 *  - Antes: 3 COUNT serializados (await await await) → 3 RTT × N tabs × 60s polling
 *  - Ahora: Promise.all + getOrSet TTL 60s → 1 RTT cacheado, max 1 fetch/min/tenant
 *
 * Audit project-wide 2026-05-19: migrado a AdminDocBadgesDB.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const badges = await getOrSet(
    `admin:doc-badges:${auth.tenantId}`,
    60,
    () => AdminDocBadgesDB.getCountsForTenant(auth.tenantId),
  );

  return NextResponse.json(badges);
}
