/**
 * lib/db/chat-public.db.ts
 *
 * Audit project-wide 2026-05-19 — elimina acceso prisma.* directo en
 * app/api/chat/public/route.ts.
 *
 * Encapsula las dos consultas residuales de prisma en ese endpoint:
 *   1. findStoreBySlug — carga la tienda por slug para obtener tenantId.
 *   2. verifyThreadOwnership — valida que el hilo pertenece al buyer
 *      (customerPhone + storeId + tenantId). Usa raw SQL parametrizado
 *      igual que el resto de chat.db.ts (ADR-011, sin string interpolation).
 *
 * Los métodos CRUD de hilos y mensajes siguen en lib/db/chat.db.ts
 * (ChatThreadsDB, ChatMessagesDB) — esta clase NO los duplica.
 */
import "server-only";
import { prisma } from "@/lib/prisma";

export type PublicStoreInfo = {
  id: string;
  tenantId: string;
  name: string;
  isPublished: boolean;
};

export type ThreadOwnershipRow = {
  customerPhone: string;
  storeId: string;
  status: string;
  /** Tanda 4: pedido del que nació el hilo (para fijar su contexto). */
  orderId: string | null;
};

export const ChatPublicDB = {
  /**
   * Busca una tienda por slug para los endpoints públicos de chat.
   * Retorna null si no existe.
   */
  async findStoreBySlug(slug: string): Promise<PublicStoreInfo | null> {
    return prisma.store.findUnique({
      where: { slug },
      select: { id: true, tenantId: true, isPublished: true, name: true },
    });
  },

  /**
   * Verifica que el hilo existe, pertenece al tenant y al buyer.
   * Usa raw SQL parametrizado ($1 $2) — igual que chat.db.ts (ADR-011).
   * Retorna la fila con customerPhone, storeId y status; null si no existe.
   */
  async findThreadForOwnershipCheck(
    threadId: string,
    tenantId: string,
  ): Promise<ThreadOwnershipRow | null> {
    const rows = await prisma.$queryRawUnsafe<ThreadOwnershipRow[]>(
      `SELECT "customerPhone","storeId","status","orderId"
         FROM "ConversationThread"
        WHERE "id" = $1 AND "tenantId" = $2 LIMIT 1`,
      threadId,
      tenantId,
    );
    return rows[0] ?? null;
  },
};
