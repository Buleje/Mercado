import "server-only";
import { SettingsDB } from "@/lib/db/settings.db";
import { findTenantByIdOrSlug } from "@/lib/tenant";
import type { TiendaSectionKey } from "@/components/admin/StorefrontEditor";

/**
 * Orden y visibilidad por defecto de las secciones de la tienda.
 * Mantener sincronizado con `StorefrontEditor` — si cambia el
 * conjunto de `TiendaSectionKey`, actualizar estas listas.
 */
export const TIENDA_DEFAULT_ORDER: TiendaSectionKey[] = [
  "daily_special",
  "seasonal_promo",
  "countdown",
  "flash_deals",
  "popular_products",
  "featured_carousel",
  "combos",
  "last_units",
  "recipes",
  "favorites",
  "recently_viewed",
];

// Secciones que inician apagadas cuando no hay config en BD.
export const TIENDA_DEFAULT_DISABLED = new Set<TiendaSectionKey>(["recipes"]);

export type TiendaSectionConfig = {
  /** Conjunto de claves marcadas como visibles en el admin. */
  visible: Set<TiendaSectionKey>;
  /** Orden exacto con el que el admin quiere que se pinten. */
  order: TiendaSectionKey[];
  /** Contenido libre — futuros overrides por seccion. */
  sectionContent: Record<string, unknown>;
  /** Tenant ID canónico (cuid). Util para otros loaders. */
  tenantId: string;
  /** Slug legible de la tienda ("main", "bodega-san-martin", etc.). */
  tenantSlug: string;
};

/**
 * Carga la configuracion de secciones de la tienda publica a partir de un
 * slug o ID de tenant. Resuelve slug→id contra Prisma y reutiliza SettingsDB
 * (que ya tiene cache in-process) para leer `storeTheme`.
 *
 * Contract:
 *   - NUNCA inventa productos — solo devuelve metadata (visible/order/content).
 *   - Si no hay config persistida, devuelve defaults (todo ON menos recipes).
 *   - Si el tenant no existe, devuelve los defaults para que la pagina siga
 *     renderizando con placeholders en lugar de 500.
 */
export async function getTiendaSectionConfig(
  tenantSlugOrId: string,
): Promise<TiendaSectionConfig> {
  const defaultVisible = new Set<TiendaSectionKey>(
    TIENDA_DEFAULT_ORDER.filter((k) => !TIENDA_DEFAULT_DISABLED.has(k)),
  );

  const fallback: TiendaSectionConfig = {
    visible: defaultVisible,
    order: TIENDA_DEFAULT_ORDER,
    sectionContent: {},
    tenantId: tenantSlugOrId,
    tenantSlug: tenantSlugOrId,
  };

  try {
    const tenant = await findTenantByIdOrSlug(tenantSlugOrId);
    const tenantId = tenant?.id ?? tenantSlugOrId;
    const tenantSlug = tenant?.slug ?? tenantSlugOrId;

    const settings = await SettingsDB.get(tenantId);
    const theme = settings?.storeTheme as Record<string, unknown> | undefined;

    const visibleKeys: TiendaSectionKey[] = Array.isArray(theme?.tiendaSections)
      ? (theme.tiendaSections as TiendaSectionKey[])
      : [];
    const orderKeys: TiendaSectionKey[] = Array.isArray(theme?.tiendaSectionOrder)
      ? (theme.tiendaSectionOrder as TiendaSectionKey[])
      : [];
    const sectionContent =
      (theme?.sectionContent as Record<string, unknown> | undefined) ?? {};

    // Sin config guardada — todos ON menos recipes.
    if (visibleKeys.length === 0 && orderKeys.length === 0) {
      return { ...fallback, tenantId, tenantSlug, sectionContent };
    }

    return {
      visible: new Set(visibleKeys),
      order: orderKeys.length > 0 ? orderKeys : TIENDA_DEFAULT_ORDER,
      sectionContent,
      tenantId,
      tenantSlug,
    };
  } catch {
    return fallback;
  }
}
