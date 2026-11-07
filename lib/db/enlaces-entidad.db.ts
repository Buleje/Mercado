import "server-only";
import { DocumentsDB } from "@/lib/db/documents.db";
import { CarpetasSistemaDB } from "@/lib/db/carpetas-sistema.db";
import type { ClaveSistema } from "@/lib/documentos/carpetas-del-sistema";
import { buildStoragePath, uploadToStorage } from "@/lib/documents/storage";
import { CARPETA_ENTIDAD, ROLES_ENTIDAD_SENSIBLE, etiquetasDeEntidad, rutaCarpetaEntidad, tagEntidad, type TipoEntidad } from "@/lib/documentos/enlaces-entidad";
import { ROL_CANDADO_DUENO } from "@/lib/documents/doc-access";

const TIPOS_SENSIBLES: ReadonlySet<TipoEntidad> = new Set<TipoEntidad>(["tercero", "colaborador"]);

/**
 * allowedRoles de lo sensible: dueño/admin + el candado que impide que
 * `manager`/`tienda_owner` lo vean en el Drive general (ADR-502). Sin el
 * candado, los privilegiados saltan el `allowedRoles` (ver `doc-access.ts`).
 */
const ALLOWED_SENSIBLE: readonly string[] = [...ROLES_ENTIDAD_SENSIBLE, ROL_CANDADO_DUENO];

type Entidad = { id: string; nombre: string; periodo?: string };

export class SubidaFallidaError extends Error {
  constructor() {
    super("storage_upload_fail");
  }
}

/** Tipos cuya carpeta cuelga de una raíz que el sistema sigue por etiqueta (donde Brandon la ponga). */
const RAIZ_SISTEMA_DEL_TIPO: Partial<Record<TipoEntidad, ClaveSistema>> = { permiso: "guias" };

/**
 * `createFolderTree` de una ruta de entidad. Si el tipo vive bajo una raíz del
 * sistema («Guías forestales (GTF)»), cuelga de ESA carpeta y no de la raíz por nombre.
 * `clave` = la ruta tal como la devuelve `idPorRuta`.
 */
async function arbolDeRuta(
  tenantId: string,
  tipo: TipoEntidad,
  ruta: readonly string[],
  rol?: string,
): Promise<{ idPorRuta: Record<string, string>; clave: string }> {
  const sistema = RAIZ_SISTEMA_DEL_TIPO[tipo];
  const raizId = sistema ? await CarpetasSistemaDB.raizDelSistema(tenantId, sistema) : null;
  const clave = (raizId ? ruta.slice(1) : ruta).join("/");
  const { idPorRuta } = await DocumentsDB.createFolderTree(tenantId, { parentId: raizId, rutas: [clave] }, rol);
  return { idPorRuta, clave };
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
    const { idPorRuta, clave } = await arbolDeRuta(tenantId, tipo, ruta, rol);
    const id = idPorRuta[clave];
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
    const { idPorRuta, clave: raizRuta } = await arbolDeRuta(tenantId, tipo, CARPETA_ENTIDAD[tipo], rol);
    const objetivo = [...ALLOWED_SENSIBLE].sort().join(",");
    const carpetas = await DocumentsDB.listFolders(tenantId);
    for (const id of [idPorRuta[raizRuta], carpetaEntidadId]) {
      const f = carpetas.find((c) => c.id === id);
      if (!id || !f) continue;
      if ([...(f.allowedRoles ?? [])].sort().join(",") !== objetivo) {
        await DocumentsDB.updateFolder(tenantId, id, { allowedRoles: [...ALLOWED_SENSIBLE] });
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
      // Un papel sensible lleva SIEMPRE el candado de dueño (aunque la ruta no
      // lo pida): si no, un `manager` lo vería en el Drive general (ADR-502).
      allowedRoles: TIPOS_SENSIBLES.has(tipo)
        ? [...ALLOWED_SENSIBLE]
        : papel.allowedRoles
          ? [...papel.allowedRoles]
          : [],
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
