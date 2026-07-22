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
  patch: (id: string, patch: Partial<{ name: string; folderId: string | null; category: string; tags: string[]; favorite: boolean; status: string; expiresAt: string | null; allowedRoles: string[]; customerId: string | null; orderId: string | null; supplierId: string | null }>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  restore: (id: string) => Promise<void>;
  purge: (id: string) => Promise<void>;
  bulk: (action: "delete" | "move" | "tag" | "favorite", ids: string[], extra?: Record<string, unknown>) => Promise<number>;
  createFolder: (input: { name: string; parentId?: string | null; color?: string; icon?: string }) => Promise<DbDocumentFolder>;
  moveFolder: (id: string, parentId: string | null) => Promise<void>;
  updateFolder: (id: string, patch: { name?: string; color?: string | null; icon?: string | null; allowedRoles?: string[] }) => Promise<void>;
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
  const updateFolder = useCallback(async (id: string, patch: { name?: string; color?: string | null; icon?: string | null; allowedRoles?: string[] }) => {
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

/** Asistente de documentos: pregunta en lenguaje natural → respuesta + docs relevantes. */
export interface DocAssistantAnswer {
  answer: string;
  matchedDocs: { id: string; name: string; category: string }[];
  source: string;
}
export async function askDocAssistant(
  question: string,
  history?: { q: string; a: string }[],
): Promise<DocAssistantAnswer> {
  return http<DocAssistantAnswer>(`${BASE}/assistant`, {
    method: "POST",
    body: JSON.stringify({ question, history }),
  });
}

/**
 * Variante en streaming: transmite la respuesta token a token (onToken con el texto
 * parcial) y al terminar devuelve la respuesta final + los docs relevantes. Protocolo:
 * 1ª línea = JSON de candidatos, luego el texto con `@@DOCS:i,i` al final. Si el stream
 * no está disponible, cae al modo no-stream.
 */
export async function askDocAssistantStream(
  question: string,
  history: { q: string; a: string }[] | undefined,
  onToken: (partialAnswer: string) => void,
): Promise<DocAssistantAnswer> {
  const res = await fetch(`${BASE}/assistant?stream=1`, {
    method: "POST",
    credentials: "include",
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ question, history }),
  });
  if (!res.ok || !res.body) return askDocAssistant(question, history);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let candidates: DocAssistantAnswer["matchedDocs"] | null = null;
  let answer = "";
  const textUpTo = (s: string) => { const d = s.indexOf("@@DOCS:"); return d >= 0 ? s.slice(0, d).trim() : s; };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    if (!candidates) {
      const nl = buffer.indexOf("\n");
      if (nl < 0) continue;
      try { candidates = JSON.parse(buffer.slice(0, nl)).docs ?? []; } catch { candidates = []; }
      buffer = buffer.slice(nl + 1);
    }
    answer = buffer;
    onToken(textUpTo(answer));
  }

  const dm = answer.indexOf("@@DOCS:");
  const refs = dm >= 0
    ? answer.slice(dm + 7).split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isInteger(n))
    : [];
  const matchedDocs = refs.map((i) => candidates?.[i]).filter((d): d is DocAssistantAnswer["matchedDocs"][number] => !!d);
  return { answer: textUpTo(answer), matchedDocs, source: "ai-stream" };
}

/** Analiza el contenido de un doc con IA (texto + resumen + datos clave + tags). */
export async function analyzeDoc(id: string): Promise<{ summary: string; keyFacts: string[]; tags: string[]; source: string; message?: string }> {
  return http(`${BASE}/${id}/analyze`, { method: "POST" });
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
    allowedRoles: string[];
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

/** Aplica un sello / marca de agua (PAGADO, COPIA…) sobre un PDF → nueva versión. */
export async function stampDoc(id: string, preset: string, customText?: string): Promise<{ version: DbDocumentVersion | null }> {
  return http(`${BASE}/${id}/stamp`, { method: "POST", body: JSON.stringify({ preset, customText }) });
}

/** Vincula/desvincula dos documentos (bidireccional). */
export async function relateDoc(id: string, relatedId: string, link: boolean): Promise<{ relatedIds: string[] }> {
  return http(`${BASE}/${id}/relate`, { method: "POST", body: JSON.stringify({ relatedId, link }) });
}

/** Combina varios documentos (PDFs + imágenes) en un PDF nuevo. */
export async function mergeDocs(ids: string[], name?: string, folderId?: string | null): Promise<{ document: DbDocument; pageCount: number; skipped: string[] }> {
  return http(`${BASE}/merge`, { method: "POST", body: JSON.stringify({ ids, name, folderId }) });
}

/** Flujo de aprobación: solicitar revisión / aprobar / rechazar. */
export async function docApproval(id: string, action: "request" | "approve" | "reject", note?: string): Promise<{ status: string }> {
  return http(`${BASE}/${id}/approval`, { method: "POST", body: JSON.stringify({ action, note }) });
}

/** Rota todas las páginas de un PDF (90/180/270°) → nueva versión. */
export async function rotateDoc(id: string, degrees: 90 | 180 | 270 = 90): Promise<{ version: DbDocumentVersion | null }> {
  return http(`${BASE}/${id}/rotate`, { method: "POST", body: JSON.stringify({ degrees }) });
}

/** Divide un PDF en un documento por página. */
export async function splitDoc(id: string): Promise<{ created: DbDocument[]; count: number }> {
  return http(`${BASE}/${id}/split`, { method: "POST", body: JSON.stringify({}) });
}

/** Cantidad de páginas de un PDF (para el editor). */
export async function fetchPageCount(id: string): Promise<number> {
  const r = await http<{ pageCount: number }>(`${BASE}/${id}/pages`);
  return r.pageCount;
}

/** Reordena/elimina/rota páginas individuales → nueva versión. */
export async function editPages(id: string, pages: { index: number; rotate?: number }[]): Promise<{ version: DbDocumentVersion | null }> {
  return http(`${BASE}/${id}/pages`, { method: "POST", body: JSON.stringify({ pages }) });
}

/** Combina varias fotos (páginas escaneadas) en un PDF nuevo. */
export async function scanToPdf(pages: Blob[], name?: string, folderId?: string | null): Promise<{ document: DbDocument; pageCount: number }> {
  const fd = new FormData();
  pages.forEach((b, i) => fd.append("pages", b, `pagina-${i + 1}.png`));
  if (name) fd.append("name", name);
  if (folderId) fd.append("folderId", folderId);
  return http(`${BASE}/scan-to-pdf`, { method: "POST", body: fd });
}
