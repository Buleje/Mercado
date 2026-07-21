"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  DbDocument,
  DbDocumentFolder,
  DbDocumentVersion,
  DbDocumentShare,
  DbDocumentAuditLog,
  DbDocumentActivity,
  DbDocumentTemplate,
  DocumentListFilters,
} from "@/lib/types/documents";
import { csrfHeaders } from "@/lib/csrf-client";

const BASE = "/api/admin/documents";

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  // CSRF: los endpoints de documentos validan x-csrf-token en mutaciones.
  // csrfHeaders lee la cookie csrf-token y la mergea; en GET es inofensivo.
  const isJson = init?.body && !(init.body instanceof FormData);
  const res = await fetch(url, {
    credentials: "include",
    headers: csrfHeaders(isJson ? { "Content-Type": "application/json" } : {}),
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export interface UseDocumentsResult {
  documents: DbDocument[];
  folders: DbDocumentFolder[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  upload: (files: File[], opts?: { folderId?: string | null; onProgress?: (done: number, total: number) => void }) => Promise<DbDocument[]>;
  scan: (file: File, opts?: { folderId?: string | null }) => Promise<{ document: DbDocument; scan: { ok: boolean; suggestedName?: string; category?: string; expiresAt?: string | null } }>;
  patch: (id: string, patch: Partial<{ name: string; folderId: string | null; category: string; tags: string[]; favorite: boolean; expiresAt: string | null; customerId: string | null; orderId: string | null; supplierId: string | null }>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  restore: (id: string) => Promise<void>;
  purge: (id: string) => Promise<void>;
  bulk: (action: "delete" | "move" | "tag" | "favorite", ids: string[], extra?: Record<string, unknown>) => Promise<number>;
  createFolder: (input: { name: string; parentId?: string | null; color?: string; icon?: string }) => Promise<DbDocumentFolder>;
  moveFolder: (id: string, parentId: string | null) => Promise<void>;
  updateFolder: (id: string, patch: { name?: string; color?: string | null; icon?: string | null }) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
}

export function useDocuments(filters: DocumentListFilters = {}): UseDocumentsResult {
  const [documents, setDocuments] = useState<DbDocument[]>([]);
  const [folders, setFolders] = useState<DbDocumentFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const f = filtersRef.current;
      const qs = new URLSearchParams();
      if (f.folderId === null) qs.set("folderId", "null");
      else if (f.folderId) qs.set("folderId", f.folderId);
      if (f.category) qs.set("category", f.category);
      if (f.q) qs.set("q", f.q);
      if (f.tags?.length) qs.set("tags", f.tags.join(","));
      if (f.favorite !== undefined) qs.set("favorite", f.favorite ? "1" : "0");
      if (f.customerId) qs.set("customerId", f.customerId);
      if (f.supplierId) qs.set("supplierId", f.supplierId);
      if (f.orderId) qs.set("orderId", f.orderId);
      // ADR-119 — vista "Por vencer" + búsqueda semántica
      if (f.expiring) qs.set("expiring", String(f.expiring));
      if (f.semantic && f.q) qs.set("semantic", "1");
      if (f.deletedOnly) qs.set("deleted", "1");

      const [docsResp, foldersResp] = await Promise.all([
        http<{ documents: DbDocument[] }>(`${BASE}?${qs.toString()}`),
        http<{ folders: DbDocumentFolder[] }>(`${BASE}/folders`),
      ]);
      setDocuments(docsResp.documents);
      setFolders(foldersResp.folders);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Stringify de las tags para evitar dep array con expresiones complejas
  const tagsKey = filters.tags?.join(",") ?? "";
  useEffect(() => {
    fetchAll();
  }, [
    fetchAll,
    filters.folderId,
    filters.category,
    filters.q,
    filters.favorite,
    filters.customerId,
    filters.supplierId,
    filters.orderId,
    filters.expiring,
    filters.semantic,
    filters.deletedOnly,
    tagsKey,
  ]);

  const upload = useCallback(
    async (files: File[], opts?: { folderId?: string | null; onProgress?: (done: number, total: number) => void }) => {
      const out: DbDocument[] = [];
      let i = 0;
      for (const f of files) {
        const fd = new FormData();
        fd.append("file", f);
        if (opts?.folderId !== undefined && opts.folderId !== null) {
          fd.append("folderId", opts.folderId);
        }
        try {
          const r = await http<{ document: DbDocument }>(BASE, { method: "POST", body: fd });
          out.push(r.document);
        } catch (e) {
          console.error("upload_fail", f.name, e);
        }
        i++;
        opts?.onProgress?.(i, files.length);
      }
      await fetchAll();
      return out;
    },
    [fetchAll]
  );

  const scan = useCallback(
    async (file: File, opts?: { folderId?: string | null }) => {
      const fd = new FormData();
      fd.append("file", file);
      if (opts?.folderId) fd.append("folderId", opts.folderId);
      const r = await http<{
        document: DbDocument;
        scan: { ok: boolean; suggestedName?: string; category?: string; expiresAt?: string | null };
      }>(`${BASE}/scan`, { method: "POST", body: fd });
      await fetchAll();
      return r;
    },
    [fetchAll]
  );

  const patch = useCallback(async (id: string, body: Record<string, unknown>) => {
    await http(`${BASE}/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    await fetchAll();
  }, [fetchAll]);

  const remove = useCallback(async (id: string) => {
    await http(`${BASE}/${id}`, { method: "DELETE" });
    await fetchAll();
  }, [fetchAll]);

  // Papelera: restaurar (soft-deleted → activo) o borrar definitivamente (purge).
  const restore = useCallback(async (id: string) => {
    await http(`${BASE}/${id}/restore`, { method: "POST" });
    await fetchAll();
  }, [fetchAll]);

  const purge = useCallback(async (id: string) => {
    await http(`${BASE}/${id}?purge=1`, { method: "DELETE" });
    await fetchAll();
  }, [fetchAll]);

  const bulk = useCallback(
    async (
      action: "delete" | "move" | "tag" | "favorite",
      ids: string[],
      extra: Record<string, unknown> = {}
    ): Promise<number> => {
      const r = await http<{ affected: number }>(`${BASE}/bulk`, {
        method: "POST",
        body: JSON.stringify({ action, ids, ...extra }),
      });
      await fetchAll();
      return r.affected;
    },
    [fetchAll]
  );

  const createFolder = useCallback(async (input: { name: string; parentId?: string | null }) => {
    const r = await http<{ folder: DbDocumentFolder }>(`${BASE}/folders`, {
      method: "POST",
      body: JSON.stringify(input),
    });
    await fetchAll();
    return r.folder;
  }, [fetchAll]);

  // Reparentar una carpeta (subcarpetas): parentId null = mover a la raíz.
  const moveFolder = useCallback(async (id: string, parentId: string | null) => {
    await http(`${BASE}/folders/${id}`, { method: "PATCH", body: JSON.stringify({ parentId }) });
    await fetchAll();
  }, [fetchAll]);

  // Editar metadata de la carpeta (nombre / color / ícono).
  const updateFolder = useCallback(async (id: string, patch: { name?: string; color?: string | null; icon?: string | null }) => {
    await http(`${BASE}/folders/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    await fetchAll();
  }, [fetchAll]);

  const deleteFolder = useCallback(async (id: string) => {
    await http(`${BASE}/folders/${id}`, { method: "DELETE" });
    await fetchAll();
  }, [fetchAll]);

  return { documents, folders, loading, error, refresh: fetchAll, upload, scan, patch, remove, restore, purge, bulk, createFolder, moveFolder, updateFolder, deleteFolder };
}

// ── Standalone helpers ──────────────────────────────────────────────────────

export async function fetchVersions(id: string): Promise<DbDocumentVersion[]> {
  const r = await http<{ versions: DbDocumentVersion[] }>(`${BASE}/${id}/versions`);
  return r.versions;
}

export async function uploadVersion(id: string, file: File, changeNote?: string): Promise<DbDocumentVersion> {
  const fd = new FormData();
  fd.append("file", file);
  if (changeNote) fd.append("changeNote", changeNote);
  const r = await http<{ version: DbDocumentVersion }>(`${BASE}/${id}/versions`, { method: "POST", body: fd });
  return r.version;
}

export async function fetchAudit(id: string): Promise<DbDocumentAuditLog[]> {
  const r = await http<{ logs: DbDocumentAuditLog[] }>(`${BASE}/${id}/audit`);
  return r.logs;
}

/** Feed de actividad global del drive (cross-documento). */
export async function fetchRecentActivity(limit = 40): Promise<DbDocumentActivity[]> {
  const r = await http<{ activity: DbDocumentActivity[] }>(`${BASE}/activity?limit=${limit}`);
  return r.activity;
}

// ── Taxonomía de etiquetas ──────────────────────────────────────────────────

export async function fetchTags(): Promise<{ tag: string; count: number }[]> {
  const r = await http<{ tags: { tag: string; count: number }[] }>(`${BASE}/tags`);
  return r.tags;
}

export async function renameDocTag(from: string, to: string): Promise<number> {
  const r = await http<{ affected: number }>(`${BASE}/tags`, {
    method: "POST",
    body: JSON.stringify({ action: "rename", from, to }),
  });
  return r.affected;
}

export async function deleteDocTag(tag: string): Promise<number> {
  const r = await http<{ affected: number }>(`${BASE}/tags`, {
    method: "POST",
    body: JSON.stringify({ action: "delete", tag }),
  });
  return r.affected;
}

export async function fetchShares(id: string): Promise<DbDocumentShare[]> {
  const r = await http<{ shares: DbDocumentShare[] }>(`${BASE}/${id}/share`);
  return r.shares;
}

export async function createShare(id: string, body: { expiresInDays?: number; password?: string } = {}): Promise<DbDocumentShare> {
  const r = await http<{ share: DbDocumentShare }>(`${BASE}/${id}/share`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return r.share;
}

export async function revokeShare(shareId: string): Promise<void> {
  await http(`${BASE}/share/${shareId}`, { method: "DELETE" });
}

export async function fetchTemplates(): Promise<DbDocumentTemplate[]> {
  const r = await http<{ templates: DbDocumentTemplate[] }>(`${BASE}/templates`);
  return r.templates;
}

export async function generateFromTemplate(input: {
  templateKey: string;
  values: Record<string, string | number>;
  filename?: string;
  folderId?: string | null;
}): Promise<DbDocument> {
  const r = await http<{ document: DbDocument }>(`${BASE}/templates/generate`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return r.document;
}

export async function getSignedDownloadUrl(id: string): Promise<{ url: string; filename: string }> {
  return http(`${BASE}/${id}/download`);
}

/** ADR-119 — patch standalone (vencimiento, links de entidad) desde el modal. */
export async function patchDocument(
  id: string,
  body: Partial<{
    name: string;
    expiresAt: string | null;
    customerId: string | null;
    supplierId: string | null;
    orderId: string | null;
  }>
): Promise<DbDocument> {
  const r = await http<{ document: DbDocument }>(`${BASE}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  return r.document;
}

export async function getDocumentDetail(id: string): Promise<{ document: DbDocument; signedUrl: string | null }> {
  return http<{ document: DbDocument; signedUrl: string | null }>(`${BASE}/${id}`);
}

export async function signDocument(id: string, body: {
  signerName: string;
  signerRole?: string;
  signatureImagePngBase64?: string;
}): Promise<{ version: DbDocumentVersion; originalSha256: string; signedAt: string }> {
  return http(`${BASE}/${id}/sign`, { method: "POST", body: JSON.stringify(body) });
}
