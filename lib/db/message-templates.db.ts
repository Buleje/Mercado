import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrSet, invalidate, invalidateByPrefix } from "@/lib/cache";

// ── Cache helpers ─────────────────────────────────────────────────────────────
function listKey(tenantId: string) {
  return `message-templates:${tenantId}:list`;
}
function rowKey(tenantId: string, id: string) {
  return `message-templates:${tenantId}:${id}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface DbMessageTemplate {
  id: string;
  tenantId: string;
  name: string;
  channel: string;
  category: string;
  subject: string | null;
  body: string;
  variablesJson: string;
  starred: boolean;
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMessageTemplateInput {
  name: string;
  channel: string;
  category: string;
  subject: string | null;
  body: string;
  variablesJson?: string;
  starred?: boolean;
}

export interface UpdateMessageTemplateInput {
  name?: string;
  channel?: string;
  category?: string;
  subject?: string | null;
  body?: string;
  variablesJson?: string;
  starred?: boolean;
  usageCount?: number;
}

export const MessageTemplatesDB = {
  /**
   * Listar todos los templates del tenant ordenados por starred → usageCount → createdAt.
   */
  async list(tenantId: string): Promise<DbMessageTemplate[]> {
    return getOrSet(listKey(tenantId), 60, () =>
      prisma.messageTemplate.findMany({
        where: { tenantId },
        orderBy: [{ starred: "desc" }, { usageCount: "desc" }, { createdAt: "desc" }],
      })
    );
  },

  /**
   * Crear un template y limpiar caché de lista.
   */
  async create(tenantId: string, data: CreateMessageTemplateInput): Promise<DbMessageTemplate> {
    const row = await prisma.messageTemplate.create({
      data: {
        ...data,
        variablesJson: data.variablesJson ?? "[]",
        starred: data.starred ?? false,
        tenantId,
      },
    });
    invalidateByPrefix(`message-templates:${tenantId}`);
    return row;
  },

  /**
   * Actualizar por id + tenantId (updateMany atómico — previene TOCTOU).
   * Retorna false si no existía el registro.
   */
  async update(
    tenantId: string,
    id: string,
    data: UpdateMessageTemplateInput,
  ): Promise<DbMessageTemplate | null> {
    const result = await prisma.messageTemplate.updateMany({
      where: { id, tenantId },
      data,
    });
    if (result.count === 0) return null;
    invalidate(rowKey(tenantId, id));
    invalidateByPrefix(`message-templates:${tenantId}:list`);
    return prisma.messageTemplate.findFirst({ where: { id, tenantId } });
  },

  /**
   * Eliminar por id + tenantId (deleteMany atómico).
   * Retorna false si no existía el registro.
   */
  async delete(tenantId: string, id: string): Promise<boolean> {
    const result = await prisma.messageTemplate.deleteMany({
      where: { id, tenantId },
    });
    if (result.count === 0) return false;
    invalidate(rowKey(tenantId, id));
    invalidateByPrefix(`message-templates:${tenantId}:list`);
    return true;
  },
};
