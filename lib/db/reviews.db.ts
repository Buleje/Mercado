import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";
import { StoreReviewsDB } from "@/lib/db/store-reviews.db";

/**
 * lib/db/reviews.db.ts — Bloque D3 del Marketplace (Reviews verificadas)
 *
 * Dos DB classes:
 *   - ReviewsMarketplaceDB  → CRUD + moderación de reviews del marketplace
 *   - ReviewVotesDB         → votos helpful con dedupe por customerPhone
 *
 * Principios heredados del patrón D1/D2 (ADR 011):
 *   - Raw SQL via $executeRawUnsafe / $queryRawUnsafe con params posicionales
 *   - tenantId primer param en TODAS las funciones
 *   - Cache getOrSet + invalidateByPrefix tras writes
 *   - Logger estructurado
 *
 * Verificación de review:
 *   Una review está "verified" cuando tiene un orderId válido del buyer
 *   (el Order debe existir, tenantId = store.tenantId, y el customerPhone del
 *   order debe matchear con el phone del review). El bool `verified` del
 *   Review se actualiza en consecuencia.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type ReviewStatus = "pending" | "approved" | "rejected" | "hidden";
export type VoteType = "upvote" | "downvote";

export type DbMarketplaceReview = {
  id: string;
  tenantId: string;
  storeId: string | null;
  productId: number | null;
  orderId: string | null;
  name: string;
  phone: string | null;
  text: string;
  rating: number;
  qualityRating: number | null;
  priceRating: number | null;
  deliveryRating: number | null;
  status: ReviewStatus;
  verified: boolean;
  verifiedAt: string | null;
  helpfulUpvotes: number;
  helpfulDownvotes: number;
  adminReply: string | null;
  adminReplyDate: string | null;
  photosJson: string | null;
  date: string;
  deletedAt: string | null;
};

export type ReviewAggregate = {
  count: number;
  average: number;
  distribution: { 1: number; 2: number; 3: number; 4: number; 5: number };
  verifiedCount: number;
};

const toISO = (d: Date | null | undefined): string | null =>
  d ? d.toISOString() : null;

function mapRow(r: {
  id: string;
  tenantId: string;
  storeId: string | null;
  productId: number | null;
  orderId: string | null;
  name: string;
  phone: string | null;
  text: string;
  rating: number;
  qualityRating: number | null;
  priceRating: number | null;
  deliveryRating: number | null;
  status: string;
  verified: boolean;
  verifiedAt: Date | null;
  helpfulUpvotes: number;
  helpfulDownvotes: number;
  adminReply: string | null;
  adminReplyDate: Date | null;
  photosJson: string | null;
  date: Date;
  deletedAt: Date | null;
}): DbMarketplaceReview {
  return {
    id:               r.id,
    tenantId:         r.tenantId,
    storeId:          r.storeId,
    productId:        r.productId,
    orderId:          r.orderId,
    name:             r.name,
    phone:            r.phone,
    text:             r.text,
    rating:           r.rating,
    qualityRating:    r.qualityRating,
    priceRating:      r.priceRating,
    deliveryRating:   r.deliveryRating,
    status:           r.status as ReviewStatus,
    verified:         r.verified,
    verifiedAt:       toISO(r.verifiedAt),
    helpfulUpvotes:   r.helpfulUpvotes,
    helpfulDownvotes: r.helpfulDownvotes,
    adminReply:       r.adminReply,
    adminReplyDate:   toISO(r.adminReplyDate),
    photosJson:       r.photosJson,
    date:             r.date.toISOString(),
    deletedAt:        toISO(r.deletedAt),
  };
}

// ─── ReviewsMarketplaceDB ─────────────────────────────────────────────────────

export const ReviewsMarketplaceDB = {
  /**
   * Crear una review VERIFICADA. El orderId es obligatorio y debe:
   *  - Existir en la base y pertenecer al mismo tenantId que el store/product
   *  - Tener el customerPhone igual al phone del review
   *  - NO estar deleted
   *
   * Si alguna de esas validaciones falla, throws un Error descriptivo.
   * Si pasa, se crea con `verified = true` + `verifiedAt = now`.
   *
   * Las reviews arrancan con status="pending" — requieren moderación admin.
   */
  async createVerified(params: {
    tenantId: string;
    storeId?: string | null;
    productId?: number | null;
    orderId: string;
    name: string;
    phone: string;
    text: string;
    rating: number; // 1-5
    qualityRating?: number;
    priceRating?: number;
    deliveryRating?: number;
    photosJson?: string;
  }): Promise<DbMarketplaceReview> {
    if (params.rating < 1 || params.rating > 5) {
      throw new Error("rating debe estar entre 1 y 5");
    }

    // SECURITY 2026-05-06 (audit reviews #11): strip HTML tags + control chars
    // del name y text. Antes el campo se persistía crudo y la UI lo renderea
    // en un PDP — si algún componente futuro usa dangerouslySetInnerHTML →
    // XSS stored al PDP de cualquier visitante.
    const stripHtml = (s: string) =>
      String(s ?? "")
        // SECURITY: strip HTML + control chars (audit reviews #11)
        .replace(/<[^>]*>/g, "")
         
        .replace(/[\u0000-\u001F\u007F]/g, "")
        .trim();
    params.name = stripHtml(params.name).slice(0, 100);
    params.text = stripHtml(params.text).slice(0, 2000);

    // 1. Verificar el order
    const orders = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        tenantId: string;
        customerPhone: string | null;
        deletedAt: Date | null;
      }>
    >(
      `SELECT "id","tenantId","customerPhone","deletedAt"
         FROM "Order"
        WHERE "id" = $1 AND "tenantId" = $2
        LIMIT 1`,
      params.orderId,
      params.tenantId,
    );
    const order = orders[0];
    if (!order || order.deletedAt) {
      throw new Error(`Order ${params.orderId} no existe o fue eliminado`);
    }
    if (order.customerPhone !== params.phone) {
      throw new Error(`El teléfono del review no coincide con el del pedido ${params.orderId}`);
    }

    // 2. Insertar la review
    const id = crypto.randomUUID();
    const now = new Date();

    await prisma.$executeRawUnsafe(
      `INSERT INTO "Review"
         ("id","tenantId","storeId","productId","orderId","name","phone","text","rating",
          "qualityRating","priceRating","deliveryRating","status","verified","verifiedAt",
          "helpfulUpvotes","helpfulDownvotes","photosJson","date","location")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending',true,$13,0,0,$14,$13,$15)`,
      id,
      params.tenantId,
      params.storeId ?? null,
      params.productId ?? null,
      params.orderId,
      params.name,
      params.phone,
      params.text,
      params.rating,
      params.qualityRating ?? null,
      params.priceRating ?? null,
      params.deliveryRating ?? null,
      now,
      params.photosJson ?? null,
      "", // location default
    );

    // ADR-082: prefijo con tenantId cubre todas las cache keys de reviews
    // (store, product, agg). Los invalidates legacy sin tenantId quedan
    // como fallback por si hay keys legacy en cache.
    invalidateByPrefix(`reviews:${params.tenantId}`);
    if (params.storeId) invalidateByPrefix(`reviews:store:${params.storeId}`);
    if (params.productId) invalidateByPrefix(`reviews:product:${params.productId}`);

    logger.info("[Reviews] created verified", {
      tenantId: params.tenantId,
      reviewId: id,
      orderId: params.orderId,
      rating: params.rating,
    });

    return {
      id,
      tenantId:         params.tenantId,
      storeId:          params.storeId ?? null,
      productId:        params.productId ?? null,
      orderId:          params.orderId,
      name:             params.name,
      phone:            params.phone,
      text:             params.text,
      rating:           params.rating,
      qualityRating:    params.qualityRating ?? null,
      priceRating:      params.priceRating ?? null,
      deliveryRating:   params.deliveryRating ?? null,
      status:           "pending",
      verified:         true,
      verifiedAt:       now.toISOString(),
      helpfulUpvotes:   0,
      helpfulDownvotes: 0,
      adminReply:       null,
      adminReplyDate:   null,
      photosJson:       params.photosJson ?? null,
      date:             now.toISOString(),
      deletedAt:        null,
    };
  },

  /**
   * Lista reviews de una tienda del marketplace, filtrado por status.
   * Cache 60s — los listados son read-heavy.
   */
  async listByStore(
    tenantId: string,
    storeId: string,
    opts: { status?: ReviewStatus; limit?: number; verifiedOnly?: boolean } = {},
  ): Promise<DbMarketplaceReview[]> {
    const limit = Math.min(Math.max(1, opts.limit ?? 50), 200);
    // SECURITY (ADR-082, 2026-04-29): cache key prefijada con tenantId
    // (defense in depth — storeId es CUID global pero la convencion es
    // SIEMPRE incluir tenantId en cache keys para evitar collision si
    // el schema cambiara).
    const cacheKey = `reviews:${tenantId}:store:${storeId}:${opts.status ?? "all"}:${opts.verifiedOnly ? "v" : "all"}:${limit}`;

    return getOrSet(cacheKey, 60, async () => {
      const args: unknown[] = [tenantId, storeId];
      let where = `"tenantId" = $1 AND "storeId" = $2 AND "deletedAt" IS NULL`;
      if (opts.status) {
        args.push(opts.status);
        where += ` AND "status" = $${args.length}`;
      }
      if (opts.verifiedOnly) {
        where += ` AND "verified" = true`;
      }
      args.push(limit);
      const limitParam = `$${args.length}`;

      const rows = await prisma.$queryRawUnsafe<
        Array<Parameters<typeof mapRow>[0]>
      >(
        `SELECT "id","tenantId","storeId","productId","orderId","name","phone","text","rating",
                "qualityRating","priceRating","deliveryRating","status","verified","verifiedAt",
                "helpfulUpvotes","helpfulDownvotes","adminReply","adminReplyDate","photosJson","date","deletedAt"
           FROM "Review"
          WHERE ${where}
          ORDER BY "date" DESC
          LIMIT ${limitParam}`,
        ...args,
      );
      return rows.map(mapRow);
    });
  },

  /**
   * Lista reviews de un producto específico.
   */
  async listByProduct(
    tenantId: string,
    productId: number,
    opts: { status?: ReviewStatus; limit?: number; verifiedOnly?: boolean } = {},
  ): Promise<DbMarketplaceReview[]> {
    const limit = Math.min(Math.max(1, opts.limit ?? 50), 200);
    // SECURITY (ADR-082): cache key prefijada con tenantId.
    const cacheKey = `reviews:${tenantId}:product:${productId}:${opts.status ?? "all"}:${opts.verifiedOnly ? "v" : "all"}:${limit}`;

    return getOrSet(cacheKey, 60, async () => {
      const args: unknown[] = [tenantId, productId];
      let where = `"tenantId" = $1 AND "productId" = $2 AND "deletedAt" IS NULL`;
      if (opts.status) {
        args.push(opts.status);
        where += ` AND "status" = $${args.length}`;
      }
      if (opts.verifiedOnly) {
        where += ` AND "verified" = true`;
      }
      args.push(limit);

      const rows = await prisma.$queryRawUnsafe<
        Array<Parameters<typeof mapRow>[0]>
      >(
        `SELECT "id","tenantId","storeId","productId","orderId","name","phone","text","rating",
                "qualityRating","priceRating","deliveryRating","status","verified","verifiedAt",
                "helpfulUpvotes","helpfulDownvotes","adminReply","adminReplyDate","photosJson","date","deletedAt"
           FROM "Review"
          WHERE ${where}
          ORDER BY "date" DESC
          LIMIT $${args.length}`,
        ...args,
      );
      return rows.map(mapRow);
    });
  },

  /**
   * Agregado de rating para una tienda o un producto:
   *  - count total
   *  - promedio (avg)
   *  - distribución por estrella
   *  - count verificadas
   *
   * Solo cuenta reviews con status=approved + deletedAt IS NULL.
   * Cache 120s — los aggregates cambian poco.
   */
  async getAggregate(
    tenantId: string,
    target: { storeId?: string; productId?: number },
  ): Promise<ReviewAggregate> {
    if (!target.storeId && !target.productId) {
      throw new Error("getAggregate requiere storeId o productId");
    }

    // SECURITY (ADR-082): cache key prefijada con tenantId.
    const cacheKey = target.storeId
      ? `reviews:${tenantId}:agg:store:${target.storeId}`
      : `reviews:${tenantId}:agg:product:${target.productId}`;

    return getOrSet(cacheKey, 120, async () => {
      const filterCol = target.storeId ? '"storeId"' : '"productId"';
      const filterVal = target.storeId ?? target.productId;

      const rows = await prisma.$queryRawUnsafe<
        Array<{
          rating: number;
          cnt: number;
          verified_cnt: number;
        }>
      >(
        `SELECT "rating",
                COUNT(*)::int AS cnt,
                SUM(CASE WHEN "verified" = true THEN 1 ELSE 0 END)::int AS verified_cnt
           FROM "Review"
          WHERE "tenantId" = $1
            AND ${filterCol} = $2
            AND "status" = 'approved'
            AND "deletedAt" IS NULL
          GROUP BY "rating"`,
        tenantId,
        filterVal,
      );

      const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      let count = 0;
      let sum = 0;
      let verifiedCount = 0;

      for (const r of rows) {
        const stars = Math.max(1, Math.min(5, r.rating)) as 1 | 2 | 3 | 4 | 5;
        distribution[stars] += r.cnt;
        count += r.cnt;
        sum += r.rating * r.cnt;
        verifiedCount += r.verified_cnt;
      }

      const average = count > 0 ? Math.round((sum / count) * 10) / 10 : 0;

      return {
        count,
        average,
        distribution,
        verifiedCount,
      };
    });
  },

  /**
   * Moderación del admin — cambiar status.
   * Valores válidos: pending | approved | rejected | hidden
   */
  async moderate(
    tenantId: string,
    reviewId: string,
    status: ReviewStatus,
    actorUsername?: string,
  ): Promise<void> {
    await prisma.$executeRawUnsafe(
      `UPDATE "Review"
          SET "status" = $1
        WHERE "id" = $2 AND "tenantId" = $3`,
      status,
      reviewId,
      tenantId,
    );
    invalidateByPrefix(`reviews:${tenantId}`);
    // SECURITY 2026-05-05 (audit reviews #4): la key real es
    // `reviews:${tenantId}:agg:...`, no `reviews:agg`. Antes el invalidate
    // por prefix `reviews:agg` nunca matcheaba y los aggregates quedaban
    // stale tras moderate/delete.
    invalidateByPrefix(`reviews:${tenantId}:agg`);
    // Audit #8 (Brandon 2026-05-30): si la review es de una tienda marketplace
    // (storeId != null), re-materializar Store.rating/reviewCount — las cards
    // del directorio y el SEO leen el campo materializado. Fire-and-forget +
    // try/catch total (no puede romper la moderación ni en tests con prisma mock).
    void (async () => {
      try {
        const r = await prisma.review.findUnique({
          where: { id: reviewId },
          select: { storeId: true },
        });
        if (r?.storeId) await StoreReviewsDB.recalcStoreRating(tenantId, r.storeId);
      } catch {
        /* fire-and-forget: el rating se re-materializa en la próxima moderación */
      }
    })();
    logger.info("[Reviews] moderated", { tenantId, reviewId, status });
    // SECURITY 2026-05-05 (audit reviews #5): audit trail.
    logActivity(
      "Moderar",
      "review",
      `Review ${reviewId} → ${status}`,
      reviewId,
      actorUsername,
    ).catch((err) => logger.warn("[Reviews] moderate audit failed", { err: String(err) }));
  },

  /**
   * Respuesta pública del seller a una review.
   */
  async reply(
    tenantId: string,
    reviewId: string,
    replyText: string,
    actorUsername?: string,
  ): Promise<void> {
    const now = new Date();
    await prisma.$executeRawUnsafe(
      `UPDATE "Review"
          SET "adminReply" = $1, "adminReplyDate" = $2
        WHERE "id" = $3 AND "tenantId" = $4`,
      replyText,
      now,
      reviewId,
      tenantId,
    );
    invalidateByPrefix(`reviews:${tenantId}`);
    logger.info("[Reviews] reply added", { tenantId, reviewId });
    // SECURITY 2026-05-05 (audit reviews #5): audit trail.
    logActivity(
      "Responder",
      "review",
      `Reply en review ${reviewId} (${replyText.length} chars)`,
      reviewId,
      actorUsername,
    ).catch((err) => logger.warn("[Reviews] reply audit failed", { err: String(err) }));
  },

  /**
   * Soft-delete.
   */
  async softDelete(tenantId: string, reviewId: string): Promise<void> {
    const now = new Date();
    await prisma.$executeRawUnsafe(
      `UPDATE "Review"
          SET "deletedAt" = $1
        WHERE "id" = $2 AND "tenantId" = $3`,
      now,
      reviewId,
      tenantId,
    );
    invalidateByPrefix(`reviews:${tenantId}`);
    // SECURITY 2026-05-05 (audit reviews #4): la key real es
    // `reviews:${tenantId}:agg:...`, no `reviews:agg`. Antes el invalidate
    // por prefix `reviews:agg` nunca matcheaba y los aggregates quedaban
    // stale tras moderate/delete.
    invalidateByPrefix(`reviews:${tenantId}:agg`);
    logger.info("[Reviews] soft deleted", { tenantId, reviewId });
  },
};

// ─── ReviewVotesDB ────────────────────────────────────────────────────────────

export const ReviewVotesDB = {
  /**
   * Vota una review como útil o no útil. Dedupe por (reviewId, customerPhone).
   * Si el usuario ya votó, se actualiza el tipo de voto y se recalcula el contador.
   *
   * Retorna los nuevos contadores de la review.
   */
  async vote(params: {
    tenantId: string;
    reviewId: string;
    customerPhone: string;
    voteType: VoteType;
  }): Promise<{ helpfulUpvotes: number; helpfulDownvotes: number }> {
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      // 1. Buscar voto previo
      const existingRows = await tx.$queryRawUnsafe<
        Array<{ id: string; voteType: string }>
      >(
        `SELECT "id","voteType"
           FROM "ReviewVote"
          WHERE "reviewId" = $1 AND "customerPhone" = $2
          LIMIT 1`,
        params.reviewId,
        params.customerPhone,
      );
      const existing = existingRows[0];

      if (existing) {
        // 2a. Si el voto es del mismo tipo, no hacer nada
        if (existing.voteType === params.voteType) {
          const review = await tx.$queryRawUnsafe<
            Array<{ helpfulUpvotes: number; helpfulDownvotes: number }>
          >(
            `SELECT "helpfulUpvotes","helpfulDownvotes"
               FROM "Review" WHERE "id" = $1 LIMIT 1`,
            params.reviewId,
          );
          return {
            helpfulUpvotes: review[0]?.helpfulUpvotes ?? 0,
            helpfulDownvotes: review[0]?.helpfulDownvotes ?? 0,
          };
        }

        // 2b. Si cambió el tipo, actualizar + ajustar contadores (restar del viejo, sumar al nuevo)
        await tx.$executeRawUnsafe(
          `UPDATE "ReviewVote"
              SET "voteType" = $1, "updatedAt" = $2
            WHERE "id" = $3`,
          params.voteType,
          now,
          existing.id,
        );

        const oldCol = existing.voteType === "upvote" ? "helpfulUpvotes" : "helpfulDownvotes";
        const newCol = params.voteType === "upvote" ? "helpfulUpvotes" : "helpfulDownvotes";

        await tx.$executeRawUnsafe(
          `UPDATE "Review"
              SET "${oldCol}" = GREATEST(0, "${oldCol}" - 1),
                  "${newCol}" = "${newCol}" + 1
            WHERE "id" = $1 AND "tenantId" = $2`,
          params.reviewId,
          params.tenantId,
        );
      } else {
        // 3. Crear voto nuevo
        await tx.$executeRawUnsafe(
          `INSERT INTO "ReviewVote"
             ("id","tenantId","reviewId","customerPhone","voteType","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$6)`,
          crypto.randomUUID(),
          params.tenantId,
          params.reviewId,
          params.customerPhone,
          params.voteType,
          now,
        );

        const col = params.voteType === "upvote" ? "helpfulUpvotes" : "helpfulDownvotes";
        await tx.$executeRawUnsafe(
          `UPDATE "Review"
              SET "${col}" = "${col}" + 1
            WHERE "id" = $1 AND "tenantId" = $2`,
          params.reviewId,
          params.tenantId,
        );
      }

      // 4. Leer los nuevos contadores
      const updated = await tx.$queryRawUnsafe<
        Array<{ helpfulUpvotes: number; helpfulDownvotes: number }>
      >(
        `SELECT "helpfulUpvotes","helpfulDownvotes"
           FROM "Review" WHERE "id" = $1 AND "tenantId" = $2 LIMIT 1`,
        params.reviewId,
        params.tenantId,
      );

      invalidateByPrefix(`reviews:${params.tenantId}`);

      return {
        helpfulUpvotes: updated[0]?.helpfulUpvotes ?? 0,
        helpfulDownvotes: updated[0]?.helpfulDownvotes ?? 0,
      };
    });
  },

  /**
   * Obtener el tipo de voto actual de un buyer en una review (null si no votó).
   */
  async getVoteFor(
    tenantId: string,
    reviewId: string,
    customerPhone: string,
  ): Promise<VoteType | null> {
    const rows = await prisma.$queryRawUnsafe<Array<{ voteType: string }>>(
      `SELECT "voteType"
         FROM "ReviewVote"
        WHERE "tenantId" = $1 AND "reviewId" = $2 AND "customerPhone" = $3
        LIMIT 1`,
      tenantId,
      reviewId,
      customerPhone,
    );
    return (rows[0]?.voteType as VoteType | undefined) ?? null;
  },
};
