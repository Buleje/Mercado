/**
 * Qué se ve en el explorador del Archivo: las carpetas y los archivos del
 * lugar donde estás, como en Windows.
 *
 * - En la raíz («Todos» sin buscar ni filtrar): las carpetas de arriba y los
 *   archivos sueltos (sin carpeta, o cuya carpeta ya no existe).
 * - Dentro de una carpeta: sus subcarpetas y sus archivos (el servidor ya
 *   manda sólo los de esa carpeta).
 * - Buscando o filtrando: todos los archivos que cumplen, estén donde estén,
 *   más las carpetas cuyo nombre coincide con lo buscado.
 * - En Favoritos, Recientes, Por vencer…: sólo los archivos, sin carpetas.
 */

import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";

export interface ContenidoExplorador {
  carpetas: DbDocumentFolder[];
  docs: DbDocument[];
}

interface Entrada {
  modo: string;
  carpetaId: string | null;
  /** Los documentos ya filtrados y ordenados (`displayDocs`). */
  docs: DbDocument[];
  carpetas: readonly DbDocumentFolder[];
  hijos: Map<string | null, DbDocumentFolder[]>;
  porId: Map<string, DbDocumentFolder>;
  busqueda: string;
  /** Hay búsqueda, filtros, estado o «sin describir» puestos. */
  acotado: boolean;
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const porNombre = (a: DbDocumentFolder, b: DbDocumentFolder) => a.name.localeCompare(b.name, "es", { sensitivity: "base" });

export function contenidoExplorador(e: Entrada): ContenidoExplorador {
  const q = sinTildes(e.busqueda.trim());
  const coincide = (f: DbDocumentFolder) => !q || sinTildes(f.name).includes(q);

  if (e.modo === "folder" && e.carpetaId) {
    return { carpetas: (e.hijos.get(e.carpetaId) ?? []).filter(coincide), docs: e.docs };
  }
  if (e.modo !== "all") return { carpetas: [], docs: e.docs };
  if (e.acotado) {
    return { carpetas: q ? e.carpetas.filter(coincide).sort(porNombre) : [], docs: e.docs };
  }
  // Una carpeta cuyo padre ya no existe se vería en ningún lado: va a la raíz.
  const raiz = e.carpetas.filter((f) => !f.parentId || !e.porId.has(f.parentId)).sort(porNombre);
  return {
    carpetas: raiz,
    docs: e.docs.filter((d) => !d.folderId || !e.porId.has(d.folderId)),
  };
}

/** Clave de un elemento del explorador en el DOM y en el foco: `c:<id>` o `d:<id>`. */
export const claveCarpeta = (id: string) => `c:${id}`;
export const claveDoc = (id: string) => `d:${id}`;
