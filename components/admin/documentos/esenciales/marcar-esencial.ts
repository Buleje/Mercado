import { toast } from "sonner";
import type { BulkFolderAccion } from "@/hooks/use-documents";
import { TAG_ESENCIAL } from "@/lib/documentos/esenciales";
import { logger } from "@/lib/logger";
import { mensajeDeError } from "../archivo/compartido";

type BulkFolders = (ids: string[], accion: BulkFolderAccion) => Promise<number>;

/**
 * Pone o quita la marca de Esenciales a una o varias carpetas (etiqueta de la
 * carpeta por `folders/bulk`: el servidor valida rol y CSRF; la lista se
 * actualiza al instante y vuelve atrás si falla). Avisa con un toast.
 */
export async function marcarEsenciales(
  bulkFolders: BulkFolders,
  carpetas: readonly { id: string; name: string }[],
  poner: boolean,
): Promise<boolean> {
  if (carpetas.length === 0) return true;
  try {
    await bulkFolders(carpetas.map((c) => c.id), { action: poner ? "addTags" : "removeTags", tags: [TAG_ESENCIAL] });
    const una = carpetas.length === 1;
    const quien = una ? `«${carpetas[0].name}»` : `${carpetas.length} carpetas`;
    toast.success(poner ? `${quien} ya ${una ? "está" : "están"} en Esenciales.` : `${quien} ${una ? "salió" : "salieron"} de Esenciales.`);
    return true;
  } catch (err) {
    logger.warn("[documentos.esenciales] no se pudo marcar", { error: String(err) });
    const msg = err instanceof Error ? err.message : String(err);
    toast.error(
      msg.includes("403")
        ? "Sólo el dueño o un administrador pueden elegir las carpetas de Esenciales."
        : `No se pudo guardar: ${mensajeDeError(msg)}`,
    );
    return false;
  }
}
