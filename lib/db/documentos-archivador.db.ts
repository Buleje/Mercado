import "server-only";
import { prisma } from "@/lib/prisma";
import { DocumentsDB } from "./documents.db";
import { ubicacionDelOriginal } from "@/lib/documentos/ubicacion-fisica";
import type { PapelDelArchivador } from "@/lib/documentos/archivador-celular";

/** Tope de la lista: Blas tiene ~440 papeles; 5.000 es holgado y acota la respuesta. */
const TOPE_PAPELES = 5000;

/**
 * «Ordenar el archivador con el celular» (31-10): los papeles con código del
 * negocio, livianos (id, número, nombre, lugar, registrado), para que el
 * celular juzgue cada sticker al instante sin pedirlo uno por uno.
 *
 * El lugar es el mismo que hereda el marcado (`DocumentsDB.marcarCodigoFisico`):
 * el del papel o, si no tiene, el de SU carpeta (no el de las carpetas de más
 * arriba). Sólo lo que el rol ve (`idsVisibles`, igual que el marcado).
 */
export class DocumentosArchivadorDB {
  static async papelesConCodigo(tenantId: string, viewerRole?: string): Promise<PapelDelArchivador[]> {
    const [filas, carpetas] = await Promise.all([
      prisma.document.findMany({
        where: { tenantId, deletedAt: null, codigo: { not: null } },
        select: { id: true, codigo: true, name: true, folderId: true, ubicacionFisica: true, codigoFisicoAt: true },
        orderBy: { codigo: "asc" },
        take: TOPE_PAPELES,
      }),
      prisma.documentFolder.findMany({
        where: { tenantId, ubicacionFisica: { not: null } },
        select: { id: true, ubicacionFisica: true },
      }),
    ]);
    const visibles = new Set(await DocumentsDB.idsVisibles(tenantId, filas.map((f) => f.id), viewerRole));
    const lugarDeCarpeta = new Map(carpetas.map((c) => [c.id, c.ubicacionFisica]));
    return filas
      .filter((f) => f.codigo != null && visibles.has(f.id))
      .map((f) => ({
        id: f.id,
        codigo: f.codigo as number,
        nombre: f.name,
        ubicacion:
          ubicacionDelOriginal(f, f.folderId ? { ubicacionFisica: lugarDeCarpeta.get(f.folderId) ?? null } : null)?.texto ?? null,
        registrado: f.codigoFisicoAt != null,
      }));
  }
}
