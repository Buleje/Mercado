import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { filasConAlerta, filasSinAlerta } from "@/lib/forestal/revision-proveedores";
import { revisarProveedoresDelNegocio } from "@/lib/forestal/revision-proveedores.server";

// ── GET /api/admin/forestal/serfor-infractores/directorio ──
// «Revisar a todos mis proveedores»: cada ficha de la libreta y cada permiso
// contra el Registro de Infractores de SERFOR y el mapa de OSINFOR. La revisión
// vive en `revisarProveedoresDelNegocio` (la comparte el vigilante mensual).

/** Pasado esto no se piden más permisos a OSINFOR: la función de Vercel corta a los 30 s. */
const PRESUPUESTO_OSINFOR_MS = 20_000;

export async function GET(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req, "STRICT", "forestal-revision-proveedores");
  if (rateLimitResponse) return rateLimitResponse;

  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
    if (auth instanceof NextResponse) return auth;

    const r = await revisarProveedoresDelNegocio(auth.tenantId, {
      presupuestoOsinforMs: PRESUPUESTO_OSINFOR_MS,
    });
    if (!r) {
      return NextResponse.json(
        { error: "SERFOR no respondió; prueba en unos minutos" },
        { status: 503 },
      );
    }

    logger.info("[revision-proveedores] revisados", {
      tenantId: auth.tenantId,
      grupos: r.grupos,
      permisos: r.permisos,
      sinConsultar: r.resumen.osinforSinConsultar,
      ms: r.ms,
    });
    return NextResponse.json({
      data: {
        resumen: r.resumen,
        filas: filasConAlerta(r.filas),
        // Las limpias y sin datos van aparte: la pantalla solo pinta las alertas; el papel de resultado lleva a todos.
        sinAlerta: filasSinAlerta(r.filas),
        corteSerfor: r.corteSerfor,
        revisadoEn: new Date().toISOString(),
      },
    });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
