import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";
import type { Industry } from "@/lib/generated/prisma/client";

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

  /**
   * El ID de soporte de la tienda (ADR-500, «482917») para el panel del
   * negocio: el dueño lo dicta y el superadmin lo busca. Lo pone la base al
   * dar de alta y no cambia nunca → 1 día de caché por tenant. El `tenantId`
   * sale SIEMPRE de la sesión (nunca de un parámetro del cliente).
   */
  async codigoDe(tenantId: string): Promise<string | null> {
    return getOrSet(`tenant:codigo:${tenantId}`, 86_400, async () => {
      const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { codigo: true } });
      return t?.codigo ?? null;
    });
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
   * A quién avisarle: el WhatsApp y el correo del dueño, por id o por slug.
   * Las tablas forestales guardan `tenantId` MIXTO (cuid o slug «main»): buscar
   * sólo por id dejaba a esos negocios sin aviso. Sin caché: lo leen los crons,
   * una vez al día por negocio.
   *
   * Primero por id y después por slug (B1, 25-10): con un `OR` en `findFirst`,
   * un slug que fuera el id de OTRO negocio podía traer al que no era, sin
   * orden que decida. Los dos son únicos.
   */
  async contactoDelDueno(
    idOSlug: string,
  ): Promise<{ id: string; name: string; ownerPhone: string | null; ownerEmail: string | null } | null> {
    if (!idOSlug) return null;
    const select = { id: true, name: true, ownerPhone: true, ownerEmail: true } as const;
    return (
      (await prisma.tenant.findUnique({ where: { id: idOSlug }, select })) ??
      (await prisma.tenant.findUnique({ where: { slug: idOSlug }, select }))
    );
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

  /**
   * Cambia el rubro (`Tenant.industry`) y devuelve el de antes y el de ahora
   * (`null` si el negocio no existe). Idempotente: con el mismo rubro no
   * escribe. Olvida el negocio público cacheado: `/api/tenants/resolve` lo
   * devuelve.
   *
   * OJO con un valor de enum NUEVO (ADR-509): un proceso con el cliente de
   * Prisma de antes del `generate` tira «Value '<x>' not found in enum» al
   * LEER esta fila. Escribirlo sólo con el dev server reiniciado y producción
   * desplegada con el cliente nuevo.
   */
  async cambiarRubro(
    tenantId: string,
    industry: Industry,
  ): Promise<{ antes: Industry; despues: Industry; cambio: boolean } | null> {
    const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { industry: true } });
    if (!t) return null;
    if (t.industry === industry) return { antes: t.industry, despues: industry, cambio: false };
    await prisma.tenant.update({ where: { id: tenantId }, data: { industry }, select: { id: true } });
    invalidateByPrefix(PREFIJO_TENANT_PUBLICO);
    return { antes: t.industry, despues: industry, cambio: true };
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
