import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { isSpecializationEnabled } from "@/lib/specializations";
import { ForestCorridaCompraDB } from "@/lib/db/forest-corrida-compra.db";
import { ctpErrorResponse } from "@/lib/forestal/ctp-api-errors";

/**
 * GET /api/admin/forestal/ctp/especies-sin-ingreso — especies que se asierran
 * (corridas vivas y sus paquetes) sin NINGÚN ingreso de esa especie en todo el
 * libro (ADR-485). Es el riesgo SERFOR: madera sin guía de origen. Sin período.
 *
 * Roles: los del GET del libro (admin, almacenero, owner).
 */
export const GET = withApiHandler("forestal-ctp-especies-sin-ingreso", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"))) {
    return NextResponse.json(
      { error: "specialization_disabled", message: "El módulo CTP no está habilitado para este tenant." },
      { status: 403 },
    );
  }
  try {
    return NextResponse.json({ especies: await ForestCorridaCompraDB.especiesSinIngreso(auth.tenantId) });
  } catch (err) {
    return ctpErrorResponse(err, "ctp-especies-sin-ingreso.GET", auth.tenantId);
  }
});
