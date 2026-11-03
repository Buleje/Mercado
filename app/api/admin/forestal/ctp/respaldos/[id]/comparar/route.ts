import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { RUTAS_PANEL } from "@/lib/auth/roles-rutas-panel";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { ctpValidationResponse } from "@/lib/forestal/ctp-api-errors";
import { ForestCtpRespaldoDB } from "@/lib/db/forest-ctp-respaldo.db";
import { idRespaldoSchema } from "../../esquemas";
import { moduloApagado, respuestaDeError, sinCupo } from "../../_respuestas";

/**
 * GET /api/admin/forestal/ctp/respaldos/[id]/comparar → `ComparacionRespaldo`
 * (ADR-530): qué se borró, se dio de baja, cambió o es nuevo desde la foto,
 * agrupado por corrida/salida/ingreso/lote. Solo lee. `huellaHoy` va como
 * `esperado` al recuperar. Lee el libro entero: tiene rate limit.
 */
type Ctx = { params: Promise<{ id: string }> };

export const GET = withApiHandler<Ctx>("forestal-ctp-respaldos-comparar", async (req: NextRequest, ctx) => {
  const auth = await requireAdmin(req, RUTAS_PANEL["/api/admin/forestal/ctp/respaldos/[id]"]);
  if (auth instanceof NextResponse) return auth;
  /* requireAdmin deja pasar al encargado (manager) siempre: se corta acá. */
  const prohibido = soloAdminODueno(auth.role, "comparar el libro con un respaldo");
  if (prohibido) return prohibido;
  const lleno = await sinCupo("comparar", auth);
  if (lleno) return lleno;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const apagado = await moduloApagado(auth.tenantId);
  if (apagado) return apagado;
  const id = idRespaldoSchema.safeParse((await ctx.params).id);
  if (!id.success) return ctpValidationResponse(id.error);
  try {
    return NextResponse.json(await ForestCtpRespaldoDB.comparar(auth.tenantId, id.data));
  } catch (err) {
    return respuestaDeError(err, "ctp.respaldos.comparar", auth.tenantId);
  }
});
