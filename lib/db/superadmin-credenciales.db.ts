import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * lib/db/superadmin-credenciales.db.ts
 *
 * Lecturas y el único write de la pestaña «Credenciales» del superadmin
 * (ficha de una tienda): quién entra a la tienda y el reset de su contraseña.
 *
 * Nunca selecciona `passwordHash` ni `totpSecret`: lo que sale de acá viaja al
 * navegador del superadmin. El write (contraseña temporal) va con la tienda y el
 * usuario en el WHERE: un `adminUserId` de otra tienda no toca nada.
 */

export interface TiendaCredenciales {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  ownerEmail: string | null;
  ownerPhone: string | null;
  customDomain: string | null;
}

export interface UsuarioTienda {
  id: string;
  username: string;
  name: string;
  role: string;
  active: boolean;
  mustChangePassword: boolean;
  dobleFactor: boolean;
  createdAt: Date;
}

/** Orden del «admin principal» (el mismo del reset y de la pestaña Seguridad). */
const pesoRol = (rol: string) => (rol === "owner" ? 0 : rol === "admin" ? 1 : 2);

/** Activos primero; dentro, owner > admin > resto, y el más antiguo primero. */
export function ordenarUsuarios<T extends { role: string; active: boolean; createdAt: Date }>(lista: T[]): T[] {
  return [...lista].sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      pesoRol(a.role) - pesoRol(b.role) ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  );
}

export const SuperadminCredencialesDB = {
  async tiendaPorSlug(slug: string): Promise<TiendaCredenciales | null> {
    return prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, slug: true, name: true, active: true, ownerEmail: true, ownerPhone: true, customDomain: true },
    });
  },

  /** Todos los usuarios de ingreso de la tienda, el principal primero. */
  async usuarios(tenantId: string): Promise<UsuarioTienda[]> {
    const filas = await prisma.adminUser.findMany({
      where: { tenantId },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        active: true,
        mustChangePassword: true,
        totpEnabledAt: true,
        createdAt: true,
      },
    });
    return ordenarUsuarios(
      filas.map(({ totpEnabledAt, ...f }) => ({ ...f, dobleFactor: totpEnabledAt !== null })),
    );
  },

  /** Último ingreso por usuario (registro `login_success` del ActivityLog). */
  async ultimosIngresos(tenantId: string, usernames: string[]): Promise<Map<string, Date>> {
    if (usernames.length === 0) return new Map();
    const filas = await prisma.activityLog.groupBy({
      by: ["user"],
      where: { tenantId, action: "login_success", user: { in: usernames } },
      _max: { createdAt: true },
    });
    const m = new Map<string, Date>();
    for (const f of filas) if (f._max.createdAt) m.set(f.user, f._max.createdAt);
    return m;
  },

  /** El admin activo que el reset toma cuando no se elige usuario. */
  async adminPrincipal(tenantId: string): Promise<{ id: string; username: string } | null> {
    const activos = await prisma.adminUser.findMany({
      where: { tenantId, active: true },
      select: { id: true, username: true, role: true, active: true, createdAt: true },
    });
    const p = ordenarUsuarios(activos)[0];
    return p ? { id: p.id, username: p.username } : null;
  },

  /** Un usuario ACTIVO de esa tienda (ownership en el WHERE). */
  async usuarioActivo(tenantId: string, adminUserId: string): Promise<{ id: string; username: string } | null> {
    return prisma.adminUser.findFirst({
      where: { tenantId, id: adminUserId, active: true },
      select: { id: true, username: true },
    });
  },

  /**
   * Pone una contraseña temporal (ya hasheada) y obliga a cambiarla al entrar.
   * Devuelve cuántas filas tocó: 0 = el usuario no es de esa tienda o ya no está activo.
   */
  async ponerContrasenaTemporal(tenantId: string, adminUserId: string, passwordHash: string): Promise<number> {
    const r = await prisma.adminUser.updateMany({
      where: { tenantId, id: adminUserId, active: true },
      data: { passwordHash, mustChangePassword: true },
    });
    return r.count;
  },
};
