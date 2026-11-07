import { useMemo, useEffect, useCallback, useState } from "react";
import { buildChildrenMap, flattenVisible, descendantIds, flattenAll, folderPath } from "@/lib/documentos/folder-tree";
import { sugDescartadasKey, tagsVisibles } from "./compartido";
import { cuantosFiltrosActivos } from "@/lib/documentos/filtros-doc";
import type { HastaArchivoIndice } from "./use-archivo-indice";
export function useArchivoCarpetas(previo: HastaArchivoIndice) {
  const { folders, setSugDescartadas, documents, sugDescartadas, patch, refresh, expandedFolders, filterMode,
    activeFolderId, setSelectedFolderIds, setSelectingFolders, selectedFolderIds, setExpandedFolders,
    setSelectedIds, displayDocs, selectedIds, filtros, terminosBusqueda, statusFilter, soloSinDescribir } = previo;
  const childrenMap = useMemo(() => buildChildrenMap(folders), [folders]);
  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);

  // ── Sugerencias IA de organización (carpeta/vencimiento del auto-análisis) ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem(sugDescartadasKey());
      if (raw) setSugDescartadas(new Set(JSON.parse(raw) as string[]));
    } catch { /* ignore */ }
  }, [setSugDescartadas]);
  const descartarSugerencia = useCallback((docId: string) => {
    setSugDescartadas((prev) => {
      const s = new Set(prev);
      s.add(docId);
      try { localStorage.setItem(sugDescartadasKey(), JSON.stringify([...s])); } catch { /* quota */ }
      return s;
    });
  }, [setSugDescartadas]);
  /** Sugerencias vigentes: la carpeta debe existir y el doc seguir suelto/sin vencimiento. */
  const sugerenciasIA = useMemo(
    () =>
      documents
        .flatMap((d) => {
          const s = (d.ocrMetadata as Record<string, unknown> | null)?.sugerencias as
            | { folderId?: string; folderName?: string; expiresAt?: string }
            | null
            | undefined;
          if (!s || sugDescartadas.has(d.id)) return [];
          const carpeta = s.folderId && !d.folderId && folderById.has(s.folderId)
            ? { folderId: s.folderId, folderName: folderById.get(s.folderId)!.name }
            : null;
          const vence = s.expiresAt && !d.expiresAt ? s.expiresAt : null;
          if (!carpeta && !vence) return [];
          return [{ doc: d, carpeta, vence }];
        })
        .slice(0, 3),
    [documents, sugDescartadas, folderById]
  );
  const aplicarSugerencia = useCallback(
    async (docId: string, cambios: { folderId?: string; expiresAt?: string }) => {
      await patch(docId, cambios);
    },
    [patch]
  );
  /**
   * Aceptar TODAS de una. Cada vencimiento que queda sin aplicar es un aviso
   * que nunca va a llegar: el cron mira `expiresAt`, no la sugerencia.
   */
  const [aplicandoTodas, setAplicandoTodas] = useState(false);
  const aplicarTodasLasSugerencias = useCallback(async () => {
    if (aplicandoTodas) return;
    setAplicandoTodas(true);
    try {
      for (const { doc, carpeta, vence } of sugerenciasIA) {
        await aplicarSugerencia(doc.id, {
          ...(carpeta ? { folderId: carpeta.folderId } : {}),
          ...(vence ? { expiresAt: vence } : {}),
        }).catch((err) => console.warn("[documentos] sugerencia fail", doc.id, err));
      }
      await refresh();
    } finally {
      setAplicandoTodas(false);
    }
  }, [aplicandoTodas, sugerenciasIA, aplicarSugerencia, refresh]);
  const visibleFolderRows = useMemo(() => flattenVisible(childrenMap, expandedFolders), [childrenMap, expandedFolders]);
  // La lista de carpetas muestra las primeras 6; el resto, tras «Ver N más».
  // La carpeta abierta nunca se esconde.
  const [todasLasCarpetas, setTodasLasCarpetas] = useState(false);
  const CARPETAS_A_LA_VISTA = 6;
  const filasDeCarpeta = todasLasCarpetas
    ? visibleFolderRows
    : visibleFolderRows.filter((r, i) => i < CARPETAS_A_LA_VISTA || (filterMode === "folder" && r.folder.id === activeFolderId));

  // ── Selección múltiple de carpetas ──────────────────────────────────────────
  const toggleFolderSelected = useCallback((id: string) => {
    setSelectedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [setSelectedFolderIds]);

  const salirSeleccion = useCallback(() => {
    setSelectingFolders(false);
    setSelectedFolderIds(new Set());
  }, [setSelectedFolderIds, setSelectingFolders]);

  /** Etiquetas ya usadas en carpetas: para reusar en vez de inventar sinónimos. */
  const folderTagSuggestions = useMemo(
    () => [...new Set(folders.flatMap((f) => tagsVisibles(f.tags)))].sort(),
    [folders],
  );

  /** Subcarpetas de lo marcado: NO se borran solas (la FK es SET NULL), así que
   *  la barra pregunta si incluirlas y las manda explícitamente. */
  const descendientesMarcados = useMemo(() => {
    const marcadas = new Set(selectedFolderIds);
    const caen = new Set<string>();
    for (const id of marcadas) {
      for (const d of descendantIds(childrenMap, id)) if (!marcadas.has(d)) caen.add(d);
    }
    return [...caen];
  }, [selectedFolderIds, childrenMap]);
  /** Cuántos documentos hay en juego al borrar lo marcado (el modal los dice). */
  const documentosMarcados = useMemo(() => {
    const cuantos = (ids: Iterable<string>) => {
      let n = 0;
      for (const id of ids) n += folderById.get(id)?.documentCount ?? 0;
      return n;
    };
    return {
      directos: cuantos(selectedFolderIds),
      enSubcarpetas: cuantos(descendientesMarcados),
    };
  }, [selectedFolderIds, descendientesMarcados, folderById]);
  const allFolderRows = useMemo(() => flattenAll(childrenMap), [childrenMap]);
  const activePath = useMemo(
    () => (filterMode === "folder" && activeFolderId ? folderPath(folderById, activeFolderId) : []),
    [filterMode, activeFolderId, folderById]
  );
  const activeChildren = useMemo(
    () => (filterMode === "folder" && activeFolderId ? childrenMap.get(activeFolderId) ?? [] : []),
    [filterMode, activeFolderId, childrenMap]
  );
  /** Dónde cae lo que se importa: la carpeta abierta, o la raíz si no hay ninguna. */
  const destinoImport = filterMode === "folder" ? activeFolderId : null;
  const toggleExpand = (id: string) =>
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // ── Selection ──
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());
  /**
   * Elegir de una todo lo que está a la vista — que con filtros o búsqueda
   * puestos NO es todo el drive, sino justo lo que acabás de acotar. Ese es el
   * atajo que importa: filtrás "Excel, vencidos", tocás uno, y de ahí a
   * borrarlos todos hay un clic.
   */
  const selectAll = () => setSelectedIds(new Set(displayDocs.map((d) => d.id)));
  const todosElegidos = displayDocs.length > 0 && selectedIds.size === displayDocs.length;
  /** ¿Hay algo acotando la lista? Cambia el texto del atajo, para no prometer
   *  "todos" cuando en realidad son los que sobrevivieron al filtro. */
  const hayFiltroPuesto =
    cuantosFiltrosActivos(filtros) > 0
    || terminosBusqueda.length > 0
    || statusFilter !== "all"
    || soloSinDescribir
    || filterMode === "folder";

  // ── Upload handlers ──
  return { childrenMap, folderById, descartarSugerencia, sugerenciasIA, aplicarSugerencia, aplicandoTodas,
    setAplicandoTodas, aplicarTodasLasSugerencias, visibleFolderRows, todasLasCarpetas, setTodasLasCarpetas,
    CARPETAS_A_LA_VISTA, filasDeCarpeta, toggleFolderSelected, salirSeleccion, folderTagSuggestions,
    descendientesMarcados, documentosMarcados, allFolderRows, activePath, activeChildren, destinoImport,
    toggleExpand, toggleSelect, clearSelection, selectAll, todosElegidos, hayFiltroPuesto };
}
export type HastaArchivoCarpetas = HastaArchivoIndice & ReturnType<typeof useArchivoCarpetas>;