import "server-only";
import { createHash } from "crypto";
import { DocumentsDB } from "@/lib/db/documents.db";
import { downloadFromStorage } from "@/lib/documents/storage";

/**
 * ¿Son REALMENTE el mismo archivo? Baja cada uno y compara su SHA-256.
 *
 * Única fuente para «Repetidos» (`POST /api/admin/documents/duplicates`) y
 * «Ordenar mi Archivo»: el agrupado por peso y nombre es barato pero no prueba
 * nada, y antes de mandar algo a la papelera hay que estar seguro. Sólo mira
 * lo que el rol ve (`rutasDe`).
 */
export interface ContenidoIdentico {
  /** Hash de cada id que se pudo bajar (null = no está en el almacenamiento). */
  hashes: Record<string, string | null>;
  /** Grupos de 2+ ids con el mismo contenido. */
  identicos: string[][];
  /** Cuántos se miraron (los que el rol ve y siguen vivos). */
  revisados: number;
}

/** De a 4: 60 archivos de una tanda no saturan la conexión con el almacenamiento. */
const EN_PARALELO = 4;

export async function contenidoIdentico(
  tenantId: string,
  ids: string[],
  viewerRole?: string,
): Promise<ContenidoIdentico> {
  const rutas = await DocumentsDB.rutasDe(tenantId, ids, viewerRole);
  const hashes: Record<string, string | null> = {};
  for (let i = 0; i < rutas.length; i += EN_PARALELO) {
    await Promise.all(
      rutas.slice(i, i + EN_PARALELO).map(async ({ id, storagePath }) => {
        const buf = await downloadFromStorage(storagePath);
        hashes[id] = buf ? createHash("sha256").update(buf).digest("hex") : null;
      }),
    );
  }
  const porHash = new Map<string, string[]>();
  for (const { id } of rutas) {
    const h = hashes[id];
    if (!h) continue;
    porHash.set(h, [...(porHash.get(h) ?? []), id]);
  }
  return { hashes, identicos: [...porHash.values()].filter((g) => g.length > 1), revisados: rutas.length };
}
