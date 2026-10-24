import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * lib/db/avisos-correo.db.ts — lecturas de los avisos por correo de cada tienda (21-10).
 *
 * El estado (pausado / tipos apagados) vive en PlatformSetting `avisos-correo:<tenantId>`
 * y se ESCRIBE por `PlatformSettingsDB.actualizar` (candado por clave + invalida su caché).
 * Acá van las lecturas en lote que esa clase no tiene: varias claves de una vez con quién
 * y cuándo las cambió, las cuentas de Google de la Agenda y qué tiendas usan lo forestal.
 *
 * `tenantId` en las tablas de negocio viene MIXTO (cuid o slug, p. ej. "main"): por eso
 * los métodos en lote reciben ambos y los resultados se indexan por el valor crudo.
 */

export interface TiendaAvisosCorreo {
  id: string;
  slug: string;
  name: string;
  ownerEmail: string | null;
}

export interface FilaAvisosGuardada {
  key: string;
  value: unknown;
  updatedBy: string | null;
  updatedAt: Date;
}

export const AvisosCorreoDB = {
  /** La tienda por slug o por id (el superadmin y las tablas mixtas mandan cualquiera de los dos). */
  async tienda(slugOId: string): Promise<TiendaAvisosCorreo | null> {
    if (!slugOId) return null;
    return prisma.tenant.findFirst({
      where: { OR: [{ slug: slugOId }, { id: slugOId }] },
      select: { id: true, slug: true, name: true, ownerEmail: true },
    });
  },

  /**
   * La tienda por su id EXACTO (el del JWT). El panel del dueño usa ésta y no
   * `tienda()`: un slug igual al id de otro negocio haría leer y escribir su fila.
   */
  async tiendaPorId(id: string): Promise<TiendaAvisosCorreo | null> {
    if (!id) return null;
    return prisma.tenant.findUnique({
      where: { id },
      select: { id: true, slug: true, name: true, ownerEmail: true },
    });
  },

  /** Varias tiendas a partir de tenantIds mixtos (cuid o slug), en UNA consulta. */
  async tiendas(slugsOIds: string[]): Promise<TiendaAvisosCorreo[]> {
    const lista = [...new Set(slugsOIds.filter(Boolean))];
    if (lista.length === 0) return [];
    return prisma.tenant.findMany({
      where: { OR: [{ id: { in: lista } }, { slug: { in: lista } }] },
      select: { id: true, slug: true, name: true, ownerEmail: true },
    });
  },

  /** Tiendas cuyo correo de dueño es éste (sin distinguir mayúsculas). */
  async tiendasPorCorreo(correo: string): Promise<TiendaAvisosCorreo[]> {
    const limpio = correo.trim();
    if (!limpio) return [];
    return prisma.tenant.findMany({
      where: { ownerEmail: { equals: limpio, mode: "insensitive" } },
      select: { id: true, slug: true, name: true, ownerEmail: true },
      orderBy: { createdAt: "asc" },
    });
  },

  /** Filas de PlatformSetting de esas claves, SIN caché (la lista y el detalle las quieren frescas). */
  async filas(keys: string[]): Promise<FilaAvisosGuardada[]> {
    if (keys.length === 0) return [];
    return prisma.platformSetting.findMany({
      where: { key: { in: keys } },
      select: { key: true, value: true, updatedBy: true, updatedAt: true },
    });
  },

  /** Cuentas de Google activas de la Agenda, contadas por tenantId crudo. */
  async googleActivasPorTienda(tenantIds: string[]): Promise<Map<string, number>> {
    if (tenantIds.length === 0) return new Map();
    const filas = await prisma.agendaConexionGoogle.groupBy({
      by: ["tenantId"],
      where: { tenantId: { in: tenantIds }, estado: "activa" },
      _count: { _all: true },
    });
    return new Map(filas.map((f) => [f.tenantId, f._count._all]));
  },

  /** Las cuentas de Google de la Agenda de una tienda (todas, con su estado). */
  async googleDe(tenantIds: string[]): Promise<{ email: string; estado: string; ultimaSync: Date | null }[]> {
    if (tenantIds.length === 0) return [];
    return prisma.agendaConexionGoogle.findMany({
      where: { tenantId: { in: tenantIds } },
      select: { email: true, estado: true, ultimaSync: true },
      orderBy: { createdAt: "asc" },
    });
  },

  /**
   * TenantIds crudos que usan lo forestal: tienen guías (ForestGtf) o libro CTP
   * (ForestCtpEntry) vivos — la MISMA regla que usa el cron `forestal-plazos` para
   * decidir a quién avisar — o su rubro es maderería. `industry` sola no sirve:
   * Blas figura como «bodega».
   */
  async conForestal(tenantIds: string[]): Promise<Set<string>> {
    if (tenantIds.length === 0) return new Set();
    const [gtf, ctp, madereras] = await Promise.all([
      prisma.forestGtf.groupBy({ by: ["tenantId"], where: { tenantId: { in: tenantIds }, deletedAt: null } }),
      prisma.forestCtpEntry.groupBy({ by: ["tenantId"], where: { tenantId: { in: tenantIds }, deletedAt: null } }),
      prisma.tenant.findMany({
        where: { industry: "madereria", OR: [{ id: { in: tenantIds } }, { slug: { in: tenantIds } }] },
        select: { id: true, slug: true },
      }),
    ]);
    return new Set([
      ...gtf.map((f) => f.tenantId),
      ...ctp.map((f) => f.tenantId),
      ...madereras.flatMap((t) => [t.id, t.slug]),
    ]);
  },

  /** Settings.smtpUser de la tienda (servidor de correo propio; hoy ningún envío lo usa). */
  async smtpPropio(tenantIds: string[]): Promise<string | null> {
    if (tenantIds.length === 0) return null;
    const fila = await prisma.settings.findFirst({
      where: { tenantId: { in: tenantIds }, smtpUser: { not: null } },
      select: { smtpUser: true },
    });
    return fila?.smtpUser?.trim() || null;
  },

  /** Último envío OK por tipo de registro (NotificationLog.type), de una tienda. */
  async ultimosEnvios(tenantIds: string[], tipos: string[]): Promise<Map<string, Date>> {
    if (tenantIds.length === 0 || tipos.length === 0) return new Map();
    const filas = await prisma.notificationLog.groupBy({
      by: ["type"],
      where: { tenantId: { in: tenantIds }, type: { in: tipos }, status: "sent" },
      _max: { createdAt: true },
    });
    const salida = new Map<string, Date>();
    for (const f of filas) if (f._max.createdAt) salida.set(f.type, f._max.createdAt);
    return salida;
  },
};
