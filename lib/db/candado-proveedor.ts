import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * Pone en fila, dentro de una transacción, lo que se decide mirando lo ya
 * registrado con UN proveedor y después escribe (revisión de security 17-10).
 *
 * - `por-pagar`: «¿ya existe esa factura u orden?» + crear o vincular la cuenta.
 *   Sin candado, 5 POST simultáneos con la misma factura dejaban 5 deudas.
 * - `devoluciones`: el tope de lo recibido + crear la devolución. Sin candado,
 *   dos pestañas creaban dos devoluciones de 10 sobre 10 recibidos.
 *
 * Cada ámbito es una clave distinta: una devolución no espera a una cuenta.
 * `pg_advisory_xact_lock` se suelta solo al terminar la transacción.
 */
export type AmbitoCandadoProveedor = "por-pagar" | "devoluciones";

export async function candadoDelProveedor(
  tx: Pick<Prisma.TransactionClient, "$executeRaw">,
  tenantId: string,
  supplierId: string,
  ambito: AmbitoCandadoProveedor,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${`${ambito}:${supplierId}`}))`;
}
