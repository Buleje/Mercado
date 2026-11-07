import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { RUTAS_PANEL } from "@/lib/auth/roles-rutas-panel";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { ctpValidationResponse } from "@/lib/forestal/ctp-api-errors";
import { ForestCtpRespaldoDB } from "@/lib/db/forest-ctp-respaldo.db";
import { idRespaldoSchema } from "../esquemas";
import { moduloApagado, respuestaDeError } from "../_respuestas";

/**
 * DELETE /api/admin/forestal/ctp/respaldos/[id] — borra un respaldo GUARDADO A
 * MANO (ADR-530: con el tope lleno, guardar otro pide borrar uno). Los
 * automáticos → 409 `SOLO_MANUALES`: los poda el sistema.
 */
type Ctx = { params: Promise<{ id: string }> };

export const DELETE = withApiHandler<Ctx>("forestal-ctp-respaldos-borrar", async (req: NextRequest, ctx) => {
  const auth = await requireAdmin(req, RUTAS_PANEL["/api/admin/forestal/ctp/respaldos/[id]"]);
  if (auth instanceof NextResponse) return auth;
  /* requireAdmin deja pasar al encargado (manager) siempre: se corta acá. */
  const prohibido = soloAdminODueno(auth.role, "borrar respaldos del libro");
  if (prohibido) return prohibido;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const apagado = await moduloApagado(auth.tenantId);
  if (apagado) return apagado;
  const id = idRespaldoSchema.safeParse((await ctx.params).id);
  if (!id.success) return ctpValidationResponse(id.error);
  try {
    await ForestCtpRespaldoDB.eliminar(auth.tenantId, id.data, auth.username ?? "unknown");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return respuestaDeError(err, "ctp.respaldos.DELETE", auth.tenantId);
  }
});
