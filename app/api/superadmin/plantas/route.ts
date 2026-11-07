import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { listaQuerySchema } from "@/lib/superadmin/plantas-forestales/schemas";
import { resolverPeriodo } from "@/lib/superadmin/plantas-forestales/periodo";
import { armarLista } from "@/lib/superadmin/plantas-forestales/resumen.server";

/**
 * GET /api/superadmin/plantas?desde&hasta&incluirPrueba=0|1 — las plantas
 * forestales (negocios con el libro CTP) con su trozas, aserrada, movimiento
 * del período, incoherencias y semáforo. Cada número sale del libro de la
 * planta (`resumen.server.ts`). Período por omisión: el trimestre en días de Lima.
 */
const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(req: NextRequest) {
  const limitado = applyRateLimit(req, "GENEROUS", "superadmin:plantas:lista");
  if (limitado) return limitado;
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const q = listaQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!q.success) return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
  const periodo = resolverPeriodo(q.data);
  if (!periodo.ok) return NextResponse.json({ error: periodo.error }, { status: 400 });

  try {
    const data = await armarLista({ periodo: periodo.periodo, incluirPrueba: q.data.incluirPrueba === "1" });
    return NextResponse.json(data, { headers: NO_STORE });
  } catch (err) {
    logger.error("[superadmin/plantas] GET", { error: String(err) });
    return NextResponse.json({ error: "No se pudieron leer las plantas" }, { status: 500 });
  }
}
