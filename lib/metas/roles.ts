/**
 * lib/metas/roles.ts — quién puede ver lo que miden las metas (ADR-488).
 *
 * El avance, lo vendido por hora/día y los logros son plata del negocio
 * (ventas, compras, gastos, caja, fiados): los ven los roles que leen ventas Y
 * gastos en la matriz — admin, dueño, encargado y analista. Cajero y almacenero
 * reciben 403 y la pantalla se los dice sin ofrecer «Reintentar».
 *
 * Una sola constante para `/api/goals/avance`, `/serie` y `/logros`: si una
 * ruta se abre más que las otras, el cajero ve por una lo que la otra le niega
 * (`__tests__/metas-roles-serie.test.ts` lo vigila).
 */
import type { AdminRole } from "@/lib/session";

export const ROLES_AVANCE: readonly AdminRole[] = ["admin", "owner", "manager", "analista"];
