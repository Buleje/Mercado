import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { DailySummaryDB } from "@/lib/db/daily-summary.db";
import { armarCierreDelDia } from "@/lib/caja/cierre-del-dia.server";
import { camposDeCajaDelCierreAMano, ROLES_CIERRE_DEL_DIA } from "@/lib/caja/cierres-por-dia";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * «Cerrar el día»: el navegador manda SÓLO lo que contó y la nota. Fecha (día
 * de Lima), ventas, fiados, stock y el esperado de caja los arma el servidor
 * con la misma cuenta que el preview (revisión 19-10: antes guardaba los 13
 * totales del cuerpo y la fecha como texto libre). Cualquier otro campo que
 * llegue se ignora.
 */
const CierreDiarioSchema = z.object({
  /** Efectivo contado en las cajas ABIERTAS; null = se saltó el conteo. */
  efectivoContado: z.number().finite().nonnegative().max(10_000_000).nullable().optional(),
  notas: z.string().max(2000).nullable().optional(),
});

export async function POST(req: NextRequest) {
  const rateLimitResult = applyRateLimit(req, "STRICT", "cierre-diario-post");
  if (rateLimitResult) return rateLimitResult;

  const auth = await requireAdmin(req, ROLES_CIERRE_DEL_DIA);
  if (auth instanceof NextResponse) return auth;

  const parsed = CierreDiarioSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  try {
    const cierre = await armarCierreDelDia(auth.tenantId);
    const caja = camposDeCajaDelCierreAMano(cierre.caja.efectivoEsperado, cierre.caja.cerradas, parsed.data.efectivoContado ?? null);
    const { id, creado } = await DailySummaryDB.guardarAMano(auth.tenantId, new Date(`${cierre.fecha}T00:00:00.000Z`), {
      totalVentas: cierre.ventas.total,
      cantidadVentas: cierre.ventas.cantidad,
      ticketPromedio: cierre.ventas.ticketPromedio,
      ...caja,
      fiadosCobrados: cierre.fiados.cobradosHoy,
      fiadosNuevos: cierre.fiados.nuevosHoy,
      fiadosVencidos: cierre.fiados.vencidos,
      mejorHora: cierre.ventas.mejorHora,
      productoTop: cierre.ventas.productoTop,
      stockAlertas: cierre.stockAlertas.length > 0 ? JSON.stringify(cierre.stockAlertas) : null,
      notas: parsed.data.notas?.trim() || null,
      creadoPor: auth.username,
    });

    logActivity(
      creado ? "Crear" : "Actualizar", "cierre-diario",
      `Cierre del día ${cierre.fecha} — Ventas: S/${cierre.ventas.total.toFixed(2)}`,
      id, auth.username,
    ).catch((err) => logger.error("[cierre-diario] logActivity failed", { error: String(err) }));

    return NextResponse.json({ id, creado, fecha: cierre.fecha, ...caja }, { status: creado ? 201 : 200 });
  } catch (e) {
    logger.error("[cierre-diario] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error al guardar cierre" }, { status: 503 });
  }
}
