import { useState, useCallback } from "react";
import MenuDocumento, { type PuntoDeMenu, type AccionesDocumento } from "../MenuDocumento";
import { slugActivo, BUILTIN_CATEGORIES, VISTAS_CON_CONTENIDO_PROPIO } from "./compartido";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import { useExplorador } from "../explorador/use-explorador";
import { cuantosFiltrosActivos } from "@/lib/documentos/filtros-doc";
import { ESTADOS_DEL_MENU, STATUS_META } from "./estado-doc";
import type { EstadoDoc } from "@/lib/documents/estados-doc";
import { cn } from "@/lib/utils";
import { Search } from "@buleje/design-system/icons";
import type { HastaArchivoAcciones } from "./use-archivo-acciones";
import { esEsencial } from "@/lib/documentos/esenciales";
import { marcarEsenciales } from "../esenciales/marcar-esencial";
import { extrasRegistrado } from "../menu-registrado";
export function useArchivoMenu(previo: HastaArchivoAcciones) {
  const { setFilterMode, setActiveFolderId, setExpandedFolders, vistaConDatos, filterMode, setSoloVencimiento,
    setPreview, handleAnalyze, handleDownload, startRename, setMovingDoc, setTagDocId, setWhatsappDoc,
    setSignDoc, setStampTarget, handleRotate, handleSplit, setPageEditorDoc, patch, confirm, bulk, view,
    setView, activeFolderId, activePath, displayDocs, documents, folders, childrenMap, folderById,
    searchDebounced, hayBusqueda, filtros, statusFilter, soloSinDescribir, sortBy, setSortBy, selectedIds,
    setSelectedIds, toggleSelect, prompt, createFolder, updateFolder, upload, moveFolder, deleteFolder,
    restoreMany, refresh, fileInputRef, setEditingFolder, setSharingFolder, setExpediente, setBorrandoCarpeta,
    zipAndDownload, bulkDownloadZip, bulkFavorite, bulkStatus, smartFolders, activeSmartId, setActiveSmartId,
    setSmartModal, setShowTags, etiquetaFiltro, semantic, search, setSearch, bulkFolders, marcarCodigoFisico } = previo;
  const [menuEn, setMenuEn] = useState<({ id: string } & PuntoDeMenu) | null>(null);
  // «Vínculos con el sistema…» (Archivo, Terceros y Esenciales): el id, para releer la carpeta
  // de la lista tras cada vínculo (la etiqueta cambia y la ventana la muestra).
  const [vinculandoId, setVinculandoId] = useState<string | null>(null);
  const setVinculando = useCallback((f: DbDocumentFolder | null) => setVinculandoId(f?.id ?? null), []);
  const abrirMenuEn = (e: React.MouseEvent, id: string) => {
    // Dentro de un campo (renombrar) el menú del navegador sigue: copiar/pegar.
    if ((e.target as HTMLElement).closest("input, textarea")) return;
    e.preventDefault();
    setMenuEn({ id, x: e.clientX, y: e.clientY });
  };

  // ── Explorador (íconos grandes/medianos, lista, detalles) ──
  const [slugDrive] = useState(slugActivo);
  const abrirCarpetaExp = useCallback((id: string | null) => {
    if (!id) { setFilterMode("all"); return; }
    setFilterMode("folder");
    setActiveFolderId(id);
    setExpandedFolders((prev) => new Set(prev).add(id));
  }, [setFilterMode, setActiveFolderId, setExpandedFolders]);
  const vistasDelPanel = BUILTIN_CATEGORIES.filter((cat) => vistaConDatos[cat.id] || filterMode === cat.id);
  const irAVista = (id: string) => {
    if (id === "expiring") setSoloVencimiento("todos");
    setFilterMode(id as typeof filterMode);
    setActiveFolderId(null);
  };
  /** Lo que hace cada opción del menú de un documento (el «⋯», el clic derecho y el explorador). */
  const accionesDe = (doc: DbDocument): AccionesDocumento => ({
    status: doc.status,
    favorite: !!doc.favorite,
    isPdf: doc.mimeType === "application/pdf",
    onPreview: () => setPreview(doc),
    onAnalyze: () => void handleAnalyze(doc),
    onDownload: () => void handleDownload(doc),
    onRename: () => startRename(doc),
    onMove: () => setMovingDoc(doc),
    onTag: () => setTagDocId(doc.id),
    onWhatsApp: () => setWhatsappDoc([doc]),
    onSign: () => setSignDoc(doc),
    onStamp: () => setStampTarget(doc),
    onRotate: () => void handleRotate(doc),
    onSplit: () => void handleSplit(doc),
    onEditPages: () => setPageEditorDoc(doc),
    onToggleFav: () => void patch(doc.id, { favorite: !doc.favorite }),
    onSetStatus: (st) => void patch(doc.id, { status: st }),
    onDelete: async () => {
      if (!(await confirm({ title: `¿Eliminar "${doc.name}"?`, intent: "danger", confirmLabel: "Sí, eliminar" }))) return;
      // Acá había un `patch(doc.id, {})` "para calentar el camino": un PATCH
      // sin campos que el servidor rechaza, y que reventaba el borrado con un
      // error en pantalla antes de llegar a borrar nada.
      await bulk("delete", [doc.id]);
    },
  });
  const ex = useExplorador({
    slug: slugDrive,
    vista: view,
    setVista: setView,
    modo: filterMode,
    carpetaId: filterMode === "folder" ? activeFolderId : null,
    ruta: activePath,
    irACarpeta: abrirCarpetaExp,
    docs: displayDocs,
    documentos: documents,
    carpetas: folders,
    hijos: childrenMap,
    porId: folderById,
    busqueda: searchDebounced,
    acotado: hayBusqueda || cuantosFiltrosActivos(filtros) > 0 || !!statusFilter || soloSinDescribir,
    orden: sortBy,
    setOrden: setSortBy,
    seleccion: selectedIds,
    setSeleccion: setSelectedIds,
    alternarSeleccion: toggleSelect,
    prompt,
    createFolder,
    updateFolder: async (id, cambios) => { await updateFolder(id, cambios); },
    renombrarDoc: (id, name) => patch(id, { name }),
    upload: (files, opts) => upload(files, opts),
    bulk,
    moveFolder,
    deleteFolder,
    restoreMany,
    refrescar: () => refresh({ silencioso: true }),
    abrirSubida: () => fileInputRef.current?.click(),
    personalizar: setEditingFolder,
    compartir: setSharingFolder,
    armarExpediente: (f) => setExpediente({ tipo: "carpeta", folderId: f.id, nombre: f.name }),
    vincularTercero: setVinculando,
    alternarEsencial: (f) => void marcarEsenciales(bulkFolders, [f], !esEsencial(f)),
    eliminarCarpetas: (fs) => { if (fs.length > 0) setBorrandoCarpeta(fs); },
    zip: zipAndDownload,
    verDoc: setPreview,
    accionesDoc: accionesDe,
    extrasCodigo: (doc) => extrasRegistrado(doc, marcarCodigoFisico),
    estados: ESTADOS_DEL_MENU,
    lote: {
      zip: () => void bulkDownloadZip(),
      whatsapp: () => {
        const elegidos = documents.filter((d) => selectedIds.has(d.id));
        if (elegidos.length > 0) setWhatsappDoc(elegidos);
      },
      favoritos: (si) => void bulkFavorite(si),
      estado: (clave) => void bulkStatus(clave as EstadoDoc),
      expediente: () => setExpediente({ tipo: "ids", ids: Array.from(selectedIds) }),
    },
    etiquetaEstado: (st) => STATUS_META[st]?.label ?? st,
    nombreLugar: BUILTIN_CATEGORIES.find((c) => c.id === filterMode)?.label
      ?? (filterMode === "smart" ? smartFolders.find((f) => f.id === activeSmartId)?.name ?? "Carpeta inteligente" : "Archivo"),
    lugares: {
      vistas: vistasDelPanel.map((c) => ({ id: c.id, label: c.label, Icon: c.icon })),
      vistaActiva: filterMode,
      irAVista,
      inteligentes: smartFolders.map((f) => ({ id: f.id, nombre: f.name })),
      inteligenteActiva: filterMode === "smart" ? activeSmartId : null,
      abrirInteligente: (id) => { setFilterMode("smart"); setActiveSmartId(id); },
      nuevaInteligente: () => setSmartModal("new"),
      etiquetas: () => setShowTags(true),
    },
  });
  // Sin panel sólo donde se ve el explorador: Resumen, Papelera, Calendario…
  // son otras pantallas y llevan el panel para volver.
  // Con el filtro por etiqueta (Archivo-hub) se ve la lista PLANA de los
  // documentos de esa entidad: se apaga el explorador/árbol de carpetas y el
  // panel lateral, y el contenido pasa a las vistas de tarjetas/lista de abajo.
  const etiquetaActiva = !!etiquetaFiltro;
  const enExplorador = ex.explorando && !VISTAS_CON_CONTENIDO_PROPIO.has(filterMode) && !etiquetaActiva;
  const explorandoVista = ex.explorando && !etiquetaActiva;
  const sinPanel = (ex.sinPanel && enExplorador) || etiquetaActiva;
  const barraExplorador = enExplorador && (filterMode === "all" || filterMode === "folder");
  // En el explorador va a la derecha de la barra de dirección; en el resto, al frente de la barra.
  const buscador = (
    <div className={cn("relative", barraExplorador ? "w-full sm:w-72 sm:flex-none" : "flex-1 min-w-[220px]")}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
      <input
        type="text"
        // Lo enfoca el acceso «Archivos» de la cabecera (components/admin/header).
        data-buscar-archivos=""
        aria-label="Buscar archivos"
        placeholder={semantic ? "Describe lo que buscas… ej: el contrato del local" : "Buscar por nombre, tag o contenido OCR…"}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className={cn(
          "w-full pl-9 pr-3 h-12 rounded-xl border-2 bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all",
          semantic ? "border-[var(--accent)]" : "border-[var(--rule-base)]"
        )}
      />
    </div>
  );
  const docDelMenu = menuEn && !ex.propsVista ? documents.find((d) => d.id === menuEn.id) ?? null : null;

  const menuDe = (doc: DbDocument, variante: "fila" | "flotante" = "fila", sinBoton = false) => (
    <MenuDocumento
      {...accionesDe(doc)}
      sinBoton={sinBoton}
      extras={ex.extrasDe(doc)}
      flotante={variante === "flotante"}
      nombre={doc.name}
      estados={ESTADOS_DEL_MENU}
      abrirEn={menuEn?.id === doc.id ? menuEn : null}
      onCerrado={() => setMenuEn((m) => (m?.id === doc.id ? null : m))}
    />
  );

  return { menuEn, setMenuEn, abrirMenuEn, vinculandoId, setVinculando, slugDrive, abrirCarpetaExp, vistasDelPanel, irAVista, accionesDe,
    ex, etiquetaActiva, enExplorador, explorandoVista, sinPanel, barraExplorador, buscador, docDelMenu, menuDe };
}
export type HastaArchivoMenu = HastaArchivoAcciones & ReturnType<typeof useArchivoMenu>;