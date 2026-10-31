import { NextRequest, NextResponse } from "next/server";
import { cuentasDelNegocio } from "@/lib/adelantos/cuentas-del-negocio";
import { requireAdmin } from "@/lib/require-admin";
import { permisoAdelantos } from "@/lib/adelantos/permisos";
import { logger } from "@/lib/logger";

/**
 * GET /api/adelantos/cuentas — Adelantos y la cuenta corriente forestal, una
 * fila por persona (ADR-412 §5). `forestal:false` cuando el tenant no tiene la
 * especialización: no se toca `ForestCuentaMov`/`ForestParty` de un negocio
 * que ni siquiera las usa. `truncado` avisa si los movimientos forestales
 * llegaron al tope en vez de mostrar un saldo corto en silencio.
 *
 * La cuenta la arma `cuentasDelNegocio` (25-10): es la misma que suman las
 * cifras del Resumen («Te deben» / «Le debes»), así que las dos no pueden
 * volver a separarse.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const sinPermiso = permisoAdelantos(auth.role, "read");
  if (sinPermiso) return sinPermiso;
  try {
    const { forestal, personas, truncado } = await cuentasDelNegocio(auth.tenantId);
    // Sin caché: justo después de `vincular_parte` esta misma ruta tiene que
    // reflejar el vínculo nuevo — un `max-age` la dejaba mostrando la fila
    // vieja hasta 30 s (revisión de código, hallazgo medio).
    return NextResponse.json({ forestal, personas, truncado }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    logger.error("[adelantos/cuentas] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
