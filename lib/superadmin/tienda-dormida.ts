import type { SenalesDeUso } from "@/lib/db/salud-negocio.db";

/**
 * Regla «Tienda dormida» (automatización stale-30d) — lógica PURA, sin base ni `server-only`
 * para poder probarla sola. La lectura vive en `AutomatizacionesDB`.
 *
 * Dormida = en 30 días sin NINGUNA operación real: pedidos, ventas POS, líneas del libro CTP
 * ni ingresos de trozas (`operaciones30d` de `SaludNegocioDB.senalesDeUso`). Antes sólo miraba
 * pedidos y marcaba como abandonado a un aserradero que trabaja a diario con el libro.
 */

/** Lo único que la regla necesita de las señales de uso. */
export type SenalesParaDormida = Pick<SenalesDeUso, "operaciones30d">;

/**
 * `null` = no se pudieron leer las señales: NO se marca dormida (es mejor no avisar que
 * mandarle «reactiva tu tienda» a un negocio que sí trabaja).
 */
export function estaDormida(senales: SenalesParaDormida | null | undefined): boolean {
  if (!senales) return false;
  return senales.operaciones30d <= 0;
}

/** De los negocios activos, los dormidos según sus señales (por `id`; los sin lectura no entran). */
export function tiendasDormidas<T extends { id: string }>(
  activas: readonly T[],
  senalesPorTienda: ReadonlyMap<string, SenalesParaDormida | null>,
): T[] {
  return activas.filter((t) => estaDormida(senalesPorTienda.get(t.id)));
}
