import "server-only";
import { prisma } from "@/lib/prisma";
import { CATEGORIA_GASTO_COMISIONES, type PagoComision } from "@/lib/comisiones/calcular";

/**
 * CommissionPagosDB — los pagos de comisión ya registrados como gasto.
 *
 * SIN caché a propósito: `ExpensesDB.getAll` tiene `"use cache"` (30 s) y tras
 * borrar un gasto seguía devolviéndolo (medido 08-10: «pagado 5.18» después
 * del DELETE). Para decidir si una comisión ya se pagó —y no pagarla dos
 * veces— hace falta la fila de verdad, no la del caché.
 */
const donde = (tenantId: string) => ({
  tenantId, category: CATEGORIA_GASTO_COMISIONES, recurring: false, notes: { startsWith: "comision:" },
});
const COLUMNAS = { id: true, amount: true, notes: true, date: true } as const;
const aPago = (f: { id: string; amount: unknown; notes: string | null; date: Date }): PagoComision => ({
  id: f.id, amount: Number(f.amount), notes: f.notes, date: f.date.toISOString(),
});

export const CommissionPagosDB = {
  async list(tenantId: string): Promise<PagoComision[]> {
    if (!tenantId) throw new Error("[CommissionPagosDB.list] tenantId required");
    const filas = await prisma.expense.findMany({ where: donde(tenantId), select: COLUMNAS, orderBy: { date: "desc" }, take: 2000 });
    return filas.map(aPago);
  },

  /**
   * Corre `pagar` con el candado del vendedor tomado
   * (`pg_advisory_xact_lock` por negocio + vendedor): dos pestañas que pagan
   * a la vez van en fila. `pagar` recibe los pagos leídos DESPUÉS de tomar el
   * candado; el gasto que registra (`ExpensesDB.add`, con su invalidación de
   * caché) se confirma antes de soltarlo, así que la segunda pestaña ya lo ve.
   */
  async conCandado<T>(tenantId: string, cashierId: string, pagar: (pagos: PagoComision[]) => Promise<T>): Promise<T> {
    if (!tenantId) throw new Error("[CommissionPagosDB.conCandado] tenantId required");
    return prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`comision-pago:${tenantId}:${cashierId}`}))`;
        // Sólo los pagos de ESTE vendedor y sin tope: con el `take: 2000` del
        // negocio entero, pasado ese número un período viejo ya no se veía
        // pagado y se podía volver a pagar. `comision:<id>:` puede traer de más
        // a otro vendedor cuyo id empiece igual; `leerMarcaDePago` lo descarta.
        const filas = await tx.expense.findMany({
          where: { ...donde(tenantId), notes: { startsWith: `comision:${cashierId}:` } },
          select: COLUMNAS,
          orderBy: { date: "desc" },
        });
        return pagar(filas.map(aPago));
      },
      { maxWait: 10_000, timeout: 20_000 },
    );
  },
};
