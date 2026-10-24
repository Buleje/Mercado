import "server-only";
import { CierreDiarioPreviewDB } from "@/lib/db/cierre-diario-preview.db";
import { CajaPorDiaDB } from "@/lib/db/caja-por-dia.db";
import { SettingsDB } from "@/lib/db/settings.db";
import { logger } from "@/lib/logger";
import { toNumOrZero } from "@/lib/decimal-utils";
import { minimoGlobalDe, stockMinimoDe } from "@/lib/inventario/stock-minimo";
import { limaDayRange, limaDateKey } from "@/lib/utils";
import type { CuadreDelDia } from "@/lib/caja/cierres-por-dia";

/**
 * El cierre del día («Cerrar el día») armado en el servidor: lo usan el preview
 * del modal y el guardado (`POST /api/cierre-diario`), así lo guardado es lo
 * que se vio y el navegador no manda ningún total (revisión 19-10: antes el
 * POST guardaba los 13 totales que llegaban en el cuerpo).
 */
export interface CierreDelDiaArmado {
  /** Día de Lima `YYYY-MM-DD`. */
  fecha: string;
  ventas: { total: number; cantidad: number; ticketPromedio: number; mejorHora: string | null; productoTop: string | null };
  fiados: { cobradosHoy: number; nuevosHoy: number; vencidos: number };
  caja: {
    /** Lo que se cuenta ahora: el efectivo esperado de las cajas ABIERTAS. */
    efectivoEsperado: number;
    abiertas: number;
    /** Las cajas ya cerradas hoy, con su propio conteo (lo de Caja › Historial › Por día). */
    cerradas: CuadreDelDia;
  };
  stockAlertas: Array<{ nombre: string; stock: number; stockMin: number }>;
}

/** Un dato secundario que falla no tumba el cierre: queda en su valor vacío y se loguea. */
const vacioSiFalla =
  <T>(que: string, valor: T) =>
  (err: unknown): T => {
    logger.warn(`[cierre-del-dia] ${que} no disponible`, { error: String(err) });
    return valor;
  };

const r2 = (v: number) => Math.round(v * 100) / 100;

/** «13:00 - 14:00 (4 ventas)»: la hora de Lima con más ventas. */
function mejorHoraDe(ventas: ReadonlyArray<{ createdAt: Date | string }>): string | null {
  if (ventas.length === 0) return null;
  const porHora = new Map<number, number>();
  for (const v of ventas) {
    const h = (new Date(v.createdAt).getUTCHours() + 19) % 24; // Lima = UTC−5
    porHora.set(h, (porHora.get(h) ?? 0) + 1);
  }
  let mejor = 0;
  let max = 0;
  for (const [h, n] of porHora) {
    if (n > max) {
      max = n;
      mejor = h;
    }
  }
  return `${String(mejor).padStart(2, "0")}:00 - ${String(mejor + 1).padStart(2, "0")}:00 (${max} ventas)`;
}

export async function armarCierreDelDia(tenantId: string, ahora: Date = new Date()): Promise<CierreDelDiaArmado> {
  if (!tenantId) throw new Error("tenantId is required");
  const { start, end } = limaDayRange(ahora);
  const fecha = limaDateKey(ahora);

  // Un solo stock mínimo (09-10): el global del negocio para los productos sin mínimo propio.
  const minimoGlobal = minimoGlobalDe(await SettingsDB.get(tenantId).catch(vacioSiFalla("settings", null)));

  // La caja manda: si no se puede leer, el cierre no se arma (mejor un 503 que un cuadre en 0).
  const [abiertas, cerradas, agregado, detalle, top, cobrados, nuevos, vencidos, bajos] = await Promise.all([
    CajaPorDiaDB.esperadoDeAbiertas(tenantId),
    CajaPorDiaDB.cuadreDelDia(tenantId, fecha),
    CierreDiarioPreviewDB.aggregateSalesInRange(tenantId, start, end).catch(
      vacioSiFalla("ventas", { _sum: { total: null }, _count: 0, _avg: { total: null } }),
    ),
    CierreDiarioPreviewDB.listSalesInRange(tenantId, start, end).catch(vacioSiFalla("detalle de ventas", [])),
    CierreDiarioPreviewDB.topProductInRange(tenantId, start, end).catch(vacioSiFalla("producto top", [])),
    CierreDiarioPreviewDB.aggregateFiadoCuotasPaid(tenantId, start, end).catch(vacioSiFalla("fiados cobrados", { _sum: { monto: null } })),
    CierreDiarioPreviewDB.aggregateNewFiados(tenantId, start, end).catch(vacioSiFalla("fiados nuevos", { _sum: { total: null } })),
    CierreDiarioPreviewDB.countOverdueFiados(tenantId).catch(vacioSiFalla("fiados vencidos", 0)),
    CierreDiarioPreviewDB.listLowStockProducts(tenantId, minimoGlobal, 20).catch(vacioSiFalla("stock bajo", [])),
  ]);

  let productoTop: string | null = null;
  if (top.length > 0) {
    const producto = await CierreDiarioPreviewDB.findProductName(tenantId, top[0].productId);
    productoTop = producto ? `${producto.name} (${top[0]._sum?.quantity ?? 0} und)` : null;
  }

  return {
    fecha,
    ventas: {
      total: toNumOrZero(agregado._sum?.total),
      cantidad: agregado._count ?? 0,
      ticketPromedio: r2(toNumOrZero(agregado._avg?.total)),
      mejorHora: mejorHoraDe(detalle),
      productoTop,
    },
    fiados: {
      cobradosHoy: toNumOrZero(cobrados._sum?.monto),
      nuevosHoy: toNumOrZero(nuevos._sum?.total),
      vencidos: typeof vencidos === "number" ? vencidos : 0,
    },
    caja: { efectivoEsperado: abiertas.esperado, abiertas: abiertas.cajas, cerradas },
    stockAlertas: bajos
      .map((p) => ({ nombre: p.name, stock: p.stock ?? 0, stockMin: stockMinimoDe(p, minimoGlobal) }))
      .filter((p) => p.stock <= p.stockMin),
  };
}
