import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { withApiHandler } from "@/lib/api-handler";
import { lothErrorResponse } from "@/lib/forestal/loth-api-errors";
import { ForestLothImportarDB } from "@/lib/db/forest-loth-importar.db";

/**
 * GET /api/admin/forestal/loth/importar-guia/candidatas — las guías de SERFOR
 * que ya entraron al Libro CTP de este negocio (ingresos vivos con su ficha) y
 * que el Libro TH todavía no tiene, agrupadas por título habilitante
 * (`RespuestaCandidatas`, ADR-461). Sin Libro CTP, la lista sale vacía.
 *
 * Guard: requireAdmin (admin, almacenero, dueño) → rate limit GENEROUS 'loth'
 * → spec:forestal:loth-libro.
 */
export const GET = withApiHandler("forestal-loth-importar-guia-candidatas", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:loth-libro"))) {
    return NextResponse.json(
      { error: "specialization_disabled", message: "El Libro de Títulos Habilitantes no está habilitado para este negocio." },
      { status: 403 },
    );
  }
  try {
    return NextResponse.json(await ForestLothImportarDB.candidatas(auth.tenantId));
  } catch (err) {
    return lothErrorResponse(err, "loth-importar-guia.candidatas", auth.tenantId);
  }
});
