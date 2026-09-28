import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * El permiso (`ForestContrato`) sólo si es uno VIVO de ESTE negocio; si no,
 * `null`. `contratoId` es una FK global: sin este filtro, un id de otro tenant
 * mandado a mano quedaba aceptado y el gasto, adelanto, flete o corrida se
 * imputaba a un contrato ajeno (revisión de ADR-442, 2026-09-27).
 *
 * Devuelve `null` en vez de fallar: la pantalla sólo ofrece los permisos
 * propios, así que un id ajeno es un pedido armado a mano o un permiso que se
 * dio de baja con la pantalla abierta — el registro entra sin permiso y queda
 * el aviso en el log. El alta de ingresos de madera sí rechaza
 * (`contratoDelTenant` en `wood-entries.db.ts`): ahí el permiso decide el saldo.
 */
export async function contratoPropio(
  tenantId: string,
  contratoId: string | null | undefined,
): Promise<string | null> {
  if (!tenantId) throw new Error("tenantId is required");
  const id = contratoId?.trim();
  if (!id) return null;
  const c = await prisma.forestContrato.findFirst({
    where: { id, tenantId, deletedAt: null },
    select: { id: true },
  });
  if (!c) logger.warn("[contrato-propio] permiso ajeno o dado de baja: se guarda sin permiso", { tenantId, contratoId: id });
  return c?.id ?? null;
}
