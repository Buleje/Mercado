import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";

/**
 * Lectura del tema visual activo para `GET /api/design-system/active`, que
 * pide el panel en cada carga (16-10, carril velocidad: eran dos idas en serie
 * sin caché, ~250 ms desde la PC de Brandon).
 *
 * Las tablas `DesignSystemConfig` y `DesignPresetCustom` están fuera del
 * schema Prisma (fase expand): se leen con `$queryRaw`. Las escribe sólo
 * `app/api/superadmin/design-system/route.ts`, que llama a
 * {@link DesignSystemActivoDB.olvidar} tras cada cambio.
 */

export interface ConfigGlobalDS {
  activePresetSlug: string | null;
  customTokensJson: unknown;
  savedPresetsJson: unknown;
}

export interface OverrideTenantDS {
  presetSlug: string | null;
  tokensJson: unknown;
}

const PREFIJO = "design-system:";
const TTL_SEG = 60;

export const DesignSystemActivoDB = {
  /** La configuración global (fila `singleton`), o `null` si no existe. */
  async global(): Promise<ConfigGlobalDS | null> {
    // `{ v }`: getOrSet trata `null` como «no está» y volvería a la base.
    const caja = await getOrSet<{ v: ConfigGlobalDS | null }>(`${PREFIJO}global`, TTL_SEG, async () => {
      const rows = await prisma.$queryRaw<ConfigGlobalDS[]>`
        SELECT "activePresetSlug", "customTokensJson", "savedPresetsJson"
        FROM "DesignSystemConfig" WHERE id = 'singleton' LIMIT 1
      `;
      return { v: rows[0] ?? null };
    });
    return caja.v;
  },

  /** El tema propio del negocio, o `null` si usa el global. */
  async deTenant(tenantId: string): Promise<OverrideTenantDS | null> {
    const caja = await getOrSet<{ v: OverrideTenantDS | null }>(`${PREFIJO}tenant:${tenantId}`, TTL_SEG, async () => {
      const rows = await prisma.$queryRaw<OverrideTenantDS[]>`
        SELECT "presetSlug", "tokensJson" FROM "DesignPresetCustom"
        WHERE "tenantId" = ${tenantId} LIMIT 1
      `;
      return { v: rows[0] ?? null };
    });
    return caja.v;
  },

  /** Tras escribir el tema global o el de un negocio: el global cambia el de todos. */
  olvidar(): void {
    invalidateByPrefix(PREFIJO);
  },
};
