import { useCallback } from "react";
import type { EstadoArchivo } from "./compartido";
import { hayCargaInterna, fijarArrastre } from "../explorador/destino-soltar";
import { archivosDesdeDrop } from "@/lib/documentos/importar-arbol";
import type { EstadoDoc } from "@/lib/documents/estados-doc";
import type { DbDocument } from "@/lib/types/documents";
import { toast } from "sonner";
import { mergeDocs } from "@/hooks/use-documents";
import type { HastaArchivoCarpetas } from "./use-archivo-carpetas";
export function useArchivoSubidas(previo: HastaArchivoCarpetas) {
  const { documents, confirm, setUploadProgress, setEstadoSubida, upload, activeFolderId, setDragOver,
    setImportandoCarpeta, setSoltado, clearSelection, selectedIds, bulk, reloadAllTags, zipping, setZipping,
    displayDocs, activePath, merging, setMerging, refresh, marcarCodigoFisico } = previo;
  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files);
      if (arr.length === 0) return;
      // Duplicados: mismo nombre base que algo ya subido → avisar ANTES.
      const base = (n: string) => n.replace(/\.[^.]+$/, "").trim().toLowerCase();
      const existentes = new Set(documents.map((d) => base(d.name)));
      const aSubir: File[] = [];
      for (const f of arr) {
        if (!existentes.has(base(f.name))) { aSubir.push(f); continue; }
        const seguir = await confirm({
          title: `"${f.name}" ya existe en el drive`,
          description: "¿Subirlo igual? Quedará duplicado.",
          intent: "warning",
          confirmLabel: "Sí, subir igual",
        });
        if (seguir) aSubir.push(f);
      }
      if (aSubir.length === 0) return;
      setUploadProgress({ done: 0, total: aSubir.length });
      setEstadoSubida(new Map(aSubir.map((f) => [f.name, { estado: "en-cola" as EstadoArchivo }])));
      try {
        await upload(aSubir, {
          folderId: activeFolderId,
          onProgress: (done, total) => setUploadProgress({ done, total }),
          onEstado: (file, estado, motivo) =>
            setEstadoSubida((prev) => {
              const m = new Map(prev ?? []);
              m.set(file.name, { estado, ...(motivo ? { motivo } : {}) });
              return m;
            }),
        });
      } finally {
        setUploadProgress(null);
        // Si todo salió bien, el panel se va solo tras un vistazo. Si algo
        // falló, se QUEDA: un archivo que no subió y desaparece de la pantalla
        // es un archivo perdido sin que nadie se entere.
        setTimeout(() => {
          setEstadoSubida((prev) => {
            if (prev && [...prev.values()].some((v) => v.estado === "error")) return prev;
            return null;
          });
        }, 2500);
      }
    },
    [documents, setUploadProgress, setEstadoSubida, confirm, upload, activeFolderId]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      // Mover dentro del Archivo (soltar en el espacio vacío) no es una subida.
      if (hayCargaInterna([...e.dataTransfer.types])) { fijarArrastre(null); return; }
      e.preventDefault();
      setDragOver(false);
      // Si lo que soltaron es una CARPETA, `files` trae el directorio como si
      // fuera un archivo (0 bytes, sin tipo) y la subida normal lo tiraba a la
      // basura. Se detecta con la API de entries y se abre el importador con
      // el árbol ya cargado — arrastrar la carpeta y listo.
      //
      // OJO: `dataTransfer.items` se VACÍA al salir del handler, así que hay
      // que empezar a leer el árbol acá mismo (archivosDesdeDrop toma las
      // entries de forma síncrona antes de su primer await); guardar la lista
      // para leerla después devuelve una lista vacía.
      const hayCarpeta = Array.from(e.dataTransfer.items).some((i) => i.webkitGetAsEntry?.()?.isDirectory);
      if (hayCarpeta) {
        setImportandoCarpeta(true);
        archivosDesdeDrop(e.dataTransfer.items)
          .then((conRuta) => setSoltado(conRuta))
          .catch((err) => console.warn("[drive] no pude leer la carpeta soltada", err));
        return;
      }
      if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
    },
    [handleFiles, setDragOver, setImportandoCarpeta, setSoltado]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    // Drag interno (mover documento o reparentar carpeta) → no es una subida.
    if (hayCargaInterna([...e.dataTransfer.types])) return;
    e.preventDefault();
    setDragOver(true);
  }, [setDragOver]);
  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.currentTarget === e.target) setDragOver(false);
  }, [setDragOver]);

  // ── Bulk actions ──
  /**
   * Corre una acción en lote y limpia la selección SOLO si salió bien.
   *
   * Si falla, la marca queda puesta para reintentar y el motivo lo muestra el
   * banner rojo del hook. El `catch` no es decorativo: sin él la promesa
   * quedaba sin manejar y en dev el error saltaba como pantalla roja de Next
   * encima del panel (así se vio el "HTTP 400: Too big...").
   */
  const correrLote = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      clearSelection();
    } catch (err) {
      console.warn("[drive] acción en lote falló", err);
    }
  };
  const bulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!(await confirm({
      title: `¿Eliminar ${selectedIds.size} documento(s)?`,
      intent: "danger",
      confirmLabel: "Sí, eliminar",
    }))) return;
    await correrLote(() => bulk("delete", Array.from(selectedIds)));
  };
  const bulkFavorite = async (fav: boolean) => {
    if (selectedIds.size === 0) return;
    await correrLote(() => bulk("favorite", Array.from(selectedIds), { favorite: fav }));
  };
  /** ADR-516 — «Ya les puse el código en el físico» a toda la pila de una. */
  const bulkCodigoFisico = async (puesto: boolean) => {
    if (selectedIds.size === 0) return;
    await correrLote(async () => {
      const n = await marcarCodigoFisico(Array.from(selectedIds), puesto);
      if (n === 0) toast.info(puesto ? "No había nada por marcar: ya estaban puestos o no tienen código." : "Ninguno estaba marcado como puesto.");
      else toast.success(puesto
        ? `${n} ${n === 1 ? "papel marcado" : "papeles marcados"} con el código en el físico.`
        : `${n} ${n === 1 ? "papel vuelve" : "papeles vuelven"} a «código por poner».`);
    });
  };
  const bulkMove = async (folderId: string | null) => {
    if (selectedIds.size === 0) return;
    await correrLote(() => bulk("move", Array.from(selectedIds), { folderId }));
  };
  /** Marcar todo lo seleccionado con el mismo estado (revisar una pila de una). */
  const bulkStatus = async (status: EstadoDoc) => {
    if (selectedIds.size === 0) return;
    await correrLote(() => bulk("status", Array.from(selectedIds), { status }));
  };
  const bulkTag = async (tag: string) => {
    const t = tag.trim();
    if (selectedIds.size === 0 || !t) return;
    await correrLote(async () => {
      await bulk("tag", Array.from(selectedIds), { tag: t });
      reloadAllTags();
    });
  };
  // Empaqueta una lista de documentos en un ZIP (client-side con jszip): baja cada
  // archivo del proxy /raw y evita nombres duplicados con un sufijo (n). Compartido
  // por la descarga en lote (selección) y la descarga de una carpeta entera.
  const zipAndDownload = async (docs: DbDocument[], filename: string) => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    const seen = new Map<string, number>();
    for (const doc of docs) {
      const res = await fetch(`/api/admin/documents/${doc.id}/raw`, { credentials: "include" });
      if (!res.ok) continue;
      const blob = await res.blob();
      let name = doc.name || `documento-${doc.id}`;
      const dup = seen.get(name) ?? 0;
      seen.set(name, dup + 1);
      if (dup > 0) {
        const dot = name.lastIndexOf(".");
        name = dot > 0 ? `${name.slice(0, dot)} (${dup})${name.slice(dot)}` : `${name} (${dup})`;
      }
      zip.file(name, blob);
    }
    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
  const bulkDownloadZip = async () => {
    if (selectedIds.size === 0 || zipping) return;
    setZipping(true);
    try {
      const docs = Array.from(selectedIds)
        .map((id) => documents.find((d) => d.id === id))
        .filter((d): d is DbDocument => !!d);
      await zipAndDownload(docs, `documentos-${selectedIds.size}.zip`);
      clearSelection();
    } finally {
      setZipping(false);
    }
  };
  // Descargar TODA la carpeta activa como ZIP.
  const downloadFolderZip = async () => {
    if (zipping || displayDocs.length === 0) return;
    setZipping(true);
    try {
      const folderName = activePath.length ? activePath[activePath.length - 1].name : "carpeta";
      await zipAndDownload(displayDocs, `${folderName.replace(/[^\w.-]+/g, "_") || "carpeta"}.zip`);
    } finally {
      setZipping(false);
    }
  };

  // Combinar los documentos seleccionados (PDFs + imágenes) en un PDF nuevo.
  const handleMerge = async () => {
    if (selectedIds.size < 2 || merging) return;
    setMerging(true);
    try {
      const ids = Array.from(selectedIds).filter((id) => {
        const d = documents.find((x) => x.id === id);
        return d && (d.mimeType === "application/pdf" || d.mimeType.startsWith("image/"));
      });
      if (ids.length < 2) {
        toast.error("Elige al menos 2 PDFs o imágenes para combinar.");
        return;
      }
      const res = await mergeDocs(ids);
      clearSelection();
      await refresh();
      if (res.skipped.length) toast.info(`Combinado en ${res.pageCount} páginas. Se saltaron ${res.skipped.length} archivo(s) no compatibles.`);
    } catch (err) {
      toast.error("No se pudo combinar: " + (err instanceof Error ? err.message.slice(0, 120) : "error"));
    } finally {
      setMerging(false);
    }
  };

  // Rotar un PDF 90° (todas las páginas) → nueva versión.
  return { handleFiles, onDrop, onDragOver, onDragLeave, correrLote, bulkDelete, bulkFavorite, bulkCodigoFisico, bulkMove,
    bulkStatus, bulkTag, zipAndDownload, bulkDownloadZip, downloadFolderZip, handleMerge };
}
export type HastaArchivoSubidas = HastaArchivoCarpetas & ReturnType<typeof useArchivoSubidas>;