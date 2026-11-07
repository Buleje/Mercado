import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { isSpecializationEnabled } from "@/lib/specializations";
import { WoodEntriesDB } from "@/lib/db/wood-entries.db";
import { ctpErrorResponse } from "@/lib/forestal/ctp-api-errors";
import { medidasTrozasSchema } from "@/lib/forestal/medidas-troza";

/**
 * PATCH /api/admin/forestal/trozas/medidas — lo que el aserradero mide en el
 * patio (Brandon 2026-09-26).
 *
 * Body: `{ trozas: [{ id, oxD1Pulg?, oxD2Pulg?, oxLargoPies?, d1Cm?, d2Cm? }] }`
 * (máx 500). En Oxapampa, ausente = no se toca y `null` = se borra.
 *
 * - Oxapampa (pulgadas, pies): el servidor calcula el pt (Dp² × L / 24.5) y lo
 *   congela. Dato comercial: no lo frena el mes cerrado.
 * - D1/D2 en cm: sólo si la guía no los trajo (nunca se pisa SERFOR) y con el
 *   período abierto. No toca `volumenM3`.
 *
 * Responde `{ trozas: TrozaConsumible[], rechazadas: [{ id, motivo }] }`:
 * las piezas releídas y lo que NO se guardó de cada una (el resto sí).
 */
export async function PATCH(req: NextRequest) {
  const rl = await applyRateLimit(req, "GENEROUS", "ctp:trozas");
  if (rl) return rl;
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"))) {
    return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = medidasTrozasSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "validation_error",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400 },
    );
  }

  try {
    const r = await WoodEntriesDB.guardarMedidasTrozas(
      auth.tenantId,
      parsed.data.trozas,
      auth.username ?? "unknown",
    );
    return NextResponse.json(r);
  } catch (e) {
    return ctpErrorResponse(e, "forestal.trozas.medidas.PATCH", auth.tenantId);
  }
}
