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
import { IDS_POR_LOTE } from "@/lib/documents/bulk-limits";
import { reportarVelocidad } from "@/lib/documentos/reportar-velocidad";

const BASE = "/api/admin/documents";

/** El error crudo de una subida, dicho en castellano y sin códigos HTTP. */
function motivoSubida(msg: string): string {
  if (/failed to fetch|network|load failed/i.test(msg)) return "se cortó la conexión";
  if (msg.includes("413") || msg.includes("too_large")) return "pesa más de lo permitido";
  if (msg.includes("415") || msg.includes("mime_not_allowed")) return "el drive no acepta ese tipo";
  if (msg.includes("429")) return "el servidor pidió esperar";
  return "no se pudo subir";
}

/** Qué se estaba haciendo, para el aviso cuando una acción en lote falla. */
const VERBO_LOTE: Record<string, string> = {
  delete: "eliminar",
  move: "mover",
  tag: "etiquetar",
  favorite: "marcar",
  status: "cambiar el estado de",
};

/** El error crudo de una acción en lote, dicho en castellano y sin JSON. */
function motivoLote(msg: string): string {
  if (/failed to fetch|network|load failed/i.test(msg)) return "se cortó la conexión";
  if (msg.includes("429")) return "el servidor pidió esperar: fueron muchas acciones seguidas";
  if (msg.includes("401")) return "hay que volver a entrar al panel";
  if (msg.includes("403") || /csrf/i.test(msg)) return "la sesión venció, recargá la página";
  if (msg.includes("400")) return "el servidor rechazó el pedido";
  return "el servidor no pudo completarlo";
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

/** Acciones en lote sobre carpetas (espejo del Zod del endpoint). */
export type BulkFolderAccion =
  | { action: "emoji"; emoji: string | null }
  | { action: "color"; color: string | null }
  | { action: "addTags"; tags: string[] }
  | { action: "removeTags"; tags: string[] }
  /** `conDocumentos` manda lo de adentro a la papelera; sin él va a la raíz. */
  | { action: "delete"; conDocumentos?: boolean };

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
  /** Saca varios de la papelera de una; devuelve cuántos volvieron. */
  restoreMany: (ids: string[]) => Promise<number>;
  /** Borra definitivamente: con `ids` los elegidos, sin `ids` la papelera entera. */
  purgeMany: (ids?: string[]) => Promise<number>;
  bulk: (action: "delete" | "move" | "tag" | "favorite" | "status", ids: string[], extra?: Record<string, unknown>) => Promise<number>;
  createFolder: (input: { name: string; parentId?: string | null; color?: string; icon?: string }) => Promise<DbDocumentFolder>;
  /** Árbol completo en una llamada (importador de carpetas): ruta → id. */
  createFolderTree: (parentId: string | null, rutas: string[]) => Promise<{ idPorRuta: Record<string, string>; creadas: number }>;
  /** Nombre+peso de lo que ya hay en esas carpetas (clave "" = raíz). */
  existingNames: (folderIds: (string | null)[]) => Promise<Record<string, { id: string; name: string; size: number }[]>>;
  moveFolder: (id: string, parentId: string | null) => Promise<void>;
  updateFolder: (id: string, patch: { name?: string; color?: string | null; icon?: string | null; emoji?: string | null; tags?: string[]; allowedRoles?: string[] }) => Promise<void>;
  /** Acciones sobre VARIAS carpetas. Devuelve cuántas cambió el servidor. */
  bulkFolders: (ids: string[], accion: BulkFolderAccion) => Promise<number>;
  deleteFolder: (id: string, opciones?: { conDocumentos?: boolean }) => Promise<void>;
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

  /**
   * Al volver con el botón atrás/adelante, el navegador puede restaurar la
   * página CONGELADA (bfcache) en vez de remontarla: el `useEffect` de arriba
   * no vuelve a correr, así que la lista queda con lo que tenía ANTES de
   * salir — si esa foto es de antes de borrar algo, se ve como si hubiera
   * "vuelto a aparecer" sin que el servidor haya hecho nada raro. `pageshow`
   * con `event.persisted` es la única forma de detectar esa restauración.
   */
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) void fetchAll({ silencioso: true });
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [fetchAll]);


  /**
   * Aplica el cambio en pantalla YA y lo confirma con el servidor detrás.
   *
   * Antes cada acción esperaba DOS viajes: el de la mutación y el de recargar
   * la lista entera. Marcar un favorito, renombrar o borrar tardaba casi un
   * segundo en verse, y con la conexión de una bodega, más. Ahora la pantalla
   * cambia al instante; si el servidor rechaza, se vuelve atrás y se avisa —
   * que es mejor que hacer esperar a todos por si acaso.
   */
  const optimista = useCallback(async <T,>(
    aplicar: () => void,
    revertir: () => void,
    pedido: () => Promise<T>,
  ): Promise<T> => {
    aplicar();
    try {
      return await pedido();
    } catch (e) {
      revertir();
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }, []);

  /** Cambia unos documentos en la lista local, devolviendo cómo volver atrás. */
  const cambiarLocal = useCallback((fn: (docs: DbDocument[]) => DbDocument[]) => {
    let previo: DbDocument[] = [];
    setDocuments((docs) => { previo = docs; return fn(docs); });
    return () => setDocuments(previo);
  }, []);

  /** Lo mismo para las carpetas. */
  const cambiarCarpetas = useCallback((fn: (f: DbDocumentFolder[]) => DbDocumentFolder[]) => {
    let previo: DbDocumentFolder[] = [];
    setFolders((f) => { previo = f; return fn(f); });
    return () => setFolders(previo);
  }, []);

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
      const arranqueSubida = performance.now();
      await Promise.all(Array.from({ length: Math.min(POOL, listos.length) }, subirUno));
      // Cuánto tardó por archivo: el total de una tanda de 400 no se puede
      // comparar con el de una de 3, y lo que se quiere saber es si subir se
      // puso más lento.
      if (out.length > 0) {
        reportarVelocidad("subida", (performance.now() - arranqueSubida) / out.length, out.length);
      }
      // Los recién subidos se agregan a la lista tal como los devolvió el
      // servidor: recargar todo para enterarse de lo que uno mismo acaba de
      // subir es un viaje de más.
      if (out.length > 0) setDocuments((docs) => [...out, ...docs]);
      return out;
    },
    []
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
      setDocuments((docs) => [r.document, ...docs]);
      return r;
    },
    []
  );

  const patch = useCallback(async (id: string, body: Record<string, unknown>) => {
    const revertir = cambiarLocal((docs) =>
      docs.map((d) => (d.id === id ? { ...d, ...(body as Partial<DbDocument>) } : d)),
    );
    await optimista(() => {}, revertir, () =>
      http(`${BASE}/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    );
  }, [optimista, cambiarLocal]);

  const remove = useCallback(async (id: string) => {
    const revertir = cambiarLocal((docs) => docs.filter((d) => d.id !== id));
    await optimista(() => {}, revertir, () => http(`${BASE}/${id}`, { method: "DELETE" }));
  }, [optimista, cambiarLocal]);

  // Papelera: restaurar (soft-deleted → activo) o borrar definitivamente (purge).
  // En las dos, el documento sale de la vista actual (que es la papelera).
  const restore = useCallback(async (id: string) => {
    const revertir = cambiarLocal((docs) => docs.filter((d) => d.id !== id));
    await optimista(() => {}, revertir, () => http(`${BASE}/${id}/restore`, { method: "POST" }));
  }, [optimista, cambiarLocal]);

  const purge = useCallback(async (id: string) => {
    const revertir = cambiarLocal((docs) => docs.filter((d) => d.id !== id));
    await optimista(() => {}, revertir, () => http(`${BASE}/${id}?purge=1`, { method: "DELETE" }));
  }, [optimista, cambiarLocal]);

  /**
   * Recuperar una tanda entera de la papelera. Un borrado masivo hecho por
   * error se deshacía de a un clic por archivo; con 300 documentos eso no es
   * una recuperación, es una tarde perdida.
   */
  const restoreMany = useCallback(async (ids: string[]): Promise<number> => {
    if (ids.length === 0) return 0;
    const enLote = new Set(ids);
    const revertir = cambiarLocal((docs) => docs.filter((d) => !enLote.has(d.id)));
    return await optimista(() => {}, revertir, async () => {
      let restaurados = 0;
      for (const lote of enLotes(ids, IDS_POR_LOTE)) {
        const r = await http<{ restored: number }>(`${BASE}/trash`, {
          method: "POST",
          body: JSON.stringify({ action: "restore", ids: lote }),
        });
        restaurados += r.restored;
      }
      // Si el servidor restauró menos de lo que se le pidió (alguno ya no estaba
      // en la papelera), la pantalla optimista quedó mintiendo: que la corrija
      // el listado real en vez de mostrar una recuperación que no pasó.
      if (restaurados !== ids.length) {
        void fetchAll({ silencioso: true, soloDocumentos: true });
      }
      return restaurados;
    });
  }, [optimista, cambiarLocal, fetchAll]);

  /**
   * Vaciar la papelera de verdad: borra los archivos del storage y las filas.
   *
   * Con `ids` va sólo lo elegido; sin `ids` se lleva la papelera COMPLETA del
   * tenant — el servidor la muele de a tandas y avisa cuántos quedan, así que
   * acá se repite hasta que no queda nada (con techo, para no colgarse si el
   * conteo no baja).
   */
  const purgeMany = useCallback(async (ids?: string[]): Promise<number> => {
    let borrados = 0;
    try {
      if (ids && ids.length > 0) {
        for (const lote of enLotes(ids, IDS_POR_LOTE)) {
          const r = await http<{ purged: number }>(`${BASE}/trash`, {
            method: "POST",
            body: JSON.stringify({ action: "purge", ids: lote }),
          });
          borrados += r.purged;
        }
        // Purgar sólo alcanza a lo que ya está en la papelera: si alguno no
        // estaba, el endpoint responde 200 sin tocarlo y el documento sigue
        // vivo. Decirlo, o la papelera parece haberse vaciado y no.
        if (borrados !== ids.length) {
          setError(`Se borraron definitivamente ${borrados} de ${ids.length}. Los otros ya no estaban en la papelera.`);
        }
      } else {
        for (let vuelta = 0; vuelta < 20; vuelta++) {
          const r = await http<{ purged: number; restantes: number }>(`${BASE}/trash`, {
            method: "POST",
            body: JSON.stringify({ action: "purge", todos: true }),
          });
          borrados += r.purged;
          if (r.restantes === 0 || r.purged === 0) break;
        }
      }
    } catch (e) {
      const crudo = e instanceof Error ? e.message : String(e);
      setError(`No se pudo vaciar la papelera: ${motivoLote(crudo)}`);
      throw e;
    } finally {
      // Borrar de verdad no se puede "adivinar" en pantalla: el listado se pide
      // otra vez para que la papelera muestre exactamente lo que quedó.
      void fetchAll({ silencioso: true, soloDocumentos: true });
    }
    return borrados;
  }, [fetchAll]);

  const bulk = useCallback(
    async (
      action: "delete" | "move" | "tag" | "favorite" | "status",
      ids: string[],
      extra: Record<string, unknown> = {}
    ): Promise<number> => {
      const enLote = new Set(ids);
      // Cada acción se refleja distinto en pantalla: borrar los saca, las
      // demás los cambian donde están.
      const revertir = cambiarLocal((docs) => {
        if (action === "delete") return docs.filter((d) => !enLote.has(d.id));
        return docs.map((d) => {
          if (!enLote.has(d.id)) return d;
          if (action === "favorite") return { ...d, favorite: Boolean(extra.favorite) };
          if (action === "status") return { ...d, status: String(extra.status ?? d.status) };
          if (action === "move") return { ...d, folderId: (extra.folderId as string | null) ?? null };
          if (action === "tag" && typeof extra.tag === "string") {
            return d.tags.includes(extra.tag) ? d : { ...d, tags: [...d.tags, extra.tag] };
          }
          return d;
        });
      });
      // El endpoint acepta hasta IDS_POR_LOTE ids por llamada. Mandar la
      // selección entera devolvía un 400 crudo ("Too big: expected array to
      // have <=200 items") y no borraba nada, justo cuando más falta hace:
      // limpiar una carpeta con cientos de archivos.
      return await optimista(() => {}, revertir, async () => {
        let afectados = 0;
        for (const lote of enLotes(ids, IDS_POR_LOTE)) {
          try {
            const r = await http<{ affected: number }>(`${BASE}/bulk`, {
              method: "POST",
              body: JSON.stringify({ action, ids: lote, ...extra }),
            });
            afectados += r.affected;
          } catch (e) {
            // Si algún lote ya pasó, deshacer todo en pantalla mentiría: se
            // verían de vuelta archivos que el servidor sí borró. Que la
            // verdad la traiga el servidor.
            if (afectados > 0) {
              void fetchAll({ silencioso: true, soloDocumentos: true });
            }
            const crudo = e instanceof Error ? e.message : String(e);
            throw new Error(
              `No se pudo ${VERBO_LOTE[action] ?? "cambiar"} ${ids.length} documento(s): ${motivoLote(crudo)}`,
            );
          }
        }
        // El servidor puede contestar 200 y no haber tocado nada: `updateMany`
        // filtra por tenant y por `deletedAt`, así que un id ajeno o ya borrado
        // devuelve `affected: 0` sin error. La pantalla ya los sacó de la
        // lista, y al recargar volvían todos — que es exactamente el síntoma
        // "los elimino y reaparecen". Cuando el número no cuadra, manda el
        // servidor: se vuelve a pedir la lista y se dice qué pasó de verdad.
        if (afectados !== ids.length) {
          void fetchAll({ silencioso: true, soloDocumentos: true });
          if (action === "delete") {
            setError(
              afectados === 0
                ? `No se eliminó ninguno de los ${ids.length} documentos: el servidor no los encontró. Recargá la página y probá de nuevo.`
                : `Se eliminaron ${afectados} de ${ids.length}. Los otros ${ids.length - afectados} siguen en el drive.`,
            );
          }
        }
        return afectados;
      });
    },
    [optimista, cambiarLocal, fetchAll]
  );

  const createFolder = useCallback(async (input: { name: string; parentId?: string | null }) => {
    // Acá NO se puede adivinar: la carpeta necesita el id que asigna el
    // servidor. Pero con la respuesta alcanza — no hace falta volver a pedir
    // el árbol entero.
    const r = await http<{ folder: DbDocumentFolder }>(`${BASE}/folders`, {
      method: "POST",
      body: JSON.stringify(input),
    });
    setFolders((f) => [...f, r.folder].sort((a, b) => a.name.localeCompare(b.name)));
    return r.folder;
  }, []);

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
    const revertir = cambiarCarpetas((f) => f.map((c) => (c.id === id ? { ...c, parentId } : c)));
    await optimista(() => {}, revertir, () =>
      http(`${BASE}/folders/${id}`, { method: "PATCH", body: JSON.stringify({ parentId }) }),
    );
  }, [optimista, cambiarCarpetas]);

  // Editar metadata de la carpeta (nombre / color / ícono).
  const updateFolder = useCallback(async (id: string, patch: { name?: string; color?: string | null; icon?: string | null; emoji?: string | null; tags?: string[]; allowedRoles?: string[] }) => {
    const revertir = cambiarCarpetas((f) => f.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    await optimista(() => {}, revertir, () =>
      http(`${BASE}/folders/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    );
  }, [optimista, cambiarCarpetas]);

  /**
   * Acciones sobre varias carpetas de una. Se aplica optimista para que la
   * pantalla responda al instante y se revierte si el servidor dice que no;
   * después se refresca, porque el conteo de documentos y las cascadas de
   * borrado los sabe el servidor y no el cliente.
   */
  const bulkFolders = useCallback(async (ids: string[], accion: BulkFolderAccion): Promise<number> => {
    if (ids.length === 0) return 0;
    const marcadas = new Set(ids);
    // Cascada: se van las marcadas y todo lo que cuelgue de ellas. Se calcula
    // ANTES de tocar la lista porque los documentos también se acomodan según
    // el árbol muerto (a la papelera o a la raíz).
    const muertas = new Set(marcadas);
    const revertir = cambiarCarpetas((lista) => {
      if (accion.action === "delete") {
        let crecio = true;
        while (crecio) {
          crecio = false;
          for (const c of lista) {
            if (c.parentId && muertas.has(c.parentId) && !muertas.has(c.id)) {
              muertas.add(c.id);
              crecio = true;
            }
          }
        }
        return lista.filter((c) => !muertas.has(c.id));
      }
      return lista.map((c) => {
        if (!marcadas.has(c.id)) return c;
        if (accion.action === "emoji") return { ...c, emoji: accion.emoji };
        if (accion.action === "color") return { ...c, color: accion.color };
        const nuevas = accion.tags.map((t) => t.trim().toLowerCase()).filter(Boolean);
        const tags =
          accion.action === "addTags"
            ? [...new Set([...(c.tags ?? []), ...nuevas])]
            : (c.tags ?? []).filter((t) => !nuevas.includes(t));
        return { ...c, tags };
      });
    });

    // Los documentos de las carpetas que se van: a la papelera (salen de la
    // lista) o sueltos en la raíz. Sin esto la pantalla los seguía mostrando
    // dentro de una carpeta que ya no existe.
    const revertirDocs = accion.action === "delete"
      ? cambiarLocal((docs) => accion.conDocumentos
          ? docs.filter((d) => !(d.folderId && muertas.has(d.folderId)))
          : docs.map((d) => (d.folderId && muertas.has(d.folderId) ? { ...d, folderId: null } : d)))
      : () => {};

    let count = 0;
    await optimista(() => {}, () => { revertir(); revertirDocs(); }, async () => {
      // Igual que con los documentos: el endpoint toma hasta IDS_POR_LOTE por
      // llamada, así que la selección va en tandas y no en un 400.
      for (const lote of enLotes(ids, IDS_POR_LOTE)) {
        const res = await http(`${BASE}/folders/bulk`, {
          method: "POST",
          body: JSON.stringify({ ...accion, ids: lote }),
        });
        count += typeof (res as { count?: number })?.count === "number" ? (res as { count: number }).count : lote.length;
      }
    });
    // El conteo de documentos por carpeta lo recalcula el servidor.
    void fetchAll();
    return count;
  }, [optimista, cambiarCarpetas, cambiarLocal, fetchAll]);

  const deleteFolder = useCallback(async (id: string, opciones: { conDocumentos?: boolean } = {}) => {
    // Borrar una carpeta arrastra a sus subcarpetas (el schema las borra en
    // cascada). Sus documentos van a la papelera o quedan sueltos en la raíz
    // según `conDocumentos`: se refleja igual acá para que la pantalla no
    // muestre carpetas que ya no existen ni documentos donde ya no están.
    const hijas = new Set<string>([id]);
    let crecio = true;
    const revertirCarpetas = cambiarCarpetas((f) => {
      while (crecio) {
        crecio = false;
        for (const c of f) {
          if (c.parentId && hijas.has(c.parentId) && !hijas.has(c.id)) { hijas.add(c.id); crecio = true; }
        }
      }
      return f.filter((c) => !hijas.has(c.id));
    });
    const revertirDocs = cambiarLocal((docs) => opciones.conDocumentos
      ? docs.filter((d) => !(d.folderId && hijas.has(d.folderId)))
      : docs.map((d) => (d.folderId && hijas.has(d.folderId) ? { ...d, folderId: null } : d)));
    await optimista(() => {}, () => { revertirCarpetas(); revertirDocs(); }, () =>
      http(`${BASE}/folders/${id}${opciones.conDocumentos ? "?conDocumentos=1" : ""}`, { method: "DELETE" }),
    );
  }, [optimista, cambiarCarpetas, cambiarLocal]);

  return { documents, semanticTerms, folders, loading, error, refresh: fetchAll, upload, scan, patch, remove, restore, purge, restoreMany, purgeMany, bulk, createFolder, createFolderTree, existingNames, moveFolder, updateFolder, bulkFolders, deleteFolder };
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
