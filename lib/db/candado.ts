import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * Pone en fila, dentro de una transacción, a quien pide la MISMA clave del MISMO negocio:
 * el segundo espera en esta sentencia hasta que el primero termina (commit o rollback).
 * `pg_advisory_xact_lock` se suelta solo al cerrar la transacción; no hay que liberarlo.
 *
 * Es el patrón «leer lo ya registrado → decidir → escribir» sin carrera: sin candado, dos
 * pedidos a la vez leen lo mismo y los dos pasan el tope (notas de crédito, revisión 17-10).
 *
 * Clave de dos enteros `(hashtext(tenantId), hashtext(clave))`: la misma que arma
 * `candadoDelProveedor` (`candado-proveedor.ts`, de Compras) con `clave = "<ámbito>:<proveedor>"`,
 * así que ese helper puede delegar acá sin cambiar ningún candado.
 */
export async function candadoDelNegocio(
  tx: Pick<Prisma.TransactionClient, "$executeRaw">,
  tenantId: string,
  clave: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${clave}))`;
}

/**
 * Varias claves de una vez, en UNA ida a la base (un lote de 200 marcas no
 * puede pagar 200 idas de ~119 ms dentro de la tx). Misma clave de dos enteros
 * que `candadoDelNegocio`, así que los dos helpers se esperan entre sí. Se toman
 * ordenadas por su hash (la subconsulta con DISTINCT no se aplana y entrega las
 * filas en ese orden): dos lotes que comparten claves nunca se cruzan en un
 * deadlock.
 */
export async function candadosDelNegocio(
  tx: Pick<Prisma.TransactionClient, "$executeRaw">,
  tenantId: string,
  claves: readonly string[],
): Promise<void> {
  const unicas = [...new Set(claves)];
  if (unicas.length === 0) return;
  if (unicas.length === 1) return candadoDelNegocio(tx, tenantId, unicas[0]);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(s.t, s.c) FROM (SELECT DISTINCT hashtext(${tenantId}) AS t, hashtext(k) AS c FROM unnest(${unicas}::text[]) AS k ORDER BY c) AS s`;
}
