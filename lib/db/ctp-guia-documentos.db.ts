import "server-only";
import { prisma } from "@/lib/prisma";
import { DocumentsDB } from "./documents.db";
import type { DbDocument } from "@/lib/types/documents";
import {
  casilleroDeDocumento,
  etiquetasDeBusqueda,
  type CasilleroGuia,
} from "@/lib/forestal/documentos-guia";

/**
 * Documentos de una guía de ingreso (ADR-438). Los archivos son documentos del
 * Drive (`DocumentsDB`); acá sólo vive lo que la guía agrega: saber que la guía
 * existe en ESTE tenant, y leer del Drive lo que es suyo.
 *
 * Sin caché propio a propósito: la lista del Drive tampoco lo tiene (se
 * escribe desde el Drive, la papelera y este modal — un caché acá mostraría una
 * factura quitada en la otra pantalla).
 */
export interface DatosDeGuia {
  gtfNumber: string;
  entryDate: string | null;
  providerName: string | null;
}

export class CtpGuiaDocumentosDB {
  /** La guía viva del tenant, o `null` (otro tenant, anulada del todo, o no existe → 404). */
  static async datosDeGuia(tenantId: string, gtfNumber: string): Promise<DatosDeGuia | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const gtf = gtfNumber.trim();
    if (!gtf) return null;
    const e = await prisma.woodEntry.findFirst({
      where: { tenantId, gtfNumber: gtf, deletedAt: null },
      orderBy: { entryDate: "asc" },
      select: { gtfNumber: true, entryDate: true, providerName: true },
    });
    return e
      ? {
          gtfNumber: e.gtfNumber,
          entryDate: e.entryDate?.toISOString() ?? null,
          providerName: e.providerName ?? null,
        }
      : null;
  }

  /**
   * Los documentos vivos del Drive que nombran a alguna de estas guías, con
   * los permisos por rol del Drive ya aplicados (`DocumentsDB.list`).
   */
  static async documentosDeGuias(
    tenantId: string,
    gtfs: readonly string[],
    viewerRole?: string,
  ): Promise<DbDocument[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const tags = etiquetasDeBusqueda(gtfs);
    if (tags.length === 0) return [];
    const docs = await DocumentsDB.list(tenantId, { tags }, viewerRole);
    return docs.filter((d) => gtfs.some((g) => casilleroDeDocumento(d.tags, g) != null));
  }

  /** Un documento del Drive si es de ESA guía (y en qué casillero está), o `null`. */
  static async documentoDeGuia(
    tenantId: string,
    id: string,
    gtfNumber: string | null,
    viewerRole?: string,
  ): Promise<{ doc: DbDocument; casillero: CasilleroGuia; gtf: string } | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const doc = await DocumentsDB.getById(tenantId, id, viewerRole);
    if (!doc) return null;
    const candidatas = gtfNumber
      ? [gtfNumber]
      : doc.tags.filter((t) => t.toLowerCase().startsWith("gtf:")).map((t) => t.slice(4));
    for (const g of candidatas) {
      const casillero = casilleroDeDocumento(doc.tags, g);
      if (casillero) return { doc, casillero, gtf: g };
    }
    return null;
  }
}
