import { NextRequest, NextResponse } from "next/server";
import { ForestCubicacionTrozasDB } from "@/lib/db/forest-cubicacion-trozas.db";
import { anularCubicacionSchema } from "@/lib/forestal/cubicacion-cuenta";
import { ROLES_PLATA, guardCubicacion, invalido, leerJson, noStore, responderError } from "../../_comun";

/**
 * POST /api/admin/forestal/cubicaciones-trozas/[id]/anular (ADR-478) — DINERO.
 * Sólo admin y dueño. Da de baja sus entregas y recalcula los saldos; también
 * las patas de su cuenta forestal y el valor de venta que puso si sigue igual (ADR-484).
 * 200 `{ cubicacion }` (anular dos veces = 200 `repetido`) · 409 `LIQUIDADA_DESPUES {liquidacion}` · 409 `NO_APLICADA`.
 */

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardCubicacion(req, { roles: ROLES_PLATA, escritura: true, plata: true });
  if (g instanceof Response) return g;
  const { id } = await params;
  const json = await leerJson(req);
  if (!json.ok) return json.res;
  const parsed = anularCubicacionSchema.safeParse(json.body);
  if (!parsed.success) return invalido(parsed.error.issues, "Escribe el motivo.");
  try {
    const r = await ForestCubicacionTrozasDB.anular(g.auth.tenantId, id, parsed.data.motivo, g.actor);
    return NextResponse.json({ cubicacion: r.cubicacion, ...(r.repetido ? { repetido: true } : {}) }, { headers: noStore });
  } catch (e) {
    return responderError(e, "anular", g.auth.tenantId);
  }
}
