import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { AlquileresDB } from "@/lib/db/alquileres.db";
import { alquilerPatchSchema, aPatch } from "../esquemas";
import { falla, idValido, leerCuerpo, noExiste, ROLES_ALQUILERES } from "../_respuestas";

/**
 * /api/admin/alquileres/[id] (ADR-524) — admin/owner.
 * GET → { alquiler } · PATCH parcial (ausente = no se toca, null = borra) →
 * { alquiler } · DELETE suave; con pagos → 409 `tiene_pagos` salvo
 * `?forzar=1` del DUEÑO (owner). Un id de otro negocio = 404.
 */

type Ctx = { params: Promise<{ id: string }> };

export const GET = withApiHandler("admin-alquiler-get", async (req: NextRequest, ctx: Ctx) => {
  const rl = await applyRateLimit(req, "GENEROUS", "admin-alquileres");
  if (rl) return rl;
  const auth = await requireAdmin(req, ROLES_ALQUILERES);
  if (auth instanceof NextResponse) return auth;
  const id = idValido((await ctx.params).id);
  if (!id) return noExiste();
  try {
    const alquiler = await AlquileresDB.obtener(auth.tenantId, id);
    return alquiler ? NextResponse.json({ alquiler }) : noExiste();
  } catch (err) {
    logger.error("[alquileres.GET.id] failed", { error: String(err), tenantId: auth.tenantId, id });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const PATCH = withApiHandler("admin-alquiler-patch", async (req: NextRequest, ctx: Ctx) => {
  const rl = await applyRateLimit(req, "GENEROUS", "admin-alquileres");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ROLES_ALQUILERES);
  if (auth instanceof NextResponse) return auth;
  const id = idValido((await ctx.params).id);
  if (!id) return noExiste();
  const cuerpo = await leerCuerpo(req, alquilerPatchSchema);
  if (!cuerpo.ok) return cuerpo.res;
  try {
    const r = await AlquileresDB.actualizar(auth.tenantId, id, aPatch(cuerpo.data), auth.username ?? "unknown");
    return r.ok ? NextResponse.json({ alquiler: r.alquiler }) : falla(r);
  } catch (err) {
    logger.error("[alquileres.PATCH.id] failed", { error: String(err), tenantId: auth.tenantId, id });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const DELETE = withApiHandler("admin-alquiler-delete", async (req: NextRequest, ctx: Ctx) => {
  const rl = await applyRateLimit(req, "GENEROUS", "admin-alquileres");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ROLES_ALQUILERES);
  if (auth instanceof NextResponse) return auth;
  const id = idValido((await ctx.params).id);
  if (!id) return noExiste();
  const pideForzar = req.nextUrl.searchParams.get("forzar") === "1";
  try {
    const r = await AlquileresDB.borrar(auth.tenantId, id, auth.username ?? "unknown", {
      forzar: pideForzar && auth.role === "owner",
    });
    if (r.ok) return NextResponse.json({ ok: true });
    if (r.error === "tiene_pagos" && pideForzar && auth.role !== "owner") {
      return falla({ ...r, message: "Solo el dueño puede borrar un alquiler que ya tiene pagos." });
    }
    return falla(r);
  } catch (err) {
    logger.error("[alquileres.DELETE.id] failed", { error: String(err), tenantId: auth.tenantId, id });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
