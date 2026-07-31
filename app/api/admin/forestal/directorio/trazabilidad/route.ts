import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { ForestDirectorioDB } from "@/lib/db/forest-directorio.db";
import { construirTrazabilidadProveedor } from "@/lib/forestal/proveedor-trazabilidad";

/**
 * GET /api/admin/forestal/directorio/trazabilidad?proveedor=<nombre>
 *
 * Todo lo que entró de un titular y qué pasó con eso (ADR-319): guías, consumo,
 * corridas, despachos, rendimiento y costo.
 *
 * Se consulta por nombre y no por id: el ingreso guarda `providerName` en texto
 * (ADR-134) y migrar el histórico es otro paso.
 */

export const GET = withApiHandler("forestal-proveedor-trazabilidad", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const ok = await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro");
  if (!ok) {
    return NextResponse.json(
      { error: "specialization_disabled", message: "El módulo CTP no está habilitado para este tenant." },
      { status: 403 },
    );
  }

  const proveedor = (req.nextUrl.searchParams.get("proveedor") ?? "").trim();
  if (proveedor.length < 2) {
    return NextResponse.json({ error: "missing_proveedor" }, { status: 400 });
  }

  const fecha = (v: string | null): Date | undefined => {
    if (!v) return undefined;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  };

  try {
    const datos = await ForestDirectorioDB.trazabilidadProveedor(auth.tenantId, proveedor, {
      desde: fecha(req.nextUrl.searchParams.get("desde")),
      hasta: fecha(req.nextUrl.searchParams.get("hasta")),
    });
    const trazabilidad = construirTrazabilidadProveedor(
      datos.ingresos,
      datos.consumos,
      datos.corridas,
      datos.despachos,
    );
    return NextResponse.json({ proveedor, trazabilidad });
  } catch (err) {
    logger.error("[proveedor-trazabilidad.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
