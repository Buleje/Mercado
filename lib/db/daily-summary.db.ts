import "server-only";
import { prisma } from "@/lib/prisma";
import { candadoDelNegocio } from "@/lib/db/candado";

/**
 * DailySummaryDB
 *
 * Audit project-wide 2026-05-19 — migracion de /api/cierre-diario.
 * Snapshot diario de KPIs de caja (ventas, fiados, mejor hora, etc.).
 */

/** Lo que guarda «Cerrar el día»: todo armado en el servidor. */
interface CierreAMano {
  totalVentas: number;
  cantidadVentas: number;
  ticketPromedio: number;
  efectivoContado: number | null;
  efectivoEsperado: number;
  diferenciaCaja: number;
  fiadosCobrados: number;
  fiadosNuevos: number;
  fiadosVencidos: number;
  mejorHora: string | null;
  productoTop: string | null;
  stockAlertas: string | null;
  notas: string | null;
  creadoPor: string;
}

/** Lo que guarda el cron cada día (los campos de caja salen del cuadre de las cajas cerradas). */
interface ResumenDelCron {
  totalVentas: number;
  cantidadVentas: number;
  ticketPromedio: number;
  efectivoEsperado: number;
  efectivoContado: number | null;
  diferenciaCaja: number;
  stockAlertas: string;
  productoTop: string | null;
}

/** Los campos de caja del resumen (`camposDeCajaDelResumen` de `lib/caja/cierres-por-dia`). */
interface CamposDeCaja {
  efectivoEsperado: number;
  efectivoContado: number | null;
  diferenciaCaja: number;
}

/** Clave del candado de un resumen: el mismo día y el mismo autor (cron / a mano) van en fila. */
const claveDelResumen = (fecha: Date, quien: "cron" | "mano") => `resumen-diario:${fecha.toISOString().slice(0, 10)}:${quien}`;

export const DailySummaryDB = {
  /**
   * Guarda el resumen del cron del día `fecha` (medianoche UTC del día de Lima):
   * actualiza el SUYO si ya corrió hoy, si no lo crea. Nunca pisa un cierre
   * hecho a mano. Sin clave única en la tabla: dos corridas a la vez hacen fila
   * en el candado del día y la segunda actualiza la fila de la primera.
   */
  async guardarDelCron(tenantId: string, fecha: Date, data: ResumenDelCron): Promise<void> {
    if (!tenantId) throw new Error("tenantId is required");
    await prisma.$transaction(async (tx) => {
      await candadoDelNegocio(tx, tenantId, claveDelResumen(fecha, "cron"));
      const existente = await tx.dailySummary.findFirst({
        where: { tenantId, fecha, creadoPor: "cron" },
        select: { id: true },
      });
      if (existente) {
        await tx.dailySummary.updateMany({ where: { id: existente.id, tenantId }, data: { ...data, mejorHora: null } });
      } else {
        await tx.dailySummary.create({ data: { tenantId, fecha, ...data, creadoPor: "cron" } });
      }
    });
  },

  /**
   * Completa el cuadre del resumen del cron de un día ya terminado: el cron
   * corre a las 16:07 de Lima, antes de que cierren las cajas, así que el de
   * hoy queda a medias y se termina en la corrida de mañana. Devuelve cuántas
   * filas tocó (0 si ese día el cron no corrió).
   */
  async completarCuadre(tenantId: string, fecha: Date, caja: CamposDeCaja): Promise<number> {
    if (!tenantId) throw new Error("tenantId is required");
    const r = await prisma.dailySummary.updateMany({ where: { tenantId, fecha, creadoPor: "cron" }, data: caja });
    return r.count;
  },

  /**
   * «Cerrar el día» (a mano): UNA fila por día. Si ya se cerró hoy, se
   * actualiza esa fila (quién la cerró pasa a ser el último); si no, se crea.
   * Los totales llegan armados por el servidor (`armarCierreDelDia`), nunca del
   * navegador. Dos clics a la vez hacen fila en el candado del día.
   */
  async guardarAMano(tenantId: string, fecha: Date, data: CierreAMano): Promise<{ id: string; creado: boolean }> {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.$transaction(async (tx) => {
      await candadoDelNegocio(tx, tenantId, claveDelResumen(fecha, "mano"));
      const existente = await tx.dailySummary.findFirst({
        where: { tenantId, fecha, creadoPor: { not: "cron" } },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (existente) {
        await tx.dailySummary.updateMany({ where: { id: existente.id, tenantId }, data });
        return { id: existente.id, creado: false };
      }
      const fila = await tx.dailySummary.create({ data: { tenantId, fecha, ...data }, select: { id: true } });
      return { id: fila.id, creado: true };
    });
  },
};
