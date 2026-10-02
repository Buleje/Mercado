import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { TenantPiezaDB } from "@/lib/db/tenant-pieza.db";
import { anotarFilaDeMatriz, catalogoDePiezas } from "@/lib/extensiones/resolver";

/**
 * GET /api/superadmin/piezas — catálogo de piezas + matriz negocios × piezas
 * (ADR-457). Sólo la sesión de PLATAFORMA (`requirePlatformAPI`): la matriz
 * cruza negocios a propósito (ADR-101).
 *
 * Response:
 *   {
 *     catalogo: { id, nombre, descripcion, version, enchufes[], rubros[], requiere[],
 *                 opcionesSchema (JSON Schema de entrada), opcionesPorDefecto | null }[],
 *     matriz:   { id, tenantId, tenantSlug, tenantNombre, piezaId, enchufe, prendida,
 *                 opciones, version, orden, actualizadoPor, createdAt, updatedAt,
 *                 huerfana, desactualizada, opcionesValidas }[]
 *   }
 */
export async function GET(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const rl = applyRateLimit(req, "GENEROUS", "superadmin-piezas-leer");
  if (rl) return rl;

  try {
    const matriz = (await TenantPiezaDB.matriz()).map(anotarFilaDeMatriz);
    return NextResponse.json({ catalogo: catalogoDePiezas(), matriz });
  } catch (err) {
    logger.error("[superadmin/piezas.GET] failed", { error: String(err) });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
