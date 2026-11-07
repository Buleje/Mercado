import "server-only";
import { prisma } from "@/lib/prisma";
import {
  canRoleSeeEnCadena,
  isPrivilegedRole,
  rolesDeLaCadena,
  veTodoElDrive,
  type CarpetaConRoles,
} from "@/lib/documents/doc-access";
import { conSubcarpetas } from "@/lib/documentos/terceros-vinculo";
import {
  ACCIONES_DEL_HISTORIAL,
  agruparMovimientos,
  cortarPagina,
  destinoDeMetadata,
  esAccionDelHistorial,
  quienMovio,
  renombreDeMetadata,
  type DestinoMovimiento,
  type MovimientoCarpeta,
} from "@/lib/documentos/movimientos-carpeta";

/** Lo que pide la vista: tope por página y techo de filas leídas del registro. */
const LIMITE_POR_DEFECTO = 20;
const LIMITE_MAXIMO = 50;
const FILAS_MAXIMAS = 200;

export type MovimientosDeCarpeta =
  | { existe: false }
  | { existe: true; movimientos: MovimientoCarpeta[]; siguiente: string | null };

/**
 * Movimientos de una carpeta y sus subcarpetas (Esenciales › panel, 24-10),
 * leídos del registro de auditoría del Drive (`DocumentAuditLog`).
 *
 * Ley 29733 y permisos: sólo papeles que el rol ve (doc + cadena de carpetas,
 * el mismo filtro del Archivo y del feed de actividad); quién lo hizo con
 * nombre sólo para dueño/admin/encargado — el resto lee «Alguien del equipo»
 * salvo lo suyo («Tú»). Nunca sale el usuario, la IP ni la metadata cruda.
 */
export class DocumentosMovimientosDB {
  static async deCarpeta(
    tenantId: string,
    carpetaId: string,
    quien: { role: string; username: string },
    opts: { antes?: Date; limite?: number } = {},
  ): Promise<MovimientosDeCarpeta> {
    if (!tenantId) throw new Error("tenantId is required");
    const limite = Math.min(LIMITE_MAXIMO, Math.max(1, Math.trunc(opts.limite ?? LIMITE_POR_DEFECTO)));

    // Todas las carpetas del negocio en una consulta: la cadena de permisos, el subárbol y los nombres.
    const carpetas = await prisma.documentFolder.findMany({
      where: { tenantId },
      select: { id: true, name: true, parentId: true, allowedRoles: true },
    });
    const mapa = new Map<string, CarpetaConRoles>(
      carpetas.map((c) => [c.id, { parentId: c.parentId ?? null, allowedRoles: c.allowedRoles ?? [] }]),
    );
    const filtra = !veTodoElDrive(quien.role);
    const veCarpeta = (id: string) => !filtra || canRoleSeeEnCadena(quien.role, [], rolesDeLaCadena(id, mapa));
    if (!mapa.has(carpetaId) || !veCarpeta(carpetaId)) return { existe: false };

    const ids = [...conSubcarpetas([carpetaId], carpetas)].filter(veCarpeta);
    // Con filtro por rol se lee de más: parte de lo leído puede ser de papeles que no ve.
    const take = Math.min(FILAS_MAXIMAS, (limite + 1) * (filtra ? 4 : 2));
    const filas = await prisma.documentAuditLog.findMany({
      where: {
        tenantId,
        action: { in: [...ACCIONES_DEL_HISTORIAL] },
        ...(opts.antes ? { createdAt: { lt: opts.antes } } : {}),
        document: { tenantId, folderId: { in: ids } },
      },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        action: true,
        actorId: true,
        metadata: true,
        createdAt: true,
        documentId: true,
        document: { select: { name: true, deletedAt: true, folderId: true, allowedRoles: true } },
      },
    });

    const visibles = filas.filter(
      (f) =>
        esAccionDelHistorial(f.action) &&
        (!filtra || canRoleSeeEnCadena(quien.role, f.document.allowedRoles ?? [], rolesDeLaCadena(f.document.folderId, mapa))),
    );
    const grupos = agruparMovimientos(
      visibles.map((f) => ({
        id: f.id,
        accion: f.action as MovimientoCarpeta["accion"],
        cuando: f.createdAt.toISOString(),
        actor: f.actorId,
        papelId: f.documentId,
        fila: f,
      })),
    );
    const { pagina, siguiente } = cortarPagina(grupos, limite, filas.length === take);

    const actores = [...new Set(pagina.map((g) => g.actor).filter((a) => !a.startsWith("whatsapp:")))];
    const usuarios = actores.length
      ? await prisma.adminUser.findMany({ where: { tenantId, username: { in: actores } }, select: { username: true, name: true } })
      : [];
    const nombres = new Map(usuarios.map((u) => [u.username, u.name ?? ""]));
    const verNombres = isPrivilegedRole(quien.role);
    const nombreVisible = new Map(carpetas.filter((c) => veCarpeta(c.id)).map((c) => [c.id, c.name]));
    const nombresVisibles = new Set(nombreVisible.values());

    const destino = (metadata: unknown): DestinoMovimiento | undefined => {
      const d = destinoDeMetadata(metadata);
      if (!d) return undefined;
      if ("ruta" in d) return nombresVisibles.has(d.ruta) ? { tipo: "carpeta", nombre: d.ruta } : { tipo: "otra" };
      if (d.id === null) return { tipo: "raiz" };
      const nombre = nombreVisible.get(d.id);
      return nombre ? { tipo: "carpeta", nombre } : { tipo: "otra" };
    };

    const movimientos = pagina.map((g): MovimientoCarpeta => {
      const renombre = g.accion === "rename" ? renombreDeMetadata(g.fila.metadata) : null;
      const haciaDonde = g.accion === "move" ? destino(g.fila.metadata) : undefined;
      return {
        id: g.id,
        accion: g.accion,
        cuando: g.cuando,
        veces: g.veces,
        quien: quienMovio(g.actor, quien.username, nombres, verNombres),
        papel: { id: g.papelId, nombre: g.fila.document.name, borrado: !!g.fila.document.deletedAt },
        ...(haciaDonde ? { destino: haciaDonde } : {}),
        ...(renombre ? { renombre } : {}),
      };
    });
    return { existe: true, movimientos, siguiente };
  }
}
