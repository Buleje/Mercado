"use client";

import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";

const API = "/api/superadmin/documents";

/** Metadata editable desde el modal (rename, categoría, tags, vencimiento). */
export interface DocMetaPatch {
  name?: string;
  category?: string;
  tags?: string[];
  expiresAt?: string | null;
}

/** Cuerpo aceptado por el PATCH interno (metadata + favorito). */
type DocPatchBody = DocMetaPatch & { favorite?: boolean };

export interface UseSuperAdminDocuments {
  docs: DbDocument[];
  loading: boolean;
  error: string | null;
  uploading: boolean;
  busyId: string | null;
  setError: (msg: string | null) => void;
  reload: () => Promise<void>;
  upload: (files: FileList | File[]) => Promise<void>;
  download: (doc: DbDocument) => Promise<void>;
  toggleFavorite: (doc: DbDocument) => Promise<void>;
  changeCategory: (doc: DbDocument, category: string) => Promise<void>;
  saveMeta: (id: string, patch: DocMetaPatch) => Promise<boolean>;
  remove: (doc: DbDocument) => Promise<void>;
  removeMany: (ids: string[]) => Promise<void>;
  folders: DbDocumentFolder[];
  creatingFolder: boolean;
  reloadFolders: () => Promise<void>;
  createFolder: (name: string) => Promise<void>;
  bulkMove: (ids: string[], folderId: string | null) => Promise<void>;
  searchContent: (q: string) => Promise<DbDocument[]>;
  trash: DbDocument[];
  trashLoading: boolean;
  reloadTrash: () => Promise<void>;
  restore: (doc: DbDocument) => Promise<void>;
  purge: (doc: DbDocument) => Promise<void>;
}

function uploadErrorLabel(name: string, code: string | undefined): string {
  if (code === "too_large") return `${name} (supera 50 MB)`;
  if (code === "mime_not_allowed") return `${name} (tipo no permitido)`;
  return name;
}

export function useSuperAdminDocuments(): UseSuperAdminDocuments {
  const [docs, setDocs] = useState<DbDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [folders, setFolders] = useState<DbDocumentFolder[]>([]);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [trash, setTrash] = useState<DbDocument[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(API, { headers: csrfHeaders({}) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDocs(data.documents ?? []);
    } catch (err) {
      console.error("[sa-documents] load failed", err);
      setError("No se pudieron cargar los documentos.");
    } finally {
      setLoading(false);
    }
  }, []);

  const reloadFolders = useCallback(async () => {
    try {
      const res = await fetch(`${API}/folders`, { headers: csrfHeaders({}) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { folders?: DbDocumentFolder[] };
      setFolders(data.folders ?? []);
    } catch (err) {
      console.error("[sa-documents] folders load failed", err);
    }
  }, []);

  useEffect(() => {
    reload();
    reloadFolders();
  }, [reload, reloadFolders]);

  const upload = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (!list.length) return;
      setUploading(true);
      setError(null);
      const failed: string[] = [];
      try {
        for (const file of list) {
          try {
            const fd = new FormData();
            fd.append("file", file);
            const res = await fetch(API, { method: "POST", headers: csrfHeaders({}), body: fd });
            if (!res.ok) {
              const data = (await res.json().catch(() => ({}))) as { error?: string };
              failed.push(uploadErrorLabel(file.name, data.error));
            }
          } catch (err) {
            console.error("[sa-documents] upload failed", file.name, err);
            failed.push(file.name);
          }
        }
        if (failed.length) {
          setError(`No se pudieron subir: ${failed.join(", ")}.`);
        }
        await reload();
      } finally {
        setUploading(false);
      }
    },
    [reload],
  );

  /** PATCH con merge del documento devuelto; revierte a la fuente si falla. */
  const patch = useCallback(
    async (id: string, body: DocPatchBody): Promise<boolean> => {
      try {
        const res = await fetch(`${API}/${id}`, {
          method: "PATCH",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { document?: DbDocument };
        if (data.document) {
          const doc = data.document;
          setDocs((prev) => prev.map((d) => (d.id === id ? doc : d)));
        }
        return true;
      } catch (err) {
        console.error("[sa-documents] patch failed", err);
        setError("No se pudo guardar el cambio.");
        await reload();
        return false;
      }
    },
    [reload],
  );

  const toggleFavorite = useCallback(
    async (doc: DbDocument) => {
      setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...d, favorite: !d.favorite } : d)));
      await patch(doc.id, { favorite: !doc.favorite });
    },
    [patch],
  );

  const changeCategory = useCallback(
    async (doc: DbDocument, category: string) => {
      setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...d, category } : d)));
      await patch(doc.id, { category });
    },
    [patch],
  );

  const saveMeta = useCallback((id: string, meta: DocMetaPatch) => patch(id, meta), [patch]);

  const download = useCallback(async (doc: DbDocument) => {
    setBusyId(doc.id);
    try {
      const res = await fetch(`${API}/${doc.id}?download=1`, { headers: csrfHeaders({}) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { signedUrl } = (await res.json()) as { signedUrl?: string };
      if (signedUrl) window.open(signedUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error("[sa-documents] download failed", err);
      setError("No se pudo descargar el documento.");
    } finally {
      setBusyId(null);
    }
  }, []);

  const remove = useCallback(async (doc: DbDocument) => {
    setBusyId(doc.id);
    try {
      const res = await fetch(`${API}/${doc.id}`, { method: "DELETE", headers: csrfHeaders({}) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (err) {
      console.error("[sa-documents] delete failed", err);
      setError(`No se pudo borrar "${doc.name}".`);
    } finally {
      setBusyId(null);
    }
  }, []);

  const removeMany = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    const failed: string[] = [];
    for (const id of ids) {
      try {
        const res = await fetch(`${API}/${id}`, { method: "DELETE", headers: csrfHeaders({}) });
        if (!res.ok) {
          failed.push(id);
          continue;
        }
        setDocs((prev) => prev.filter((d) => d.id !== id));
      } catch (err) {
        console.error("[sa-documents] bulk delete failed", id, err);
        failed.push(id);
      }
    }
    if (failed.length) setError(`No se pudieron borrar ${failed.length} documento(s).`);
  }, []);

  const createFolder = useCallback(
    async (name: string) => {
      setCreatingFolder(true);
      try {
        const res = await fetch(`${API}/folders`, {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ name }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await reloadFolders();
      } catch (err) {
        console.error("[sa-documents] create folder failed", err);
        setError("No se pudo crear la carpeta.");
      } finally {
        setCreatingFolder(false);
      }
    },
    [reloadFolders],
  );

  const bulkMove = useCallback(
    async (ids: string[], folderId: string | null) => {
      if (!ids.length) return;
      setDocs((prev) => prev.map((d) => (ids.includes(d.id) ? { ...d, folderId } : d)));
      try {
        const res = await fetch(`${API}/bulk`, {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ action: "move", ids, folderId }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        console.error("[sa-documents] bulk move failed", err);
        setError("No se pudieron mover los documentos.");
        await reload();
      }
    },
    [reload],
  );

  const searchContent = useCallback(async (q: string): Promise<DbDocument[]> => {
    const term = q.trim();
    if (term.length < 2) return [];
    try {
      const res = await fetch(`${API}?q=${encodeURIComponent(term)}`, { headers: csrfHeaders({}) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { documents?: DbDocument[] };
      return data.documents ?? [];
    } catch (err) {
      console.error("[sa-documents] content search failed", err);
      setError("No se pudo buscar en el contenido.");
      return [];
    }
  }, []);

  const reloadTrash = useCallback(async () => {
    setTrashLoading(true);
    try {
      const res = await fetch(`${API}?deleted=1`, { headers: csrfHeaders({}) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { documents?: DbDocument[] };
      setTrash(data.documents ?? []);
    } catch (err) {
      console.error("[sa-documents] trash load failed", err);
      setError("No se pudo cargar la papelera.");
    } finally {
      setTrashLoading(false);
    }
  }, []);

  const restore = useCallback(
    async (doc: DbDocument) => {
      setBusyId(doc.id);
      try {
        const res = await fetch(`${API}/${doc.id}`, {
          method: "PATCH",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ restore: true }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setTrash((prev) => prev.filter((d) => d.id !== doc.id));
        await reload();
      } catch (err) {
        console.error("[sa-documents] restore failed", err);
        setError(`No se pudo restaurar "${doc.name}".`);
      } finally {
        setBusyId(null);
      }
    },
    [reload],
  );

  const purge = useCallback(async (doc: DbDocument) => {
    setBusyId(doc.id);
    try {
      const res = await fetch(`${API}/${doc.id}?purge=1`, {
        method: "DELETE",
        headers: csrfHeaders({}),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setTrash((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (err) {
      console.error("[sa-documents] purge failed", err);
      setError(`No se pudo borrar definitivamente "${doc.name}".`);
    } finally {
      setBusyId(null);
    }
  }, []);

  return {
    docs,
    loading,
    error,
    uploading,
    busyId,
    setError,
    reload,
    upload,
    download,
    toggleFavorite,
    changeCategory,
    saveMeta,
    remove,
    removeMany,
    folders,
    creatingFolder,
    reloadFolders,
    createFolder,
    bulkMove,
    searchContent,
    trash,
    trashLoading,
    reloadTrash,
    restore,
    purge,
  };
}
