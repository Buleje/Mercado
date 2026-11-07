import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { AlquileresDB } from "@/lib/db/alquileres.db";
import { aPagoPatch, pagoPatchSchema } from "../../../esquemas";
import { idValido, leerCuerpo, noExiste, respuestaPago, ROLES_ALQUILERES } from "../../../_respuestas";

/**
 * /api/admin/alquileres/[id]/pagos/[pagoId] (ADR-524) — admin/owner.
 * PATCH corrección parcial (mes, monto, día, medio, comprobante) con audit
 * antes→después → { pago, alquiler } · pasar a un mes que ya tiene pago →
 * 409 `periodo_ya_pagado`. DELETE → { pago, alquiler } (el pago borrado).
 * El pago tiene que ser de ESE alquiler y de este negocio (404).
 */

type Ctx = { params: Promise<{ id: string; pagoId: string }> };

export const PATCH = withApiHandler("admin-alquiler-pago-patch", async (req: NextRequest, ctx: Ctx) => {
  const rl = await applyRateLimit(req, "GENEROUS", "admin-alquileres");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ROLES_ALQUILERES);
  if (auth instanceof NextResponse) return auth;
  const p = await ctx.params;
  const id = idValido(p.id);
  const pagoId = idValido(p.pagoId);
  if (!id || !pagoId) return noExiste("Ese pago no es de este alquiler.");
  const cuerpo = await leerCuerpo(req, pagoPatchSchema);
  if (!cuerpo.ok) return cuerpo.res;
  try {
    const r = await AlquileresDB.corregirPago(auth.tenantId, id, pagoId, aPagoPatch(cuerpo.data), auth.username ?? "unknown");
    return respuestaPago(r, false);
  } catch (err) {
    logger.error("[alquileres.pagos.PATCH] failed", { error: String(err), tenantId: auth.tenantId, id, pagoId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const DELETE = withApiHandler("admin-alquiler-pago-delete", async (req: NextRequest, ctx: Ctx) => {
  const rl = await applyRateLimit(req, "GENEROUS", "admin-alquileres");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ROLES_ALQUILERES);
  if (auth instanceof NextResponse) return auth;
  const p = await ctx.params;
  const id = idValido(p.id);
  const pagoId = idValido(p.pagoId);
  if (!id || !pagoId) return noExiste("Ese pago no es de este alquiler.");
  try {
    const r = await AlquileresDB.borrarPago(auth.tenantId, id, pagoId, auth.username ?? "unknown");
    return respuestaPago(r, false);
  } catch (err) {
    logger.error("[alquileres.pagos.DELETE] failed", { error: String(err), tenantId: auth.tenantId, id, pagoId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
