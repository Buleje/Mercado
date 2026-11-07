/**
 * El filtro por permiso de un pedido al Libro TH (lista, contadores, Excel).
 *
 * `planId` + `solo` se validan con Zod (`leerFiltroPermiso`); un plan que no
 * es de ESTE negocio, o que se dio de baja, es 404 — el `tenantId` de la
 * sesión va en el `where` de `ForestPlanDB.getPlan`, no en un `if` después.
 * Sin esto, `?planId=` se ignoraba y la respuesta traía el libro entero.
 */

import { NextResponse } from "next/server";
import type { ForestPlanDB as ForestPlanDBTipo } from "@/lib/db/forest-plan.db";
import { leerFiltroPermiso, type FiltroPermiso } from "@/lib/forestal/loth-filtro-permiso";

type PlanDelPedido = NonNullable<Awaited<ReturnType<typeof ForestPlanDBTipo.getPlan>>>;

export async function permisoDelPedido(
  tenantId: string,
  sp: URLSearchParams,
): Promise<{ filtro: FiltroPermiso | null; plan: PlanDelPedido | null } | NextResponse> {
  const leido = leerFiltroPermiso(sp);
  if (!leido.ok) return NextResponse.json({ error: "invalid_query", message: leido.mensaje }, { status: 400 });
  if (leido.filtro?.tipo !== "plan") return { filtro: leido.filtro, plan: null };
  /* Import perezoso: `forest-plan.db` arrastra medio módulo forestal (1,7 s de
     import medido en vitest) y el Excel del libro entero no lo necesita — con
     el import arriba, la prueba de las 650 líneas pasaba a cortarse por tiempo. */
  const { ForestPlanDB } = await import("@/lib/db/forest-plan.db");
  const plan = await ForestPlanDB.getPlan(tenantId, leido.filtro.planId);
  if (!plan) {
    return NextResponse.json({ error: "not_found", message: "Ese permiso no existe en este negocio." }, { status: 404 });
  }
  return { filtro: leido.filtro, plan };
}
