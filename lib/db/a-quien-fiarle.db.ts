import "server-only";

/**
 * «A quién fiarle»: junta por cliente lo que decide si se le fía —su deuda de
 * fiados (la misma que «Mis clientes» y «Por cobrar»), su historial de fiados,
 * el vencimiento más viejo, su límite y cuántas veces compró— y le aplica la
 * regla de `lib/credit/a-quien-fiarle.ts`.
 *
 * Reusa `CustomersDB.getAllConCompras` (deuda + compras, la misma lectura del
 * CRM) y agrega dos `groupBy` de fiados: sin N+1 por cliente.
 */

import { withRlsTx } from "@/lib/prisma-rls";
import { toNumOrZero } from "@/lib/decimal-utils";
import { limaDateKey } from "@/lib/utils";
import { CustomersDB } from "./customers.db";
import { diaUtc } from "./por-cobrar.db";
import { armarAQuienFiarle, type ClienteParaFiar, type FilaFiarle, type ResumenFiarle } from "@/lib/credit/a-quien-fiarle";

export interface AQuienFiarle {
  hoy: string;
  filas: FilaFiarle[];
  resumen: ResumenFiarle;
}

interface Historial {
  fiados: number;
  pagados: number;
  vencidosEstado: number;
}

export const AQuienFiarleDB = {
  async listar(tenantId: string, ahora: Date = new Date()): Promise<AQuienFiarle> {
    const [clientes, [porEstado, abiertos]] = await Promise.all([
      CustomersDB.getAllConCompras(tenantId),
      withRlsTx(tenantId, (tx) =>
        Promise.all([
          tx.fiado.groupBy({
            by: ["customerId", "status"],
            where: { tenantId, status: { not: "CANCELADO" } },
            _count: { _all: true },
          }),
          /* El vencimiento más viejo entre lo que todavía debe: de ahí salen los
             días de atraso (la caja bloquea pasados los 60). */
          tx.fiado.groupBy({
            by: ["customerId"],
            where: { tenantId, status: { in: ["ACTIVO", "VENCIDO"] }, saldo: { gt: 0 }, fechaVence: { not: null } },
            _min: { fechaVence: true },
          }),
        ]),
      ),
    ]);

    const historial = new Map<string, Historial>();
    for (const r of porEstado) {
      const h = historial.get(r.customerId) ?? { fiados: 0, pagados: 0, vencidosEstado: 0 };
      h.fiados += r._count._all;
      if (r.status === "PAGADO") h.pagados += r._count._all;
      if (r.status === "VENCIDO") h.vencidosEstado += r._count._all;
      historial.set(r.customerId, h);
    }
    /* `fechaVence` es un día de calendario guardado a medianoche UTC: se lee en
       UTC (como «Por cobrar»). En hora de Lima caía un día antes y el atraso
       salía un día más largo que el de esa lista. */
    const venceMasViejo = new Map(
      abiertos.map((r) => [r.customerId, diaUtc(r._min.fechaVence)]),
    );

    const paraFiar: ClienteParaFiar[] = clientes.map((c) => {
      const h = historial.get(c.phone);
      return {
        telefono: c.phone,
        nombre: c.name,
        limite: toNumOrZero(c.creditLimit),
        deuda: toNumOrZero(c.creditBalance),
        vencido: toNumOrZero(c.fiadoVencido),
        fiados: h?.fiados ?? 0,
        pagados: h?.pagados ?? 0,
        vencidosEstado: h?.vencidosEstado ?? 0,
        venceMasViejo: venceMasViejo.get(c.phone) ?? null,
        compras: c.compras,
        ultimaCompra: c.ultimaCompra,
      };
    });

    const hoy = limaDateKey(ahora);
    return { hoy, ...armarAQuienFiarle(paraFiar, hoy) };
  },
};
