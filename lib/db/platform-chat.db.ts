import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { logSuperadminAction } from "@/lib/audit/superadmin-audit";

/**
 * lib/db/platform-chat.db.ts — Messenger Plataforma ↔ Tenants (ADR-132).
 *
 * Conversaciones bidireccionales entre el superadmin (plataforma) y los dueños
 * de tenants. Modelo dedicado (PlatformConversation/PlatformMessage), NO
 * ConversationThread (ese es buyer↔seller).
 *
 * Patrón raw SQL (igual que chat.db.ts / ADR-011):
 *   - $queryRawUnsafe / $executeRawUnsafe con parámetros posicionales ($1 $2)
 *   - NUNCA string interpolation (anti-SQLi)
 *   - Cache getOrSet (TTL corto, chat es dinámico) + invalidateByPrefix tras writes
 *   - El superadmin opera cross-tenant (es plataforma). Las lecturas del LADO
 *     TENANT filtran SIEMPRE por tenantId y jamás devuelven notas internas.
 */

const CACHE_PREFIX = "platform-chat";

export type PlatformSenderType = "platform" | "tenant" | "system";
export type PlatformConvStatus = "open" | "closed" | "archived";
export type PlatformPriority = "low" | "medium" | "high";
export type PlatformMessageType =
  | "text"
  | "image"
  | "broadcast"
  | "note"
  | "system_event";

export type DbPlatformConversation = {
  id: string;
  tenantId: string;
  tenantName: string;
  subject: string | null;
  status: PlatformConvStatus;
  priority: PlatformPriority;
  assignedTo: string | null;
  labels: string[];
  unreadForPlatform: number;
  unreadForTenant: number;
  lastMessageAt: Date | null;
  lastMessageText: string | null;
  lastSenderType: PlatformSenderType | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export type DbPlatformMessage = {
  id: string;
  conversationId: string;
  tenantId: string;
  senderType: PlatformSenderType;
  senderName: string;
  senderId: string | null;
  body: string;
  messageType: PlatformMessageType;
  attachmentUrl: string | null;
  isInternalNote: boolean;
  metadataJson: string | null;
  readByPlatformAt: Date | null;
  readByTenantAt: Date | null;
  createdAt: Date;
};

type RawConv = Omit<DbPlatformConversation, "labels"> & { labelsJson: string | null };

function mapConv(r: RawConv): DbPlatformConversation {
  let labels: string[] = [];
  if (r.labelsJson) {
    try {
      const parsed = JSON.parse(r.labelsJson);
      if (Array.isArray(parsed)) labels = parsed.filter((x): x is string => typeof x === "string");
    } catch {
      /* labels corruptas → vacío */
    }
  }
  const { labelsJson: _omit, ...rest } = r;
  void _omit;
  return { ...rest, labels };
}

const CONV_COLS = `
  id, "tenantId", "tenantName", subject, status, priority, "assignedTo",
  "labelsJson", "unreadForPlatform", "unreadForTenant", "lastMessageAt",
  "lastMessageText", "lastSenderType", "createdBy", "createdAt", "updatedAt"
`;

export class PlatformChatDB {
  // ──────────────────────────────────────────────────────────────────────────
  // LADO SUPERADMIN (cross-tenant)
  // ──────────────────────────────────────────────────────────────────────────

  /** Lista conversaciones con filtros de triage (status, asignado, etiqueta, búsqueda). */
  static async listConversations(filters: {
    status?: PlatformConvStatus;
    assignedTo?: string;
    label?: string;
    search?: string;
    limit?: number;
  } = {}): Promise<DbPlatformConversation[]> {
    const limit = Math.min(filters.limit ?? 100, 300);
    const cacheKey = `${CACHE_PREFIX}:list:${JSON.stringify({ ...filters, limit })}`;
    return getOrSet(cacheKey, 5, async () => {
      const where: string[] = [];
      const params: unknown[] = [];
      if (filters.status) {
        params.push(filters.status);
        where.push(`status = $${params.length}`);
      }
      if (filters.assignedTo) {
        params.push(filters.assignedTo);
        where.push(`"assignedTo" = $${params.length}`);
      }
      if (filters.label) {
        params.push(`%"${filters.label}"%`);
        where.push(`"labelsJson" LIKE $${params.length}`);
      }
      if (filters.search && filters.search.trim()) {
        params.push(`%${filters.search.trim()}%`);
        const i = params.length;
        where.push(`("tenantName" ILIKE $${i} OR subject ILIKE $${i} OR "lastMessageText" ILIKE $${i})`);
      }
      params.push(limit);
      const sql = `
        SELECT ${CONV_COLS} FROM "PlatformConversation"
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY "lastMessageAt" DESC NULLS LAST, "createdAt" DESC
        LIMIT $${params.length}
      `;
      const rows = await prisma.$queryRawUnsafe<RawConv[]>(sql, ...params);
      return rows.map(mapConv);
    });
  }

  static async getConversation(id: string): Promise<DbPlatformConversation | null> {
    const rows = await prisma.$queryRawUnsafe<RawConv[]>(
      `SELECT ${CONV_COLS} FROM "PlatformConversation" WHERE id = $1 LIMIT 1`,
      id,
    );
    return rows[0] ? mapConv(rows[0]) : null;
  }

  /** Suma de no-leídos para el badge del nav superadmin. */
  static async unreadTotalForPlatform(): Promise<number> {
    return getOrSet(`${CACHE_PREFIX}:unread:platform`, 5, async () => {
      const rows = await prisma.$queryRawUnsafe<{ total: bigint | number }[]>(
        `SELECT COALESCE(SUM("unreadForPlatform"),0) AS total FROM "PlatformConversation" WHERE status <> 'archived'`,
      );
      return Number(rows[0]?.total ?? 0);
    });
  }

  /** Crea (o reusa la abierta) una conversación con un tenant. */
  static async createConversation(input: {
    tenantId: string;
    tenantName?: string;
    subject?: string | null;
    priority?: PlatformPriority;
    createdBy?: string;
  }): Promise<DbPlatformConversation> {
    const tenantName = input.tenantName ?? (await this.resolveTenantName(input.tenantId));
    const id = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "PlatformConversation"
        (id, "tenantId", "tenantName", subject, status, priority, "createdBy", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 'open', $5, $6, NOW(), NOW())`,
      id,
      input.tenantId,
      tenantName,
      input.subject ?? null,
      input.priority ?? "medium",
      input.createdBy ?? "platform",
    );
    await invalidateByPrefix(CACHE_PREFIX);
    logSuperadminAction(
      "platform_chat_create",
      `Conversación con ${tenantName}`,
      { conversationId: id, tenantId: input.tenantId },
      input.createdBy,
    ).catch(() => {});
    const conv = await this.getConversation(id);
    if (!conv) throw new Error("No se pudo crear la conversación");
    return conv;
  }

  static async getMessages(
    conversationId: string,
    opts: { includeNotes?: boolean } = {},
  ): Promise<DbPlatformMessage[]> {
    const includeNotes = opts.includeNotes ?? true;
    const sql = `
      SELECT id, "conversationId", "tenantId", "senderType", "senderName", "senderId",
             body, "messageType", "attachmentUrl", "isInternalNote", "metadataJson",
             "readByPlatformAt", "readByTenantAt", "createdAt"
      FROM "PlatformMessage"
      WHERE "conversationId" = $1 AND "deletedAt" IS NULL
        ${includeNotes ? "" : `AND "isInternalNote" = false`}
      ORDER BY "createdAt" ASC
      LIMIT 500
    `;
    return prisma.$queryRawUnsafe<DbPlatformMessage[]>(sql, conversationId);
  }

  /** Inserta un mensaje y actualiza el último mensaje + contador de no-leídos. */
  static async sendMessage(input: {
    conversationId: string;
    senderType: PlatformSenderType;
    senderName: string;
    senderId?: string | null;
    body: string;
    messageType?: PlatformMessageType;
    attachmentUrl?: string | null;
    isInternalNote?: boolean;
    metadataJson?: string | null;
  }): Promise<DbPlatformMessage> {
    const conv = await this.getConversation(input.conversationId);
    if (!conv) throw new Error("Conversación no encontrada");

    const id = randomUUID();
    const isNote = input.isInternalNote ?? false;
    const messageType: PlatformMessageType = input.messageType ?? (isNote ? "note" : "text");

    await prisma.$executeRawUnsafe(
      `INSERT INTO "PlatformMessage"
        (id, "conversationId", "tenantId", "senderType", "senderName", "senderId",
         body, "messageType", "attachmentUrl", "isInternalNote", "metadataJson", "createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())`,
      id,
      input.conversationId,
      conv.tenantId,
      input.senderType,
      input.senderName,
      input.senderId ?? null,
      input.body,
      messageType,
      input.attachmentUrl ?? null,
      isNote,
      input.metadataJson ?? null,
    );

    // Las notas internas NO tocan el último mensaje público ni los no-leídos.
    if (!isNote) {
      const preview = input.body.slice(0, 280);
      if (input.senderType === "platform") {
        await prisma.$executeRawUnsafe(
          `UPDATE "PlatformConversation"
             SET "lastMessageAt"=NOW(), "lastMessageText"=$2, "lastSenderType"='platform',
                 "unreadForTenant"="unreadForTenant"+1, "updatedAt"=NOW()
           WHERE id=$1`,
          input.conversationId,
          preview,
        );
      } else if (input.senderType === "tenant") {
        await prisma.$executeRawUnsafe(
          `UPDATE "PlatformConversation"
             SET "lastMessageAt"=NOW(), "lastMessageText"=$2, "lastSenderType"='tenant',
                 "unreadForPlatform"="unreadForPlatform"+1, "updatedAt"=NOW()
           WHERE id=$1`,
          input.conversationId,
          preview,
        );
      } else {
        await prisma.$executeRawUnsafe(
          `UPDATE "PlatformConversation"
             SET "lastMessageAt"=NOW(), "lastMessageText"=$2, "lastSenderType"='system', "updatedAt"=NOW()
           WHERE id=$1`,
          input.conversationId,
          preview,
        );
      }
    }

    await invalidateByPrefix(CACHE_PREFIX);
    const rows = await prisma.$queryRawUnsafe<DbPlatformMessage[]>(
      `SELECT id, "conversationId", "tenantId", "senderType", "senderName", "senderId",
              body, "messageType", "attachmentUrl", "isInternalNote", "metadataJson",
              "readByPlatformAt", "readByTenantAt", "createdAt"
       FROM "PlatformMessage" WHERE id=$1`,
      id,
    );
    return rows[0];
  }

  /** Marca leído desde un lado: resetea su contador + estampa readBy*. */
  static async markRead(conversationId: string, side: "platform" | "tenant"): Promise<void> {
    if (side === "platform") {
      await prisma.$executeRawUnsafe(
        `UPDATE "PlatformConversation" SET "unreadForPlatform"=0, "updatedAt"=NOW() WHERE id=$1`,
        conversationId,
      );
      await prisma.$executeRawUnsafe(
        `UPDATE "PlatformMessage" SET "readByPlatformAt"=NOW()
         WHERE "conversationId"=$1 AND "readByPlatformAt" IS NULL AND "senderType"='tenant'`,
        conversationId,
      );
    } else {
      await prisma.$executeRawUnsafe(
        `UPDATE "PlatformConversation" SET "unreadForTenant"=0, "updatedAt"=NOW() WHERE id=$1`,
        conversationId,
      );
      await prisma.$executeRawUnsafe(
        `UPDATE "PlatformMessage" SET "readByTenantAt"=NOW()
         WHERE "conversationId"=$1 AND "readByTenantAt" IS NULL AND "senderType"='platform'`,
        conversationId,
      );
    }
    await invalidateByPrefix(CACHE_PREFIX);
  }

  static async setLabels(id: string, labels: string[]): Promise<void> {
    await prisma.$executeRawUnsafe(
      `UPDATE "PlatformConversation" SET "labelsJson"=$2, "updatedAt"=NOW() WHERE id=$1`,
      id,
      JSON.stringify(labels),
    );
    await invalidateByPrefix(CACHE_PREFIX);
  }

  static async assign(id: string, username: string | null): Promise<void> {
    await prisma.$executeRawUnsafe(
      `UPDATE "PlatformConversation" SET "assignedTo"=$2, "updatedAt"=NOW() WHERE id=$1`,
      id,
      username,
    );
    await invalidateByPrefix(CACHE_PREFIX);
  }

  static async setPriority(id: string, priority: PlatformPriority): Promise<void> {
    await prisma.$executeRawUnsafe(
      `UPDATE "PlatformConversation" SET priority=$2, "updatedAt"=NOW() WHERE id=$1`,
      id,
      priority,
    );
    await invalidateByPrefix(CACHE_PREFIX);
  }

  static async setStatus(id: string, status: PlatformConvStatus): Promise<void> {
    await prisma.$executeRawUnsafe(
      `UPDATE "PlatformConversation" SET status=$2, "updatedAt"=NOW() WHERE id=$1`,
      id,
      status,
    );
    await invalidateByPrefix(CACHE_PREFIX);
  }

  /**
   * Broadcast segmentado: envía el MISMO mensaje a varios tenants. El segmento
   * (filtro por plan/estado/vertical) se resuelve en el API; acá recibimos la
   * lista ya resuelta. Crea/reusa una conversación abierta por tenant.
   */
  static async broadcast(input: {
    /** `body` por-tenant opcional (plantilla renderizada); si falta usa input.body. */
    tenants: { tenantId: string; tenantName: string; body?: string }[];
    body: string;
    subject?: string | null;
    createdBy?: string;
  }): Promise<{ sent: number; conversationIds: string[] }> {
    const conversationIds: string[] = [];
    for (const t of input.tenants) {
      // Reusar la conversación abierta más reciente, o crear una nueva.
      const existing = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM "PlatformConversation"
         WHERE "tenantId"=$1 AND status='open'
         ORDER BY "lastMessageAt" DESC NULLS LAST LIMIT 1`,
        t.tenantId,
      );
      let convId = existing[0]?.id;
      if (!convId) {
        const conv = await this.createConversation({
          tenantId: t.tenantId,
          tenantName: t.tenantName,
          subject: input.subject ?? "Anuncio de la plataforma",
          createdBy: input.createdBy ?? "platform",
        });
        convId = conv.id;
      }
      await this.sendMessage({
        conversationId: convId,
        senderType: "platform",
        senderName: input.createdBy ?? "Buleje",
        body: t.body ?? input.body,
        messageType: "broadcast",
        metadataJson: JSON.stringify({ broadcast: true }),
      });
      conversationIds.push(convId);
    }
    await invalidateByPrefix(CACHE_PREFIX);
    logSuperadminAction(
      "platform_chat_broadcast",
      `Broadcast a ${input.tenants.length} tenants`,
      { count: input.tenants.length },
      input.createdBy,
    ).catch(() => {});
    return { sent: input.tenants.length, conversationIds };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // LADO TENANT (scope tenantId obligatorio · sin notas internas)
  // ──────────────────────────────────────────────────────────────────────────

  static async listForTenant(tenantId: string): Promise<DbPlatformConversation[]> {
    const rows = await prisma.$queryRawUnsafe<RawConv[]>(
      `SELECT ${CONV_COLS} FROM "PlatformConversation"
       WHERE "tenantId"=$1 AND status <> 'archived'
       ORDER BY "lastMessageAt" DESC NULLS LAST, "createdAt" DESC LIMIT 100`,
      tenantId,
    );
    return rows.map(mapConv);
  }

  static async unreadTotalForTenant(tenantId: string): Promise<number> {
    const rows = await prisma.$queryRawUnsafe<{ total: bigint | number }[]>(
      `SELECT COALESCE(SUM("unreadForTenant"),0) AS total
       FROM "PlatformConversation" WHERE "tenantId"=$1 AND status <> 'archived'`,
      tenantId,
    );
    return Number(rows[0]?.total ?? 0);
  }

  /** Mensajes de una conversación PARA un tenant: verifica ownership + oculta notas internas. */
  static async getMessagesForTenant(
    tenantId: string,
    conversationId: string,
  ): Promise<DbPlatformMessage[] | null> {
    const conv = await this.getConversation(conversationId);
    if (!conv || conv.tenantId !== tenantId) return null; // aislamiento multi-tenant
    return this.getMessages(conversationId, { includeNotes: false });
  }

  // ──────────────────────────────────────────────────────────────────────────

  private static async resolveTenantName(tenantId: string): Promise<string> {
    try {
      const rows = await prisma.$queryRawUnsafe<{ name: string }[]>(
        `SELECT name FROM "Tenant" WHERE id=$1 LIMIT 1`,
        tenantId,
      );
      return rows[0]?.name ?? tenantId;
    } catch (e) {
      logger.warn("[platform-chat] resolveTenantName falló", { tenantId, err: String(e) });
      return tenantId;
    }
  }
}
