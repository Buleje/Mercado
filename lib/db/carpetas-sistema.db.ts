import "server-only";
import { prisma } from "@/lib/prisma";
import { DocumentsDB } from "@/lib/db/documents.db";
import { RAICES_SISTEMA, mismoNombre, type ClaveSistema } from "@/lib/documentos/carpetas-del-sistema";

/** Lo mínimo de Prisma que se usa: acepta el cliente o una transacción. */
type Cliente = Pick<typeof prisma, "documentFolder">;

const TTL_MS = 2 * 60_000;
const enVuelo = new Map<string, Promise<string>>();
const recordadas = new Map<string, { id: string; hasta: number }>();

/**
 * Raíces del Archivo que crea el sistema (Guías, Libro TH, Cámaras), siguiendo a
 * la carpeta donde Brandon la haya puesto (etiqueta `sistema:<clave>`).
 */
export class CarpetasSistemaDB {
  /**
   * Id de la raíz. Orden: (a) la carpeta del negocio con la etiqueta, esté donde
   * esté; (b) la de la raíz con el nombre de siempre (se etiqueta); (c) se crea en
   * la raíz con nombre y etiqueta. Con `db` (una transacción) no usa la memoria. `rolesNueva`: roles si hay que crearla.
   */
  static async raizDelSistema(tenantId: string, clave: ClaveSistema, db?: Cliente, rolesNueva: string[] = []): Promise<string> {
    if (!tenantId) throw new Error("tenantId is required");
    if (db) return CarpetasSistemaDB.resolver(tenantId, clave, db, rolesNueva);
    const k = `${tenantId}|${clave}`;
    const guardada = recordadas.get(k);
    if (guardada && guardada.hasta > Date.now()) return guardada.id;
    const previa = enVuelo.get(k);
    if (previa) return previa;
    const p = CarpetasSistemaDB.resolver(tenantId, clave, prisma, rolesNueva)
      .then((id) => {
        recordadas.set(k, { id, hasta: Date.now() + TTL_MS });
        return id;
      })
      .finally(() => enVuelo.delete(k));
    enVuelo.set(k, p);
    return p;
  }

  /** Si borraron la carpeta recordada: el próximo pedido vuelve a buscarla. */
  static olvidar(tenantId: string): void {
    for (const k of recordadas.keys()) if (k.startsWith(`${tenantId}|`)) recordadas.delete(k);
  }

  private static async resolver(tenantId: string, clave: ClaveSistema, db: Cliente, rolesNueva: string[]): Promise<string> {
    const { tag, nombre } = RAICES_SISTEMA[clave];
    const etiquetada = await db.documentFolder.findFirst({
      where: { tenantId, tags: { has: tag } },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    if (etiquetada) return etiquetada.id;

    const deLaRaiz = (
      await db.documentFolder.findMany({ where: { tenantId, parentId: null }, select: { id: true, name: true, tags: true } })
    ).find((c) => mismoNombre(c.name, nombre));
    if (deLaRaiz) {
      await db.documentFolder.updateMany({ where: { id: deLaRaiz.id, tenantId }, data: { tags: [...deLaRaiz.tags, tag] } });
      return deLaRaiz.id;
    }
    const creada = await db.documentFolder.create({
      data: { tenantId, parentId: null, name: nombre, tags: [tag], allowedRoles: rolesNueva },
      select: { id: true },
    });
    return creada.id;
  }

  /**
   * Id de la carpeta de `ruta` (cuyo PRIMER tramo es el nombre de la raíz del
   * sistema), creando lo que falte DEBAJO de la raíz que corresponde.
   */
  static async carpetaDeRuta(tenantId: string, clave: ClaveSistema, ruta: readonly string[]): Promise<string | null> {
    const raizId = await CarpetasSistemaDB.raizDelSistema(tenantId, clave);
    const resto = ruta.slice(1).join("/");
    if (!resto) return raizId;
    try {
      return (await DocumentsDB.createFolderTree(tenantId, { parentId: raizId, rutas: [resto] })).idPorRuta[resto] ?? null;
    } catch (err) {
      if (!(err instanceof Error) || err.message !== "parent_not_found") throw err;
      // La raíz recordada ya no existe: una segunda vuelta desde cero.
      CarpetasSistemaDB.olvidar(tenantId);
      const nueva = await CarpetasSistemaDB.raizDelSistema(tenantId, clave);
      return (await DocumentsDB.createFolderTree(tenantId, { parentId: nueva, rutas: [resto] })).idPorRuta[resto] ?? null;
    }
  }
}
