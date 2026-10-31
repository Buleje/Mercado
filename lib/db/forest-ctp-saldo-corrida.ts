import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * Cuánto queda de una corrida de producción — la única fuente (ADR-316).
 *
 * ## Por qué existe
 *
 * Hasta ahora sólo el despacho consumía producto, así que I5 podía calcular
 * `disponible = producido − despachado` por su cuenta. Con el **reproceso** hay
 * un segundo consumidor, y dos cálculos separados dejan un hueco evidente:
 * producir 10, reprocesar 8 y después despachar 10 pasaría las dos validaciones
 * por separado, con 8 m³ de madera que ya no existen.
 *
 * Por eso el saldo se calcula UNA vez, acá, y lo usan los dos.
 *
 * ## Qué descuenta y qué no
 *
 * | | ¿descuenta? | por qué |
 * |---|---|---|
 * | Despacho | **sí** | la madera se fue del patio |
 * | Reproceso | **sí** | el producto original dejó de existir como tal |
 * | Lote | **no** | es una etiqueta comercial, no un segundo stock (ADR-136) |
 *
 * Los despachos y reprocesos **anulados no reservan nada**: si el acta se anuló,
 * la madera volvió a estar disponible.
 */

/**
 * Un consumo anulado no sigue reservando la corrida.
 *
 * ⚠️ Hacen falta **las dos** condiciones. La anulación de una línea del CTP pone
 * `status = "anulado"` y **NO** hace soft-delete: filtrar sólo por `deletedAt`
 * dejaría que 35 despachos anulados de este tenant siguieran reservando madera
 * que en realidad está disponible. Es el mismo predicado que `ORIGEN_VIGENTE`
 * de `forest-ctp-despacho.db`, de donde salió esta cuenta.
 */
const VIGENTE = { deletedAt: null, status: "registrado" } as const;

export type SaldoCorrida = {
  produccionEntryId: string;
  lineNo: number | null;
  producido: number;
  despachado: number;
  reprocesado: number;
  disponible: number;
};

const r4 = (n: number) => Number(n.toFixed(4));

/**
 * Saldo de varias corridas en una sola pasada.
 *
 * `excluir` deja fuera un despacho o un reproceso concreto: al **editar** uno,
 * lo que él mismo ya tenía atribuido no puede contarse como si fuera de otro,
 * o su propia edición se rechazaría a sí misma.
 */
export async function saldosDeCorridas(
  /** Sirve dentro de una tx o con el cliente suelto: sólo lee. */
  tx: Pick<Prisma.TransactionClient, "forestCtpEntry" | "forestCtpDespachoOrigen" | "forestCtpReproceso">,
  tenantId: string,
  produccionEntryIds: string[],
  excluir?: { despachoEntryId?: string; reprocesoDestinoId?: string },
): Promise<Map<string, SaldoCorrida>> {
  const ids = [...new Set(produccionEntryIds)].filter(Boolean);
  const salida = new Map<string, SaldoCorrida>();
  if (ids.length === 0) return salida;

  const [corridas, despachos, reprocesos] = await Promise.all([
    tx.forestCtpEntry.findMany({
      // Mismo predicado que usa el despacho: una corrida anulada no tiene
      // producción disponible. Sin el `status` una de las 45 anuladas de este
      // tenant ofrecería su cantidad entera como saldo.
      where: { id: { in: ids }, tenantId, ...VIGENTE },
      select: { id: true, lineNo: true, quantity: true },
    }),
    tx.forestCtpDespachoOrigen.groupBy({
      by: ["produccionEntryId"],
      where: {
        tenantId,
        produccionEntryId: { in: ids },
        ...(excluir?.despachoEntryId ? { despachoEntryId: { not: excluir.despachoEntryId } } : {}),
        despacho: VIGENTE,
      },
      _sum: { quantity: true },
    }),
    tx.forestCtpReproceso.groupBy({
      by: ["origenEntryId"],
      where: {
        tenantId,
        origenEntryId: { in: ids },
        ...(excluir?.reprocesoDestinoId ? { destinoEntryId: { not: excluir.reprocesoDestinoId } } : {}),
        destino: VIGENTE,
      },
      _sum: { quantity: true },
    }),
  ]);

  const porDespacho = new Map(despachos.map((d) => [d.produccionEntryId, Number(d._sum.quantity ?? 0)]));
  const porReproceso = new Map(reprocesos.map((r) => [r.origenEntryId, Number(r._sum.quantity ?? 0)]));

  for (const c of corridas) {
    const producido = c.quantity ? Number(c.quantity) : 0;
    const despachado = porDespacho.get(c.id) ?? 0;
    const reprocesado = porReproceso.get(c.id) ?? 0;
    salida.set(c.id, {
      produccionEntryId: c.id,
      lineNo: c.lineNo,
      producido: r4(producido),
      despachado: r4(despachado),
      reprocesado: r4(reprocesado),
      // Nunca negativo: si diera menos que cero es que hay datos viejos
      // inconsistentes, y mostrar un saldo negativo dejaría atribuir de más.
      disponible: r4(Math.max(0, producido - despachado - reprocesado)),
    });
  }
  return salida;
}

/** Cómo se explica un saldo cuando la atribución no entra. */
export function explicarSaldo(s: SaldoCorrida): string {
  const partes: string[] = [];
  if (s.despachado > 0) partes.push(`${s.despachado} despachado`);
  if (s.reprocesado > 0) partes.push(`${s.reprocesado} reprocesado`);
  return partes.length > 0 ? ` (${partes.join(" · ")})` : "";
}
