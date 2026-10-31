import { useCallback, useMemo, useState } from "react";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import { ordenarDocsTercero, type OrdenDocsTercero } from "@/lib/documentos/terceros-vinculo";
import type { CarpetaEsencial } from "@/lib/documentos/esenciales";

/**
 * Por qué papeles pasan las flechas del visor en Esenciales: nunca por todo el
 * Archivo. Gana la lista desde la que se abrió (la del panel, «lo que más
 * abres»); si el papel se abrió por otro lado (su menú «⋯»), la carpeta
 * elegida entera; si no, los papeles de todas las esenciales.
 */
export function useVisorEsenciales({ preview, setPreview, elegida, todas, vivos, orden }: {
  preview: DbDocument | null;
  setPreview: (d: DbDocument | null) => void;
  elegida: CarpetaEsencial<DbDocumentFolder> | null;
  todas: readonly CarpetaEsencial<DbDocumentFolder>[];
  vivos: readonly DbDocument[];
  orden: OrdenDocsTercero;
}): { abrir: (doc: DbDocument, lista?: readonly DbDocument[]) => void; lista: DbDocument[] } {
  const [desde, setDesde] = useState<DbDocument[] | null>(null);

  const abrir = useCallback((doc: DbDocument, lista?: readonly DbDocument[]) => {
    setDesde(lista ? [...lista] : null);
    setPreview(doc);
  }, [setPreview]);

  const lista = useMemo(() => {
    if (!preview) return [];
    const tiene = (l: readonly DbDocument[] | null) => !!l?.some((d) => d.id === preview.id);
    if (tiene(desde)) return desde as DbDocument[];
    const de = (ids: ReadonlySet<string>) => ordenarDocsTercero(vivos.filter((d) => !!d.folderId && ids.has(d.folderId)), orden);
    if (elegida) {
      const l = de(elegida.carpetaIds);
      if (tiene(l)) return l;
    }
    const todos = de(new Set(todas.flatMap((e) => [...e.carpetaIds])));
    return tiene(todos) ? todos : [preview];
  }, [preview, desde, elegida, todas, vivos, orden]);

  return { abrir, lista };
}
