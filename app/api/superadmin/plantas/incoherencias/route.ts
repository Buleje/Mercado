import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { incoherenciasQuerySchema } from "@/lib/superadmin/plantas-forestales/schemas";
import { armarIncoherencias } from "@/lib/superadmin/plantas-forestales/resumen.server";

/**
 * GET /api/superadmin/plantas/incoherencias?gravedad&origen&tenantId&incluirPrueba
 * — las incoherencias de todas las plantas en una lista (lo grave primero) y
 * el conteo de cada planta. Período: el trimestre por omisión (el mismo que
 * la lista, así comparten la caché por planta).
 */
const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(req: NextRequest) {
  const limitado = applyRateLimit(req, "GENEROUS", "superadmin:plantas:incoherencias");
  if (limitado) return limitado;
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const q = incoherenciasQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!q.success) return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });

  try {
    const data = await armarIncoherencias({
      gravedad: q.data.gravedad,
      origen: q.data.origen,
      tenantId: q.data.tenantId,
      incluirPrueba: q.data.incluirPrueba === "1",
    });
    return NextResponse.json(data, { headers: NO_STORE });
  } catch (err) {
    logger.error("[superadmin/plantas/incoherencias] GET", { error: String(err) });
    return NextResponse.json({ error: "No se pudieron leer las incoherencias" }, { status: 500 });
  }
}
