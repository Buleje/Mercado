import { useState, useCallback, useEffect, useRef } from "react";
import { useImportCarpeta } from "@/contexts/import-carpeta-context";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import type { EstadoArchivo } from "./compartido";
import { taxonomiaGuardada, guardarTaxonomia } from "@/lib/documentos/cache-lista-cliente";
import { fetchTags } from "@/hooks/use-documents";
import { esTagDeMaquinaPlan } from "@/lib/forestal/plan-documentos-tipos";
import type { SoloVencimiento } from "../ChipsVencimiento";
import type { FuenteDelModal } from "../expediente/use-expediente";
import { type SmartFolder, loadSmartFolders, saveSmartFolders } from "@/lib/documentos/smart-folders";
import { useFotosEscondidas } from "@/hooks/use-fotos-escondidas";
import type { HastaArchivoVista } from "./use-archivo-vista";
export function useArchivoEstados(previo: HastaArchivoVista) {
  const { setFilterMode, setActiveFolderId, setSearchDebounced, search, etiquetaFiltro, filterMode,
    setEtiquetaFiltro } = previo;
  const [scanResult, setScanResult] = useState<{ name: string; expiresAt: string | null } | null>(null);
  // Resultado del análisis IA de contenido (resumen + datos clave).
  const [analyzeResult, setAnalyzeResult] = useState<{ name: string; summary: string; keyFacts: string[] } | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  /** Import masivo de una carpeta con su árbol. */
  const [importandoCarpeta, setImportandoCarpeta] = useState(false);
  // El import corre en segundo plano (puede terminar con el drive cerrado):
  // cuando avisa que terminó, se recarga la lista.
  const { terminados: importsTerminados } = useImportCarpeta();
  /** Lo que se soltó en el drive cuando era una carpeta: entra derecho al importador. */
  const [soltado, setSoltado] = useState<{ file: File; ruta: string }[] | null>(null);
  const [preview, setPreview] = useState<DbDocument | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  /** Estado por archivo de la subida en curso (panel abajo a la derecha). */
  /** Estado por archivo de la subida en curso, con el motivo si falló. */
  const [estadoSubida, setEstadoSubida] = useState<Map<string, { estado: EstadoArchivo; motivo?: string }> | null>(null);
  /** Sugerencias IA descartadas por el usuario (persisten por tenant). */
  const [sugDescartadas, setSugDescartadas] = useState<Set<string>>(new Set());
  /** «Ordenar mi Archivo»: abierto, y cuántas veces se ordenó (para recontar el aviso). */
  const [ordenando, setOrdenando] = useState(false);
  const [ordenVersion, setOrdenVersion] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  // Subcarpetas: `undefined` = no creando, `null` = crear en raíz, string = crear dentro de esa carpeta.
  const [newFolderParent, setNewFolderParent] = useState<string | null | undefined>(undefined);
  const [newFolderName, setNewFolderName] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  /**
   * Selección múltiple de CARPETAS. Es un modo explícito y no un checkbox
   * siempre visible: la fila ya tiene cuatro acciones al hover y un quinto
   * control permanente la vuelve ilegible.
   */
  const [selectingFolders, setSelectingFolders] = useState(false);
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());
  /** Modal de etiquetado en lote (elegir de la taxonomía o crear nueva) para la selección activa. */
  const [bulkTagModalOpen, setBulkTagModalOpen] = useState(false);
  /** Id del documento cuyo editor de etiquetas está abierto (chips + autocompletar). */
  const [tagDocId, setTagDocId] = useState<string | null>(null);
  /** Taxonomía completa del tenant, para sugerir al escribir y evitar duplicados por typo. */
  const [allTags, setAllTags] = useState<string[]>(() => taxonomiaGuardada() ?? []);
  const reloadAllTags = useCallback(() => {
    fetchTags().then((r) => { const t = r.map((x) => x.tag).filter((x) => !esTagDeMaquinaPlan(x)); guardarTaxonomia(t); setAllTags(t); }).catch((err) => console.warn("[documentos] no pude cargar la taxonomía de etiquetas", err));
  }, []);
  // Sólo la usan los dos modales de etiquetar: se pide al abrir uno (22-10, era 1 de los 8 pedidos al abrir el Archivo).
  const pideTaxonomia = bulkTagModalOpen || tagDocId !== null;
  useEffect(() => { if (pideTaxonomia && taxonomiaGuardada() === null) reloadAllTags(); }, [pideTaxonomia, reloadAllTags]);
  /** Menú "Más" de la barra de selección — agrupa las acciones menos frecuentes
   *  (mover, ZIP, WhatsApp, combinar) para que la fila no crezca sin límite. */
  const [bulkMoreOpen, setBulkMoreOpen] = useState(false);
  const [bulkMorePos, setBulkMorePos] = useState<{ top: number; right: number } | null>(null);
  const bulkMoreBtnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!bulkMoreOpen) return;
    const close = () => setBulkMoreOpen(false);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [bulkMoreOpen]);
  const [expiryBannerDismissed, setExpiryBannerDismissed] = useState(false);
  /** Qué mitad de «Vencimientos» se mira: lo ya vencido, lo que vence en 30 días, o todo. */
  const [soloVencimiento, setSoloVencimiento] = useState<SoloVencimiento>("todos");
  const verVencimientos = useCallback((cuales: SoloVencimiento) => {
    setSoloVencimiento(cuales);
    setFilterMode("expiring");
    setActiveFolderId(null);
  }, [setFilterMode, setActiveFolderId]);
  const [zipping, setZipping] = useState(false);
  // Drag & drop de documentos hacia carpetas de la barra lateral.
  const [draggingDocId, setDraggingDocId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  // Reparentar carpetas (arrastrar una carpeta sobre otra o a la raíz).
  const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null);
  const [rootDropActive, setRootDropActive] = useState(false);
  // Modales por-documento (mover a carpeta / enviar por WhatsApp).
  const [movingDoc, setMovingDoc] = useState<DbDocument | null>(null);
  /** Documentos a mandar por WhatsApp: uno desde la ficha, varios desde la selección. */
  const [whatsappDoc, setWhatsappDoc] = useState<DbDocument[] | null>(null);
  /** «Armar expediente»: de una carpeta (clic derecho) o de la selección (en el orden elegido). */
  const [expediente, setExpediente] = useState<FuenteDelModal | null>(null);
  const [signDoc, setSignDoc] = useState<DbDocument | null>(null);
  const [stampTarget, setStampTarget] = useState<DbDocument | null>(null);
  const [merging, setMerging] = useState(false);
  // Personalizar carpeta (nombre + color + ícono).
  const [editingFolder, setEditingFolder] = useState<DbDocumentFolder | null>(null);
  // Compartir carpeta completa por link.
  const [sharingFolder, setSharingFolder] = useState<DbDocumentFolder | null>(null);
  // Editor de taxonomía de etiquetas.
  const [showTags, setShowTags] = useState(false);
  // Carpetas inteligentes (filtros guardados, por dispositivo).
  const [smartFolders, setSmartFolders] = useState<SmartFolder[]>([]);
  const [activeSmartId, setActiveSmartId] = useState<string | null>(null);
  const [smartModal, setSmartModal] = useState<SmartFolder | "new" | null>(null);
  const [showCameraScan, setShowCameraScan] = useState(false);
  const [pageEditorDoc, setPageEditorDoc] = useState<DbDocument | null>(null);
  useEffect(() => { setSmartFolders(loadSmartFolders()); }, []);
  const persistSmart = useCallback((next: SmartFolder[]) => { setSmartFolders(next); saveSmartFolders(next); }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search, setSearchDebounced]);

  // Fotos de las cámaras: fuera de las vistas generales (en Blas, 360 de 375
  // documentos). Dentro de una carpeta, con una etiqueta pedida («Ver fotos» pide
  // una) o en la papelera se muestran todas.
  const fotosEsc = useFotosEscondidas();
  const vistaGeneral = !etiquetaFiltro && filterMode !== "folder" && filterMode !== "trash";
  const escondeFotos = vistaGeneral; // `vistaGeneral`: ni carpeta, ni etiqueta, ni papelera
  /** «Ver fotos»: la lista de esa etiqueta, desde «Todos» (el aviso de arriba trae el «Quitar»). */
  const verFotosDeMaquina = useCallback((e: { tag: string; label: string }) => {
    if (filterMode !== "all") setFilterMode("all");
    setEtiquetaFiltro(e);
  }, [filterMode, setFilterMode, setEtiquetaFiltro]);

  return { scanResult, setScanResult, analyzeResult, setAnalyzeResult, analyzingId, setAnalyzingId,
    selectedIds, setSelectedIds, importandoCarpeta, setImportandoCarpeta, importsTerminados, soltado,
    setSoltado, preview, setPreview, renaming, setRenaming, uploadProgress, setUploadProgress, estadoSubida,
    setEstadoSubida, sugDescartadas, setSugDescartadas, ordenando, setOrdenando, ordenVersion,
    setOrdenVersion, dragOver, setDragOver, showTemplates, setShowTemplates, newFolderParent,
    setNewFolderParent, newFolderName, setNewFolderName, expandedFolders, setExpandedFolders,
    selectingFolders, setSelectingFolders, selectedFolderIds, setSelectedFolderIds, bulkTagModalOpen,
    setBulkTagModalOpen, tagDocId, setTagDocId, allTags, setAllTags, reloadAllTags, pideTaxonomia,
    bulkMoreOpen, setBulkMoreOpen, bulkMorePos, setBulkMorePos, bulkMoreBtnRef, expiryBannerDismissed,
    setExpiryBannerDismissed, soloVencimiento, setSoloVencimiento, verVencimientos, zipping, setZipping,
    draggingDocId, setDraggingDocId, dragOverFolderId, setDragOverFolderId, draggingFolderId,
    setDraggingFolderId, rootDropActive, setRootDropActive, movingDoc, setMovingDoc, whatsappDoc,
    setWhatsappDoc, expediente, setExpediente, signDoc, setSignDoc, stampTarget, setStampTarget, merging,
    setMerging, editingFolder, setEditingFolder, sharingFolder, setSharingFolder, showTags, setShowTags,
    smartFolders, setSmartFolders, activeSmartId, setActiveSmartId, smartModal, setSmartModal, showCameraScan,
    setShowCameraScan, pageEditorDoc, setPageEditorDoc, persistSmart, fileInputRef, scanInputRef, fotosEsc,
    vistaGeneral, escondeFotos, verFotosDeMaquina };
}
export type HastaArchivoEstados = HastaArchivoVista & ReturnType<typeof useArchivoEstados>;