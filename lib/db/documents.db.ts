import "server-only";
import { randomBytes, createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  canRoleSeeEnCadena,
  enlaceSigueSirviendo,
  estaRestringido,
  isPrivilegedRole,
  rolesDeLaCadena,
  type CarpetaConRoles,
} from "@/lib/documents/doc-access";
import { palabrasUtiles } from "@/lib/documentos/terminos-busqueda";
import { Prisma } from "@/lib/generated/prisma/client";
import type {
  Document as PDocument,
  DocumentFolder as PDocumentFolder,
  DocumentVersion as PDocumentVersion,
  DocumentShare as PDocumentShare,
  DocumentAuditLog as PDocumentAuditLog,
  DocumentTemplate as PDocumentTemplate,
} from "@/lib/generated/prisma/client";
import type {
  DbDocument,
  DbDocumentFolder,
  DbDocumentVersion,
  DbDocumentShare,
  DbSharedLink,
  DbDocumentAuditLog,
  DbDocumentActivity,
  DbDocumentTemplate,
  DocAction,
  DocumentListFilters,
  TemplateField,
} from "@/lib/types/documents";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Dónde vive `unaccent()` en esta base, averiguado una sola vez: Supabase la
 * instala en el schema `extensions`, otras instalaciones en `public`, y una
 * base sin la extensión no la tiene en ningún lado ("no"). Sin este recuerdo,
 * cada búsqueda pagaría un error de SQL para descubrir lo mismo.
 */
let modoUnaccent: "extensions" | "publico" | "no" | null = null;

/**
 * Lo único de `ocrMetadata` que la grilla dibuja.
 *
 * El resto —la descripción rica, el resumen, los datos clave, las entidades—
 * pesa unos 8 KB de los 12 que ocupa el campo, y sólo lo mira el visor, que ya
 * pide el documento completo por su cuenta al abrirlo. La descripción se
 * reemplaza por una marca de "sí, ya sabemos qué es esto", que es lo único que
 * la grilla necesita para el filtro de sin-describir y para contar cuántos
 * faltan indexar.
 *
 * Cuando hay una búsqueda escrita esto NO se aplica: ahí el cliente sí usa los
 * datos clave y las entidades para ordenar por relevancia y explicar por qué
 * apareció cada documento.
 */
function metadataDeGrilla(meta: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!meta) return null;
  const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const reducida: Record<string, unknown> = {};
  for (const clave of [
    "structured", "sugerencias", "analyzedAt", "analyzedVia",
    "descripcionUsuario", "descripcionUsuarioAt", "leidoComoEscaneo", "paginasLeidas",
  ]) {
    if (meta[clave] !== undefined) reducida[clave] = meta[clave];
  }
  if (texto(meta.description) || texto(meta.summary)) reducida.tieneDescripcionIa = true;
  return reducida;
}

function toISO(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

function toISOReq(d: Date): string {
  return d.toISOString();
}

function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("hex");
}

/** Hash sha256 — usado para password de share (cheap, no bcrypt dependency). */
function hashPassword(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapDoc(
  d: PDocument & { _count?: { versions: number; shares: number } }
): DbDocument {
  return {
    id: d.id,
    tenantId: d.tenantId,
    folderId: d.folderId,
    name: d.name,
    originalName: d.originalName,
    mimeType: d.mimeType,
    size: d.size,
    storagePath: d.storagePath,
    category: d.category,
    tags: d.tags,
    favorite: d.favorite,
    status: d.status,
    expiresAt: toISO(d.expiresAt),
    customerId: d.customerId,
    orderId: d.orderId,
    supplierId: d.supplierId,
    ocrText: d.ocrText,
    ocrMetadata: (d.ocrMetadata as Record<string, unknown> | null) ?? null,
    aiCategory: d.aiCategory,
    aiTags: d.aiTags,
    allowedRoles: d.allowedRoles ?? [],
    uploadedById: d.uploadedById,
    uploadedAt: toISOReq(d.uploadedAt),
    updatedAt: toISOReq(d.updatedAt),
    deletedAt: toISO(d.deletedAt),
    versionCount: d._count?.versions,
    shareCount: d._count?.shares,
  };
}

function mapFolder(
  f: PDocumentFolder & { _count?: { documents: number } }
): DbDocumentFolder {
  return {
    id: f.id,
    tenantId: f.tenantId,
    parentId: f.parentId,
    name: f.name,
    color: f.color,
    icon: f.icon,
    emoji: f.emoji ?? null,
    tags: f.tags ?? [],
    allowedRoles: f.allowedRoles ?? [],
    createdAt: toISOReq(f.createdAt),
    updatedAt: toISOReq(f.updatedAt),
    documentCount: f._count?.documents,
  };
}

function mapVersion(v: PDocumentVersion): DbDocumentVersion {
  return {
    id: v.id,
    documentId: v.documentId,
    versionNumber: v.versionNumber,
    storagePath: v.storagePath,
    size: v.size,
    mimeType: v.mimeType,
    uploadedById: v.uploadedById,
    uploadedAt: toISOReq(v.uploadedAt),
    changeNote: v.changeNote,
  };
}

function mapShare(s: PDocumentShare): DbDocumentShare {
  return {
    id: s.id,
    documentId: s.documentId,
    tenantId: s.tenantId,
    token: s.token,
    expiresAt: toISOReq(s.expiresAt),
    hasPassword: s.password != null,
    createdById: s.createdById,
    createdAt: toISOReq(s.createdAt),
    accessCount: s.accessCount,
    lastAccessAt: toISO(s.lastAccessAt),
    revokedAt: toISO(s.revokedAt),
  };
}

function mapAuditLog(a: PDocumentAuditLog): DbDocumentAuditLog {
  return {
    id: a.id,
    documentId: a.documentId,
    tenantId: a.tenantId,
    actorId: a.actorId,
    action: a.action as DocAction,
    metadata: (a.metadata as Record<string, unknown> | null) ?? null,
    ipAddress: a.ipAddress,
    createdAt: toISOReq(a.createdAt),
  };
}

function mapTemplate(t: PDocumentTemplate): DbDocumentTemplate {
  return {
    id: t.id,
    tenantId: t.tenantId,
    key: t.key,
    name: t.name,
    description: t.description,
    body: t.body,
    fields: (t.fields as unknown as TemplateField[]) ?? [],
    isSystem: t.isSystem,
    createdAt: toISOReq(t.createdAt),
  };
}

// ── Carpeta de destino: siempre de ESTE negocio ───────────────────────────────

/**
 * La carpeta de destino no existe en este negocio.
 *
 * Hasta el 2026-09-29 `POST /api/admin/documents` guardaba el `folderId` que
 * mandaba el cliente sin mirar de quién era (hallazgo del architect en
 * ADR-467): un documento del negocio A podía quedar colgado de una carpeta del
 * negocio B — contaba en el «N archivos» de la carpeta ajena, heredaba sus
 * permisos y se soltaba a la raíz si B la borraba. La ruta lo traduce a 404
 * (igual que una carpeta que no existe: no se confirma que exista en otro lado).
 */
export class CarpetaAjenaError extends Error {
  constructor(public readonly folderId: string) {
    super("Esa carpeta no existe en este negocio.");
    this.name = "CarpetaAjenaError";
  }
}

/**
 * Mover la carpeta ahí la dejaría adentro de sí misma (hija, nieta…): el árbol
 * se cerraría en un ciclo y la carpeta —con todo lo que tiene— desaparecería
 * del Drive, porque ya no cuelga de la raíz por ningún camino.
 */
export class CicloDeCarpetasError extends Error {
  constructor(
    public readonly folderId: string,
    public readonly parentId: string,
  ) {
    super("No se puede mover una carpeta adentro de sí misma ni de una de sus subcarpetas.");
    this.name = "CicloDeCarpetasError";
  }
}

/** Tope de niveles al subir por los padres: corta aunque la base ya tuviera un ciclo. */
const MAX_NIVELES_CARPETA = 200;

/** ¿La carpeta existe EN ESTE negocio? El `tenantId` va en el WHERE, no en un `if`. */
async function carpetaEsDelNegocio(tenantId: string, folderId: string): Promise<boolean> {
  return (await prisma.documentFolder.count({ where: { id: folderId, tenantId } })) > 0;
}

// ── Permisos por rol: la cadena entera de carpetas ───────────────────────────
//
// Revisión de seguridad 2026-10-04 (veto del rescate de ADR-467): el rol se
// miraba sólo contra la carpeta DIRECTA y sólo al listar/abrir. Compartir,
// lote, «Por vencer», versiones, papelera, etiquetas… no lo miraban. Todo pasa
// ahora por estos tres helpers; «no lo puede ver» se responde igual que «no
// existe» (null / 0 / lista sin el doc → 404 en la ruta).

/** ¿Hace falta filtrar? Sin rol (procesos internos) o con rol privilegiado, no. */
function filtraPorRol(viewerRole: string | null | undefined): viewerRole is string {
  return !!viewerRole && !isPrivilegedRole(viewerRole);
}

/** Todas las carpetas del negocio con su madre y sus roles (60 en `main`: 1 consulta). */
async function mapaDeCarpetas(tenantId: string): Promise<Map<string, CarpetaConRoles>> {
  const filas = await prisma.documentFolder.findMany({
    where: { tenantId },
    select: { id: true, parentId: true, allowedRoles: true },
  });
  return new Map(filas.map((f) => [f.id, { parentId: f.parentId ?? null, allowedRoles: f.allowedRoles ?? [] }]));
}

/** Se queda con lo que el rol ve (doc + cadena de carpetas). */
async function soloVisibles<T extends { folderId: string | null; allowedRoles?: string[] | null }>(
  tenantId: string,
  filas: T[],
  viewerRole: string,
  carpetas?: Map<string, CarpetaConRoles>,
): Promise<T[]> {
  if (filas.length === 0) return filas;
  const mapa = carpetas ?? (await mapaDeCarpetas(tenantId));
  return filas.filter((d) => canRoleSeeEnCadena(viewerRole, d.allowedRoles ?? [], rolesDeLaCadena(d.folderId, mapa)));
}

/** Rol ACTUAL de quien creó un enlace (null si ya no existe o está inactivo). */
async function rolDelCreador(tenantId: string, username: string): Promise<string | null> {
  const u = await prisma.adminUser.findFirst({
    where: { tenantId, username, active: true },
    select: { role: true },
  });
  return u?.role ?? null;
}

// ── DocumentsDB class ─────────────────────────────────────────────────────────

export class DocumentsDB {
  // ── Documents ──────────────────────────────────────────────────────────────

  /**
   * IDs de documentos que matchean IGNORANDO TILDES.
   *
   * Por qué en SQL crudo y no con Prisma: `contains` termina en `ILIKE`, que
   * distingue "descripción" de "descripcion" — en un drive escrito en
   * castellano eso deja afuera media búsqueda. `unaccent()` pliega los acentos
   * de los dos lados. Es un PRE-FILTRO: devuelve ids y el resto del armado
   * (carpeta, permisos, orden, conteos) sigue en Prisma como siempre.
   *
   * Devuelve `null` si la base no tiene la extensión, y el llamador vuelve a la
   * búsqueda de siempre — un entorno sin `unaccent` busca peor, no se rompe.
   */
  private static async buscarIdsSinTildes(
    tenantId: string,
    palabras: string[],
    modo: "todas" | "alguna",
    soloBorrados: boolean,
  ): Promise<string[] | null> {
    if (modoUnaccent === "no" || palabras.length === 0) return null;

    const intentar = async (esquema: "extensions." | ""): Promise<string[]> => {
      // Todo lo que puede nombrar al documento, en un solo texto plegado.
      const campos = Prisma.raw(
        `${esquema}unaccent(lower(coalesce("name",'') || ' ' || coalesce("originalName",'') || ' ' || coalesce("ocrText",'') || ' ' || array_to_string("tags",' ')))`,
      );
      const cond = palabras.map(
        (p) => Prisma.sql`${campos} LIKE '%' || ${Prisma.raw(`${esquema}unaccent`)}(lower(${p})) || '%'`,
      );
      const filas = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Document"
        WHERE "tenantId" = ${tenantId}
          AND ${soloBorrados ? Prisma.sql`"deletedAt" IS NOT NULL` : Prisma.sql`"deletedAt" IS NULL`}
          AND (${Prisma.join(cond, modo === "todas" ? " AND " : " OR ")})
        LIMIT 2000`;
      return filas.map((f) => f.id);
    };

    try {
      if (modoUnaccent === null || modoUnaccent === "extensions") {
        const ids = await intentar("extensions.");
        modoUnaccent = "extensions";
        return ids;
      }
      return await intentar("");
    } catch (err) {
      // Supabase la instala en `extensions`; otras instalaciones, en `public`.
      // Se prueba el otro camino una vez y se recuerda cuál anduvo.
      if (modoUnaccent === null) {
        try {
          const ids = await intentar("");
          modoUnaccent = "publico";
          return ids;
        } catch (err2) {
          modoUnaccent = "no";
          logger.warn("documents.busqueda.sin_unaccent", { err: String(err2).slice(0, 160) });
          return null;
        }
      }
      logger.warn("documents.busqueda.unaccent_fallo", { err: String(err).slice(0, 160) });
      return null;
    }
  }

  static async list(
    tenantId: string,
    filters: DocumentListFilters = {},
    viewerRole?: string
  ): Promise<DbDocument[]> {
    const where: Record<string, unknown> = { tenantId };

    if (filters.deletedOnly) where.deletedAt = { not: null };
    else if (!filters.includeDeleted) where.deletedAt = null;

    if (filters.folderId !== undefined) {
      where.folderId = filters.folderId; // null → raíz
    }
    if (filters.category) where.category = filters.category;
    if (filters.favorite !== undefined) where.favorite = filters.favorite;
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.orderId) where.orderId = filters.orderId;
    if (filters.supplierId) where.supplierId = filters.supplierId;
    if (filters.tags?.length) where.tags = { hasSome: filters.tags };

    /** Un término contra todo lo que puede nombrar a un documento. */
    const enTodoElDoc = (t: string) => [
      { name: { contains: t, mode: "insensitive" } },
      { originalName: { contains: t, mode: "insensitive" } },
      { ocrText: { contains: t, mode: "insensitive" } },
      { tags: { hasSome: [t.toLowerCase()] } },
    ];

    // Primero se intenta la búsqueda que IGNORA TILDES (Postgres `ILIKE` no lo
    // hace). Si sale bien, filtra por id y no hace falta el `contains` de
    // abajo; si el entorno no tiene la extensión `unaccent`, devuelve null y
    // seguimos con la búsqueda de siempre.
    const palabrasQ = filters.q?.trim() ? palabrasUtiles(filters.q) : [];
    const terminosAny = filters.qAny?.filter((t) => t.trim().length > 1).slice(0, 12) ?? [];
    const busqueda = palabrasQ.length > 0
      ? { palabras: palabrasQ, modo: "todas" as const }
      : terminosAny.length > 0
      ? { palabras: terminosAny, modo: "alguna" as const }
      : null;
    const idsSinTildes = busqueda
      ? await this.buscarIdsSinTildes(tenantId, busqueda.palabras, busqueda.modo, !!filters.deletedOnly)
      : null;

    if (idsSinTildes) {
      where.id = { in: idsSinTildes };
    } else if (filters.q?.trim()) {
      const q = filters.q.trim();
      // Varias palabras = TODAS tienen que estar, cada una donde sea. Antes se
      // buscaba la frase literal: "alquiler del local" no encontraba el
      // contrato cuya descripción dice "alquiler de un local", que es
      // exactamente el documento que la persona estaba buscando. Como la frase
      // exacta contiene todas sus palabras, sigue matcheando; el orden por
      // relevancia (client-side) es el que la pone primera.
      const palabras = palabrasUtiles(q);
      if (palabras.length > 1) where.AND = palabras.map((p) => ({ OR: enTodoElDoc(p) }));
      else where.OR = enTodoElDoc(q);
    } else if (filters.qAny?.length) {
      // ADR-119 — búsqueda semántica: cualquier término matchea.
      const terms = filters.qAny.filter((t) => t.trim().length > 1).slice(0, 12);
      where.OR = terms.flatMap((t) => enTodoElDoc(t));
    }

    // El texto indexado sólo viaja cuando alguien está buscando: es quien lo
    // pide para resaltar la coincidencia y ordenar por relevancia. Abrir el
    // drive sin buscar nada no tiene por qué arrastrar el contenido de 292
    // archivos (ver `conTextoCompleto` en DocumentListFilters).
    const docs = await prisma.document.findMany({
      where,
      orderBy: [{ favorite: "desc" }, { uploadedAt: "desc" }],
      include: { _count: { select: { versions: true, shares: true } } },
      ...(filters.conTextoCompleto ? {} : { omit: { ocrText: true } }),
      take: 500,
    });
    // Con `omit` el campo no viene en la fila; el mapeo lo repone en null para
    // que el tipo del documento siga siendo uno solo en toda la app.
    const mapped = docs.map((d) => {
      const doc = mapDoc({ ...d, ocrText: (d as { ocrText?: string | null }).ocrText ?? null });
      return filters.conTextoCompleto ? doc : { ...doc, ocrMetadata: metadataDeGrilla(doc.ocrMetadata) };
    });

    // Permisos por doc y por TODA la cadena de carpetas: los roles no
    // privilegiados solo ven lo permitido.
    if (filtraPorRol(viewerRole)) return soloVisibles(tenantId, mapped, viewerRole);
    return mapped;
  }

  static async getById(tenantId: string, id: string, viewerRole?: string): Promise<DbDocument | null> {
    const doc = await prisma.document.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        _count: { select: { versions: true, shares: true } },
        folder: { select: { allowedRoles: true, parentId: true } },
      },
    });
    if (!doc) return null;
    // Permisos: un rol no privilegiado no puede acceder a un doc restringido.
    if (filtraPorRol(viewerRole) && !(await this.rolVeFila(tenantId, doc, viewerRole))) return null;
    return mapDoc(doc);
  }

  /**
   * ¿El rol ve esta fila? Si la carpeta directa cuelga de la raíz no hace
   * falta leer el árbol: la cadena es ella sola.
   */
  private static async rolVeFila(
    tenantId: string,
    doc: {
      folderId: string | null;
      allowedRoles?: string[] | null;
      folder?: { allowedRoles?: string[] | null; parentId?: string | null } | null;
    },
    viewerRole: string,
  ): Promise<boolean> {
    const propios = doc.allowedRoles ?? [];
    if (!doc.folderId) return canRoleSeeEnCadena(viewerRole, propios, []);
    if (doc.folder && !doc.folder.parentId) {
      const directa = doc.folder.allowedRoles ?? [];
      return canRoleSeeEnCadena(viewerRole, propios, directa.length ? [directa] : []);
    }
    return canRoleSeeEnCadena(viewerRole, propios, rolesDeLaCadena(doc.folderId, await mapaDeCarpetas(tenantId)));
  }

  /**
   * ¿Este rol ve el documento? Con `incluirBorrados` mira también la papelera
   * (restaurar, borrar, historial). Sin rol o con rol privilegiado = existe.
   */
  static async puedeVer(
    tenantId: string,
    id: string,
    viewerRole: string | null | undefined,
    opciones: { incluirBorrados?: boolean } = {},
  ): Promise<boolean> {
    const doc = await prisma.document.findFirst({
      where: { id, tenantId, ...(opciones.incluirBorrados ? {} : { deletedAt: null }) },
      select: { folderId: true, allowedRoles: true, folder: { select: { allowedRoles: true, parentId: true } } },
    });
    if (!doc) return false;
    return filtraPorRol(viewerRole) ? this.rolVeFila(tenantId, doc, viewerRole) : true;
  }

  /**
   * De estos ids, los que el rol ve (incluye la papelera: el que llama ya
   * filtra por `deletedAt`). Sin rol o privilegiado vuelven tal cual, sin
   * consulta. Con `soloSinRoles` descarta además lo restringido: un rol no
   * privilegiado no puede MOVER un papel restringido (lo sacaría de su carpeta
   * y lo dejaría a la vista de roles que hoy no lo ven).
   */
  static async idsVisibles(
    tenantId: string,
    ids: string[],
    viewerRole: string | null | undefined,
    opciones: { soloSinRoles?: boolean } = {},
  ): Promise<string[]> {
    if (!filtraPorRol(viewerRole) || ids.length === 0) return ids;
    const filas = await prisma.document.findMany({
      where: { id: { in: ids }, tenantId },
      select: { id: true, folderId: true, allowedRoles: true },
    });
    const mapa = await mapaDeCarpetas(tenantId);
    return filas
      .filter((d) => {
        const cadena = rolesDeLaCadena(d.folderId, mapa);
        if (opciones.soloSinRoles && estaRestringido(d.allowedRoles ?? [], cadena)) return false;
        return canRoleSeeEnCadena(viewerRole, d.allowedRoles ?? [], cadena);
      })
      .map((d) => d.id);
  }

  /** ¿El documento o alguna carpeta de su cadena tiene roles? (null = no existe). */
  static async tieneRoles(tenantId: string, id: string): Promise<boolean | null> {
    const doc = await prisma.document.findFirst({
      where: { id, tenantId },
      select: { folderId: true, allowedRoles: true },
    });
    if (!doc) return null;
    const cadena = doc.folderId ? rolesDeLaCadena(doc.folderId, await mapaDeCarpetas(tenantId)) : [];
    return estaRestringido(doc.allowedRoles ?? [], cadena);
  }

  /**
   * ¿El rol ve la carpeta? (existe en el negocio + pasa todas las puertas de su
   * cadena). `restringida` dice si alguna carpeta de la cadena tiene roles.
   */
  static async accesoACarpeta(
    tenantId: string,
    folderId: string,
    viewerRole: string | null | undefined,
  ): Promise<{ existe: boolean; ve: boolean; restringida: boolean }> {
    const mapa = await mapaDeCarpetas(tenantId);
    if (!mapa.has(folderId)) return { existe: false, ve: false, restringida: false };
    const cadena = rolesDeLaCadena(folderId, mapa);
    const ve = filtraPorRol(viewerRole) ? canRoleSeeEnCadena(viewerRole, [], cadena) : true;
    return { existe: true, ve, restringida: cadena.length > 0 };
  }

  /**
   * Trae el documento incluyendo soft-deleted (para restore).
   */
  static async getByIdIncludingDeleted(
    tenantId: string,
    id: string
  ): Promise<DbDocument | null> {
    const doc = await prisma.document.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { versions: true, shares: true } } },
    });
    return doc ? mapDoc(doc) : null;
  }

  static async create(
    tenantId: string,
    input: {
      folderId?: string | null;
      name: string;
      originalName: string;
      mimeType: string;
      size: number;
      storagePath: string;
      category?: string;
      tags?: string[];
      uploadedById: string;
      customerId?: string;
      orderId?: string;
      supplierId?: string;
      /** Rol de quien sube: una carpeta que no ve es, para él, una que no existe. */
      viewerRole?: string;
    }
  ): Promise<DbDocument> {
    // Una carpeta de otro negocio no se acepta como destino (ver `CarpetaAjenaError`).
    if (input.folderId && !(await carpetaEsDelNegocio(tenantId, input.folderId))) {
      throw new CarpetaAjenaError(input.folderId);
    }
    // Ni una que el rol no ve: subir ahí confirmaba que existía (404 igual).
    if (
      input.folderId &&
      filtraPorRol(input.viewerRole) &&
      !(await this.accesoACarpeta(tenantId, input.folderId, input.viewerRole)).ve
    ) {
      throw new CarpetaAjenaError(input.folderId);
    }
    const doc = await prisma.document.create({
      data: {
        tenantId,
        folderId: input.folderId ?? null,
        name: input.name,
        originalName: input.originalName,
        mimeType: input.mimeType,
        size: input.size,
        storagePath: input.storagePath,
        category: input.category ?? "otros",
        tags: input.tags ?? [],
        uploadedById: input.uploadedById,
        customerId: input.customerId ?? null,
        orderId: input.orderId ?? null,
        supplierId: input.supplierId ?? null,
      },
      include: { _count: { select: { versions: true, shares: true } } },
    });
    return mapDoc(doc);
  }

  static async update(
    tenantId: string,
    id: string,
    patch: {
      name?: string;
      /**
       * Se acepta acá para que la subida no tenga que hacer DOS escrituras a la
       * misma fila (una para la categoría y otra para la ruta del archivo).
       * Con 400 archivos eran 400 viajes de más a la base.
       */
      storagePath?: string;
      folderId?: string | null;
      category?: string;
      tags?: string[];
      favorite?: boolean;
      status?: string;
      expiresAt?: Date | null;
      customerId?: string | null;
      orderId?: string | null;
      supplierId?: string | null;
      ocrText?: string;
      ocrMetadata?: Record<string, unknown>;
      aiCategory?: string;
      aiTags?: string[];
      allowedRoles?: string[];
    }
  ): Promise<DbDocument | null> {
    const existing = await prisma.document.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!existing) return null;
    /* Mover a una carpeta de otro negocio = «no existe» (la ruta ya responde 404
       con `null`). Sólo se consulta cuando de verdad cambia de carpeta. */
    if (
      typeof patch.folderId === "string" &&
      patch.folderId !== existing.folderId &&
      !(await carpetaEsDelNegocio(tenantId, patch.folderId))
    ) {
      return null;
    }

    // ADR-119 — al mover/cambiar la fecha de vencimiento, re-armamos el ciclo
    // de recordatorios: limpiamos la marca para que el cron vuelva a avisar.
    const data: Record<string, unknown> = { ...patch };
    if (
      Object.prototype.hasOwnProperty.call(patch, "expiresAt") &&
      patch.expiresAt?.getTime() !== existing.expiresAt?.getTime()
    ) {
      data.expiryReminderSentAt = null;
    }

    const doc = await prisma.document.update({
      where: { id },
      data,
      include: { _count: { select: { versions: true, shares: true } } },
    });
    return mapDoc(doc);
  }

  /**
   * ADR-119 — documentos cuyo vencimiento cae dentro de `withinDays` (incluye
   * ya vencidos). Ordenados por urgencia. Para la vista "Por vencer" del UI.
   */
  static async listExpiring(
    tenantId: string,
    withinDays = 30,
    viewerRole?: string
  ): Promise<DbDocument[]> {
    const limit = new Date();
    limit.setDate(limit.getDate() + withinDays);
    const docs = await prisma.document.findMany({
      where: {
        tenantId,
        deletedAt: null,
        expiresAt: { not: null, lte: limit },
      },
      orderBy: [{ expiresAt: "asc" }],
      include: { _count: { select: { versions: true, shares: true } } },
      take: 200,
    });
    // Mismo filtro que `list`: «Por vencer» devolvía el texto OCR de papeles
    // que el rol no puede abrir (revisión de seguridad 04-10).
    const mapped = docs.map(mapDoc);
    return filtraPorRol(viewerRole) ? soloVisibles(tenantId, mapped, viewerRole) : mapped;
  }

  /**
   * ADR-119 — count barato de documentos por vencer dentro de `withinDays`
   * (incluye vencidos). Usa el índice [tenantId, expiresAt]. Para el widget
   * de alertas del home (/api/admin/overview).
   */
  static async countExpiring(tenantId: string, withinDays = 30): Promise<number> {
    const limit = new Date();
    limit.setDate(limit.getDate() + withinDays);
    return prisma.document.count({
      where: { tenantId, deletedAt: null, expiresAt: { not: null, lte: limit } },
    });
  }

  /**
   * Documentos que todavía no tienen contexto: la cola de indexado los toma de
   * a poco hasta que no queda ninguno.
   *
   * "Sin contexto" es no tener descripción — ni de la IA ni escrita a mano —,
   * que es la medida honesta de "no se puede encontrar por lo que dice adentro".
   * Se ordena por INTENTOS y después por antigüedad: un escaneo que ya falló
   * tres veces no puede quedarse adelante de veinte documentos que nunca se
   * intentaron. El filtro de tipo lo hace el llamador con `isAnalyzableMime`
   * (vive del lado cliente-safe y no se puede consultar desde SQL).
   */
  static async pendientesDeIndexar(
    tenantId: string,
    limite = 50,
    maxIntentos = 3,
  ): Promise<{ id: string; name: string; mimeType: string; intentos: number; lento: boolean }[]> {
    const docs = await prisma.document.findMany({
      /* Las fotos de personas de las cámaras (`lib/camaras/personas-drive.server.ts`)
         llegan de a cientos por día ya descritas: filtradas ACÁ y no en el bucle,
         porque si no llenan la ventana de 1000 y un PDF subido antes nunca se indexa. */
      where: { tenantId, deletedAt: null, NOT: { tags: { has: "personas" } } },
      select: { id: true, name: true, mimeType: true, ocrMetadata: true, uploadedAt: true },
      orderBy: { uploadedAt: "desc" },
      take: 1000,
    });
    const salida: { id: string; name: string; mimeType: string; intentos: number; lento: boolean }[] = [];
    for (const d of docs) {
      const meta = (d.ocrMetadata ?? {}) as Record<string, unknown>;
      const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
      if (texto(meta.description) || texto(meta.summary) || texto(meta.descripcionUsuario)) continue;
      const intentos = typeof meta.indexIntentos === "number" ? meta.indexIntentos : 0;
      if (intentos >= maxIntentos) continue;
      salida.push({
        id: d.id,
        name: d.name,
        mimeType: d.mimeType,
        intentos,
        // Se sabe que hay que MIRARLO: o es una imagen, o la vez pasada tardó
        // minutos (un PDF escaneado no se distingue de uno con texto hasta que
        // se lo abre — por eso se anota la primera vez y ya no se olvida).
        lento: d.mimeType.startsWith("image/") || meta.indexLento === true,
      });
    }
    return salida.sort((a, b) => a.intentos - b.intentos).slice(0, limite);
  }

  /**
   * Deja anotado que se intentó indexar y no salió.
   *
   * Sin esto la cola reintentaría para siempre los mismos 68 escaneos que no se
   * pueden leer, y nunca llegaría a los que sí. Se guarda el motivo para que la
   * pantalla pueda decir POR QUÉ falta el contexto de un documento.
   */
  static async marcarIntentoDeIndexado(
    tenantId: string,
    id: string,
    motivo: string,
    opciones: { lento?: boolean } = {},
  ): Promise<void> {
    const doc = await prisma.document.findFirst({ where: { id, tenantId }, select: { ocrMetadata: true } });
    if (!doc) return;
    const meta = (doc.ocrMetadata ?? {}) as Record<string, unknown>;
    const intentos = typeof meta.indexIntentos === "number" ? meta.indexIntentos : 0;
    await prisma.document.update({
      where: { id },
      data: {
        ocrMetadata: {
          ...meta,
          indexIntentos: intentos + 1,
          indexUltimoMotivo: motivo.slice(0, 200),
          indexUltimoIntento: new Date().toISOString(),
          ...(opciones.lento ? { indexLento: true } : {}),
        },
      },
    });
  }

  /** Anota que este documento tarda minutos, aunque haya salido bien. */
  static async marcarDocumentoLento(tenantId: string, id: string): Promise<void> {
    const doc = await prisma.document.findFirst({ where: { id, tenantId }, select: { ocrMetadata: true } });
    if (!doc) return;
    const meta = (doc.ocrMetadata ?? {}) as Record<string, unknown>;
    if (meta.indexLento === true) return;
    await prisma.document.update({ where: { id }, data: { ocrMetadata: { ...meta, indexLento: true } } });
  }

  /** Tenants que tienen documentos sin describir (para el cron de indexado). */
  static async tenantsConPendientesDeIndexar(limite = 20): Promise<string[]> {
    const filas = await prisma.document.groupBy({
      by: ["tenantId"],
      where: { deletedAt: null, ocrText: null },
      _count: { _all: true },
      orderBy: { _count: { tenantId: "desc" } },
      take: limite,
    });
    return filas.map((f) => f.tenantId);
  }

  /**
   * ADR-119 — usado por el cron. Trae documentos que vencen dentro de la
   * ventana y aún no recibieron aviso (o cuyo aviso quedó obsoleto). Cross-
   * tenant: el caller agrupa por tenantId para resolver el teléfono destino.
   */
  static async listPendingExpiryReminders(
    withinDays: number,
    /**
     * Cuánto hacia ATRÁS se sigue avisando. Antes era 1 día: un documento que
     * vencía y no se avisaba ese mismo día (el cron falló, o se subió una
     * licencia ya caída) no avisaba NUNCA, que es justo cuando más importa.
     * El anti-spam sigue siendo `expiryReminderSentAt`: se avisa una sola vez.
     */
    tambienVencidosHaceDias = 60,
  ): Promise<DbDocument[]> {
    const limit = new Date();
    limit.setDate(limit.getDate() + withinDays);
    const desde = new Date(Date.now() - tambienVencidosHaceDias * 86_400_000);
    const docs = await prisma.document.findMany({
      where: {
        deletedAt: null,
        expiresAt: { not: null, lte: limit, gte: desde },
        expiryReminderSentAt: null,
      },
      orderBy: [{ expiresAt: "asc" }],
      take: 1000,
    });
    return docs.map(mapDoc);
  }

  /** ADR-119 — marca el aviso de vencimiento como enviado (anti-spam).
   * Scopeado por tenant (CRIT-1): el cron agrupa por tenant antes de sellar. */
  static async markExpiryReminderSent(tenantId: string, ids: string[]): Promise<void> {
    if (!ids.length) return;
    await prisma.document.updateMany({
      where: { tenantId, id: { in: ids } },
      data: { expiryReminderSentAt: new Date() },
    });
  }

  static async softDelete(tenantId: string, id: string): Promise<boolean> {
    const r = await prisma.document.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return r.count > 0;
  }

  static async restore(tenantId: string, id: string, viewerRole?: string): Promise<boolean> {
    if (filtraPorRol(viewerRole) && !(await this.puedeVer(tenantId, id, viewerRole, { incluirBorrados: true }))) {
      return false;
    }
    const r = await prisma.document.updateMany({
      where: { id, tenantId, deletedAt: { not: null } },
      data: { deletedAt: null },
    });
    return r.count > 0;
  }

  /** Hard delete + cascade. Solo para purge admin (no expuesto al UI). */
  static async hardDelete(tenantId: string, id: string): Promise<boolean> {
    const existing = await prisma.document.findFirst({ where: { id, tenantId } });
    if (!existing) return false;
    await prisma.document.delete({ where: { id } });
    return true;
  }

  /**
   * Actualiza el storagePath de un documento existente sin pasar por update().
   * Uso interno tras upload: el path final se construye con el id del documento,
   * por lo que necesitamos crear primero y luego escribir el path real.
   */
  static async setStoragePath(
    tenantId: string,
    id: string,
    storagePath: string
  ): Promise<boolean> {
    const r = await prisma.document.updateMany({
      where: { id, tenantId },
      data: { storagePath },
    });
    return r.count > 0;
  }

  /**
   * Devuelve los storagePaths de todas las versiones de un documento.
   * Uso interno para purge cleanup del bucket.
   */
  static async listVersionPaths(
    tenantId: string,
    documentId: string
  ): Promise<string[]> {
    const doc = await prisma.document.findFirst({
      where: { id: documentId, tenantId },
      select: { id: true },
    });
    if (!doc) return [];
    const versions = await prisma.documentVersion.findMany({
      where: { documentId },
      select: { storagePath: true },
    });
    return versions.map((v) => v.storagePath);
  }

  // ── Bulk ───────────────────────────────────────────────────────────────────

  static async bulkSoftDelete(tenantId: string, ids: string[]): Promise<number> {
    const r = await prisma.document.updateMany({
      where: { id: { in: ids }, tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return r.count;
  }

  static async bulkMove(
    tenantId: string,
    ids: string[],
    folderId: string | null
  ): Promise<number> {
    // Mismo hueco que `create`: el destino tiene que ser de este negocio. 0 = nada movido.
    if (folderId && !(await carpetaEsDelNegocio(tenantId, folderId))) return 0;
    const r = await prisma.document.updateMany({
      where: { id: { in: ids }, tenantId, deletedAt: null },
      data: { folderId },
    });
    return r.count;
  }

  /** Saca varios de la papelera de una (contraparte de `bulkSoftDelete`). */
  static async bulkRestore(tenantId: string, ids: string[]): Promise<number> {
    const r = await prisma.document.updateMany({
      where: { id: { in: ids }, tenantId, deletedAt: { not: null } },
      data: { deletedAt: null },
    });
    return r.count;
  }

  /**
   * Rutas en el storage de varios documentos y de TODAS sus versiones, para
   * poder vaciar la papelera sin dejar los archivos huérfanos ocupando espacio.
   *
   * Sólo mira documentos que ya están en la papelera: vaciarla no puede
   * llevarse por delante un archivo activo aunque venga su id en la lista.
   */
  static async storagePathsOfDeleted(
    tenantId: string,
    ids: string[]
  ): Promise<{ ids: string[]; paths: string[] }> {
    const docs = await prisma.document.findMany({
      where: { id: { in: ids }, tenantId, deletedAt: { not: null } },
      select: { id: true, storagePath: true },
    });
    if (docs.length === 0) return { ids: [], paths: [] };
    const versiones = await prisma.documentVersion.findMany({
      where: { documentId: { in: docs.map((d) => d.id) } },
      select: { storagePath: true },
    });
    return {
      ids: docs.map((d) => d.id),
      paths: [...docs.map((d) => d.storagePath), ...versiones.map((v) => v.storagePath)],
    };
  }

  /** Ids de la papelera, de a tandas: "vaciar" no puede cargar 10.000 de golpe. */
  static async idsEnPapelera(tenantId: string, limite: number): Promise<string[]> {
    const docs = await prisma.document.findMany({
      where: { tenantId, deletedAt: { not: null } },
      orderBy: { deletedAt: "asc" },
      select: { id: true },
      take: limite,
    });
    return docs.map((d) => d.id);
  }

  /**
   * Tenants que tienen algo pasado de plazo en la papelera.
   *
   * Método de PLATAFORMA (sin tenantId): lo usa el cron de retención para saber
   * a quién visitar. La purga en sí se hace tenant por tenant con los métodos
   * de siempre, así que el aislamiento no se relaja.
   */
  static async tenantsConPapeleraVencida(corte: Date): Promise<string[]> {
    const filas = await prisma.document.findMany({
      where: { deletedAt: { not: null, lt: corte } },
      select: { tenantId: true },
      distinct: ["tenantId"],
    });
    return filas.map((f) => f.tenantId);
  }

  /** Ids de un tenant que ya cumplieron su plazo en la papelera. */
  static async idsPapeleraVencida(tenantId: string, corte: Date, limite: number): Promise<string[]> {
    const docs = await prisma.document.findMany({
      where: { tenantId, deletedAt: { not: null, lt: corte } },
      orderBy: { deletedAt: "asc" },
      select: { id: true },
      take: limite,
    });
    return docs.map((d) => d.id);
  }

  /** Cuántos quedan en la papelera (para saber si hay que seguir vaciando). */
  static async contarPapelera(tenantId: string): Promise<number> {
    return prisma.document.count({ where: { tenantId, deletedAt: { not: null } } });
  }

  /** Borra de verdad (sin vuelta) los documentos ya en la papelera. */
  static async bulkHardDelete(tenantId: string, ids: string[]): Promise<number> {
    const r = await prisma.document.deleteMany({
      where: { id: { in: ids }, tenantId, deletedAt: { not: null } },
    });
    return r.count;
  }

  /** Favorito para varios de una (era un `update` por id: N viajes a la base). */
  static async bulkSetFavorite(
    tenantId: string,
    ids: string[],
    favorite: boolean
  ): Promise<number> {
    const r = await prisma.document.updateMany({
      where: { id: { in: ids }, tenantId, deletedAt: null },
      data: { favorite },
    });
    return r.count;
  }

  /** Mismo estado para varios de una (revisar una pila de boletas en un clic). */
  static async bulkSetStatus(
    tenantId: string,
    ids: string[],
    status: string
  ): Promise<number> {
    const r = await prisma.document.updateMany({
      where: { id: { in: ids }, tenantId, deletedAt: null },
      data: { status },
    });
    return r.count;
  }

  static async bulkAddTag(
    tenantId: string,
    ids: string[],
    tag: string
  ): Promise<number> {
    // Sin lowercase: el PATCH de un documento individual preserva el case tal
    // como lo tipeó el usuario (por eso la taxonomía real tiene "GTF"/"SERFOR"
    // en mayúsculas) — forzarlo acá creaba un tag hermano en minúsculas cada
    // vez que se elegía uno YA existente desde la lista en vez de tipearlo.
    const tagN = tag.trim();
    if (!tagN) return 0;
    const docs = await prisma.document.findMany({
      where: { id: { in: ids }, tenantId, deletedAt: null },
      select: { id: true, tags: true },
    });
    // Batch: updates independientes en paralelo (era N+1 secuencial).
    const toUpdate = docs.filter((d) => !d.tags.includes(tagN));
    await Promise.all(
      toUpdate.map((d) =>
        prisma.document.update({ where: { id: d.id }, data: { tags: [...d.tags, tagN] } }),
      ),
    );
    return toUpdate.length;
  }

  /** Etiquetas del tenant con conteo (solo docs activos), ordenadas por uso. */
  static async listTags(tenantId: string, viewerRole?: string): Promise<{ tag: string; count: number }[]> {
    const todos = await prisma.document.findMany({
      where: { tenantId, deletedAt: null },
      select: { tags: true, folderId: true, allowedRoles: true },
    });
    // Las etiquetas de un papel restringido también lo describen («despido-juan»).
    const docs = filtraPorRol(viewerRole) ? await soloVisibles(tenantId, todos, viewerRole) : todos;
    const counts = new Map<string, number>();
    for (const d of docs) for (const t of d.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return Array.from(counts, ([tag, count]) => ({ tag, count })).sort(
      (a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "es"),
    );
  }

  /** Renombra/fusiona una etiqueta en todos los docs (dedupe si el destino ya existe). */
  static async renameTag(tenantId: string, from: string, to: string, viewerRole?: string): Promise<number> {
    const toN = to.trim().toLowerCase();
    if (!toN || toN === from) return 0;
    const todos = await prisma.document.findMany({
      where: { tenantId, deletedAt: null, tags: { has: from } },
      select: { id: true, tags: true, folderId: true, allowedRoles: true },
    });
    // Un rol restringido sólo re-etiqueta lo que ve.
    const docs = filtraPorRol(viewerRole) ? await soloVisibles(tenantId, todos, viewerRole) : todos;
    await Promise.all(
      docs.map((d) => {
        const next = Array.from(new Set(d.tags.map((t) => (t === from ? toN : t))));
        return prisma.document.update({ where: { id: d.id }, data: { tags: next } });
      }),
    );
    return docs.length;
  }

  /** Elimina una etiqueta de todos los docs del tenant. */
  static async deleteTag(tenantId: string, tag: string, viewerRole?: string): Promise<number> {
    const todos = await prisma.document.findMany({
      where: { tenantId, deletedAt: null, tags: { has: tag } },
      select: { id: true, tags: true, folderId: true, allowedRoles: true },
    });
    const docs = filtraPorRol(viewerRole) ? await soloVisibles(tenantId, todos, viewerRole) : todos;
    await Promise.all(
      docs.map((d) =>
        prisma.document.update({ where: { id: d.id }, data: { tags: d.tags.filter((t) => t !== tag) } }),
      ),
    );
    return docs.length;
  }

  // ── Folders ────────────────────────────────────────────────────────────────

  static async listFolders(tenantId: string, viewerRole?: string): Promise<DbDocumentFolder[]> {
    const folders = await prisma.documentFolder.findMany({
      where: { tenantId },
      orderBy: [{ name: "asc" }],
      include: {
        _count: { select: { documents: { where: { deletedAt: null } } } },
      },
    });
    if (!filtraPorRol(viewerRole)) return folders.map(mapFolder);
    // Una carpeta que el rol no ve no aparece en el árbol (ni su nombre). Con
    // la cadena entera, si ve una hija ve también a todas sus madres.
    const mapa = new Map(folders.map((f) => [f.id, { parentId: f.parentId ?? null, allowedRoles: f.allowedRoles ?? [] }]));
    return folders
      .filter((f) => canRoleSeeEnCadena(viewerRole, [], rolesDeLaCadena(f.id, mapa)))
      .map(mapFolder);
  }

  static async createFolder(
    tenantId: string,
    input: {
      name: string;
      parentId?: string | null;
      color?: string;
      icon?: string;
      allowedRoles?: string[];
    },
    viewerRole?: string
  ): Promise<DbDocumentFolder> {
    // El padre tiene que ser de este negocio (mismo hueco que el `folderId` de
    // un documento) y, para un rol restringido, una carpeta que VE: si no, 404
    // igual que una que no existe.
    let rolesDelPadre: string[] = [];
    if (input.parentId) {
      const padre = await prisma.documentFolder.findFirst({
        where: { id: input.parentId, tenantId },
        select: { allowedRoles: true },
      });
      if (!padre) throw new CarpetaAjenaError(input.parentId);
      if (filtraPorRol(viewerRole) && !(await this.accesoACarpeta(tenantId, input.parentId, viewerRole)).ve) {
        throw new CarpetaAjenaError(input.parentId);
      }
      rolesDelPadre = padre.allowedRoles ?? [];
    }
    const f = await prisma.documentFolder.create({
      data: {
        tenantId,
        name: input.name,
        parentId: input.parentId ?? null,
        color: input.color ?? null,
        icon: input.icon ?? null,
        // Hereda los roles de la madre si no se mandan: una subcarpeta nueva
        // adentro de «solo admin» nace «solo admin» y el candado se ve en la UI.
        allowedRoles: input.allowedRoles ?? rolesDelPadre,
      },
      include: { _count: { select: { documents: true } } },
    });
    return mapFolder(f);
  }

  /**
   * Crea de un saque el árbol de carpetas de un import ("Contratos/2026/…").
   *
   * Por qué en una sola llamada y no una por carpeta: subir una carpeta con 30
   * subcarpetas eran 30 requests, y el rate limit del panel (20 cada 5 min)
   * cortaba el import por la mitad, dejando medio árbol creado.
   *
   * Es IDEMPOTENTE: si la carpeta ya existe bajo ese padre (mismo nombre, sin
   * distinguir mayúsculas) se reusa. Reimportar fusiona, no duplica.
   *
   * @param rutas rutas relativas al destino, con "/" — "Contratos/2026".
   * @returns el id de cada ruta (incluidas las intermedias) y cuántas se crearon.
   */
  static async createFolderTree(
    tenantId: string,
    input: { parentId?: string | null; rutas: string[] },
    viewerRole?: string,
  ): Promise<{ idPorRuta: Record<string, string>; creadas: number }> {
    const raiz = input.parentId ?? null;
    if (raiz) {
      // El destino tiene que ser una carpeta de ESTE tenant (y una que el rol ve).
      const padre = await prisma.documentFolder.findFirst({ where: { id: raiz, tenantId }, select: { id: true } });
      if (!padre) throw new Error("parent_not_found");
      if (filtraPorRol(viewerRole) && !(await this.accesoACarpeta(tenantId, raiz, viewerRole)).ve) {
        throw new Error("parent_not_found");
      }
    }

    // Índice de lo que ya existe: (padre, nombre en minúscula) → id.
    const existentes = await prisma.documentFolder.findMany({
      where: { tenantId },
      select: { id: true, name: true, parentId: true, allowedRoles: true },
    });
    // Roles de cada carpeta: la que se crea hereda los de su madre (como `createFolder`).
    const rolesPorId = new Map(existentes.map((f) => [f.id, f.allowedRoles ?? []]));
    // Separador NUL: no puede aparecer ni en un id ni en un nombre de carpeta.
    const clave = (parentId: string | null, name: string) => `${parentId ?? ""}\u0000${name.trim().toLowerCase()}`;
    const indice = new Map(existentes.map((f) => [clave(f.parentId, f.name), f.id]));

    const idPorRuta: Record<string, string> = {};
    let creadas = 0;

    // Ordenar por profundidad garantiza que el padre se resuelva antes que el hijo.
    const ordenadas = [...new Set(input.rutas)].sort((a, b) => a.split("/").length - b.split("/").length);
    for (const ruta of ordenadas) {
      const partes = ruta.split("/").map((p) => p.trim()).filter(Boolean);
      let padreId: string | null = raiz;
      let acumulada = "";
      for (const nombre of partes) {
        acumulada = acumulada ? `${acumulada}/${nombre}` : nombre;
        const yaResuelta = idPorRuta[acumulada];
        if (yaResuelta) { padreId = yaResuelta; continue; }

        const existente = indice.get(clave(padreId, nombre));
        if (existente) {
          idPorRuta[acumulada] = existente;
          padreId = existente;
          continue;
        }
        const heredados = padreId ? rolesPorId.get(padreId) ?? [] : [];
        const creada = await prisma.documentFolder.create({
          data: { tenantId, name: nombre.slice(0, 80), parentId: padreId, allowedRoles: heredados },
          select: { id: true },
        });
        rolesPorId.set(creada.id, heredados);
        indice.set(clave(padreId, nombre), creada.id);
        idPorRuta[acumulada] = creada.id;
        padreId = creada.id;
        creadas++;
      }
    }

    return { idPorRuta, creadas };
  }

  /**
   * Nombre y peso de los documentos que ya viven en cada carpeta.
   *
   * Lo usa el importador para no volver a subir lo mismo: reimportar una
   * carpeta a la que le agregaste 3 archivos tiene que subir 3, no 300 otra vez.
   * Se pide de todas las carpetas de un tirón (una query) en vez de una por
   * carpeta. La clave "" es la raíz del drive.
   */
  static async listNamesInFolders(
    tenantId: string,
    folderIds: (string | null)[],
    viewerRole?: string,
  ): Promise<Record<string, { id: string; name: string; size: number }[]>> {
    const ids = folderIds.filter((f): f is string => typeof f === "string");
    const incluirRaiz = folderIds.includes(null);
    if (ids.length === 0 && !incluirRaiz) return {};

    const todos = await prisma.document.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(incluirRaiz && ids.length > 0
          ? { OR: [{ folderId: { in: ids } }, { folderId: null }] }
          : incluirRaiz
            ? { folderId: null }
            : { folderId: { in: ids } }),
      },
      // El id hace falta para REEMPLAZAR: sin él no se sabe a qué documento
      // subirle la versión nueva y el importador terminaba duplicando.
      select: { id: true, folderId: true, name: true, originalName: true, size: true, allowedRoles: true },
    });
    const docs = filtraPorRol(viewerRole) ? await soloVisibles(tenantId, todos, viewerRole) : todos;

    const out: Record<string, { id: string; name: string; size: number }[]> = {};
    for (const d of docs) {
      const k = d.folderId ?? "";
      (out[k] ??= []).push({ id: d.id, name: d.originalName || d.name, size: d.size });
    }
    return out;
  }

  static async updateFolder(
    tenantId: string,
    id: string,
    patch: {
      name?: string;
      parentId?: string | null;
      color?: string | null;
      icon?: string | null;
      emoji?: string | null;
      tags?: string[];
      allowedRoles?: string[];
    }
  ): Promise<DbDocumentFolder | null> {
    const existing = await prisma.documentFolder.findFirst({ where: { id, tenantId }, select: { parentId: true } });
    if (!existing) return null;
    const include = { _count: { select: { documents: true } } } as const;
    const nuevoPadre = patch.parentId;
    /* Sin padre nuevo (no se mueve, o va a la raíz) no puede haber ciclo. Con
       padre nuevo se va SIEMPRE por el candado, aunque parezca el mismo de antes:
       `existing` se leyó afuera y con 3 movimientos casi a la vez podía estar
       viejo (revisión de seguridad 04-10). */
    if (typeof nuevoPadre !== "string") {
      const f = await prisma.documentFolder.update({
        where: { id, tenantId },
        data: patch as Record<string, unknown>,
        include,
      });
      return mapFolder(f);
    }

    /* Mover de carpeta. Dos reglas, en la base y bajo un candado por negocio:
       · el padre nuevo es de ESTE negocio (antes se aceptaba cualquier id y la
         carpeta quedaba colgando del árbol de otro tenant);
       · el padre nuevo no está adentro de la carpeta que se mueve (ciclo).
       El candado es porque dos movimientos cruzados a la vez («A adentro de B» y
       «B adentro de A») pasaban cada uno su chequeo y juntos cerraban el ciclo.
       Antes esto lo miraba la ruta, fuera de la transacción y leyendo el árbol
       entero del negocio en cada PATCH. */
    const f = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`documents-carpetas:${tenantId}`}))`;
      const padre = await tx.documentFolder.count({ where: { id: nuevoPadre, tenantId } });
      if (padre === 0) throw new CarpetaAjenaError(nuevoPadre);
      // Los antepasados del padre nuevo (él incluido): si aparece la que se mueve, es un ciclo.
      const antepasados = await tx.$queryRaw<{ id: string }[]>`
        WITH RECURSIVE sube AS (
          SELECT id, "parentId", 1 AS nivel
            FROM "DocumentFolder"
           WHERE id = ${nuevoPadre} AND "tenantId" = ${tenantId}
          UNION ALL
          SELECT f.id, f."parentId", s.nivel + 1
            FROM "DocumentFolder" f
            JOIN sube s ON f.id = s."parentId"
           WHERE f."tenantId" = ${tenantId} AND s.nivel < ${MAX_NIVELES_CARPETA}
        )
        SELECT id FROM sube`;
      if (antepasados.some((a) => a.id === id)) throw new CicloDeCarpetasError(id, nuevoPadre);
      return tx.documentFolder.update({
        where: { id, tenantId },
        data: patch as Record<string, unknown>,
        include,
      });
    });
    return mapFolder(f);
  }

  /**
   * Eliminar carpetas, con o sin lo que tienen adentro.
   *
   * Por defecto la FK suelta los documentos a la raíz (`Document.folderId` es
   * ON DELETE SET NULL): borrabas una carpeta con 80 archivos y los 80
   * aparecían sueltos en el drive, que para quien la borró es "no se borró
   * nada". Con `conDocumentos` esos documentos se van antes a la PAPELERA
   * (recuperables 30 días) y recién después se borran las carpetas.
   *
   * Sólo se lleva los documentos de las carpetas que REALMENTE se borran: la
   * FK de `parentId` también es SetNull, así que una subcarpeta que no está en
   * `ids` sobrevive —sube a la raíz— y sus documentos siguen adentro. Cuando la
   * intención es el árbol completo, la UI manda los ids de todo el árbol.
   */
  static async eliminarCarpetas(
    tenantId: string,
    ids: string[],
    opciones: { conDocumentos?: boolean; viewerRole?: string } = {},
  ): Promise<{ carpetas: number; documentos: number }> {
    if (!tenantId) throw new Error("tenantId is required");
    const limpios = [...new Set(ids.filter((x) => typeof x === "string" && x.trim()))];
    if (limpios.length === 0) return { carpetas: 0, documentos: 0 };

    let documentos = 0;
    if (opciones.conDocumentos) {
      // Antes del delete: después ya no hay forma de saber qué había adentro.
      // Un rol restringido sólo manda a la papelera lo que ve; lo demás (papeles
      // con roles propios) cae a la raíz con sus roles intactos.
      const soloEstos = filtraPorRol(opciones.viewerRole)
        ? (
            await soloVisibles(
              tenantId,
              await prisma.document.findMany({
                where: { tenantId, folderId: { in: limpios }, deletedAt: null },
                select: { id: true, folderId: true, allowedRoles: true },
              }),
              opciones.viewerRole,
            )
          ).map((d) => d.id)
        : null;
      const r = await prisma.document.updateMany({
        where: { tenantId, folderId: { in: limpios }, deletedAt: null, ...(soloEstos ? { id: { in: soloEstos } } : {}) },
        data: { deletedAt: new Date() },
      });
      documentos = r.count;
    }
    /* Lo que no se fue a la papelera cae a la raíz (FK ON DELETE SET NULL, y las
       subcarpetas se van en cascada). Antes perdía la restricción de su cadena de
       carpetas y quedaba a la vista de todos los roles (security 04-10). Se le
       copia el equivalente: la intersección de sus roles propios y los de cada
       carpeta con roles; vacía = sólo roles privilegiados (`["admin"]`). */
    const mapa = await mapaDeCarpetas(tenantId);
    const seBorran = new Set(limpios.filter((id) => mapa.has(id)));
    for (let crecio = true; crecio; ) {
      crecio = false;
      for (const [id, c] of mapa) {
        if (c.parentId && seBorran.has(c.parentId) && !seBorran.has(id)) {
          seBorran.add(id);
          crecio = true;
        }
      }
    }
    const caen = seBorran.size
      ? await prisma.document.findMany({
          where: { tenantId, folderId: { in: [...seBorran] }, deletedAt: null },
          select: { id: true, folderId: true, allowedRoles: true },
        })
      : [];
    const porRoles = new Map<string, { roles: string[]; ids: string[] }>();
    for (const d of caen) {
      const cadena = rolesDeLaCadena(d.folderId, mapa);
      if (cadena.length === 0) continue;
      const propios = d.allowedRoles ?? [];
      const niveles = propios.length ? [propios, ...cadena] : cadena;
      const comunes = niveles.reduce((acc, r) => acc.filter((x) => r.includes(x)));
      const roles = comunes.length ? [...new Set(comunes)].sort() : ["admin"];
      const k = roles.join(",");
      const g = porRoles.get(k) ?? { roles, ids: [] };
      g.ids.push(d.id);
      porRoles.set(k, g);
    }
    const count = await prisma.$transaction(async (tx) => {
      for (const { roles, ids } of porRoles.values()) {
        await tx.document.updateMany({ where: { tenantId, id: { in: ids } }, data: { allowedRoles: roles } });
      }
      const r = await tx.documentFolder.deleteMany({ where: { id: { in: limpios }, tenantId } });
      return r.count;
    });
    return { carpetas: count, documentos };
  }

  static async deleteFolder(
    tenantId: string,
    id: string,
    opciones: { conDocumentos?: boolean } = {},
  ): Promise<boolean> {
    const existing = await prisma.documentFolder.findFirst({ where: { id, tenantId } });
    if (!existing) return false;
    // Sin `conDocumentos` los documentos pasan a raíz (folderId → null via ON
    // DELETE SET NULL); con él se van antes a la papelera.
    const { carpetas } = await this.eliminarCarpetas(tenantId, [id], opciones);
    return carpetas > 0;
  }

  /**
   * Acciones en lote sobre CARPETAS. Devuelve cuántas se tocaron de verdad
   * (`updateMany` filtrado por tenant: un id de otro tenant no cuenta y no
   * escribe — el aislamiento es app-level, ADR-134).
   *
   * · `emoji` / `color` — `null` LIMPIA el valor (volver al ícono por defecto).
   * · `addTags` / `removeTags` — suman o quitan sin pisar lo que ya había: con
   *   varias carpetas seleccionadas, reemplazar el array borraría las etiquetas
   *   propias de cada una.
   * · `delete` — cascada a subcarpetas (schema); los documentos van a la raíz,
   *   o a la papelera con `conDocumentos` (ver `eliminarCarpetas`).
   */
  static async bulkFolders(
    tenantId: string,
    ids: string[],
    accion:
      | { tipo: "emoji"; emoji: string | null }
      | { tipo: "color"; color: string | null }
      | { tipo: "addTags"; tags: string[] }
      | { tipo: "removeTags"; tags: string[] }
      | { tipo: "delete"; conDocumentos?: boolean },
  ): Promise<number> {
    if (!tenantId) throw new Error("tenantId is required");
    const limpios = [...new Set(ids.filter((x) => typeof x === "string" && x.trim()))];
    if (limpios.length === 0) return 0;
    const where = { id: { in: limpios }, tenantId };

    if (accion.tipo === "delete") {
      const { carpetas } = await this.eliminarCarpetas(tenantId, limpios, {
        conDocumentos: accion.conDocumentos,
      });
      return carpetas;
    }
    if (accion.tipo === "emoji") {
      const { count } = await prisma.documentFolder.updateMany({ where, data: { emoji: accion.emoji } });
      return count;
    }
    if (accion.tipo === "color") {
      const { count } = await prisma.documentFolder.updateMany({ where, data: { color: accion.color } });
      return count;
    }

    // Etiquetas: se leen las actuales y se escribe carpeta por carpeta. `updateMany`
    // no sabe hacer unión de arrays, y hacerlo con SQL crudo por una operación de
    // decenas de filas no paga la deuda de mantener el raw.
    const actuales = await prisma.documentFolder.findMany({
      where,
      select: { id: true, tags: true },
    });
    const nuevas = accion.tags.map((t) => t.trim().toLowerCase()).filter(Boolean);
    let tocadas = 0;
    for (const f of actuales) {
      const antes = f.tags ?? [];
      const despues =
        accion.tipo === "addTags"
          ? [...new Set([...antes, ...nuevas])]
          : antes.filter((t) => !nuevas.includes(t));
      // Sin cambios no se escribe: así el `updatedAt` sigue contando la última
      // vez que la carpeta cambió de verdad.
      if (antes.length === despues.length && antes.every((t, i) => t === despues[i])) continue;
      await prisma.documentFolder.update({ where: { id: f.id }, data: { tags: despues } });
      tocadas += 1;
    }
    return tocadas;
  }

  // ── Versions ───────────────────────────────────────────────────────────────

  static async listVersions(
    tenantId: string,
    documentId: string,
    viewerRole?: string
  ): Promise<DbDocumentVersion[]> {
    // Las versiones viejas son el MISMO papel: mismo permiso que el actual.
    if (!(await this.puedeVer(tenantId, documentId, viewerRole, { incluirBorrados: true }))) return [];
    const versions = await prisma.documentVersion.findMany({
      where: { documentId },
      orderBy: { versionNumber: "desc" },
    });
    return versions.map(mapVersion);
  }

  /** Una versión histórica puntual (validada por tenant + documento). */
  static async getVersion(
    tenantId: string,
    documentId: string,
    versionId: string,
    viewerRole?: string
  ): Promise<DbDocumentVersion | null> {
    if (!(await this.puedeVer(tenantId, documentId, viewerRole, { incluirBorrados: true }))) return null;
    const v = await prisma.documentVersion.findFirst({ where: { id: versionId, documentId } });
    return v ? mapVersion(v) : null;
  }

  static async addVersion(
    tenantId: string,
    documentId: string,
    input: {
      storagePath: string;
      size: number;
      mimeType: string;
      uploadedById: string;
      changeNote?: string;
    }
  ): Promise<DbDocumentVersion | null> {
    const doc = await prisma.document.findFirst({
      where: { id: documentId, tenantId, deletedAt: null },
      select: { id: true, storagePath: true, size: true, mimeType: true, uploadedById: true },
    });
    if (!doc) return null;

    // archivar versión actual antes de reemplazar
    const last = await prisma.documentVersion.findFirst({
      where: { documentId },
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true },
    });
    const nextNumber = (last?.versionNumber ?? 1) + 1;

    // Si no hay versiones, primero crear v1 con storage actual antes de v(N+1)
    if (!last) {
      await prisma.documentVersion.create({
        data: {
          documentId,
          versionNumber: 1,
          storagePath: doc.storagePath,
          size: doc.size,
          mimeType: doc.mimeType,
          uploadedById: doc.uploadedById,
          changeNote: "Versión inicial",
        },
      });
    }

    const v = await prisma.documentVersion.create({
      data: {
        documentId,
        versionNumber: last ? nextNumber : 2,
        storagePath: input.storagePath,
        size: input.size,
        mimeType: input.mimeType,
        uploadedById: input.uploadedById,
        changeNote: input.changeNote ?? null,
      },
    });

    // promover nueva como vigente
    await prisma.document.update({
      where: { id: documentId },
      data: {
        storagePath: input.storagePath,
        size: input.size,
        mimeType: input.mimeType,
      },
    });

    return mapVersion(v);
  }

  // ── Shares ─────────────────────────────────────────────────────────────────

  static async createShare(
    tenantId: string,
    documentId: string,
    input: {
      createdById: string;
      expiresInDays?: number;
      password?: string;
      /** Rol de quien lo crea: un papel que no puede abrir tampoco lo puede publicar. */
      viewerRole?: string;
    }
  ): Promise<DbDocumentShare | null> {
    if (!(await this.puedeVer(tenantId, documentId, input.viewerRole))) return null;

    const ttlDays = Math.max(1, Math.min(90, input.expiresInDays ?? 7));
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    const s = await prisma.documentShare.create({
      data: {
        documentId,
        tenantId,
        token: randomToken(24),
        expiresAt,
        password: input.password ? hashPassword(input.password) : null,
        createdById: input.createdById,
      },
    });
    return mapShare(s);
  }

  static async listShares(
    tenantId: string,
    documentId: string,
    viewerRole?: string
  ): Promise<DbDocumentShare[]> {
    if (filtraPorRol(viewerRole) && !(await this.puedeVer(tenantId, documentId, viewerRole))) return [];
    const shares = await prisma.documentShare.findMany({
      where: { documentId, tenantId },
      orderBy: { createdAt: "desc" },
    });
    return shares.map(mapShare);
  }

  static async revokeShare(tenantId: string, shareId: string, viewerRole?: string): Promise<boolean> {
    if (filtraPorRol(viewerRole)) {
      // Cortar el enlace de un papel que el rol no ve = mismo 404 que «no existe».
      const s = await prisma.documentShare.findFirst({ where: { id: shareId, tenantId }, select: { documentId: true } });
      if (!s || !(await this.puedeVer(tenantId, s.documentId, viewerRole, { incluirBorrados: true }))) return false;
    }
    const r = await prisma.documentShare.updateMany({
      where: { id: shareId, tenantId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return r.count > 0;
  }

  /**
   * Vista pública por token. NO requiere tenantId. Valida token + expiry + revoke.
   * Devuelve documento + share o null si inválido. Si hay password, no se valida acá
   * (el caller debe verificarla con verifyPassword).
   */
  static async findByShareToken(
    token: string
  ): Promise<{ doc: DbDocument; share: DbDocumentShare } | null> {
    const share = await prisma.documentShare.findUnique({
      where: { token },
      include: {
        document: {
          include: { _count: { select: { versions: true, shares: true } } },
        },
      },
    });
    if (!share) return null;
    if (share.revokedAt) return null;
    if (share.expiresAt.getTime() < Date.now()) return null;
    if (share.document.deletedAt) return null;
    // Un papel restringido sólo sigue publicado si quien sacó el enlace lo
    // puede ver HOY (ver `enlaceSigueSirviendo`). Lo que no tiene roles no paga
    // ninguna consulta extra.
    const propios = share.document.allowedRoles ?? [];
    const cadena = share.document.folderId
      ? rolesDeLaCadena(share.document.folderId, await mapaDeCarpetas(share.tenantId))
      : [];
    if (estaRestringido(propios, cadena)) {
      const rol = await rolDelCreador(share.tenantId, share.createdById);
      if (!enlaceSigueSirviendo(rol, propios, cadena)) return null;
    }
    return { doc: mapDoc(share.document), share: mapShare(share) };
  }

  static verifySharePassword(stored: string | null, attempt: string): boolean {
    if (!stored) return true; // no password
    return hashPassword(attempt) === stored;
  }

  /**
   * Devuelve el password hash crudo del share (solo si existe).
   * Uso interno para validar contraseña sin exponerla en findByShareToken.
   */
  static async getShareRawPassword(token: string): Promise<string | null> {
    const share = await prisma.documentShare.findUnique({
      where: { token },
      select: { password: true },
    });
    return share?.password ?? null;
  }

  static async incrementShareAccess(shareId: string): Promise<void> {
    await prisma.documentShare.update({
      where: { id: shareId },
      data: { accessCount: { increment: 1 }, lastAccessAt: new Date() },
    });
  }

  // ── Folder shares (compartir carpeta completa) ──────────────────────────────

  static async createFolderShare(
    tenantId: string,
    folderId: string,
    input: { createdById: string; expiresInDays?: number; password?: string }
  ): Promise<{ token: string; expiresAt: string; hasPassword: boolean } | null> {
    const folder = await prisma.documentFolder.findFirst({
      where: { id: folderId, tenantId },
      select: { id: true },
    });
    if (!folder) return null;
    const ttlDays = Math.max(1, Math.min(90, input.expiresInDays ?? 30));
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
    const s = await prisma.documentFolderShare.create({
      data: {
        folderId,
        tenantId,
        token: randomToken(24),
        expiresAt,
        password: input.password ? hashPassword(input.password) : null,
        createdById: input.createdById,
      },
    });
    return { token: s.token, expiresAt: s.expiresAt.toISOString(), hasPassword: !!s.password };
  }

  /**
   * Hash de la clave de un enlace de carpeta (null si no tiene). Lo usan TODAS
   * las rutas públicas de la carpeta — la del listado y la que sirve cada
   * archivo: validar sólo el listado dejaría la clave de adorno, porque con el
   * id del documento se bajaría igual.
   */
  static async getFolderShareRawPassword(token: string): Promise<string | null> {
    const share = await prisma.documentFolderShare.findUnique({
      where: { token },
      select: { password: true },
    });
    return share?.password ?? null;
  }

  /**
   * Vista pública por token de carpeta. Valida token + expiry + revoke. Devuelve la
   * carpeta + sus documentos directos (no borrados). NO requiere tenantId.
   */
  static async findByFolderShareToken(token: string): Promise<{
    folder: { id: string; name: string };
    docs: { id: string; name: string; mimeType: string; size: number; uploadedAt: string }[];
    expiresAt: string;
    hasPassword: boolean;
  } | null> {
    const share = await prisma.documentFolderShare.findUnique({
      where: { token },
      include: { folder: { select: { id: true, name: true } } },
    });
    if (!share || share.revokedAt || share.expiresAt.getTime() < Date.now()) return null;
    const visibles = await this.docsDelEnlaceDeCarpeta(share);
    if (!visibles) return null;
    const docs = await prisma.document.findMany({
      where: { id: { in: visibles }, tenantId: share.tenantId, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, mimeType: true, size: true, uploadedAt: true },
    });
    return {
      folder: { id: share.folder.id, name: share.folder.name },
      docs: docs.map((d) => ({ id: d.id, name: d.name, mimeType: d.mimeType, size: d.size, uploadedAt: d.uploadedAt.toISOString() })),
      expiresAt: share.expiresAt.toISOString(),
      hasPassword: !!share.password,
    };
  }

  /**
   * Ids de los documentos directos que un enlace de carpeta puede servir, o
   * null si la carpeta entera ya no se sirve. Misma regla que un enlace de
   * documento: lo restringido (la carpeta, su cadena o el doc) sólo si quien
   * creó el enlace lo ve hoy. Desde el 04-10 sólo un rol privilegiado crea
   * enlaces de carpeta; esto cubre los que se sacaron antes.
   */
  private static async docsDelEnlaceDeCarpeta(share: {
    folderId: string;
    tenantId: string;
    createdById: string;
  }): Promise<string[] | null> {
    const filas = await prisma.document.findMany({
      where: { folderId: share.folderId, tenantId: share.tenantId, deletedAt: null },
      select: { id: true, allowedRoles: true },
    });
    const cadena = rolesDeLaCadena(share.folderId, await mapaDeCarpetas(share.tenantId));
    const hayRestringido = cadena.length > 0 || filas.some((d) => (d.allowedRoles ?? []).length > 0);
    if (!hayRestringido) return filas.map((d) => d.id);
    const rol = await rolDelCreador(share.tenantId, share.createdById);
    if (cadena.length > 0 && !enlaceSigueSirviendo(rol, [], cadena)) return null;
    return filas.filter((d) => enlaceSigueSirviendo(rol, d.allowedRoles ?? [], cadena)).map((d) => d.id);
  }

  /** storagePath de un doc dentro de una carpeta compartida (valida pertenencia y permisos). */
  static async getFolderShareDocPath(
    token: string,
    docId: string
  ): Promise<{ storagePath: string; mimeType: string; name: string } | null> {
    const share = await prisma.documentFolderShare.findUnique({
      where: { token },
      select: { folderId: true, tenantId: true, revokedAt: true, expiresAt: true, createdById: true },
    });
    if (!share || share.revokedAt || share.expiresAt.getTime() < Date.now()) return null;
    const visibles = await this.docsDelEnlaceDeCarpeta(share);
    if (!visibles?.includes(docId)) return null;
    const doc = await prisma.document.findFirst({
      where: { id: docId, folderId: share.folderId, tenantId: share.tenantId, deletedAt: null },
      select: { storagePath: true, mimeType: true, name: true },
    });
    return doc ? { storagePath: doc.storagePath, mimeType: doc.mimeType, name: doc.name } : null;
  }

  static async incrementFolderShareAccess(token: string): Promise<void> {
    // `token` es @unique → update directo (no updateMany, que exigiría tenantId).
    await prisma.documentFolderShare.update({
      where: { token },
      data: { accessCount: { increment: 1 }, lastAccessAt: new Date() },
    });
  }

  static async revokeFolderShare(tenantId: string, shareId: string): Promise<boolean> {
    const r = await prisma.documentFolderShare.updateMany({
      where: { id: shareId, tenantId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return r.count > 0;
  }

  // ── Centro de enlaces (documentos + carpetas en una sola lista) ─────────────

  /**
   * Todos los enlaces públicos del tenant, de documentos y de carpetas, en una
   * lista única ordenada por fecha de creación. El token viaja completo porque
   * el admin necesita poder copiar el enlace para reenviarlo.
   */
  static async listTenantShares(
    tenantId: string,
    opts: { limit?: number } = {}
  ): Promise<DbSharedLink[]> {
    const take = Math.max(1, Math.min(500, opts.limit ?? 200));

    const [docShares, folderShares] = await Promise.all([
      prisma.documentShare.findMany({
        where: { tenantId, document: { deletedAt: null } },
        include: { document: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
        take,
      }),
      prisma.documentFolderShare.findMany({
        where: { tenantId },
        include: { folder: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
        take,
      }),
    ]);

    const links: DbSharedLink[] = [
      ...docShares.map((s) => ({
        id: s.id,
        kind: "doc" as const,
        targetId: s.document.id,
        targetName: s.document.name,
        token: s.token,
        expiresAt: toISOReq(s.expiresAt),
        hasPassword: !!s.password,
        createdById: s.createdById,
        createdAt: toISOReq(s.createdAt),
        accessCount: s.accessCount,
        lastAccessAt: toISO(s.lastAccessAt),
        revokedAt: toISO(s.revokedAt),
      })),
      ...folderShares.map((s) => ({
        id: s.id,
        kind: "folder" as const,
        targetId: s.folder.id,
        targetName: s.folder.name,
        token: s.token,
        expiresAt: toISOReq(s.expiresAt),
        hasPassword: !!s.password,
        createdById: s.createdById,
        createdAt: toISOReq(s.createdAt),
        accessCount: s.accessCount,
        lastAccessAt: toISO(s.lastAccessAt),
        revokedAt: toISO(s.revokedAt),
      })),
    ];

    return links
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, take);
  }

  /**
   * Documentos que parecen repetidos, agrupados.
   *
   * El criterio barato y certero para el caso real (la misma carpeta importada
   * dos veces, o el mismo adjunto subido por dos personas) es **mismo peso
   * exacto + mismo nombre base**. Dos archivos distintos casi nunca coinciden
   * al byte; y comparar el contenido de todo el drive sería bajarlo entero.
   * Quien decida borrar puede pedir la comparación real (`hashDeDocumentos`).
   */
  static async gruposDuplicados(
    tenantId: string,
    opts: { minBytes?: number; viewerRole?: string } = {}
  ): Promise<{ clave: string; nombre: string; size: number; docs: DbDocument[] }[]> {
    // Un archivo vacío o minúsculo (un .txt de 12 bytes) coincide con cualquier
    // otro igual de chico sin ser el mismo: no vale la pena mirarlos.
    const minBytes = opts.minBytes ?? 1024;

    const todos = await prisma.document.findMany({
      where: { tenantId, deletedAt: null, size: { gte: minBytes } },
      orderBy: { uploadedAt: "desc" },
      include: { _count: { select: { versions: true, shares: true } } },
    });
    // Sólo los que el rol ve: el listado devuelve el documento entero (OCR incluido).
    const docs = filtraPorRol(opts.viewerRole) ? await soloVisibles(tenantId, todos, opts.viewerRole) : todos;

    /** "informe final.pdf" y "informe final (1).pdf" son el mismo documento. */
    const nombreBase = (n: string) =>
      n.toLowerCase()
        .replace(/\.[^.]+$/, "")
        .replace(/[ _-]*\(\d+\)$/, "")
        .replace(/[ _-]*(copia|copy)\s*\d*$/, "")
        .trim();

    const grupos = new Map<string, { clave: string; nombre: string; size: number; docs: DbDocument[] }>();
    for (const d of docs) {
      const clave = `${d.size}:${nombreBase(d.name)}`;
      const g = grupos.get(clave);
      if (g) g.docs.push(mapDoc(d));
      else grupos.set(clave, { clave, nombre: d.name, size: d.size, docs: [mapDoc(d)] });
    }

    return [...grupos.values()]
      .filter((g) => g.docs.length > 1)
      // Primero donde más espacio se recupera.
      .sort((a, b) => b.size * (b.docs.length - 1) - a.size * (a.docs.length - 1));
  }

  /** storagePath de varios documentos (para comparar su contenido de verdad). */
  static async rutasDe(tenantId: string, ids: string[], viewerRole?: string): Promise<{ id: string; storagePath: string }[]> {
    const permitidos = await this.idsVisibles(tenantId, ids, viewerRole);
    const docs = await prisma.document.findMany({
      where: { id: { in: permitidos }, tenantId, deletedAt: null },
      select: { id: true, storagePath: true },
    });
    return docs;
  }

  /** Revoca de una sola vez todos los enlaces vivos del tenant (botón de pánico). */
  static async revokeAllShares(tenantId: string): Promise<number> {
    const [docs, folders] = await Promise.all([
      prisma.documentShare.updateMany({
        where: { tenantId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      prisma.documentFolderShare.updateMany({
        where: { tenantId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return docs.count + folders.count;
  }

  // ── Audit log ──────────────────────────────────────────────────────────────

  static async log(
    tenantId: string,
    input: {
      documentId: string;
      actorId: string;
      action: DocAction;
      metadata?: Record<string, unknown>;
      ipAddress?: string;
    }
  ): Promise<void> {
    try {
      await prisma.documentAuditLog.create({
        data: {
          documentId: input.documentId,
          tenantId,
          actorId: input.actorId,
          action: input.action,
          metadata: (input.metadata as unknown as object) ?? undefined,
          ipAddress: input.ipAddress ?? null,
        },
      });
    } catch (err) {
      logger.warn("documents.audit.fail", { err: String(err) });
    }
  }

  /**
   * Una entrada de auditoría por documento, en UN solo insert.
   *
   * La acción en lote hacía un `create` por id: 500 documentos eran 500 viajes
   * a la base, y cada fila se guardaba la lista COMPLETA de ids en su metadata
   * (500 filas × 500 ids). El detalle compartido va una vez en `metadata`; el
   * id propio ya está en su columna.
   *
   * Filtra a los documentos que existen en el tenant porque `documentId` es
   * una FK: un id inventado tumbaría el `createMany` entero, mientras que los
   * `create` sueltos solo perdían esa fila.
   */
  static async logMany(
    tenantId: string,
    documentIds: string[],
    input: {
      actorId: string;
      action: DocAction;
      metadata?: Record<string, unknown>;
      ipAddress?: string;
    }
  ): Promise<void> {
    if (documentIds.length === 0) return;
    try {
      const existentes = await prisma.document.findMany({
        where: { id: { in: documentIds }, tenantId },
        select: { id: true },
      });
      if (existentes.length === 0) return;
      await prisma.documentAuditLog.createMany({
        data: existentes.map((d) => ({
          documentId: d.id,
          tenantId,
          actorId: input.actorId,
          action: input.action,
          metadata: (input.metadata as unknown as object) ?? undefined,
          ipAddress: input.ipAddress ?? null,
        })),
      });
    } catch (err) {
      logger.warn("documents.audit.fail", { err: String(err) });
    }
  }

  static async listAudit(
    tenantId: string,
    documentId: string,
    limit = 100,
    viewerRole?: string
  ): Promise<DbDocumentAuditLog[]> {
    if (!(await this.puedeVer(tenantId, documentId, viewerRole, { incluirBorrados: true }))) return [];
    const logs = await prisma.documentAuditLog.findMany({
      where: { documentId, tenantId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return logs.map(mapAuditLog);
  }

  /** Feed de actividad global del tenant (cross-documento), con nombre del doc. */
  static async recentActivity(tenantId: string, limit = 40, viewerRole?: string): Promise<DbDocumentActivity[]> {
    const take = Math.min(200, Math.max(1, limit));
    const todos = await prisma.documentAuditLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take,
      include: { document: { select: { name: true, deletedAt: true, folderId: true, allowedRoles: true } } },
    });
    // El feed muestra el NOMBRE del papel: sin filtrar, el cajero leía «Despido
    // de Juan.pdf» aunque no pudiera abrirlo. Las filas sin documento quedan.
    let logs = todos;
    if (filtraPorRol(viewerRole)) {
      const mapa = await mapaDeCarpetas(tenantId);
      logs = todos.filter(
        (a) =>
          !a.document ||
          canRoleSeeEnCadena(viewerRole, a.document.allowedRoles ?? [], rolesDeLaCadena(a.document.folderId, mapa)),
      );
    }
    return logs.map((a) => ({
      id: a.id,
      documentId: a.documentId,
      documentName: a.document?.name ?? "(documento eliminado)",
      documentDeleted: !!a.document?.deletedAt,
      actorId: a.actorId,
      action: a.action as DocAction,
      createdAt: a.createdAt.toISOString(),
    }));
  }

  // ── Templates ──────────────────────────────────────────────────────────────

  static async listTemplates(tenantId: string): Promise<DbDocumentTemplate[]> {
    const templates = await prisma.documentTemplate.findMany({
      where: { OR: [{ tenantId: null, isSystem: true }, { tenantId }] },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    });
    return templates.map(mapTemplate);
  }

  static async getTemplate(
    tenantId: string,
    key: string
  ): Promise<DbDocumentTemplate | null> {
    const t = await prisma.documentTemplate.findFirst({
      where: {
        OR: [
          { key, tenantId: null, isSystem: true },
          { key, tenantId },
        ],
      },
    });
    return t ? mapTemplate(t) : null;
  }
}
