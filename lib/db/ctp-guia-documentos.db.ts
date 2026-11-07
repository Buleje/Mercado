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
  /** Para la carpeta del Drive (ADR-442): titular y permiso de la guía. */
  titular: string | null;
  permiso: string | null;
  /**
   * De dónde salió: el ingreso del CTP, una guía guardada antes del ingreso,
   * la GTF emitida en el Libro TH o la GTF de un despacho del CTP (ADR-482).
   */
  origen: "ingreso" | "guardada" | "libro-th" | "despacho";
}

/** Carpeta de las GTF de despacho del CTP: no tienen titular propio (ADR-482). */
const TITULAR_DESPACHOS = "Despachos del CTP";

export class CtpGuiaDocumentosDB {
  /**
   * La guía viva del tenant, o `null` (otro tenant, anulada del todo, o no
   * existe → 404). Vale el ingreso del libro O una guía guardada antes del
   * ingreso (ADR-442): así los papeles se suben antes de que llegue el camión
   * y siguen a la mano si el ingreso se borra.
   *
   * La carpeta sale de la guía guardada cuando la hay (titular y permiso tal
   * como se guardaron), para que el ingreso no abra una carpeta hermana con el
   * nombre escrito distinto.
   */
  static async datosDeGuia(tenantId: string, gtfNumber: string): Promise<DatosDeGuia | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const gtf = gtfNumber.trim();
    if (!gtf) return null;
    const [e, g, th, d] = await Promise.all([
      prisma.woodEntry.findFirst({
        where: { tenantId, gtfNumber: gtf, deletedAt: null },
        orderBy: { entryDate: "asc" },
        select: { gtfNumber: true, entryDate: true, providerName: true, originCode: true },
      }),
      prisma.forestGuiaGuardada.findFirst({
        where: { tenantId, gtfNumber: gtf, deletedAt: null },
        select: { gtfNumber: true, titularNombre: true, permisoCodigo: true, gtfDate: true },
      }),
      /* ADR-482: la GTF emitida en el Libro TH tiene sus papeles aunque todavía
         no haya entrado al CTP; con el mismo N° son LOS MISMOS papeles. Una
         anulada no recibe papeles nuevos (como un ingreso borrado). */
      prisma.forestGtf.findFirst({
        where: { tenantId, gtfNumber: gtf, deletedAt: null, status: { not: "anulada" } },
        orderBy: { createdAt: "asc" },
        select: { gtfNumber: true, gtfDate: true, titularName: true, tituloHabilitante: true },
      }),
      prisma.forestCtpEntry.findFirst({
        where: { tenantId, gtfNumber: gtf, section: "despacho", deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: { gtfNumber: true, entryDate: true, originCode: true },
      }),
    ]);
    if (!e && !g && !th && !d) return null;
    /* Carpeta: lo que se escribió a mano al guardar > lo emitido en el Libro TH
       > lo del ingreso > el despacho. Así la GTF del bosque y su ingreso no
       abren dos carpetas hermanas con el titular escrito distinto. */
    return {
      gtfNumber: e?.gtfNumber ?? g?.gtfNumber ?? th?.gtfNumber ?? d?.gtfNumber ?? gtf,
      entryDate:
        e?.entryDate?.toISOString() ??
        g?.gtfDate?.toISOString() ??
        th?.gtfDate?.toISOString() ??
        d?.entryDate?.toISOString() ??
        null,
      providerName: e?.providerName ?? g?.titularNombre ?? th?.titularName ?? null,
      titular:
        g?.titularNombre ??
        th?.titularName ??
        e?.providerName ??
        (d ? TITULAR_DESPACHOS : null),
      permiso: g?.permisoCodigo ?? th?.tituloHabilitante ?? e?.originCode ?? d?.originCode ?? null,
      origen: e ? "ingreso" : g ? "guardada" : th ? "libro-th" : "despacho",
    };
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

  /** Los N° de guía de los ingresos vivos del tenant, sin repetir (para el aviso de papeles del Inicio). */
  static async gtfsDeIngresos(tenantId: string): Promise<string[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const filas = await prisma.woodEntry.findMany({
      where: { tenantId, deletedAt: null },
      select: { gtfNumber: true },
      distinct: ["gtfNumber"],
      take: 500,
    });
    return filas.map((f) => f.gtfNumber.trim()).filter(Boolean);
  }
}
