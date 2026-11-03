import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { RUTAS_PANEL } from "@/lib/auth/roles-rutas-panel";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { ctpValidationResponse } from "@/lib/forestal/ctp-api-errors";
import { ForestCtpRespaldoDB } from "@/lib/db/forest-ctp-respaldo.db";
import { idRespaldoSchema } from "../../esquemas";
import { moduloApagado, respuestaDeError } from "../../_respuestas";

/**
 * GET /api/admin/forestal/ctp/respaldos/[id]/descargar → el `.json.gz` tal
 * cual se guardó (ADR-530), `libro-ctp-<slug>-<fecha>.json.gz`. Queda en la
 * auditoría quién lo bajó (Ley 29733).
 */
type Ctx = { params: Promise<{ id: string }> };

export const GET = withApiHandler<Ctx>("forestal-ctp-respaldos-descargar", async (req: NextRequest, ctx) => {
  const auth = await requireAdmin(req, RUTAS_PANEL["/api/admin/forestal/ctp/respaldos/[id]"]);
  if (auth instanceof NextResponse) return auth;
  /* requireAdmin deja pasar al encargado (manager) siempre: se corta acá. */
  const prohibido = soloAdminODueno(auth.role, "descargar respaldos del libro");
  if (prohibido) return prohibido;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const apagado = await moduloApagado(auth.tenantId);
  if (apagado) return apagado;
  const id = idRespaldoSchema.safeParse((await ctx.params).id);
  if (!id.success) return ctpValidationResponse(id.error);
  try {
    const { datos, nombre } = await ForestCtpRespaldoDB.descargar(auth.tenantId, id.data, auth.username ?? "unknown");
    return new NextResponse(Buffer.from(datos), {
      status: 200,
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="${nombre}"`,
        "Content-Length": String(datos.byteLength),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return respuestaDeError(err, "ctp.respaldos.descargar", auth.tenantId);
  }
});
