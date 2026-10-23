import { useMemo, useEffect, useCallback } from "react";
import { TAGS_FOTOS_DE_MAQUINA, esFotoDeMaquina } from "@/lib/documents/fotos-de-maquina";
import { useDocuments } from "@/hooks/use-documents";
import { useAbrirDesdeUrl } from "../use-abrir-desde-url";
import { palabrasUtiles } from "@/lib/documentos/terminos-busqueda";
import { daysUntil } from "./compartido";
import { matchesSmartFolder } from "@/lib/documentos/smart-folders";
import { tieneDescripcion, ordenarPorRelevancia } from "@/lib/documentos/relevancia";
import { cuantosFiltrosActivos, cumpleFiltros } from "@/lib/documentos/filtros-doc";
import { tipoDeArchivo } from "../explorador/orden-agrupar";
import { isAnalyzableMime } from "@/lib/documents/analyzable-mime";
import type { HastaArchivoEstados } from "./use-archivo-estados";
export function useArchivoLista(previo: HastaArchivoEstados) {
  const { etiquetaFiltro, searchDebounced, semantic, filterMode, activeFolderId, escondeFotos, preview,
    setPreview, setSearch, importsTerminados, setUploadProgress, setScanResult, setSortBy,
    setTarjetasVisibles, soloVencimiento, activeSmartId, smartFolders, statusFilter, soloSinDescribir,
    filtros, sortBy } = previo;
  const filters = useMemo(
    () =>
      etiquetaFiltro
        ? {
            // Filtro de SERVIDOR por tag (Archivo-hub, ADR-502): trae TODOS los
            // documentos con ese tag cruzando carpetas (`folderId: undefined`).
            // Va aparte del chip cliente `filtros.tags`: lo que se ve es lo que
            // trajo el servidor por esta etiqueta.
            folderId: undefined,
            tags: [etiquetaFiltro.tag],
            q: searchDebounced.trim() || undefined,
            semantic: semantic && !!searchDebounced.trim(),
          }
        : {
            folderId: filterMode === "folder" ? activeFolderId : undefined,
            // Terceros busca adentro de lo suyo: un texto que quedó en la cabecera
            // (que ahí no se ve) no le tiene que esconder papeles.
            q: filterMode === "terceros" ? undefined : searchDebounced.trim() || undefined,
            favorite: filterMode === "favorites" ? true : undefined,
            expiring: filterMode === "expiring" ? 30 : undefined,
            semantic: filterMode !== "terceros" && semantic && !!searchDebounced.trim(),
            deletedOnly: filterMode === "trash" ? true : undefined,
            sinTags: escondeFotos ? [...TAGS_FOTOS_DE_MAQUINA] : undefined,
          },
    [etiquetaFiltro, filterMode, activeFolderId, searchDebounced, semantic, escondeFotos]
  );

  const {
    documents, semanticTerms, folders, loading, error, refresh,
    upload, scan, patch, bulk, restore, purge, restoreMany, purgeMany, createFolder, createFolderTree, existingNames, moveFolder, updateFolder, bulkFolders, deleteFolder,
  } = useDocuments(filters);
  /** `?doc=<id>` abre ese papel y `?q=` pone la búsqueda (buscador del panel). */
  useAbrirDesdeUrl({ documents, loading, preview, setPreview, setBuscar: setSearch });

  /**
   * Con qué se compara cada documento para decir POR QUÉ apareció: la frase
   * entera, sus palabras sueltas y —en modo IA— los sinónimos con los que el
   * servidor amplió la búsqueda. Sin eso, un documento traído por el sinónimo
   * "arriendo" se mostraría sin explicación de por qué está ahí.
   */
  const terminosBusqueda = useMemo(() => {
    const q = searchDebounced.trim();
    if (!q) return [];
    // Las mismas palabras que usó el servidor para filtrar (sin "de", "del"…):
    // si acá se colaran, la lista resaltaría en amarillo un "de" que no fue el
    // que trajo el documento.
    return Array.from(new Set([q.toLowerCase(), ...palabrasUtiles(q), ...semanticTerms]))
      .filter((t) => t.length >= 2);
  }, [searchDebounced, semanticTerms]);

  // Un import terminado (aunque haya sido desde otra pestaña) trae documentos
  // nuevos: recargar. El 0 inicial se saltea para no duplicar el fetch de montaje.
  useEffect(() => {
    if (importsTerminados === 0) return;
    void refresh();
  }, [importsTerminados, refresh]);

  // ── Escaneo desde cámara (móvil) ──
  const handleScan = useCallback(
    async (files: FileList | File[]) => {
      const file = Array.from(files)[0];
      if (!file) return;
      setUploadProgress({ done: 0, total: 1 });
      try {
        const r = await scan(file, { folderId: activeFolderId });
        if (r.scan?.ok) {
          setScanResult({ name: r.document.name, expiresAt: r.scan.expiresAt ?? null });
          setTimeout(() => setScanResult(null), 8000);
        }
      } catch (e) {
        console.error("scan_fail", e);
      } finally {
        setUploadProgress(null);
      }
    },
    [setUploadProgress, scan, activeFolderId, setScanResult]
  );

  /**
   * Buscando, lo natural es que arriba esté lo más parecido a lo que pediste,
   * no lo último que subiste; al limpiar la búsqueda vuelve a lo de siempre.
   * Sólo se toca el orden "por defecto": si el usuario eligió tamaño o nombre,
   * manda el suyo.
   */
  const hayBusqueda = terminosBusqueda.length > 0;
  useEffect(() => {
    setSortBy((prev) => {
      if (hayBusqueda) return prev === "recent" ? "relevancia" : prev;
      return prev === "relevancia" ? "recent" : prev;
    });
  }, [hayBusqueda, setSortBy]);

  useEffect(() => { setTarjetasVisibles(10); }, [filterMode, activeFolderId, setTarjetasVisibles]);

  // ── Filtrado (recent) + orden client-side ──
  const displayDocs = useMemo(() => {
    let list = documents;
    if (filterMode === "recent") {
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      list = list.filter((d) => new Date(d.uploadedAt).getTime() > cutoff);
    }
    if (filterMode === "expiring" && soloVencimiento !== "todos") {
      list = list.filter((d) => {
        const n = daysUntil(d.expiresAt);
        return n !== null && (soloVencimiento === "vencidos" ? n < 0 : n >= 0);
      });
    }
    if (filterMode === "smart" && activeSmartId) {
      const sf = smartFolders.find((f) => f.id === activeSmartId);
      if (sf) list = list.filter((d) => matchesSmartFolder(d, sf.rules));
    }
    // Con el filtro por etiqueta activo lo que se ve es EXACTO lo que trajo el
    // servidor por ese tag: no se le superponen los chips cliente.
    if (!etiquetaFiltro) {
      if (statusFilter) list = list.filter((d) => d.status === statusFilter);
      if (soloSinDescribir) list = list.filter((d) => !tieneDescripcion(d));
      if (cuantosFiltrosActivos(filtros) > 0) list = list.filter((d) => cumpleFiltros(d, filtros));
    }
    if (sortBy === "relevancia") return ordenarPorRelevancia(list, terminosBusqueda);
    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name, "es", { sensitivity: "base" });
        case "size":
          return b.size - a.size;
        case "type":
          return tipoDeArchivo(a).localeCompare(tipoDeArchivo(b), "es") || a.name.localeCompare(b.name, "es", { sensitivity: "base" });
        case "expiry": {
          // Los que vencen primero arriba; los que no vencen, al final.
          const av = a.expiresAt ? new Date(a.expiresAt).getTime() : Infinity;
          const bv = b.expiresAt ? new Date(b.expiresAt).getTime() : Infinity;
          return av - bv;
        }
        case "recent":
        default:
          return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
      }
    });
    return sorted;
  }, [documents, filterMode, sortBy, statusFilter, activeSmartId, smartFolders, soloSinDescribir, terminosBusqueda, filtros, etiquetaFiltro, soloVencimiento]);

  const statusCounts = useMemo(() => {
    const m: Record<string, number> = { draft: 0, review: 0, approved: 0, archived: 0 };
    for (const d of documents) if (d.status && d.status in m) m[d.status] += 1;
    return m;
  }, [documents]);

  // Lo que la IA puede leer (PDF/texto/Word/Excel/fotos — single-source en
  // analyzable-mime) y todavía NO tiene descripción. Es la medida honesta de
  // "cuánto de mi drive no se puede buscar por su contenido": un documento
  // analizado cuya descripción quedó vacía sigue sin servir para buscar.
  const indexableDocs = useMemo(
    () => documents.filter((d) => isAnalyzableMime(d.mimeType) && !tieneDescripcion(d) && !esFotoDeMaquina(d)),
    [documents]
  );
  // Todos los documentos analizables, estén o no ya indexados. Sirve para
  return { filters, documents, semanticTerms, folders, loading, error, refresh, upload, scan, patch, bulk,
    restore, purge, restoreMany, purgeMany, createFolder, createFolderTree, existingNames, moveFolder,
    updateFolder, bulkFolders, deleteFolder, terminosBusqueda, handleScan, hayBusqueda, displayDocs,
    statusCounts, indexableDocs };
}
export type HastaArchivoLista = HastaArchivoEstados & ReturnType<typeof useArchivoLista>;