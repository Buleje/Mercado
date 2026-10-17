import "server-only";
import { logger } from "@/lib/logger";
import { minimoGlobalDe, STOCK_MINIMO_GLOBAL_POR_DEFECTO } from "@/lib/inventario/stock-minimo";

/**
 * El mínimo global del negocio (`Settings.globalMinStock`) para el servidor,
 * leído UNA vez por pedido y pasado a `stockMinimoDe` / `enStockBajo` para
 * cada producto (09-10, un solo stock mínimo). `SettingsDB.get` va por la
 * caché de 60 s; si la lectura falla vale el default del schema (5), nunca 0:
 * con 0 un producto sin mínimo propio dejaría de alertar.
 */
export async function minimoGlobalDelNegocio(tenantId: string): Promise<number> {
  try {
    // Import diferido: settings.db arrastra media capa de datos y este
    // módulo lo importan rutas y db chicas.
    const { SettingsDB } = await import("@/lib/db/settings.db");
    return minimoGlobalDe(await SettingsDB.get(tenantId));
  } catch (err) {
    logger.warn("[stock-minimo] no se pudo leer globalMinStock", { tenantId, error: String(err) });
    return STOCK_MINIMO_GLOBAL_POR_DEFECTO;
  }
}

/**
 * Para los crons que recorren varios negocios: un mínimo por tenant, una
 * lectura por tenant (no por producto).
 */
export async function minimosGlobalesPorNegocio(tenantIds: Iterable<string>): Promise<Map<string, number>> {
  const unicos = [...new Set(tenantIds)];
  const pares = await Promise.all(
    unicos.map(async (t) => [t, await minimoGlobalDelNegocio(t)] as const),
  );
  return new Map(pares);
}
