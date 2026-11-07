import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { AlquileresDB } from "@/lib/db/alquileres.db";
import { normalizar, pagoSchema } from "../../esquemas";
import { idValido, leerCuerpo, noExiste, respuestaPago, ROLES_ALQUILERES } from "../../_respuestas";

/**
 * POST /api/admin/alquileres/[id]/pagos (ADR-524) — admin/owner.
 * Un pago por mes (`@@unique([alquilerId, periodo])`):
 *   201 { pago, alquiler } · replay idéntico (mismo mes + monto + día) →
 *   200 { pago, alquiler, duplicado: true } · otro pago para ese mes →
 *   409 `periodo_ya_pagado` (con el pago que ya está) · mes fuera del
 *   contrato → 422 `periodo_fuera_de_plazo`. Es registro: no mueve caja.
 */

export const POST = withApiHandler(
  "admin-alquiler-pago-post",
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const rl = await applyRateLimit(req, "GENEROUS", "admin-alquileres");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req, ROLES_ALQUILERES);
    if (auth instanceof NextResponse) return auth;
    const id = idValido((await ctx.params).id);
    if (!id) return noExiste();
    const cuerpo = await leerCuerpo(req, pagoSchema);
    if (!cuerpo.ok) return cuerpo.res;
    try {
      const r = await AlquileresDB.registrarPago(auth.tenantId, id, normalizar(cuerpo.data), auth.username ?? "unknown");
      return respuestaPago(r, true);
    } catch (err) {
      logger.error("[alquileres.pagos.POST] failed", { error: String(err), tenantId: auth.tenantId, id });
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
  },
);
