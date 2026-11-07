import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
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

/** Un cambio de los campos de caja de una fila: se escribe `despues` sólo si la fila sigue en `antes`. */
export interface CambioDeCaja {
  id: string;
  antes: CamposDeCaja;
  despues: CamposDeCaja;
}

/** Filas por sentencia del arreglo en lote (cada ida a Supabase son ~119 ms; sin transacción entre lotes). */
const LOTE = 50;

const aNumero = (v: Prisma.Decimal | null) => (v == null ? null : Number(v));

/**
 * El UPDATE de un lote de `cambiarCajaDelCron` (exportado para validarlo con
 * `EXPLAIN` dentro de `BEGIN READ ONLY` sin escribir): compara-y-cambia en el
 * WHERE, con `tenantId`.
 */
export function sentenciaDeCambioDeCaja(tenantId: string, lote: readonly CambioDeCaja[]): Prisma.Sql {
  const filas = lote.map(
    (c) => Prisma.sql`(${c.id}::text, ${c.despues.efectivoEsperado}::numeric, ${c.despues.efectivoContado}::numeric, ${c.despues.diferenciaCaja}::numeric,
      ${c.antes.efectivoEsperado}::numeric, ${c.antes.efectivoContado}::numeric, ${c.antes.diferenciaCaja}::numeric)`,
  );
  return Prisma.sql`
    UPDATE "DailySummary" AS d
    SET "efectivoEsperado" = v.esp, "efectivoContado" = v.cont, "diferenciaCaja" = v.dif
    FROM (VALUES ${Prisma.join(filas)}) AS v(id, esp, cont, dif, esp_antes, cont_antes, dif_antes)
    WHERE d."id" = v.id AND d."tenantId" = ${tenantId} AND d."creadoPor" = ${"cron"}
      AND d."efectivoEsperado" = v.esp_antes
      AND d."efectivoContado" IS NOT DISTINCT FROM v.cont_antes
      AND d."diferenciaCaja" = v.dif_antes`;
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

  /**
   * Mantenimiento (`scripts/recalcular-cierres-viejos.ts`): los negocios con
   * resúmenes del cron SIN cuadre (esperado 0, contado vacío, diferencia 0)
   * de antes de `antesDe`. Es el único método sin `tenantId`: enumera negocios.
   */
  async negociosConCronSinCuadre(antesDe: Date): Promise<Array<{ tenantId: string; slug: string }>> {
    const tenants = await prisma.tenant.findMany({
      where: { dailySummaries: { some: { creadoPor: "cron", efectivoEsperado: 0, efectivoContado: null, diferenciaCaja: 0, fecha: { lt: antesDe } } } },
      select: { id: true, slug: true },
      orderBy: { slug: "asc" },
    });
    return tenants.map((t) => ({ tenantId: t.id, slug: t.slug }));
  },

  /** Los resúmenes del cron SIN cuadre de un negocio, de antes de `antesDe` (del más viejo al más nuevo). */
  async cronSinCuadre(tenantId: string, antesDe: Date) {
    if (!tenantId) throw new Error("tenantId is required");
    const filas = await prisma.dailySummary.findMany({
      where: { tenantId, creadoPor: "cron", efectivoEsperado: 0, efectivoContado: null, diferenciaCaja: 0, fecha: { lt: antesDe } },
      select: { id: true, tenantId: true, fecha: true, creadoPor: true, efectivoEsperado: true, efectivoContado: true, diferenciaCaja: true },
      orderBy: { fecha: "asc" },
    });
    return filas.map((f) => ({
      ...f,
      efectivoEsperado: Number(f.efectivoEsperado),
      efectivoContado: aNumero(f.efectivoContado),
      diferenciaCaja: Number(f.diferenciaCaja),
    }));
  },

  /**
   * Cambia los campos de caja de resúmenes del cron, en lotes de 50 por
   * sentencia y sin transacción entre lotes. Cada fila se escribe SÓLO si sigue
   * como dice `antes` (comparar-y-cambiar en el WHERE, con `tenantId`): correrlo
   * dos veces no cambia nada la segunda, y nunca pisa una fila que el cron ya
   * completó. Sirve para aplicar el arreglo y para revertirlo (antes ↔ después).
   * Devuelve cuántas filas cambió.
   */
  async cambiarCajaDelCron(tenantId: string, cambios: readonly CambioDeCaja[]): Promise<number> {
    if (!tenantId) throw new Error("tenantId is required");
    let total = 0;
    for (let i = 0; i < cambios.length; i += LOTE) {
      total += await prisma.$executeRaw(sentenciaDeCambioDeCaja(tenantId, cambios.slice(i, i + LOTE)));
    }
    return total;
  },
};
