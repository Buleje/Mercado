import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { CashRegistersDB } from "@/lib/db/sales.db";
import { withDbRetry } from "@/lib/db-retry";
import { saldoEsperadoDeCaja } from "@/lib/caja/saldo-esperado";
import { veredictoArqueo } from "@/lib/caja/arqueo-veredicto";
import { logger } from "@/lib/logger";

/**
 * GET /api/finanzas/caja-abierta — la caja abierta y cuánto efectivo espera.
 *
 * Sólo lectura. El Resumen de Mi Plata mostraba como «efectivo» un 30 % de los
 * ingresos del mes, un número que nadie contó. Esto devuelve la caja de verdad:
 * desde cuándo está abierta, el desglose del esperado y su veredicto
 * (`imposible` si espera un saldo negativo, `pendiente` si no).
 *
 * Se calcula con TODOS los movimientos de la caja (`getOpen` no los recorta),
 * no con los 100 últimos que trae el listado de cajas.
 *
 * Respuesta: `{ abierta: false }` o
 * `{ abierta: true, id, desde, movimientos, apertura, ventasEfectivo, ingresos,
 *    egresos, esperado, veredicto }`.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const caja = await withDbRetry(() => CashRegistersDB.getOpen(auth.tenantId));
    if (!caja) {
      return NextResponse.json({ abierta: false }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const saldo = saldoEsperadoDeCaja(caja.openingAmount, caja.movements);
    const veredicto = veredictoArqueo({ expectedAmount: saldo.esperado, countedAmount: null });
    return NextResponse.json(
      {
        abierta: true,
        id: caja.id,
        desde: caja.openedAt,
        movimientos: caja.movements.length,
        ...saldo,
        veredicto,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    logger.error("[finanzas/caja-abierta] failed", { error: String(err) });
    return NextResponse.json({ error: "No se pudo leer la caja" }, { status: 500 });
  }
}
