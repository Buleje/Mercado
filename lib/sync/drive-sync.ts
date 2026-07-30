import "server-only";
import { DocumentsDB } from "@/lib/db/documents.db";
import {
  buildStoragePath,
  uploadToStorage,
  isMimeAllowed,
} from "@/lib/documents/storage";
import { resolverMime } from "@/lib/documents/tipos-archivo";
import { AUTOR_AGENTE } from "@/lib/sync/auth-agente";
import { logger } from "@/lib/logger";

/**
 * lib/sync/drive-sync.ts — traducción entre "carpeta de Windows" y "Drive" (ADR-307).
 *
 * La ruta relativa del archivo ES su lugar en el Drive:
 *   `Boletas/2026/enero.pdf`  →  carpeta Boletas → 2026, documento `enero.pdf`
 */

/** Separador lógico del protocolo de sync: siempre `/`, aunque Windows use `\`. */
export const SEP = "/";

/**
 * Normaliza una ruta que llega del agente y la deja segura.
 *
 * Rechaza todo lo que intente salirse de la carpeta (`..`), rutas absolutas y
 * unidades de Windows. Sin esto, un `../../etc/passwd` escribiría fuera del árbol.
 *
 * @returns los segmentos limpios, o `null` si la ruta no es aceptable.
 */
export function partirRuta(rutaCruda: string): string[] | null {
  if (!rutaCruda || typeof rutaCruda !== "string") return null;
  if (rutaCruda.length > 1024) return null;

  const plana = rutaCruda.replace(/\\/g, SEP);

  // El agente SIEMPRE manda rutas relativas a la carpeta sincronizada. Una absoluta
  // (`/etc/shadow`, `C:\Windows\hosts`) significa que el cliente tiene un bug: se
  // rechaza en vez de convertirla en relativa a la callada, que dejaría carpetas
  // fantasma llamadas "etc" y escondería el error.
  if (plana.startsWith(SEP) || /^[a-zA-Z]:/.test(plana)) return null;

  const partes = plana
    .split(SEP)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && p !== ".");

  if (partes.length === 0) return null;
  // Traversal o bytes que romperían el path al escribirlo en disco.
  if (partes.some((p) => p === ".." || p.includes("\u0000"))) return null;

  return partes;
}

/** Parte una ruta en carpetas + nombre de archivo. */
export function separarCarpetaYNombre(rutaCruda: string): { carpetas: string[]; nombre: string } | null {
  const partes = partirRuta(rutaCruda);
  if (!partes) return null;
  const nombre = partes[partes.length - 1];
  return { carpetas: partes.slice(0, -1), nombre };
}

/**
 * Devuelve el `folderId` para una lista de carpetas, creando las que falten.
 * `[]` significa la raíz del Drive → `null`.
 */
export async function asegurarCarpetas(
  tenantId: string,
  carpetas: string[]
): Promise<string | null> {
  if (carpetas.length === 0) return null;

  const ruta = carpetas.join(SEP);
  const { idPorRuta } = await DocumentsDB.createFolderTree(tenantId, {
    parentId: null,
    rutas: [ruta],
  });

  return idPorRuta[ruta] ?? null;
}

/**
 * Reconstruye la ruta lógica de cada documento (`carpeta/sub/nombre.pdf`).
 *
 * Se arma en memoria a partir del árbol de carpetas para no pegarle a la base una
 * vez por documento.
 */
export async function rutasLogicas(
  tenantId: string
): Promise<Map<string, string>> {
  const carpetas = await DocumentsDB.listFolders(tenantId);
  const porId = new Map(carpetas.map((f) => [f.id, f]));

  /** Sube por el árbol hasta la raíz. Corta si detecta un ciclo. */
  const rutaDeCarpeta = (folderId: string | null): string[] => {
    const salida: string[] = [];
    const vistos = new Set<string>();
    let actual = folderId;
    while (actual && !vistos.has(actual)) {
      vistos.add(actual);
      const f = porId.get(actual);
      if (!f) break;
      salida.unshift(f.name);
      actual = f.parentId ?? null;
    }
    return salida;
  };

  const cache = new Map<string | null, string[]>();
  const memo = (folderId: string | null): string[] => {
    if (!cache.has(folderId)) cache.set(folderId, rutaDeCarpeta(folderId));
    return cache.get(folderId)!;
  };

  const docs = await DocumentsDB.list(tenantId, {});
  const salida = new Map<string, string>();
  for (const d of docs) {
    const partes = [...memo(d.folderId ?? null), d.name];
    salida.set(d.id, partes.join(SEP));
  }
  return salida;
}

export type ResultadoSubida =
  | {
      ok: true;
      documentId: string;
      accion: "creado" | "version";
      size: number;
      /**
       * `updatedAt` del documento ya guardado. El agente lo necesita para que el
       * ciclo siguiente no crea que el panel cambió y se re-baje lo que acaba de
       * subir.
       */
      updatedAt: string;
    }
  | { ok: false; error: string; detalle?: string };

/**
 * Guarda el contenido que mandó el agente en la ruta indicada.
 *
 * Si ya hay un documento en esa ruta, agrega una **versión nueva** en vez de pisarlo:
 * el contenido anterior queda en el historial del Drive (ADR-307 §4).
 */
export async function guardarEnRuta(
  tenantId: string,
  opts: { ruta: string; contenido: Buffer; documentId?: string | null }
): Promise<ResultadoSubida> {
  const partido = separarCarpetaYNombre(opts.ruta);
  if (!partido) return { ok: false, error: "ruta_invalida" };

  const { carpetas, nombre } = partido;
  const mime = resolverMime(nombre, "");
  if (!isMimeAllowed(mime, nombre)) {
    return { ok: false, error: "mime_not_allowed", detalle: mime };
  }

  const folderId = await asegurarCarpetas(tenantId, carpetas);

  // ¿Ya existe? Primero por id (el agente lo recuerda), si no por carpeta + nombre.
  let existente = opts.documentId
    ? await DocumentsDB.getById(tenantId, opts.documentId)
    : null;

  if (!existente) {
    const hermanos = await DocumentsDB.list(tenantId, { folderId });
    existente =
      hermanos.find((d) => d.name.toLowerCase() === nombre.toLowerCase()) ?? null;
  }

  if (existente) {
    const storagePath = buildStoragePath({
      tenantId,
      documentId: existente.id,
      versionLabel: `v${Date.now()}`,
      originalName: nombre,
    });
    const up = await uploadToStorage(storagePath, opts.contenido, mime);
    if (!up.ok) return { ok: false, error: "storage_fail", detalle: up.error };

    const version = await DocumentsDB.addVersion(tenantId, existente.id, {
      storagePath,
      size: opts.contenido.length,
      mimeType: mime,
      uploadedById: AUTOR_AGENTE,
      changeNote: "Editado desde la carpeta de Windows",
    });
    if (!version) return { ok: false, error: "version_fail" };

    DocumentsDB.log(tenantId, {
      documentId: existente.id,
      actorId: AUTOR_AGENTE,
      action: "version",
      metadata: { origen: "sync-escritorio", ruta: opts.ruta, size: opts.contenido.length },
    }).catch((err) => logger.warn("sync.audit.version_fail", { err: String(err) }));

    // Se relee para devolver el `updatedAt` que quedó guardado, no el de antes.
    const trasVersion = await DocumentsDB.getById(tenantId, existente.id);
    return {
      ok: true,
      documentId: existente.id,
      accion: "version",
      size: opts.contenido.length,
      updatedAt: new Date(trasVersion?.updatedAt ?? Date.now()).toISOString(),
    };
  }

  // Alta: se crea el row primero porque el path de storage lleva el id adentro.
  const draft = await DocumentsDB.create(tenantId, {
    folderId,
    name: nombre,
    originalName: nombre,
    mimeType: mime,
    size: opts.contenido.length,
    storagePath: "pending",
    uploadedById: AUTOR_AGENTE,
  });

  const storagePath = buildStoragePath({
    tenantId,
    documentId: draft.id,
    versionLabel: "v1",
    originalName: nombre,
  });

  const up = await uploadToStorage(storagePath, opts.contenido, mime);
  if (!up.ok) {
    // Sin archivo no hay documento: se borra el row para no dejar huérfanos.
    await DocumentsDB.hardDelete(tenantId, draft.id);
    return { ok: false, error: "storage_fail", detalle: up.error };
  }

  const guardado = await DocumentsDB.update(tenantId, draft.id, { storagePath });

  DocumentsDB.log(tenantId, {
    documentId: draft.id,
    actorId: AUTOR_AGENTE,
    action: "upload",
    metadata: { origen: "sync-escritorio", ruta: opts.ruta, size: opts.contenido.length },
  }).catch((err) => logger.warn("sync.audit.upload_fail", { err: String(err) }));

  return {
    ok: true,
    documentId: draft.id,
    accion: "creado",
    size: opts.contenido.length,
    updatedAt: new Date(guardado?.updatedAt ?? Date.now()).toISOString(),
  };
}
