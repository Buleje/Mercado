import "server-only";
import { DocumentsDB } from "@/lib/db/documents.db";
import { buildStoragePath, uploadToStorage } from "@/lib/documents/storage";
import { CARPETA_ENTIDAD, ROLES_ENTIDAD_SENSIBLE, etiquetasDeEntidad, rutaCarpetaEntidad, tagEntidad, type TipoEntidad } from "@/lib/documentos/enlaces-entidad";

const TIPOS_SENSIBLES: ReadonlySet<TipoEntidad> = new Set<TipoEntidad>(["tercero", "colaborador"]);

type Entidad = { id: string; nombre: string; periodo?: string };

export class SubidaFallidaError extends Error {
  constructor() {
    super("storage_upload_fail");
  }
}

/**
 * EnlacesEntidadDB — orquesta `DocumentsDB` para el cableado único
 * documento↔entidad (tag `<tipo>:<id>` + carpeta por tipo). No toca Prisma:
 * todo pasa por `DocumentsDB`. `tenantId` SIEMPRE 1er parámetro.
 */
export const EnlacesEntidadDB = {
  /** La carpeta de la entidad (se crea si falta; idempotente). */
  async carpetaDe(tenantId: string, tipo: TipoEntidad, entidad: Entidad, rol?: string): Promise<string> {
    if (!tenantId) throw new Error("tenantId is required");
    const ruta = rutaCarpetaEntidad(tipo, entidad.nombre, entidad.periodo);
    const { idPorRuta } = await DocumentsDB.createFolderTree(tenantId, { parentId: null, rutas: [ruta.join("/")] }, rol);
    const id = idPorRuta[ruta.join("/")];
    if (!id) throw new Error("folder_not_resolved");
    if (TIPOS_SENSIBLES.has(tipo)) await this.cerrarARolesSensibles(tenantId, tipo, id, rol);
    return id;
  },

  /**
   * La raíz del tipo («Terceros», «Equipo/Pagos») y la carpeta de la entidad
   * quedan sólo para los roles sensibles: si no, heredan [] y un cajero vería
   * los NOMBRES del árbol aunque no abra el PDF. Idempotente: sólo escribe lo que difiere.
   */
  async cerrarARolesSensibles(tenantId: string, tipo: TipoEntidad, carpetaEntidadId: string, rol?: string): Promise<void> {
    const raizRuta = CARPETA_ENTIDAD[tipo].join("/");
    const { idPorRuta } = await DocumentsDB.createFolderTree(tenantId, { parentId: null, rutas: [raizRuta] }, rol);
    const objetivo = [...ROLES_ENTIDAD_SENSIBLE].sort().join(",");
    const carpetas = await DocumentsDB.listFolders(tenantId);
    for (const id of [idPorRuta[raizRuta], carpetaEntidadId]) {
      const f = carpetas.find((c) => c.id === id);
      if (!id || !f) continue;
      if ([...(f.allowedRoles ?? [])].sort().join(",") !== objetivo) {
        await DocumentsDB.updateFolder(tenantId, id, { allowedRoles: [...ROLES_ENTIDAD_SENSIBLE] });
      }
    }
  },

  /** Sube un PDF a la carpeta de la entidad, atado por tag. Devuelve el id del documento. */
  async archivar(
    tenantId: string,
    tipo: TipoEntidad,
    entidad: Entidad,
    papel: { pdf: Uint8Array; nombreArchivo: string; extraTags?: string[]; allowedRoles?: readonly string[] },
    rol?: string,
    uploadedById = "sistema",
  ): Promise<string> {
    if (!tenantId) throw new Error("tenantId is required");
    const folderId = await this.carpetaDe(tenantId, tipo, entidad, rol);
    const nombre = papel.nombreArchivo.replace(/\.pdf$/i, "").slice(0, 120);
    const archivo = `${nombre.replace(/[^\w.-]+/g, "_")}.pdf`;
    const draft = await DocumentsDB.create(tenantId, {
      folderId,
      name: nombre,
      originalName: archivo,
      mimeType: "application/pdf",
      size: papel.pdf.length,
      storagePath: "pending",
      category: "otros",
      tags: etiquetasDeEntidad(tipo, entidad.id, entidad.nombre, papel.extraTags),
      uploadedById,
      viewerRole: rol,
      allowedRoles: papel.allowedRoles ? [...papel.allowedRoles] : [],
    });
    const storagePath = buildStoragePath({ tenantId, documentId: draft.id, versionLabel: "v1", originalName: archivo });
    const up = await uploadToStorage(storagePath, papel.pdf, "application/pdf");
    if (!up.ok) {
      await DocumentsDB.hardDelete(tenantId, draft.id);
      throw new SubidaFallidaError();
    }
    await DocumentsDB.setStoragePath(tenantId, draft.id, storagePath);
    return draft.id;
  },

  /** Los documentos atados a la entidad (lo que el rol ve). */
  async listar(tenantId: string, tipo: TipoEntidad, id: string, rol?: string): Promise<Awaited<ReturnType<typeof DocumentsDB.list>>> {
    if (!tenantId) throw new Error("tenantId is required");
    return DocumentsDB.list(tenantId, { tags: [tagEntidad(tipo, id)] }, rol);
  },
};
