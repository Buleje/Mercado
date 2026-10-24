import "server-only";
import { CtpGuiaDocumentosDB } from "@/lib/db/ctp-guia-documentos.db";
import { PAPELES_DE_LEY, faltantesPorGuia } from "./documentos-guia";
import { guiasSinPapeles } from "./aviso-guias-th";

export interface PapelesPendientes {
  /** Guías de ingreso del libro. */
  total: number;
  /** Las que no tienen alguno de los papeles de ley. */
  sinPapeles: number;
  /** De esas, las que no tienen NINGUNO. */
  sinNinguno: number;
  /** Algunos N° para mostrar (los primeros). */
  ejemplos: string[];
}

/**
 * Cuántas guías de ingreso del tenant no tienen sus papeles de ley (ADR-482).
 * Misma regla que la columna «Papeles» de Ingresos: `faltantesPorGuia`.
 */
export async function papelesPendientes(tenantId: string, rol?: string): Promise<PapelesPendientes> {
  const gtfs = await CtpGuiaDocumentosDB.gtfsDeIngresos(tenantId);
  if (gtfs.length === 0) return { total: 0, sinPapeles: 0, sinNinguno: 0, ejemplos: [] };
  const docs = await CtpGuiaDocumentosDB.documentosDeGuias(tenantId, gtfs, rol);
  const faltan = faltantesPorGuia(docs, gtfs);
  const sin = guiasSinPapeles(faltan);
  return {
    total: Object.keys(faltan).length,
    sinPapeles: sin.length,
    sinNinguno: sin.filter((g) => faltan[g].length === PAPELES_DE_LEY.length).length,
    ejemplos: sin.slice(0, 3),
  };
}
