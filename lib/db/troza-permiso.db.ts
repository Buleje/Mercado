import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * El permiso de la troza (ADR-504): la troza = código de planta + permiso.
 *
 * `WoodEntryTroza.contratoId` es COPIA de `WoodEntry.contratoId` de su ingreso
 * (el índice único por permiso no puede mirar otra tabla). Dos puertas, y
 * ninguna otra:
 *   · `trozasConPermiso` — TODA alta de trozas (`createMany`) pasa sus filas
 *     por acá dentro de la misma tx: un solo lugar, no una copia por camino.
 *   · `arrastrarPermisoATrozas` — cuando el ingreso GANA permiso después
 *     (`TituloGuiaDB.declarar`), sus trozas lo siguen en la misma tx;
 *     `arrastrarPermisoDelContrato` es lo mismo para un `$transaction([…])` en
 *     lote (`ForestContratoDB.vincularPorCodigo`).
 * Si una troza queda en NULL, la base aplica la regla de hoy (un código por
 * centro): falla segura, nunca mezcla. `scripts/backfill-troza-contrato-adr504.mjs`
 * alinea lo que haya quedado atrás.
 */

/** Pura: a cada fila le pone el permiso de su ingreso (NULL si el ingreso no tiene o no se leyó). */
export function ponerPermisoDelIngreso<T extends { woodEntryId: string }>(
  filas: readonly T[],
  permisoDe: ReadonlyMap<string, string | null>,
): (T & { contratoId: string | null })[] {
  return filas.map((f) => ({ ...f, contratoId: permisoDe.get(f.woodEntryId) ?? null }));
}

/**
 * Las filas de un `woodEntryTroza.createMany` con el permiso de su ingreso.
 * Lee los ingresos DENTRO de la tx del alta: ve el ingreso recién creado y no
 * se adelanta a un cambio de permiso que esté en vuelo. Una sola ida por alta.
 */
export async function trozasConPermiso<T extends { woodEntryId: string }>(
  tx: Prisma.TransactionClient,
  tenantId: string,
  filas: readonly T[],
): Promise<(T & { contratoId: string | null })[]> {
  if (!tenantId) throw new Error("tenantId is required");
  const ids = [...new Set(filas.map((f) => f.woodEntryId))];
  if (ids.length === 0) return [];
  const ingresos = await tx.woodEntry.findMany({
    where: { tenantId, id: { in: ids } },
    select: { id: true, contratoId: true },
  });
  return ponerPermisoDelIngreso(filas, new Map(ingresos.map((i) => [i.id, i.contratoId])));
}

/**
 * Las trozas de estos ingresos toman el permiso que el ingreso tiene AHORA.
 * Sólo toca las que difieren (idempotente). Devuelve cuántas cambió.
 */
export async function arrastrarPermisoATrozas(
  tx: Prisma.TransactionClient,
  tenantId: string,
  woodEntryIds: readonly string[],
): Promise<number> {
  if (!tenantId) throw new Error("tenantId is required");
  const ids = [...new Set(woodEntryIds)];
  if (ids.length === 0) return 0;
  return tx.$executeRaw`
    UPDATE "WoodEntryTroza" t SET "contratoId" = e."contratoId"
    FROM "WoodEntry" e
    WHERE t."tenantId" = ${tenantId} AND e."tenantId" = ${tenantId}
      AND e."id" = t."woodEntryId" AND e."id" = ANY(${ids}::text[])
      AND t."contratoId" IS DISTINCT FROM e."contratoId"
  `;
}

/**
 * Para un `prisma.$transaction([…])` en lote, DESPUÉS del `updateMany` que ata
 * los ingresos al permiso: las trozas de los ingresos de este permiso lo toman.
 * Mismo UPDATE que `arrastrarPermisoATrozas`, filtrado por el permiso.
 */
export function arrastrarPermisoDelContrato(tenantId: string, contratoId: string) {
  if (!tenantId) throw new Error("tenantId is required");
  return prisma.$executeRaw`
    UPDATE "WoodEntryTroza" t SET "contratoId" = e."contratoId"
    FROM "WoodEntry" e
    WHERE t."tenantId" = ${tenantId} AND e."tenantId" = ${tenantId}
      AND e."id" = t."woodEntryId" AND e."contratoId" = ${contratoId}
      AND t."contratoId" IS DISTINCT FROM e."contratoId"
  `;
}
