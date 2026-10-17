import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";

/**
 * TenantsDB
 *
 * Acceso canonico a `Tenant` para lookups admin/cron (no billing).
 * Audit project-wide 2026-05-19 — migracion de endpoints que listan
 * tenants para iteracion (daily-digest, batch jobs, etc.).
 *
 * Para lookups por id/slug usar `findTenantByIdOrSlug` en lib/tenant.ts
 * (cacheado por request).
 */

export const TenantsDB = {
  /**
   * Lista solo los IDs de tenants activos. Util para crons que iteran
   * sobre todos los tenants.
   */
  async listActiveIds(): Promise<string[]> {
    const rows = await prisma.tenant.findMany({
      where: { active: true },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  },

  /**
   * Lista tenants activos con campos basicos para iteracion en crons.
   */
  async listActive(): Promise<Array<{ id: string; slug: string; name: string }>> {
    return prisma.tenant.findMany({
      where: { active: true },
      select: { id: true, slug: true, name: true },
    });
  },

  /**
   * TODOS los negocios (activos o no) con su alta: el código corto de los QR
   * (ADR-486) es del más viejo cuando dos caen en el mismo, así que hacen falta
   * también los dados de baja. Sólo lectura.
   */
  async listParaCodigoCorto(): Promise<Array<{ id: string; active: boolean; createdAt: Date }>> {
    return prisma.tenant.findMany({ select: { id: true, active: true, createdAt: true } });
  },

  /** Datos básicos de un tenant por id (nombre/slug) — para páginas públicas. */
  async getBasicById(
    id: string,
  ): Promise<{ id: string; slug: string; name: string } | null> {
    return prisma.tenant.findUnique({
      where: { id },
      select: { id: true, slug: true, name: true },
    });
  },

  /**
   * El negocio por slug, id o dominio propio (`custom--<host>`) para lo
   * PÚBLICO: la portada `/t/<negocio>` y `GET /api/tenants/resolve`, que se
   * piden en cada visita. Cacheado 60 s (16-10, carril velocidad: era una ida
   * a la base en serie antes de todo lo demás, ~120 ms desde la PC de Brandon).
   * `null` también se cachea (un slug inexistente no vuelve a la base). Lo
   * limpia {@link TenantsDB.olvidarPublico} al cambiar nombre, logo, color,
   * dominio o estado; el resto lo cubre el TTL.
   *
   * Trae `ownerPhone`: quien lo devuelva por API elige los campos.
   */
  async publicoPorSlugOId(slugOId: string): Promise<TenantPublico | null> {
    if (!slugOId) return null;
    const caja = await getOrSet<{ t: TenantPublicoCache | null }>(
      `${PREFIJO_TENANT_PUBLICO}${slugOId}`,
      60,
      async () => {
        const where = slugOId.startsWith("custom--")
          ? { customDomain: slugOId.slice("custom--".length) }
          : { OR: [{ id: slugOId }, { slug: slugOId }] };
        const t = await prisma.tenant.findFirst({ where, select: SELECT_TENANT_PUBLICO });
        // createdAt como texto: con REDIS_URL la caché pasa por JSON.
        return { t: t ? { ...t, createdAt: t.createdAt.toISOString() } : null };
      },
    );
    return caja.t ? { ...caja.t, createdAt: new Date(caja.t.createdAt) } : null;
  },

  /** Olvida el negocio público cacheado (todos los slugs: es barato y el slug pudo cambiar). */
  olvidarPublico(): void {
    invalidateByPrefix(PREFIJO_TENANT_PUBLICO);
  },
};

const PREFIJO_TENANT_PUBLICO = "tenant-publico:";

const SELECT_TENANT_PUBLICO = {
  id: true,
  slug: true,
  name: true,
  plan: true,
  active: true,
  ownerPhone: true,
  customDomain: true,
  logoUrl: true,
  primaryColor: true,
  secondaryColor: true,
  industry: true,
  createdAt: true,
} as const;

export interface TenantPublico {
  id: string;
  slug: string;
  name: string;
  plan: string;
  active: boolean;
  ownerPhone: string | null;
  customDomain: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  industry: string | null;
  createdAt: Date;
}

type TenantPublicoCache = Omit<TenantPublico, "createdAt"> & { createdAt: string };
