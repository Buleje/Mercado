import { toast } from "sonner";
import type { DbDocument } from "@/lib/types/documents";
import { logger } from "@/lib/logger";

type Subir = (files: File[], opts: { folderId: string | null }) => Promise<DbDocument[]>;

/** Hay archivos en lo que se arrastra (no texto, ni una carpeta de Esenciales que se reordena). */
export const traeArchivos = (e: React.DragEvent): boolean => [...e.dataTransfer.types].includes("Files");

/**
 * Lo soltado, sin carpetas: una carpeta del disco llega como un «archivo» de
 * 0 bytes que la subida no sabe leer. Esas van por «Importar carpeta» del Archivo.
 */
export function archivosSoltados(e: React.DragEvent): { archivos: File[]; carpetas: number } {
  const items = [...e.dataTransfer.items];
  let carpetas = 0;
  const archivos: File[] = [];
  items.forEach((it) => {
    if (it.kind !== "file") return;
    if (it.webkitGetAsEntry?.()?.isDirectory) { carpetas++; return; }
    const f = it.getAsFile();
    if (f) archivos.push(f);
  });
  return { archivos, carpetas };
}

/** Sube a la carpeta y avisa con un toast. */
export async function subirACarpeta(subir: Subir, archivos: File[], carpeta: { id: string; name: string }, carpetasSueltas = 0): Promise<void> {
  if (carpetasSueltas > 0) {
    toast.info("Para subir una carpeta entera usa «Importar carpeta» en el Archivo.");
  }
  if (archivos.length === 0) return;
  const id = toast.loading(archivos.length === 1 ? `Subiendo a «${carpeta.name}»…` : `Subiendo ${archivos.length} archivos a «${carpeta.name}»…`);
  try {
    const subidos = await subir(archivos, { folderId: carpeta.id });
    toast.success(subidos.length === 1 ? `Listo: 1 archivo en «${carpeta.name}».` : `Listo: ${subidos.length} archivos en «${carpeta.name}».`, { id });
  } catch (err) {
    logger.warn("[documentos.esenciales] subir falló", { error: String(err) });
    toast.error("No se pudo subir. Prueba de nuevo.", { id });
  }
}
