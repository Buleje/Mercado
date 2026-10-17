import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { withDbRetry } from "@/lib/db-retry";
import { logger } from "@/lib/logger";
import { limaDateKey } from "@/lib/utils";
import { excepcionesDeCompras } from "@/lib/compras/excepciones-compras";
import { datosParaExcepciones, ROLES_QUE_VEN_LA_PLATA } from "@/lib/compras/datos-de-compras";

/**
 * GET /api/compras/excepciones — «Revisar pendientes» (C64).
 *
 * La bandeja de lo que necesita una mano: costos sin anotar, entregas
 * atrasadas, comprobantes repetidos y saldos que no cuadran con lo recibido.
 * Cada caso trae la diferencia, quién pidió o recibió y el enlace a donde se
 * arregla. Sólo lectura: «Ya lo revisé» vive en el navegador de quien revisa.
 *
 * Los saldos sólo los ve quien gestiona la plata (`plataOculta` para el resto).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const verPlata = ROLES_QUE_VEN_LA_PLATA.includes(auth.role);
  try {
    const datos = await withDbRetry(() => datosParaExcepciones(auth.tenantId, verPlata));
    return NextResponse.json(excepcionesDeCompras(datos, limaDateKey()));
  } catch (e) {
    logger.error("[compras/excepciones] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No pudimos revisar los pendientes. Prueba de nuevo." }, { status: 503 });
  }
}
