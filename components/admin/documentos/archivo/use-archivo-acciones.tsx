import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import { rotateDoc, splitDoc, getSignedDownloadUrl, analyzeDoc } from "@/hooks/use-documents";
import { toast } from "sonner";
import { descendantIds } from "@/lib/documentos/folder-tree";
import { useState, useCallback } from "react";
import type { BorradoCarpetas } from "../ConfirmarBorrarCarpetas";
import { formatNumber } from "@/lib/format";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { StatBlock, StorageRing } from "./piezas-sueltas";
import { File as FileIcon, AlarmClock, Star } from "@buleje/design-system/icons";
import { STORAGE_QUOTA_BYTES } from "./compartido";
import { cn } from "@/lib/utils";
import type { HastaArchivoSubidas } from "./use-archivo-subidas";
export function useArchivoAcciones(previo: HastaArchivoSubidas) {
  const { refresh, confirm, setDragOverFolderId, setDraggingDocId, bulk, setRootDropActive,
    setDraggingFolderId, childrenMap, folderById, moveFolder, setExpandedFolders, setNewFolderName,
    setNewFolderParent, newFolderName, newFolderParent, createFolder, bulkFolders, deleteFolder,
    activeFolderId, setActiveFolderId, setFilterMode, setRenaming, renaming, patch, analyzingId,
    setAnalyzingId, setAnalyzeResult, fotosEsc, escondeFotos, searchDebounced, shownDocCount, totalSize,
    verVencimientos, vencidosDocs, expiringDocs, favCount } = previo;
  const handleRotate = async (doc: DbDocument) => {
    try {
      await rotateDoc(doc.id, 90);
      await refresh();
    } catch (err) {
      toast.error("No se pudo rotar: " + (err instanceof Error ? err.message.slice(0, 120) : "error"));
    }
  };

  // Dividir un PDF en un documento por página.
  const handleSplit = async (doc: DbDocument) => {
    if (!(await confirm({
      title: `¿Dividir "${doc.name}" en un documento por página?`,
      confirmLabel: "Sí, dividir",
    }))) return;
    try {
      const res = await splitDoc(doc.id);
      await refresh();
      toast.success(`Listo: se crearon ${res.count} documento(s), uno por página.`);
    } catch (err) {
      toast.error("No se pudo dividir: " + (err instanceof Error ? err.message.slice(0, 120) : "error"));
    }
  };

  // Mover UN documento a una carpeta al soltarlo (drag & drop).
  const dropDocOnFolder = async (docId: string, folderId: string | null) => {
    setDragOverFolderId(null);
    setDraggingDocId(null);
    if (!docId) return;
    await bulk("move", [docId], { folderId });
  };

  // Reparentar una carpeta al soltarla sobre otra (o "raíz").
  // Guard: no soltar sobre sí misma ni sobre un descendiente (crearía un ciclo).
  const dropFolderOnFolder = async (folderId: string, targetId: string | null) => {
    setDragOverFolderId(null);
    setRootDropActive(false);
    setDraggingFolderId(null);
    if (!folderId || folderId === targetId) return;
    if (targetId && descendantIds(childrenMap, folderId).has(targetId)) return;
    const dragged = folderById.get(folderId);
    if (dragged && (dragged.parentId ?? null) === (targetId ?? null)) return;
    await moveFolder(folderId, targetId);
    if (targetId) setExpandedFolders((prev) => new Set(prev).add(targetId));
  };

  // ── Folder actions ──
  const openCreateChild = (parentId: string | null) => {
    setNewFolderName("");
    setNewFolderParent(parentId);
    if (parentId) setExpandedFolders((prev) => new Set(prev).add(parentId));
  };
  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    const parentId = newFolderParent ?? null;
    await createFolder({ name, parentId });
    setNewFolderName("");
    setNewFolderParent(undefined);
    if (parentId) setExpandedFolders((prev) => new Set(prev).add(parentId));
  };
  /**
   * Borrar UNA carpeta abre el mismo modal que el borrado en lote: las
   * subcarpetas no caen solas (la FK es SET NULL) y los documentos de adentro
   * pueden irse a la papelera o quedar sueltos. Antes era un `confirm()` que
   * sólo avisaba que los documentos iban a la raíz — y quien borraba la carpeta
   * los veía reaparecer.
   */
  // Una o varias (el explorador borra lo elegido de una vez).
  const [borrandoCarpeta, setBorrandoCarpeta] = useState<DbDocumentFolder[] | null>(null);
  const handleDeleteFolder = (f: DbDocumentFolder) => setBorrandoCarpeta([f]);
  const confirmarBorrarCarpeta = async (fs: DbDocumentFolder[], opciones: BorradoCarpetas) => {
    const descs = new Set(fs.flatMap((f) => [...descendantIds(childrenMap, f.id)]));
    const ids = fs.map((f) => f.id);
    const conSub = opciones.incluirSubcarpetas && descs.size > 0;
    if (conSub || ids.length > 1) {
      await bulkFolders(conSub ? [...new Set([...ids, ...descs])] : ids, { action: "delete", conDocumentos: opciones.conDocumentos });
    } else {
      await deleteFolder(ids[0], { conDocumentos: opciones.conDocumentos });
    }
    setBorrandoCarpeta(null);
    if (activeFolderId && (ids.includes(activeFolderId) || descs.has(activeFolderId))) {
      setActiveFolderId(null);
      setFilterMode("all");
    }
  };

  // ── Rename ──
  const startRename = (d: DbDocument) => setRenaming({ id: d.id, value: d.name });
  const commitRename = async () => {
    if (!renaming) return;
    const { id, value } = renaming;
    const trimmed = value.trim();
    if (trimmed && trimmed.length > 0) {
      await patch(id, { name: trimmed });
    }
    setRenaming(null);
  };

  // ── Download single ──
  const handleDownload = async (d: DbDocument) => {
    try {
      const { url, filename } = await getSignedDownloadUrl(d.id);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.target = "_blank";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      console.error(e);
      toast.error("No se pudo generar el link de descarga.");
    }
  };

  // ── Analizar contenido con IA (para que el asistente pueda leerlo) ──
  const handleAnalyze = useCallback(async (doc: DbDocument) => {
    if (analyzingId) return;
    setAnalyzingId(doc.id);
    try {
      const r = await analyzeDoc(doc.id);
      setAnalyzeResult({
        name: doc.name,
        summary: r.summary || "Guardé el texto del documento. El asistente ya puede usar su contenido.",
        keyFacts: r.keyFacts ?? [],
      });
      setTimeout(() => setAnalyzeResult(null), 15000);
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setAnalyzeResult({
        name: doc.name,
        summary: /no_text|422/.test(msg)
          ? "No pude extraer texto (¿es una imagen o un escaneo? usa el botón Escanear)."
          : "No pude analizar el documento. Reintenta.",
        keyFacts: [],
      });
      setTimeout(() => setAnalyzeResult(null), 8000);
    } finally {
      setAnalyzingId(null);
    }
  }, [analyzingId, refresh, setAnalyzeResult, setAnalyzingId]);

  // Hero stats — en la papelera se ocultan: el listado que hay en memoria es el
  // de los BORRADOS, así que "Total archivos" y "Espacio usado" contaban la
  // papelera como si fuera el drive (4 archivos, 976 KB, con 41 vivos). Ocultos
  // por defecto (Brandon 2026-08-30): empujaban los documentos, que es lo que
  // se busca casi siempre al abrir el drive.
  // «15 papeles · 360 fotos»: con las fotos de las cámaras escondidas, el total
  // sólo cuenta los papeles y las fotos van aparte (y su peso sigue sumando al
  // espacio usado). Con una búsqueda escrita no: ese conteo no sería de la búsqueda.
  const fotosN = fotosEsc.conteo?.total ?? 0;
  const hayFotosEscondidas = escondeFotos && !searchDebounced.trim() && fotosN > 0;
  const bytesFotos = hayFotosEscondidas ? (fotosEsc.conteo?.bytes ?? 0) : 0;
  const resumenArchivos = hayFotosEscondidas
    ? `${formatNumber(shownDocCount)} ${shownDocCount === 1 ? "papel" : "papeles"} · ${formatNumber(fotosN)} ${fotosN === 1 ? "foto" : "fotos"}`
    : `${formatNumber(shownDocCount)} ${shownDocCount === 1 ? "archivo" : "archivos"}`;
  const kpis = useKpisPlegables({
    claveMemoria: "documentos-archivo",
    alto: "md",
    compactoEnMovil: true,
    resumen: resumenArchivos,
    tarjetas: [
      <StatBlock key="total" label={hayFotosEscondidas ? "Papeles" : "Total archivos"} value={shownDocCount.toString()} icon={FileIcon} tint="text-primary" nota={hayFotosEscondidas ? `+ ${formatNumber(fotosN)} ${fotosN === 1 ? "foto" : "fotos"} de las cámaras` : undefined} />,
      <StorageRing key="espacio" usedBytes={totalSize + bytesFotos} quotaBytes={STORAGE_QUOTA_BYTES} />,
      <button
        key="vencer"
        type="button"
        onClick={() => verVencimientos("todos")}
        className={cn(
          "text-left bg-[var(--surface-raised)] border rounded-2xl p-4 transition-all hover:shadow-md",
          vencidosDocs.length > 0
            ? "border-[var(--data-error-500)]/40 hover:border-[var(--data-error-500)]"
            : expiringDocs.length > 0
            ? "border-[var(--data-warning-500)]/40 hover:border-[var(--data-warning-500)]"
            : "border-[var(--rule-base)] hover:border-primary/40"
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-bold text-[var(--text-tertiary)]">Por vencer (30 días)</p>
            <p className={cn("text-2xl font-extrabold tabular-nums mt-0.5", expiringDocs.length > 0 ? "text-[var(--data-warning-ink)]" : "text-[var(--text-tertiary)]")}>{expiringDocs.length}</p>
            {vencidosDocs.length > 0 && (
              <p className="text-sm font-bold text-[var(--data-error-ink)]">
                + {vencidosDocs.length} ya {vencidosDocs.length === 1 ? "vencido" : "vencidos"}
              </p>
            )}
          </div>
          <AlarmClock className={cn("h-5 w-5 shrink-0 mt-0.5", expiringDocs.length > 0 ? "text-[var(--data-warning-ink)]" : "text-[var(--text-tertiary)]")} />
        </div>
      </button>,
      <StatBlock key="fav" label="Favoritos" value={favCount.toString()} icon={Star} tint="text-amber-500" />,
    ],
  });

  // ── «⋯» por documento (tarjeta y fila) + clic derecho ──
  // Un solo menú abierto por clic derecho a la vez: el punto vive acá y cada
  // documento sabe si es el suyo.
  return { handleRotate, handleSplit, dropDocOnFolder, dropFolderOnFolder, openCreateChild,
    handleCreateFolder, borrandoCarpeta, setBorrandoCarpeta, handleDeleteFolder, confirmarBorrarCarpeta,
    startRename, commitRename, handleDownload, handleAnalyze, fotosN, hayFotosEscondidas, bytesFotos,
    resumenArchivos, kpis };
}
export type HastaArchivoAcciones = HastaArchivoSubidas & ReturnType<typeof useArchivoAcciones>;