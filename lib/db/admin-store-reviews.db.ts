/**
 * lib/db/admin-store-reviews.db.ts
 *
 * Audit project-wide 2026-05-19 — migración de app/api/admin/store-reviews/route.ts.
 * Antes: prisma.review directo en el route (findMany + groupBy + findUnique + update).
 * Ahora: clase canónica con guards cross-tenant explícitos + tenantId primer argumento.
 *
 * Acción "reply" no cambia status — solo actualiza adminReply/adminReplyDate.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { StoreReviewsDB } from "@/lib/db/store-reviews.db";

export type ReviewStatus = "pending" | "approved" | "rejected" | "hidden";

export type StoreReviewRow = {
  id: string;
  name: string | null;
  location: string | null;
  text: string | null;
  rating: number | null;
  phone: string | null;
  status: string;
  date: string;
  adminReply: string | null;
  adminReplyDate: string | null;
  storeId: string | null;
};

export type ReviewListResult = {
  data: StoreReviewRow[];
  counts: Record<string, number>;
};

export type ReviewMutationResult = {
  id: string;
  status: string;
  adminReply: string | null;
  adminReplyDate: Date | null;
};

export const AdminStoreReviewsDB = {
  /**
   * Lista reseñas de tiendas del tenant con conteo por status.
   * Guard: where siempre incluye tenantId — nunca devuelve rows de otro tenant.
   *
   * @param tenantId  ID del tenant autenticado
   * @param status    Filtro de status o "all"
   * @param limit     Máximo de rows (1–100)
   */
  async listForTenant(
    tenantId: string,
    status: ReviewStatus | "all",
    limit: number,
  ): Promise<ReviewListResult> {
    const baseWhere = {
      tenantId,
      deletedAt: null,
      storeId: { not: null } as { not: null },
    } as const;

    const where: Record<string, unknown> = { ...baseWhere };
    if (status !== "all") where.status = status;

    const [reviews, counts] = await Promise.all([
      prisma.review.findMany({
        where,
        orderBy: { date: "desc" },
        take: limit,
        select: {
          id: true,
          name: true,
          location: true,
          text: true,
          rating: true,
          phone: true,
          status: true,
          date: true,
          adminReply: true,
          adminReplyDate: true,
          storeId: true,
        },
      }),
      prisma.review.groupBy({
        by: ["status"],
        where: baseWhere,
        _count: { _all: true },
      }),
    ]);

    const countByStatus: Record<string, number> = {};
    for (const c of counts) countByStatus[c.status] = c._count._all;

    return {
      data: reviews.map((r) => ({
        id: r.id,
        name: r.name,
        location: r.location,
        text: r.text,
        rating: r.rating,
        phone: r.phone,
        status: r.status,
        date: r.date.toISOString(),
        adminReply: r.adminReply,
        adminReplyDate: r.adminReplyDate?.toISOString() ?? null,
        storeId: r.storeId,
      })),
      counts: countByStatus,
    };
  },

  /**
   * Verifica ownership de una reseña antes de mutarla.
   * Guard: findUnique + compara tenantId — previene IDOR.
   *
   * @returns la reseña si pertenece al tenant, null si no existe o es ajena
   */
  async findOwnedById(
    tenantId: string,
    reviewId: string,
  ): Promise<{ id: string; tenantId: string; status: string } | null> {
    const existing = await prisma.review.findUnique({
      where: { id: reviewId },
      select: { id: true, tenantId: true, status: true },
    });
    if (!existing || existing.tenantId !== tenantId) return null;
    return existing;
  },

  /**
   * Aprueba, rechaza u oculta una reseña verificada como propia del tenant.
   * Guard: where incluye id verificado en findOwnedById — no se puede mutar sin ownership check previo.
   *
   * @param tenantId   ID del tenant (para el guard implícito via findOwnedById)
   * @param reviewId   ID de la reseña ya verificada como propia
   * @param updateData Campos a actualizar (status y/o adminReply)
   */
  async updateStatus(
    tenantId: string,
    reviewId: string,
    updateData: Record<string, unknown>,
  ): Promise<ReviewMutationResult> {
    const row = await prisma.review.update({
      where: { id: reviewId },
      data: updateData,
      select: {
        id: true,
        status: true,
        adminReply: true,
        adminReplyDate: true,
        storeId: true,
      },
    });
    // Audit #8 (Brandon 2026-05-30): si cambió el status de una review de
    // tienda marketplace, re-materializar Store.rating/reviewCount (las cards
    // del directorio + el SEO leen el campo materializado). Fire-and-forget.
    if ("status" in updateData && row.storeId) {
      // recalcStoreRating tiene try/catch interno total → nunca rechaza; void
      // lo marca como fire-and-forget intencional (no bloquea la respuesta).
      void StoreReviewsDB.recalcStoreRating(tenantId, row.storeId);
    }
    return row;
  },
};
