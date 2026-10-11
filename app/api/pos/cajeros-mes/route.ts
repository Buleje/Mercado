import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { PosControlCajerosDB } from "@/lib/db/pos-control-cajeros.db";
import { parsearMes, rangoDelMesLima, mesLima } from "@/lib/finance/ingresos-del-periodo";
import { resumirPorUsuario } from "@/lib/pos/quitados";

/**
 * GET /api/pos/cajeros-mes?mes=YYYY-MM — control del mes por cajero para
 * Turnos › Cajeros: descuentos dados en el POS (Square «descuentos por
 * empleado») y productos quitados del ticket antes de cobrar («voids»).
 *
 * La clave de cada fila es la que guarda la base (`username`; ventas viejas, el
 * id del usuario): la pantalla la cruza con su lista de cajeros. Sólo dueño,
 * admin y encargado: es la plata de todo el equipo.
 */
export async function GET(req: NextRequest) {
  const _rl = applyRateLimit(req, "SHELL_POLL", "pos-cajeros-mes");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const mes = parsearMes(new URL(req.url).searchParams.get("mes")) ?? mesLima(new Date());
  const { start, end } = rangoDelMesLima(mes);

  try {
    const [descuentos, renglones] = await Promise.all([
      PosControlCajerosDB.descuentosPorCajero(auth.tenantId, start, end),
      PosControlCajerosDB.quitadosDelMes(auth.tenantId, start, end),
    ]);
    const quitados = resumirPorUsuario(renglones);
    const claves = new Set<string>([...descuentos.map((d) => d.cajero), ...quitados.keys()]);
    const cajeros = [...claves].map((clave) => {
      const d = descuentos.find((x) => x.cajero === clave);
      const q = quitados.get(clave);
      return {
        clave,
        descuentos: { monto: d?.monto ?? 0, tickets: d?.tickets ?? 0 },
        quitados: q ?? { veces: 0, unidades: 0, monto: 0 },
      };
    });
    return NextResponse.json({ mes, cajeros });
  } catch (e) {
    logger.error("[pos/cajeros-mes] GET", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
