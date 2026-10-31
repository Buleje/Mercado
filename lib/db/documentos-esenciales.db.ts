import "server-only";
import { prisma } from "@/lib/prisma";
import { esEsencial } from "@/lib/documentos/esenciales";
import type { CarpetaDelResumen, DocDelResumen } from "@/lib/documentos/esenciales-resumen";
import { conSubcarpetas } from "@/lib/documentos/terceros-vinculo";

/**
 * Lecturas de la tarjeta «Esenciales» del Inicio (Brandon 24-10). Sólo lee:
 * el filtro por rol y las cifras van en `resumenDeEsenciales` (puro), con el
 * árbol entero para subir por la cadena de carpetas.
 *
 * Vive aparte de `DocumentsDB` (2.988 líneas) para no crecerla con una
 * consulta que sólo usa esta tarjeta; mismo shape que `datosParaAvisosEsenciales`.
 */
export const DocumentosEsencialesDB = {
  /**
   * Todas las carpetas del negocio (para armar el árbol y ver candados) y los
   * papeles vivos de las marcadas y sus descendientes, con las columnas justas.
   * Dos idas a la base; sin esenciales, una (y las carpetas igual: la tarjeta
   * no ofrece «Elegir carpetas» a un negocio que no usa el Archivo).
   */
  async datosDelResumen(tenantId: string): Promise<{ carpetas: CarpetaDelResumen[]; docs: DocDelResumen[] }> {
    if (!tenantId) throw new Error("tenantId is required");
    const carpetas = await prisma.documentFolder.findMany({
      where: { tenantId },
      select: { id: true, name: true, parentId: true, tags: true, allowedRoles: true, icon: true, color: true, emoji: true },
    });
    const raices = carpetas.filter((c) => esEsencial(c)).map((c) => c.id);
    if (raices.length === 0) return { carpetas, docs: [] };
    const ids = [...conSubcarpetas(raices, carpetas)];
    const docs = await prisma.document.findMany({
      where: { tenantId, deletedAt: null, folderId: { in: ids } },
      select: { id: true, folderId: true, allowedRoles: true, expiresAt: true, uploadedAt: true },
    });
    return { carpetas, docs };
  },
};
