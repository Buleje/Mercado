import "server-only";
import { ContractsDB } from "@/lib/db/contracts.db";
import { DocumentsDB } from "@/lib/db/documents.db";
import { buildStoragePath, uploadToStorage } from "@/lib/documents/storage";
import { generarContratoPdf, type EmisorContrato, type FirmaEnPdf } from "@/lib/contratos/contrato-pdf";
import { SettingsDB } from "@/lib/db/settings.db";
import { logger } from "@/lib/logger";
import type { DbContract } from "@/lib/types/contracts";

/**
 * Convierte un contrato en un documento vivo del Drive (ADR-307).
 *
 * Es el movimiento que desbloquea todo lo demás: una vez que el contrato es un
 * PDF guardado en Documentación, hereda gratis lo que ese módulo ya sabe hacer
 * —búsqueda por contenido, la IA que lo lee y responde preguntas, permisos por
 * rol, versiones, compartir por link y el recordatorio de vencimiento que ya
 * corre todos los días a las 9.
 */

const NOMBRE_CARPETA = "Contratos";

/** Busca la carpeta "Contratos" del tenant, o la crea la primera vez. */
async function carpetaDeContratos(tenantId: string): Promise<string | null> {
  try {
    const folders = await DocumentsDB.listFolders(tenantId);
    const existente = folders.find(
      (f) => f.name.trim().toLowerCase() === NOMBRE_CARPETA.toLowerCase() && !f.parentId,
    );
    if (existente) return existente.id;
    const nueva = await DocumentsDB.createFolder(tenantId, {
      name: NOMBRE_CARPETA,
      color: "teal",
      icon: "legal",
    });
    return nueva.id;
  } catch (err) {
    // Sin carpeta el contrato igual se archiva: cae en la raíz del drive.
    logger.warn("[contratos] no se pudo resolver la carpeta", { err: String(err) });
    return null;
  }
}

/**
 * Datos del emisor para el encabezado del PDF. Salen de la configuración de la
 * tienda; si no están, el PDF se genera igual, sólo sin el bloque del emisor.
 */
async function emisorDelTenant(tenantId: string): Promise<EmisorContrato | undefined> {
  try {
    const settings = await SettingsDB.get(tenantId);
    const razonSocial = settings.razonSocial?.trim() || settings.businessName?.trim();
    if (!razonSocial) return undefined;
    return {
      razonSocial,
      ruc: settings.ruc?.trim() || undefined,
      direccion: settings.businessAddress?.trim() || undefined,
    };
  } catch (err) {
    logger.warn("[contratos] no se pudo leer el emisor", { err: String(err) });
    return undefined;
  }
}

export interface ArchivarResult {
  ok: boolean;
  documentId?: string;
  hash?: string;
  paginas?: number;
  error?: string;
  status?: number;
}

/** Nombre del archivo en el drive: legible para una persona buscando a mano. */
function nombreDelArchivo(contrato: DbContract): string {
  return `${contrato.numero} — ${contrato.clienteNombre}`.slice(0, 120);
}

/**
 * Genera el PDF del contrato y lo deja archivado en el Drive.
 *
 * Si el contrato ya tenía documento, sube una VERSIÓN nueva en vez de crear un
 * duplicado: así el historial del documento cuenta la historia del contrato
 * (borrador → firmado por uno → firmado por los dos).
 */
export async function archivarContrato(
  tenantId: string,
  contratoId: string,
  actorId: string,
  opts: { nota?: string } = {},
): Promise<ArchivarResult> {
  const contrato = await ContractsDB.getById(tenantId, contratoId);
  if (!contrato) return { ok: false, error: "not_found", status: 404 };

  const cuerpo = (contrato.contenido?.trim() || contrato.clausulas.join("\n\n")).trim();
  if (!cuerpo) return { ok: false, error: "contrato_sin_texto", status: 422 };

  const [emisor, firmasDb] = await Promise.all([
    emisorDelTenant(tenantId),
    ContractsDB.getSignatureImages(tenantId, contratoId),
  ]);

  const firmas: FirmaEnPdf[] = firmasDb.map((f) => ({
    nombre: f.nombre,
    rol: f.rol,
    documento: f.documento,
    firmaDataUrl: f.firmaDataUrl,
    firmadoEn: f.firmadoEn,
  }));

  const faltanFirmas = contrato.firmantes.length > 0 && firmas.length < contrato.firmantes.length;

  const pdf = await generarContratoPdf({
    contrato,
    emisor,
    firmas,
    borrador: contrato.estado === "BORRADOR" || faltanFirmas,
  });

  const nombre = nombreDelArchivo(contrato);
  const fileName = `${contrato.numero}.pdf`;
  const vencimiento = contrato.fechaVencimiento ? new Date(contrato.fechaVencimiento) : null;

  // ── El contrato ya vive en el drive: sube una versión nueva ────────────────
  if (contrato.documentId) {
    const doc = await DocumentsDB.getById(tenantId, contrato.documentId);
    if (doc) {
      const storagePath = buildStoragePath({
        tenantId,
        documentId: doc.id,
        versionLabel: `v${Date.now()}`,
        originalName: fileName,
      });
      const up = await uploadToStorage(storagePath, pdf.bytes, "application/pdf");
      if (!up.ok) return { ok: false, error: "storage_upload_fail", status: 502 };

      await DocumentsDB.addVersion(tenantId, doc.id, {
        storagePath,
        size: pdf.bytes.length,
        mimeType: "application/pdf",
        uploadedById: actorId,
        changeNote: opts.nota ?? `Contrato ${contrato.numero} regenerado`,
      });
      await DocumentsDB.update(tenantId, doc.id, {
        name: nombre,
        expiresAt: vencimiento,
        status: contrato.firmadoEn ? "approved" : "draft",
      });

      await ContractsDB.update(tenantId, contratoId, { hashSha256: pdf.hash });
      await ContractsDB.addEvent(
        tenantId,
        contratoId,
        "PDF_GENERADO",
        `PDF actualizado en Documentación (${pdf.paginas} pág.)`,
        actorId,
        { documentId: doc.id, hash: pdf.hash },
      );
      return { ok: true, documentId: doc.id, hash: pdf.hash, paginas: pdf.paginas };
    }
    // El documento fue borrado del drive: lo volvemos a crear desde cero.
  }

  // ── Primera vez: crea el documento ────────────────────────────────────────
  const folderId = await carpetaDeContratos(tenantId);

  const draft = await DocumentsDB.create(tenantId, {
    folderId,
    name: nombre,
    originalName: fileName,
    mimeType: "application/pdf",
    size: pdf.bytes.length,
    storagePath: "pending",
    category: "contrato",
    uploadedById: actorId,
  });

  const storagePath = buildStoragePath({
    tenantId,
    documentId: draft.id,
    versionLabel: "v1",
    originalName: fileName,
  });
  const up = await uploadToStorage(storagePath, pdf.bytes, "application/pdf");
  if (!up.ok) {
    await DocumentsDB.hardDelete(tenantId, draft.id);
    return { ok: false, error: "storage_upload_fail", status: 502 };
  }
  await DocumentsDB.setStoragePath(tenantId, draft.id, storagePath);

  // El vencimiento del contrato pasa a ser el del documento: con eso el cron
  // diario de Documentación ya avisa por WhatsApp sin escribir un cron nuevo.
  await DocumentsDB.update(tenantId, draft.id, {
    expiresAt: vencimiento,
    status: contrato.firmadoEn ? "approved" : "draft",
    tags: ["contrato", contrato.tipo.toLowerCase()],
    // El texto del contrato entra al índice de búsqueda del drive, así que se
    // encuentra por cualquier cláusula y el asistente lo puede leer.
    ocrText: [
      `Contrato ${contrato.numero}`,
      contrato.clienteNombre,
      contrato.clienteDoc,
      contrato.resumen,
      cuerpo,
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 100_000),
  });

  await ContractsDB.update(tenantId, contratoId, {
    documentId: draft.id,
    hashSha256: pdf.hash,
  });
  await ContractsDB.addEvent(
    tenantId,
    contratoId,
    "PDF_GENERADO",
    `Guardado en Documentación (${pdf.paginas} pág.)`,
    actorId,
    { documentId: draft.id, hash: pdf.hash },
  );

  return { ok: true, documentId: draft.id, hash: pdf.hash, paginas: pdf.paginas };
}
