import "server-only";

/**
 * lib/asistente/fotos-chat.ts — las fotos del chat de «Buleje IA» (ADR-528).
 *
 * Valida (cantidad, peso, tipo por BYTES MÁGICOS, nunca por el nombre ni por el
 * `type` que dice el navegador), las guarda en Documentos › «Buleje IA · Fotos»
 * y arma las `ImagenTurno` que viajan al modelo.
 */

import { DocumentsDB } from "@/lib/db/documents.db";
import { buildStoragePath, deleteFromStorage, uploadToStorage } from "@/lib/documents/storage";
import { logger } from "@/lib/logger";
import { FOTOS_POR_MENSAJE, FOTO_MAX_BYTES, FOTO_MIMES, type ImagenTurno } from "@/lib/ia-proveedores/tipos";

export const CARPETA_FOTOS = "Buleje IA · Fotos";

export type MimeFoto = (typeof FOTO_MIMES)[number];

/** Tipo real de la imagen según sus primeros bytes; `null` si no es jpeg/png/webp. */
export function mimePorBytes(b: Uint8Array): MimeFoto | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) {
    return "image/png";
  }
  // RIFF....WEBP
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export interface FotoValida {
  buffer: Buffer;
  mime: MimeFoto;
  /** Nombre que el navegador le puso (solo para mostrar). */
  original: string;
}

export type ResultadoValidacion =
  | { ok: true; fotos: FotoValida[] }
  | { ok: false; status: 400 | 413 | 415; message: string };

const EXT: Record<MimeFoto, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Entrada mínima (un `File` la cumple): permite probar sin navegador. */
export interface ArchivoEntrada {
  name: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export async function validarFotos(archivos: ArchivoEntrada[]): Promise<ResultadoValidacion> {
  if (archivos.length > FOTOS_POR_MENSAJE) {
    return { ok: false, status: 400, message: `Máximo ${FOTOS_POR_MENSAJE} fotos por mensaje.` };
  }
  const fotos: FotoValida[] = [];
  for (const a of archivos) {
    if (a.size > FOTO_MAX_BYTES) {
      return { ok: false, status: 413, message: `La foto «${a.name}» pesa más de ${FOTO_MAX_BYTES / 1024 / 1024} MB.` };
    }
    const buffer = Buffer.from(await a.arrayBuffer());
    // El peso real se mide sobre los bytes: `size` lo declara el cliente.
    if (buffer.length > FOTO_MAX_BYTES) {
      return { ok: false, status: 413, message: `La foto «${a.name}» pesa más de ${FOTO_MAX_BYTES / 1024 / 1024} MB.` };
    }
    const mime = mimePorBytes(buffer);
    if (!mime) {
      return { ok: false, status: 415, message: `«${a.name}» no es una foto JPG, PNG o WebP.` };
    }
    fotos.push({ buffer, mime, original: a.name });
  }
  return { ok: true, fotos };
}

/**
 * Guarda las fotos en Documentos y devuelve lo que viaja al modelo.
 * Si una falla a medias, borra las ya subidas de ese mensaje y lanza.
 */
export async function guardarFotos(
  tenantId: string,
  actor: { username: string; role: string },
  fotos: FotoValida[],
): Promise<ImagenTurno[]> {
  if (fotos.length === 0) return [];
  const { idPorRuta } = await DocumentsDB.createFolderTree(
    tenantId,
    { parentId: null, rutas: [CARPETA_FOTOS] },
    actor.role,
  );
  const folderId = idPorRuta[CARPETA_FOTOS] ?? null;
  const dia = new Date().toISOString().slice(0, 10);
  const hechas: ImagenTurno[] = [];
  const subidas: string[] = [];
  try {
    for (const [i, f] of fotos.entries()) {
      const nombre = `foto-${dia}-${Date.now().toString(36)}-${i + 1}.${EXT[f.mime]}`;
      const doc = await DocumentsDB.create(tenantId, {
        folderId,
        name: nombre,
        originalName: nombre,
        mimeType: f.mime,
        size: f.buffer.length,
        storagePath: "pending",
        uploadedById: actor.username,
        viewerRole: actor.role,
        category: "otros",
        tags: ["buleje-ia"],
      });
      const storagePath = buildStoragePath({ tenantId, documentId: doc.id, versionLabel: "v1", originalName: nombre });
      const up = await uploadToStorage(storagePath, f.buffer, f.mime);
      if (!up.ok) {
        await DocumentsDB.hardDelete(tenantId, doc.id);
        throw new Error("No pude guardar la foto en Documentos.");
      }
      subidas.push(storagePath);
      await DocumentsDB.update(tenantId, doc.id, { storagePath });
      hechas.push({ documentoId: doc.id, nombre, mime: f.mime, base64: f.buffer.toString("base64") });
    }
  } catch (err) {
    logger.error("[fotos-chat] guardar falló", { error: String(err), tenantId });
    if (subidas.length) await deleteFromStorage(subidas).catch((e) => logger.error("[fotos-chat] limpiar storage falló", { error: String(e) }));
    for (const h of hechas) {
      await DocumentsDB.hardDelete(tenantId, h.documentoId).catch((e) =>
        logger.error("[fotos-chat] limpiar documento falló", { error: String(e) }),
      );
    }
    throw err;
  }
  return hechas;
}
