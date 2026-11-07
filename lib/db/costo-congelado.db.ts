import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { CtpInvariantError } from "./forest-ctp-consumo.db";

/**
 * El freno del costo congelado de un INGRESO — una sola regla para las dos
 * puertas que escriben `WoodEntry.costoTotal`: `WoodEntriesDB.setCosto` (una
 * guía) y `WoodEntriesPrecioDB.ponerPrecio` (en tanda).
 *
 * Al cerrar un mes, cada corrida copia a `ForestCtpConsumo.costoUnitarioSnap`
 * el costo por m³ de las guías que consumió (ADR-134 D6) y queda
 * `congeladoAt`. Cambiar después el costo de esa guía hace que el libro diga
 * dos cosas: el acta de la corrida con el precio viejo y la guía con el
 * nuevo. Reabrir el mes NO descongela (congelar es irreversible), así que el
 * guard del mes cerrado no alcanza: hay que mirar el consumo.
 *
 * Vivía sólo en la tanda; `setCosto` lo saltaba (revisión + seguridad
 * 2026-09-25). Por eso está acá y no copiado en cada puerta.
 */

/** Qué ingresos de la lista ya tienen alguna corrida con el costo congelado. */
export async function ingresosConCostoCongelado(
  db: Prisma.TransactionClient,
  tenantId: string,
  ids: readonly string[],
): Promise<Set<string>> {
  if (!tenantId) throw new Error("tenantId is required");
  if (ids.length === 0) return new Set();
  const rows = await db.forestCtpConsumo.findMany({
    where: { tenantId, congeladoAt: { not: null }, woodEntryId: { in: [...ids] } },
    select: { woodEntryId: true },
    distinct: ["woodEntryId"],
  });
  return new Set(rows.map((r) => r.woodEntryId));
}

/** El mensaje, igual en las dos puertas. */
export const mensajeCostoCongelado = (gtfNumber: string): string =>
  `El costo de la guía ${gtfNumber} ya quedó congelado en una corrida al cierre: cambiarlo haría que el libro diga dos cosas.`;

/** Tira `CONGELADO` (→ 422) si el ingreso ya tiene el costo congelado en alguna corrida. */
export async function exigirCostoNoCongelado(
  db: Prisma.TransactionClient,
  tenantId: string,
  woodEntryId: string,
  gtfNumber: string,
): Promise<void> {
  const congelados = await ingresosConCostoCongelado(db, tenantId, [woodEntryId]);
  if (congelados.has(woodEntryId)) {
    throw new CtpInvariantError(mensajeCostoCongelado(gtfNumber), "CONGELADO", { woodEntryId });
  }
}
