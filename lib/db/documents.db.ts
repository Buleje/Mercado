import "server-only";
import { randomBytes, createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
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
  DbDocumentAuditLog,
  DbDocumentTemplate,
  DocAction,
  DocumentListFilters,
  TemplateField,
} from "@/lib/types/documents";

// ── Helpers ───────────────────────────────────────────────────────────────────

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
    expiresAt: toISO(d.expiresAt),
    customerId: d.customerId,
    orderId: d.orderId,
    supplierId: d.supplierId,
    ocrText: d.ocrText,
    ocrMetadata: (d.ocrMetadata as Record<string, unknown> | null) ?? null,
    aiCategory: d.aiCategory,
    aiTags: d.aiTags,
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

// ── DocumentsDB class ─────────────────────────────────────────────────────────

export class DocumentsDB {
  // ── Documents ──────────────────────────────────────────────────────────────

  static async list(
    tenantId: string,
    filters: DocumentListFilters = {}
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

    if (filters.q?.trim()) {
      const q = filters.q.trim();
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { originalName: { contains: q, mode: "insensitive" } },
        { ocrText: { contains: q, mode: "insensitive" } },
        { tags: { hasSome: [q.toLowerCase()] } },
      ];
    } else if (filters.qAny?.length) {
      // ADR-119 — búsqueda semántica: cualquier término matchea.
      const terms = filters.qAny.filter((t) => t.trim().length > 1).slice(0, 12);
      where.OR = terms.flatMap((t) => [
        { name: { contains: t, mode: "insensitive" } },
        { originalName: { contains: t, mode: "insensitive" } },
        { ocrText: { contains: t, mode: "insensitive" } },
        { tags: { hasSome: [t.toLowerCase()] } },
      ]);
    }

    const docs = await prisma.document.findMany({
      where,
      orderBy: [{ favorite: "desc" }, { uploadedAt: "desc" }],
      include: { _count: { select: { versions: true, shares: true } } },
      take: 500,
    });
    return docs.map(mapDoc);
  }

  static async getById(tenantId: string, id: string): Promise<DbDocument | null> {
    const doc = await prisma.document.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { _count: { select: { versions: true, shares: true } } },
    });
    return doc ? mapDoc(doc) : null;
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
    }
  ): Promise<DbDocument> {
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
      folderId?: string | null;
      category?: string;
      tags?: string[];
      favorite?: boolean;
      expiresAt?: Date | null;
      customerId?: string | null;
      orderId?: string | null;
      supplierId?: string | null;
      ocrText?: string;
      ocrMetadata?: Record<string, unknown>;
      aiCategory?: string;
      aiTags?: string[];
    }
  ): Promise<DbDocument | null> {
    const existing = await prisma.document.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!existing) return null;

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
    withinDays = 30
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
    return docs.map(mapDoc);
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
   * ADR-119 — usado por el cron. Trae documentos que vencen dentro de la
   * ventana y aún no recibieron aviso (o cuyo aviso quedó obsoleto). Cross-
   * tenant: el caller agrupa por tenantId para resolver el teléfono destino.
   */
  static async listPendingExpiryReminders(
    withinDays: number
  ): Promise<DbDocument[]> {
    const limit = new Date();
    limit.setDate(limit.getDate() + withinDays);
    const docs = await prisma.document.findMany({
      where: {
        deletedAt: null,
        expiresAt: { not: null, lte: limit, gte: new Date(Date.now() - 86400000) },
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

  static async restore(tenantId: string, id: string): Promise<boolean> {
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
    const r = await prisma.document.updateMany({
      where: { id: { in: ids }, tenantId, deletedAt: null },
      data: { folderId },
    });
    return r.count;
  }

  static async bulkAddTag(
    tenantId: string,
    ids: string[],
    tag: string
  ): Promise<number> {
    const tagN = tag.trim().toLowerCase();
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

  // ── Folders ────────────────────────────────────────────────────────────────

  static async listFolders(tenantId: string): Promise<DbDocumentFolder[]> {
    const folders = await prisma.documentFolder.findMany({
      where: { tenantId },
      orderBy: [{ name: "asc" }],
      include: {
        _count: { select: { documents: { where: { deletedAt: null } } } },
      },
    });
    return folders.map(mapFolder);
  }

  static async createFolder(
    tenantId: string,
    input: {
      name: string;
      parentId?: string | null;
      color?: string;
      icon?: string;
    }
  ): Promise<DbDocumentFolder> {
    const f = await prisma.documentFolder.create({
      data: {
        tenantId,
        name: input.name,
        parentId: input.parentId ?? null,
        color: input.color ?? null,
        icon: input.icon ?? null,
      },
      include: { _count: { select: { documents: true } } },
    });
    return mapFolder(f);
  }

  static async updateFolder(
    tenantId: string,
    id: string,
    patch: { name?: string; parentId?: string | null; color?: string; icon?: string }
  ): Promise<DbDocumentFolder | null> {
    const existing = await prisma.documentFolder.findFirst({ where: { id, tenantId } });
    if (!existing) return null;
    const f = await prisma.documentFolder.update({
      where: { id },
      data: patch as Record<string, unknown>,
      include: { _count: { select: { documents: true } } },
    });
    return mapFolder(f);
  }

  static async deleteFolder(tenantId: string, id: string): Promise<boolean> {
    const existing = await prisma.documentFolder.findFirst({ where: { id, tenantId } });
    if (!existing) return false;
    // documentos pasan a raíz (folderId → null via ON DELETE SET NULL)
    await prisma.documentFolder.delete({ where: { id } });
    return true;
  }

  // ── Versions ───────────────────────────────────────────────────────────────

  static async listVersions(
    tenantId: string,
    documentId: string
  ): Promise<DbDocumentVersion[]> {
    const doc = await prisma.document.findFirst({
      where: { id: documentId, tenantId },
      select: { id: true },
    });
    if (!doc) return [];
    const versions = await prisma.documentVersion.findMany({
      where: { documentId },
      orderBy: { versionNumber: "desc" },
    });
    return versions.map(mapVersion);
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
    }
  ): Promise<DbDocumentShare | null> {
    const doc = await prisma.document.findFirst({
      where: { id: documentId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!doc) return null;

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
    documentId: string
  ): Promise<DbDocumentShare[]> {
    const shares = await prisma.documentShare.findMany({
      where: { documentId, tenantId },
      orderBy: { createdAt: "desc" },
    });
    return shares.map(mapShare);
  }

  static async revokeShare(tenantId: string, shareId: string): Promise<boolean> {
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

  static async listAudit(
    tenantId: string,
    documentId: string,
    limit = 100
  ): Promise<DbDocumentAuditLog[]> {
    const doc = await prisma.document.findFirst({
      where: { id: documentId, tenantId },
      select: { id: true },
    });
    if (!doc) return [];
    const logs = await prisma.documentAuditLog.findMany({
      where: { documentId, tenantId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return logs.map(mapAuditLog);
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
