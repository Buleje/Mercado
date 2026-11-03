import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { RUTAS_PANEL } from "@/lib/auth/roles-rutas-panel";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { ctpValidationResponse } from "@/lib/forestal/ctp-api-errors";
import { ForestCtpRespaldoDB } from "@/lib/db/forest-ctp-respaldo.db";
import type { ResultadoRecuperar } from "@/lib/forestal/ctp-respaldo-tipos";
import { idRespaldoSchema, recuperarRespaldoSchema } from "../../esquemas";
import { jsonInvalido, moduloApagado, respuestaDeError, sinCupo } from "../../_respuestas";

/**
 * POST /api/admin/forestal/ctp/respaldos/[id]/recuperar `{ seleccion, esperado }`
 * → `ResultadoRecuperar` (ADR-530). Trae de vuelta lo marcado sin pisar nada,
 * todo o nada. 409 `LIBRO_CAMBIO` si el libro ya no es el que se comparó ·
 * 422 `NO_SE_PUEDE` si dejaría un saldo negativo o una guía pasada.
 */
type Ctx = { params: Promise<{ id: string }> };

export const POST = withApiHandler<Ctx>("forestal-ctp-respaldos-recuperar", async (req: NextRequest, ctx) => {
  const auth = await requireAdmin(req, RUTAS_PANEL["/api/admin/forestal/ctp/respaldos/[id]"]);
  if (auth instanceof NextResponse) return auth;
  /* requireAdmin deja pasar al encargado (manager) siempre: se corta acá. */
  const prohibido = soloAdminODueno(auth.role, "recuperar el libro desde un respaldo");
  if (prohibido) return prohibido;
  const lleno = await sinCupo("recuperar", auth);
  if (lleno) return lleno;
  /* Además del de `proxy.ts`: escribe en bloque en el libro. */
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const apagado = await moduloApagado(auth.tenantId);
  if (apagado) return apagado;
  const id = idRespaldoSchema.safeParse((await ctx.params).id);
  if (!id.success) return ctpValidationResponse(id.error);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonInvalido();
  }
  const parsed = recuperarRespaldoSchema.safeParse(body);
  if (!parsed.success) return ctpValidationResponse(parsed.error);
  try {
    const r: ResultadoRecuperar = await ForestCtpRespaldoDB.recuperar(
      auth.tenantId,
      id.data,
      parsed.data.seleccion,
      auth.username ?? "unknown",
      parsed.data.esperado,
    );
    return NextResponse.json(r);
  } catch (err) {
    return respuestaDeError(err, "ctp.respaldos.recuperar", auth.tenantId);
  }
});
