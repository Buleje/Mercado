import "server-only";

/**
 * Subir y quitar documentos de una guía (ADR-438) — el lado servidor.
 *
 * Reusa la cadena de subida del Drive (`app/api/admin/documents` POST):
 * fila `Document` → archivo al bucket privado `documents` → etiquetas →
 * auditoría → miniatura y lectura en segundo plano. Lo propio de acá es qué se
 * acepta: el TIPO REAL del archivo (PDF por su firma `%PDF-`, imagen por lo que
 * sharp lee), nunca el que declara el navegador.
 */
import sharp from "sharp";
import { DocumentsDB } from "@/lib/db/documents.db";
import { buildStoragePath, uploadToStorage } from "@/lib/documents/storage";
import { analyzeDocumentContent, isAnalyzableMime } from "@/lib/documents/analyze-document";
import { enColaDeAnalisis } from "@/lib/documents/cola-analisis";
import { precalcularMiniatura } from "@/lib/documents/precalcular-miniatura";
import { logger } from "@/lib/logger";
import type { DbDocument } from "@/lib/types/documents";
import type { DatosDeGuia } from "@/lib/db/ctp-guia-documentos.db";
import {
  MAX_BYTES_DOC_GUIA,
  ROLES_PAPELES_GUIA,
  carpetaGuiaPorTitular,
  esPdfPorFirma,
  etiquetasDeDocumentoGuia,
  nombreDeDocumentoGuia,
  type CasilleroGuia,
} from "./documentos-guia";

/* Una imagen chica en bytes puede declarar 30 000 × 30 000 píxeles. */
const MAX_PIXELES = 60_000_000;
/* Un papel fotografiado se lee con 2400 px del lado largo; más es peso. */
const MAX_LADO = 2400;
const FORMATOS_IMAGEN = new Set(["jpeg", "png", "webp", "heif", "tiff"]);

export type ArchivoListo =
  | { ok: true; buffer: Buffer; mime: "application/pdf" | "image/webp"; ext: "pdf" | "webp" }
  | { ok: false; status: number; error: string; message: string };

/** El archivo que llegó → lo que se guarda, o por qué no. */
export async function prepararArchivo(file: File): Promise<ArchivoListo> {
  if (file.size === 0)
    return { ok: false, status: 400, error: "vacio", message: "El archivo llegó vacío." };
  if (file.size > MAX_BYTES_DOC_GUIA) {
    return {
      ok: false,
      status: 413,
      error: "muy_grande",
      message: `Pesa ${(file.size / 1024 / 1024).toFixed(1).replace(".", ",")} MB. El máximo es 4 MB: sácale foto con menos resolución o parte el PDF.`,
    };
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (esPdfPorFirma(buf)) return { ok: true, buffer: buf, mime: "application/pdf", ext: "pdf" };

  try {
    const { format } = await sharp(buf, { limitInputPixels: MAX_PIXELES }).metadata();
    if (!format || !FORMATOS_IMAGEN.has(format)) {
      return {
        ok: false,
        status: 415,
        error: "tipo_no_permitido",
        message: "Sube un PDF o una foto (JPG, PNG, WebP o HEIC).",
      };
    }
    /* `rotate()` endereza por EXIF antes de que el webp tire los metadatos
       (el EXIF del teléfono trae GPS: no viaja con el papel). */
    const webp = await sharp(buf, { limitInputPixels: MAX_PIXELES })
      .rotate()
      .resize({ width: MAX_LADO, height: MAX_LADO, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
    return { ok: true, buffer: webp, mime: "image/webp", ext: "webp" };
  } catch (e) {
    logger.warn("[docs-guia] no se pudo leer como imagen", {
      err: e instanceof Error ? e.message : String(e),
    });
    return {
      ok: false,
      status: 415,
      error: "tipo_no_permitido",
      message: "No es un PDF ni una foto que se pueda leer.",
    };
  }
}

export interface GuardarDocGuia {
  tenantId: string;
  user: string;
  role?: string;
  guia: DatosDeGuia;
  casillero: CasilleroGuia;
  archivo: Extract<ArchivoListo, { ok: true }>;
  nombreOriginal: string;
  ip?: string;
  /** Id del documento del MISMO casillero que éste reemplaza (va a la papelera). */
  reemplaza?: DbDocument | null;
}

/** Sube al Drive y lo deja etiquetado en su casillero. `null` si el storage falló. */
export async function guardarDocumentoDeGuia(o: GuardarDocGuia): Promise<DbDocument | null> {
  const { tenantId, archivo } = o;
  /* ADR-442: la carpeta del titular y su permiso, con una carpeta por guía
     (antes, año/mes del ingreso: lo de un mismo permiso quedaba repartido). */
  const ruta = carpetaGuiaPorTitular({
    titular: o.guia.titular,
    permiso: o.guia.permiso,
    gtfNumber: o.guia.gtfNumber,
  }).join("/");
  let folderId: string | null = null;
  try {
    folderId =
      (await DocumentsDB.createFolderTree(tenantId, { rutas: [ruta] })).idPorRuta[ruta] ?? null;
  } catch (e) {
    /* Sin carpeta se guarda en la raíz: perder el papel por la carpeta sería
       cambiar lo importante por lo accesorio. */
    logger.warn("[docs-guia] carpeta no disponible", { err: String(e) });
  }

  const nombre = nombreDeDocumentoGuia(
    o.casillero,
    o.guia.gtfNumber,
    o.nombreOriginal,
    archivo.ext,
  );
  const draft = await DocumentsDB.create(tenantId, {
    folderId,
    name: nombre,
    originalName: o.nombreOriginal || nombre,
    mimeType: archivo.mime,
    size: archivo.buffer.length,
    storagePath: "pending",
    category: o.casillero === "factura" ? "facturas" : "otros",
    tags: etiquetasDeDocumentoGuia(o.guia.gtfNumber, o.casillero),
    uploadedById: o.user,
    /* La carpeta del titular hereda los roles de su raíz (vacíos): sin esto el
       cajero veía la factura en el Drive general aunque la ruta le diera 403. */
    allowedRoles: [...ROLES_PAPELES_GUIA],
  });
  const storagePath = buildStoragePath({
    tenantId,
    documentId: draft.id,
    versionLabel: "v1",
    originalName: nombre,
  });
  const up = await uploadToStorage(storagePath, archivo.buffer, archivo.mime);
  if (!up.ok) {
    await DocumentsDB.hardDelete(tenantId, draft.id);
    return null;
  }
  const doc = (await DocumentsDB.update(tenantId, draft.id, { storagePath })) ?? {
    ...draft,
    storagePath,
  };

  DocumentsDB.log(tenantId, {
    documentId: doc.id,
    actorId: o.user,
    action: "upload",
    metadata: {
      origen: "guia",
      gtfNumber: o.guia.gtfNumber,
      casillero: o.casillero,
      reemplaza: o.reemplaza?.id ?? null,
    },
    ipAddress: o.ip,
  }).catch((err) => logger.warn("[docs-guia] segundo plano falló", { error: String(err) }));

  if (o.reemplaza) {
    await quitarDocumentoDeGuia(
      tenantId,
      o.reemplaza.id,
      o.user,
      { motivo: "reemplazado", por: doc.id, gtfNumber: o.guia.gtfNumber },
      o.ip,
    );
  }

  if (isAnalyzableMime(archivo.mime)) {
    enColaDeAnalisis(doc.id, () => analyzeDocumentContent(tenantId, doc.id, o.user, o.role)).catch(
      (err) => logger.warn("[docs-guia] segundo plano falló", { error: String(err) }),
    );
  }
  precalcularMiniatura(storagePath, nombre, archivo.mime, archivo.buffer.length).catch((err) =>
    logger.warn("[docs-guia] segundo plano falló", { error: String(err) }),
  );
  return doc;
}

/** Baja lógica: a la papelera del Drive (se recupera desde ahí), con quién y por qué. */
export async function quitarDocumentoDeGuia(
  tenantId: string,
  id: string,
  user: string,
  metadata: Record<string, unknown>,
  ip?: string,
): Promise<boolean> {
  const ok = await DocumentsDB.softDelete(tenantId, id);
  if (ok) {
    DocumentsDB.log(tenantId, {
      documentId: id,
      actorId: user,
      action: "delete",
      metadata: { origen: "guia", ...metadata },
      ipAddress: ip,
    }).catch((err) => logger.warn("[docs-guia] segundo plano falló", { error: String(err) }));
  }
  return ok;
}
