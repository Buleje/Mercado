import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";

/**
 * StorePostsDB — feed de Publicaciones por tienda (ADR-130). El dueño publica
 * (texto + imagen) y los vecinos comentan. Estilo IG/Facebook ligero.
 *
 * Reglas de la casa:
 *   - `tenantId` SIEMPRE 1er parámetro (aislamiento multi-tenant). Sin fallback "main".
 *   - Solo `status="published"` y `deletedAt IS NULL` en lecturas públicas.
 *   - Lectura cacheada (`getOrSet`) + invalidación por prefijo tras writes.
 *   - Defensivo: si la query falla devuelve vacío (UI con empty state honesto).
 */

export interface StorePostComment {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface StorePost {
  id: string;
  body: string;
  imageUrl: string | null;
  pinned: boolean;
  likeCount: number;
  commentCount: number;
  createdAt: string;
  comments: StorePostComment[];
}

const FEED_PREFIX = "marketplace:store-posts:";
const feedKey = (storeId: string) => `${FEED_PREFIX}${storeId}`;
const MAX_BODY = 1000;
const MAX_COMMENT = 500;

export const StorePostsDB = {
  /** Feed público de una tienda — publicadas, fijadas primero, con sus comentarios. */
  async listFeed(
    tenantId: string,
    storeId: string,
    opts: { limit?: number } = {},
  ): Promise<StorePost[]> {
    const limit = Math.min(Math.max(opts.limit ?? 30, 1), 50);
    try {
      return await getOrSet(feedKey(storeId), 60, async () => {
        const rows = await prisma.storePost.findMany({
          where: { tenantId, storeId, status: "published", deletedAt: null },
          orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
          take: limit,
          include: {
            comments: {
              where: { status: "published", deletedAt: null },
              orderBy: { createdAt: "asc" },
              take: 30,
            },
          },
        });
        return rows.map((p) => ({
          id: p.id,
          body: p.body,
          imageUrl: p.imageUrl,
          pinned: p.pinned,
          likeCount: p.likeCount,
          commentCount: p.commentCount,
          createdAt: p.createdAt.toISOString(),
          comments: p.comments.map((c) => ({
            id: c.id,
            authorName: c.authorName,
            body: c.body,
            createdAt: c.createdAt.toISOString(),
          })),
        }));
      });
    } catch (err) {
      logger.error("[StorePostsDB.listFeed] failed", { tenantId, storeId, error: String(err) });
      return [];
    }
  },

  /** Lista para el DUEÑO (incluye ocultas) — para gestionar desde el admin. */
  async listForOwner(
    tenantId: string,
    storeId: string,
  ): Promise<Array<Omit<StorePost, "comments">>> {
    try {
      const rows = await prisma.storePost.findMany({
        where: { tenantId, storeId, deletedAt: null },
        orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
        take: 50,
        select: {
          id: true,
          body: true,
          imageUrl: true,
          pinned: true,
          likeCount: true,
          commentCount: true,
          createdAt: true,
        },
      });
      return rows.map((p) => ({
        id: p.id,
        body: p.body,
        imageUrl: p.imageUrl,
        pinned: p.pinned,
        likeCount: p.likeCount,
        commentCount: p.commentCount,
        createdAt: p.createdAt.toISOString(),
      }));
    } catch (err) {
      logger.error("[StorePostsDB.listForOwner] failed", { tenantId, storeId, error: String(err) });
      return [];
    }
  },

  /** Crea una publicación (dueño). Devuelve el id o null si falla. */
  async createPost(
    tenantId: string,
    storeId: string,
    data: { body: string; imageUrl?: string | null; pinned?: boolean },
  ): Promise<{ id: string } | null> {
    const body = data.body.trim().slice(0, MAX_BODY);
    if (!body) return null;
    try {
      const post = await prisma.storePost.create({
        data: {
          tenantId,
          storeId,
          body,
          imageUrl: data.imageUrl?.trim() || null,
          pinned: data.pinned ?? false,
        },
        select: { id: true },
      });
      invalidateByPrefix(feedKey(storeId));
      return post;
    } catch (err) {
      logger.error("[StorePostsDB.createPost] failed", { tenantId, storeId, error: String(err) });
      return null;
    }
  },

  /** Soft-delete de una publicación (dueño). Scoped por tenantId + storeId. */
  async deletePost(tenantId: string, storeId: string, postId: string): Promise<boolean> {
    try {
      const res = await prisma.storePost.updateMany({
        where: { id: postId, tenantId, storeId, deletedAt: null },
        data: { deletedAt: new Date(), status: "hidden" },
      });
      invalidateByPrefix(feedKey(storeId));
      return res.count > 0;
    } catch (err) {
      logger.error("[StorePostsDB.deletePost] failed", { tenantId, storeId, postId, error: String(err) });
      return false;
    }
  },

  /** Agrega un comentario a una publicación (cliente). */
  async addComment(
    tenantId: string,
    storeId: string,
    postId: string,
    data: { authorName: string; body: string; customerId?: string | null },
  ): Promise<{ id: string } | null> {
    const body = data.body.trim().slice(0, MAX_COMMENT);
    const authorName = data.authorName.trim().slice(0, 80) || "Vecino";
    if (!body) return null;
    try {
      // El post debe existir, ser de esta tienda/tenant y estar publicado.
      const post = await prisma.storePost.findFirst({
        where: { id: postId, tenantId, storeId, status: "published", deletedAt: null },
        select: { id: true },
      });
      if (!post) return null;

      const [comment] = await prisma.$transaction([
        prisma.storePostComment.create({
          data: { tenantId, postId, authorName, body, customerId: data.customerId ?? null },
          select: { id: true },
        }),
        prisma.storePost.update({
          where: { id: postId },
          data: { commentCount: { increment: 1 } },
        }),
      ]);
      invalidateByPrefix(feedKey(storeId));
      return comment;
    } catch (err) {
      logger.error("[StorePostsDB.addComment] failed", { tenantId, storeId, postId, error: String(err) });
      return null;
    }
  },
};
