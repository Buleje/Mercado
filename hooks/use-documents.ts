"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  DbDocument,
  DbDocumentFolder,
  DbDocumentVersion,
  DbDocumentShare,
  DbSharedLink,
  DbDocumentAuditLog,
  DbDocumentActivity,
  DbDocumentTemplate,
  DocumentListFilters,
} from "@/lib/types/documents";
import { csrfHeaders } from "@/lib/csrf-client";
import { comprimirImagen } from "@/lib/documents/compress-image";
import { motivoRechazo } from "@/lib/documents/upload-limits";
import { enLotes, CARPETAS_POR_LLAMADA } from "@/lib/documentos/importar-arbol";

const BASE = "/api/admin/documents";

/**
 * Manda al servidor cuánto tardó un tramo del drive, para poder comparar si una
 * ronda de mejoras sirvió o si algo se puso lento con el tiempo.
 *
 * `keepalive` para que sobreviva si la persona se va de la pantalla justo
 * después; y todo el envío es a prueba de fallas: una medición perdida no vale
 * ni un error en pantalla.
 */
function reportarVelocidad(tramo: "listado" | "miniaturas" | "visor", ms: number, docs = 0): void {
  if (!Number.isFinite(ms) || ms <= 0) return;
  fetch(`${BASE}/velocidad`, {
    method: "POST",
    credentials: "include",
    keepalive: true,
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ muestras: [{ tramo, ms: Math.round(ms), docs }] }),
  }).catch((err) => console.warn("[drive] no se pudo reportar la velocidad", err));
}

/** El error crudo de una subida, dicho en castellano y sin códigos HTTP. */
function motivoSubida(msg: string): string {
  if (/failed to fetch|network|load failed/i.test(msg)) return "se cortó la conexión";
  if (msg.includes("413") || msg.includes("too_large")) return "pesa más de lo permitido";
  if (msg.includes("415") || msg.includes("mime_not_allowed")) return "el drive no acepta ese tipo";
  if (msg.includes("429")) return "el servidor pidió esperar";
  return "no se pudo subir";
}

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
  /** Sinónimos con los que la búsqueda IA amplió la consulta (vacío sin IA). */
  semanticTerms: string[];
  folders: DbDocumentFolder[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  upload: (files: File[], opts?: {
    folderId?: string | null;
    onProgress?: (done: number, total: number) => void;
    onEstado?: (file: File, estado: "en-cola" | "comprimiendo" | "subiendo" | "listo" | "error", motivo?: string) => void;
    /**
     * Carpeta POR archivo (el importador manda todo junto). Si está, gana sobre
     * `folderId`: permite una sola tanda con el pool aprovechado en vez de una
     * llamada por carpeta.
     */
    folderIdDe?: (file: File) => string | null | undefined;
    /** Para frenar la subida a mitad (400 archivos son varios minutos). */
    signal?: AbortSignal;
  }) => Promise<DbDocument[]>;
  scan: (file: File, opts?: { folderId?: string | null }) => Promise<{ document: DbDocument; scan: { ok: boolean; suggestedName?: string; category?: string; expiresAt?: string | null } }>;
  patch: (id: string, patch: Partial<{ name: string; folderId: string | null; category: string; tags: string[]; favorite: boolean; status: string; expiresAt: string | null; allowedRoles: string[]; customerId: string | null; orderId: string | null; supplierId: string | null }>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  restore: (id: string) => Promise<void>;
  purge: (id: string) => Promise<void>;
  bulk: (action: "delete" | "move" | "tag" | "favorite" | "status", ids: string[], extra?: Record<string, unknown>) => Promise<number>;
  createFolder: (input: { name: string; parentId?: string | null; color?: string; icon?: string }) => Promise<DbDocumentFolder>;
  /** Árbol completo en una llamada (importador de carpetas): ruta → id. */
  createFolderTree: (parentId: string | null, rutas: string[]) => Promise<{ idPorRuta: Record<string, string>; creadas: number }>;
  /** Nombre+peso de lo que ya hay en esas carpetas (clave "" = raíz). */
  existingNames: (folderIds: (string | null)[]) => Promise<Record<string, { id: string; name: string; size: number }[]>>;
  moveFolder: (id: string, parentId: string | null) => Promise<void>;
  updateFolder: (id: string, patch: { name?: string; color?: string | null; icon?: string | null; allowedRoles?: string[] }) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
}

export function useDocuments(filters: DocumentListFilters = {}): UseDocumentsResult {
  const [documents, setDocuments] = useState<DbDocument[]>([]);
  const [semanticTerms, setSemanticTerms] = useState<string[]>([]);
  const [folders, setFolders] = useState<DbDocumentFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  /**
   * Trae documentos y carpetas.
   *
   * `silencioso` evita prender el estado de carga: después de marcar un
   * favorito o renombrar un archivo, la grilla entera parpadeaba a "cargando"
   * y volvía, aunque lo único que cambió fue una tarjeta.
   *
   * `soloDocumentos` se saltea la consulta de carpetas: mover o etiquetar un
   * archivo no cambia el árbol, y sin embargo se volvía a pedir entero en cada
   * mutación. Eran dos requests donde alcanza con una.
   */
  const fetchAll = useCallback(async (opciones?: { silencioso?: boolean; soloDocumentos?: boolean }) => {
    if (!opciones?.silencioso) setLoading(true);
    setError(null);
    const arranque = performance.now();
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
        http<{ documents: DbDocument[]; semanticTerms?: string[] }>(`${BASE}?${qs.toString()}`),
        opciones?.soloDocumentos
          ? Promise.resolve(null)
          : http<{ folders: DbDocumentFolder[] }>(`${BASE}/folders`),
      ]);
      setDocuments(docsResp.documents);
      // En modo IA el servidor expande la consulta a sinónimos; devolverlos deja
      // decir POR QUÉ apareció cada documento (y resaltar el término que pegó).
      setSemanticTerms(docsResp.semanticTerms ?? []);
      if (foldersResp) setFolders(foldersResp.folders);

      // Cuánto tardó de verdad, del lado de quien lo usa. Sólo se reporta la
      // apertura completa (no los refrescos silenciosos, que son otra cosa) y
      // el envío es best-effort: medir no puede frenar ni romper el drive.
      if (!opciones?.silencioso) {
        reportarVelocidad("listado", performance.now() - arranque, docsResp.documents.length);
      }
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
    async (
      files: File[],
      opts?: {
        folderId?: string | null;
        onProgress?: (done: number, total: number) => void;
        /** Estado por archivo, con su nombre ORIGINAL (el panel de progreso). */
        onEstado?: (file: File, estado: "en-cola" | "comprimiendo" | "subiendo" | "listo" | "error", motivo?: string) => void;
    /**
     * Carpeta POR archivo (el importador manda todo junto). Si está, gana sobre
     * `folderId`: permite una sola tanda con el pool aprovechado en vez de una
     * llamada por carpeta.
     */
    folderIdDe?: (file: File) => string | null | undefined;
    /** Para frenar la subida a mitad (400 archivos son varios minutos). */
    signal?: AbortSignal;
      },
    ) => {
      // Las fotos grandes se comprimen ANTES de subir (varias veces más
      // rápido con datos móviles); lo que no es imagen sale intacto.
      const listos = await Promise.all(files.map(async (f) => {
        if (f.type.startsWith("image/")) opts?.onEstado?.(f, "comprimiendo");
        const c = await comprimirImagen(f);
        opts?.onEstado?.(f, "en-cola");
        return c;
      }));

      // Lo que el servidor va a rechazar igual (pesado, tipo no admitido) se
      // descarta ACÁ: mandar 50 MB para recibir un 413 es tirar la subida a la
      // basura. Se mide DESPUÉS de comprimir: una foto de 12 MB puede entrar.
      const rechazos = new Map<number, string>();
      listos.forEach((f, i) => {
        const motivo = motivoRechazo(f);
        if (motivo) {
          rechazos.set(i, motivo);
          opts?.onEstado?.(files[i], "error", motivo);
        }
      });

      // Cuántas subidas van a la vez.
      //
      // Estaba fijo en 3 con la idea de que más saturaba las conexiones lentas.
      // Medido con 12 archivos: pool 3 = 676 ms por archivo, pool 6 = 339, pool
      // 10 = 313. O sea que 3 dejaba la mitad de la velocidad sin usar, porque
      // el tiempo se va esperando la red, no ocupando la máquina; y pasar de 6
      // ya casi no gana nada.
      //
      // El tamaño sí importa: con archivos grandes el cuello es el ancho de
      // banda —mandar seis a la vez sólo los hace competir entre ellos— así que
      // ahí se vuelve al pool chico.
      const pesoPromedio = listos.reduce((s, f) => s + f.size, 0) / Math.max(1, listos.length);
      const POOL = pesoPromedio > 4 * 1024 * 1024 ? 3 : 6;

      const out: DbDocument[] = [];
      let hechos = 0;
      let siguiente = 0;
      const subirUno = async () => {
        for (;;) {
          if (opts?.signal?.aborted) return;
          const idx = siguiente++;
          if (idx >= listos.length) return;
          if (rechazos.has(idx)) { hechos++; opts?.onProgress?.(hechos, listos.length); continue; }
          const f = listos[idx];
          const original = files[idx]; // la compresión pudo renombrar
          const fd = new FormData();
          fd.append("file", f);
          const carpeta = opts?.folderIdDe ? opts.folderIdDe(original) : opts?.folderId;
          if (carpeta !== undefined && carpeta !== null) fd.append("folderId", carpeta);
          opts?.onEstado?.(original, "subiendo");
          // Un corte de red daba el archivo por muerto sin reintentar: subiendo
          // una carpeta con datos móviles se perdían archivos de a montones y
          // el usuario sólo veía "error". Se reintenta SOLO el corte de red (un
          // 413/415/429 fallaría igual); el riesgo es duplicar un archivo que
          // sí había llegado, y en un drive duplicar se ve y se borra —
          // perderlo, no.
          for (let intento = 1; ; intento++) {
            try {
              const r = await http<{ document: DbDocument }>(BASE, { method: "POST", body: fd, signal: opts?.signal });
              out.push(r.document);
              opts?.onEstado?.(original, "listo");
              break;
            } catch (e) {
              // Frenado a propósito: el archivo no falló, simplemente no le tocó.
              if (opts?.signal?.aborted) { opts?.onEstado?.(original, "en-cola"); return; }
              const msg = e instanceof Error ? e.message : String(e);
              const esRed = e instanceof TypeError || /failed to fetch|network|load failed/i.test(msg);
              if (!esRed || intento >= 3) {
                // warn y no error: la falla está MANEJADA (el archivo queda
                // marcado en rojo en el panel). Un console.error acá levanta el
                // overlay de Next en dev como si nada lo hubiera atrapado.
                console.warn("upload_fail", f.name, msg);
                opts?.onEstado?.(original, "error", motivoSubida(msg));
                break;
              }
              await new Promise((r) => setTimeout(r, intento * 1000));
              opts?.onEstado?.(original, "subiendo");
            }
          }
          hechos++;
          opts?.onProgress?.(hechos, listos.length);
        }
      };
      await Promise.all(Array.from({ length: Math.min(POOL, listos.length) }, subirUno));
      await fetchAll({ silencioso: true, soloDocumentos: true });
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
      await fetchAll({ silencioso: true, soloDocumentos: true });
      return r;
    },
    [fetchAll]
  );

  const patch = useCallback(async (id: string, body: Record<string, unknown>) => {
    await http(`${BASE}/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    await fetchAll({ silencioso: true, soloDocumentos: true });
  }, [fetchAll]);

  const remove = useCallback(async (id: string) => {
    await http(`${BASE}/${id}`, { method: "DELETE" });
    await fetchAll({ silencioso: true, soloDocumentos: true });
  }, [fetchAll]);

  // Papelera: restaurar (soft-deleted → activo) o borrar definitivamente (purge).
  const restore = useCallback(async (id: string) => {
    await http(`${BASE}/${id}/restore`, { method: "POST" });
    await fetchAll({ silencioso: true, soloDocumentos: true });
  }, [fetchAll]);

  const purge = useCallback(async (id: string) => {
    await http(`${BASE}/${id}?purge=1`, { method: "DELETE" });
    await fetchAll({ silencioso: true, soloDocumentos: true });
  }, [fetchAll]);

  const bulk = useCallback(
    async (
      action: "delete" | "move" | "tag" | "favorite" | "status",
      ids: string[],
      extra: Record<string, unknown> = {}
    ): Promise<number> => {
      const r = await http<{ affected: number }>(`${BASE}/bulk`, {
        method: "POST",
        body: JSON.stringify({ action, ids, ...extra }),
      });
      await fetchAll({ silencioso: true, soloDocumentos: true });
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

  /**
   * Crea un árbol entero ("Contratos/2026") en UNA llamada, reusando lo que ya
   * existe. Es lo que usa el importador de carpetas: una request por carpeta
   * chocaba con el rate limit y dejaba el árbol a medio crear (ADR-306).
   */
  const createFolderTree = useCallback(async (parentId: string | null, rutas: string[]) => {
    // El endpoint acepta 400 rutas por llamada; un archivo de un año entero
    // puede tener más carpetas. Como el plan viene en profundidad, partirlo en
    // lotes ordenados es seguro: el padre nunca queda para después del hijo.
    const idPorRuta: Record<string, string> = {};
    let creadas = 0;
    for (const lote of enLotes(rutas, CARPETAS_POR_LLAMADA)) {
      const r = await http<{ idPorRuta: Record<string, string>; creadas: number }>(`${BASE}/folders/tree`, {
        method: "POST",
        body: JSON.stringify({ parentId, rutas: lote }),
      });
      Object.assign(idPorRuta, r.idPorRuta);
      creadas += r.creadas;
    }
    await fetchAll();
    return { idPorRuta, creadas };
  }, [fetchAll]);

  /**
   * Qué archivos (nombre + peso) ya viven en esas carpetas. Lo usa el
   * importador para no volver a subir lo que ya está. Clave "" = raíz.
   */
  const existingNames = useCallback(async (folderIds: (string | null)[]) => {
    const r = await http<{ porCarpeta: Record<string, { id: string; name: string; size: number }[]> }>(`${BASE}/existing`, {
      method: "POST",
      body: JSON.stringify({ folderIds }),
    });
    return r.porCarpeta;
  }, []);

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

  return { documents, semanticTerms, folders, loading, error, refresh: fetchAll, upload, scan, patch, remove, restore, purge, bulk, createFolder, createFolderTree, existingNames, moveFolder, updateFolder, deleteFolder };
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

/** Analiza el contenido de un doc con IA (texto + descripción rica + datos + entidades + tags). */
export async function analyzeDoc(id: string): Promise<{ summary: string; description?: string; keyFacts: string[]; tags: string[]; entities?: Record<string, string[]> | null; source: string; message?: string; aviso?: string }> {
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

/** Centro de enlaces: todos los links publicos vivos del tenant (docs + carpetas). */
export async function fetchSharedLinks(): Promise<DbSharedLink[]> {
  const r = await http<{ links: DbSharedLink[] }>(`${BASE}/shares`);
  return r.links;
}

export async function revokeSharedLink(id: string, kind: "doc" | "folder"): Promise<void> {
  await http(`${BASE}/shares/${id}?kind=${kind}`, { method: "DELETE" });
}

export async function revokeAllSharedLinks(): Promise<number> {
  const r = await http<{ revoked: number }>(`${BASE}/shares`, { method: "DELETE" });
  return r.revoked;
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
    /** Carpeta destino; `null` = raíz. Lo usa el selector de ubicación. */
    folderId: string | null;
    expiresAt: string | null;
    allowedRoles: string[];
    customerId: string | null;
    supplierId: string | null;
    orderId: string | null;
    /** Descripción escrita por el usuario (entra al texto buscable). */
    descripcion: string;
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
