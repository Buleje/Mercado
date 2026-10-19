/**
 * La meta que vivía en el navegador (19-10, «una sola meta»).
 *
 * Mi Plata › Gastos › «Metas del mes» guardaba la meta de ventas y el tope de
 * gastos en `localStorage` («bodega-budget-config»): otra meta distinta de la
 * de Metas y logros (`/api/goals`), que no veía nadie más y se perdía al
 * cambiar de equipo. Ahora hay una sola, la del servidor. Si este navegador
 * todavía tiene la vieja y el servidor no tiene la suya, se ofrece UNA vez
 * guardarla en el sistema.
 *
 * Puro: lee el texto guardado y las metas del servidor, sin tocar el storage.
 */
import type { MetaDTO } from "@/lib/admin/metas-tareas";

/** Donde la guardaba la sección vieja: `{ month: "YYYY-MM", salesGoal, expensesGoal }`. */
export const CLAVE_META_VIEJA = "bodega-budget-config";
/** «No, gracias»: ya se ofreció en este navegador. */
export const CLAVE_META_VIEJA_OFRECIDA = "bodega-meta-anterior-ofrecida";

export interface MetaVieja {
  ventas: number | null;
  gastos: number | null;
}

const positivo = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null);

/**
 * Lo que había en el navegador para el mes `mes` («YYYY-MM» de Lima); `null` si
 * no hay nada que valga. La sección vieja sólo usaba la del mes en curso
 * (`parsed.month === ym`): una de mayo no es la meta de octubre y ofrecerla la
 * subiría como la actual.
 */
export function leerMetaVieja(raw: string | null, mes: string): MetaVieja | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as { month?: unknown; salesGoal?: unknown; expensesGoal?: unknown } | null;
    if (!o || typeof o !== "object" || o.month !== mes) return null;
    const ventas = positivo(o.salesGoal);
    const gastos = positivo(o.expensesGoal);
    return ventas || gastos ? { ventas, gastos } : null;
  } catch {
    return null;
  }
}

type MetaServidor = Pick<MetaDTO, "category" | "period">;

/** La meta mensual del servidor de esa categoría (la que se muestra y se cambia en Metas y logros). */
export function metaMensual<T extends MetaServidor>(metas: readonly T[], categoria: "ventas" | "gastos"): T | undefined {
  return metas.find((m) => m.category === categoria && m.period === "mensual");
}

/** Qué ofrecer guardar: sólo lo que el servidor todavía no tiene. `null` = nada. */
export function queOfrecerGuardar(vieja: MetaVieja | null, metas: readonly MetaServidor[]): MetaVieja | null {
  if (!vieja) return null;
  const ventas = vieja.ventas && !metaMensual(metas, "ventas") ? vieja.ventas : null;
  const gastos = vieja.gastos && !metaMensual(metas, "gastos") ? vieja.gastos : null;
  return ventas || gastos ? { ventas, gastos } : null;
}
