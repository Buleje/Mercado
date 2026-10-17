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
