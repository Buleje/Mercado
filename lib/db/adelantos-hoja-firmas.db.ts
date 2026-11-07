import "server-only";
import { prisma } from "@/lib/prisma";
import { DocumentsDB } from "@/lib/db/documents.db";
import { buildStoragePath, uploadToStorage } from "@/lib/documents/storage";
import { ROL_CANDADO_DUENO } from "@/lib/documents/doc-access";
import { ROLES_ENTIDAD_SENSIBLE } from "@/lib/documentos/enlaces-entidad";
import {
  CARPETA_HOJAS_FIRMAS,
  TAG_HOJA_FIRMAS,
  conceptoParaHoja,
  hojasDeDocumento,
  tagDeHojaAdelanto,
  tagDeHojaCodigo,
  type AdelantoParaHoja,
  type HojaFirmada,
} from "@/lib/adelantos/hoja-firmas";

const ALLOWED_SENSIBLE: readonly string[] = [...ROLES_ENTIDAD_SENSIBLE, ROL_CANDADO_DUENO];

export class AdelantosAjenosError extends Error {
  constructor() {
    super("adelantos_ajenos");
  }
}
export class SubidaHojaFallidaError extends Error {
  constructor() {
    super("storage_upload_fail");
  }
}

/**
 * La hoja de firmas del sábado (25-10): qué adelantos esperan su firma y la
 * foto de la hoja firmada atada a cada uno (documento del Archivo con etiquetas,
 * ver `lib/adelantos/hoja-firmas.ts`). `tenantId` 1.º; todo filtra por él.
 */
export const AdelantosHojaFirmasDB = {
  /** Abiertos que el negocio dio, sin firma en el registro y sin hoja firmada. */
  async pendientes(tenantId: string): Promise<AdelantoParaHoja[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const [filas, firmados, hojas] = await Promise.all([
      prisma.adelanto.findMany({
        where: { tenantId, direccion: "DADO", status: { in: ["ABIERTO", "EXCEDIDO"] } },
        orderBy: [{ fechaAdelanto: "asc" }, { id: "asc" }],
        select: {
          id: true, codigoOperacion: true, montoAdelantado: true, saldoPendiente: true, moneda: true,
          fechaAdelanto: true, notas: true, conceptoRecibido: true,
          beneficiario: { select: { nombre: true, documento: true } },
        },
        take: 500,
      }),
      prisma.adelantoFirma.findMany({ where: { tenantId, tipo: "FIRMA" }, distinct: ["adelantoId"], select: { adelantoId: true } }),
      this.hojasPorAdelanto(tenantId),
    ]);
    const conFirma = new Set(firmados.map((f) => f.adelantoId));
    return filas
      .filter((a) => !conFirma.has(a.id) && !hojas[a.id])
      .map((a) => ({
        id: a.id,
        codigo: a.codigoOperacion,
        persona: a.beneficiario.nombre,
        documento: a.beneficiario.documento,
        fecha: a.fechaAdelanto.toISOString(),
        concepto: conceptoParaHoja(a.notas, a.conceptoRecibido),
        monto: Number(a.montoAdelantado),
        saldo: Number(a.saldoPendiente),
        moneda: a.moneda,
      }));
  },

  /** La hoja firmada más nueva de cada adelanto que ya tiene foto. */
  async hojasPorAdelanto(tenantId: string): Promise<Record<string, HojaFirmada>> {
    if (!tenantId) throw new Error("tenantId is required");
    const docs = await prisma.document.findMany({
      where: { tenantId, deletedAt: null, tags: { has: TAG_HOJA_FIRMAS } },
      orderBy: { uploadedAt: "asc" }, // la más nueva pisa a la vieja
      select: { id: true, tags: true, uploadedAt: true },
      take: 1000,
    });
    const out: Record<string, HojaFirmada> = {};
    for (const d of docs) for (const { adelantoId, ...h } of hojasDeDocumento(d)) out[adelantoId] = h;
    return out;
  },

  /**
   * Guarda la foto de la hoja y la ata a cada adelanto. Todos tienen que ser de
   * este negocio y no estar anulados (si no, ninguno: `AdelantosAjenosError`).
   * Devuelve el id del documento.
   */
  async adjuntarFoto(
    tenantId: string,
    o: { adelantoIds: string[]; codigo: string; cuerpo: Buffer; ext: "webp" | "pdf"; usuario: string; rol: string },
  ): Promise<string> {
    if (!tenantId) throw new Error("tenantId is required");
    const ids = [...new Set(o.adelantoIds)];
    const validos = await prisma.adelanto.findMany({
      where: { tenantId, id: { in: ids }, direccion: "DADO", status: { not: "CANCELADO" } },
      select: { id: true },
    });
    if (validos.length !== ids.length) throw new AdelantosAjenosError();

    const ruta = CARPETA_HOJAS_FIRMAS.join("/");
    // ¿La raíz «Adelantos» ya existía (hecha a mano, quizá compartida)? Sólo se cierra si la crea ESTA llamada.
    const raizNombre = CARPETA_HOJAS_FIRMAS[0].toLowerCase();
    const raizExistia = (await DocumentsDB.listFolders(tenantId)).some((c) => !c.parentId && c.name.trim().toLowerCase() === raizNombre);
    const { idPorRuta } = await DocumentsDB.createFolderTree(tenantId, { parentId: null, rutas: [ruta] }, o.rol);
    const folderId = idPorRuta[ruta];
    if (!folderId) throw new Error("folder_not_resolved");
    const carpetas = await DocumentsDB.listFolders(tenantId);
    const raiz = carpetas.find((c) => c.id === folderId)?.parentId ?? null;
    // Siempre la subcarpeta «Hojas de firmas» (DNI y montos: sólo dueño/admin); la raíz sólo si no existía.
    for (const id of raizExistia ? [folderId] : [raiz, folderId]) {
      const f = carpetas.find((c) => c.id === id);
      if (id && f && [...(f.allowedRoles ?? [])].sort().join(",") !== [...ALLOWED_SENSIBLE].sort().join(",")) {
        await DocumentsDB.updateFolder(tenantId, id, { allowedRoles: [...ALLOWED_SENSIBLE] });
      }
    }

    const mimeType = o.ext === "pdf" ? "application/pdf" : "image/webp";
    const nombre = `Hoja de firmas ${o.codigo}`;
    const archivo = `${o.codigo}.${o.ext}`;
    const draft = await DocumentsDB.create(tenantId, {
      folderId,
      name: nombre,
      originalName: archivo,
      mimeType,
      size: o.cuerpo.length,
      storagePath: "pending",
      category: "otros",
      tags: [TAG_HOJA_FIRMAS, tagDeHojaCodigo(o.codigo), "adelantos", ...ids.map(tagDeHojaAdelanto)],
      uploadedById: o.usuario,
      viewerRole: o.rol,
      allowedRoles: [...ALLOWED_SENSIBLE],
    });
    const storagePath = buildStoragePath({ tenantId, documentId: draft.id, versionLabel: "v1", originalName: archivo });
    const up = await uploadToStorage(storagePath, o.cuerpo, mimeType);
    if (!up.ok) {
      await DocumentsDB.hardDelete(tenantId, draft.id);
      throw new SubidaHojaFallidaError();
    }
    await DocumentsDB.setStoragePath(tenantId, draft.id, storagePath);
    return draft.id;
  },
};
