import "server-only";
import { prisma } from "@/lib/prisma";

// ─── MarketplaceReviewsDB ─────────────────────────────────────────────────────

export const MarketplaceReviewsDB = {
  /**
   * Get approved reviews for a store (public). Incluye photosJson para
   * el render con fotos en el storefront.
   *
   * Audit project-wide 2026-05-19: extendido con photosJson para soportar
   * marketplace/stores/[slug]/reviews que migraba este shape exacto.
   */
  async getByStore(storeId: string, opts: { take?: number } = {}) {
    return prisma.review.findMany({
      where: { storeId, status: "approved", deletedAt: null },
      select: {
        id: true,
        name: true,
        text: true,
        rating: true,
        date: true,
        adminReply: true,
        adminReplyDate: true,
        photosJson: true,
      },
      orderBy: { date: "desc" },
      take: Math.min(50, Math.max(1, opts.take ?? 20)),
    });
  },

  /**
   * Get aggregate rating for a store.
   */
  async getStoreRating(storeId: string): Promise<{ rating: number; count: number }> {
    const result = await prisma.review.aggregate({
      where: { storeId, status: "approved", deletedAt: null },
      _avg: { rating: true },
      _count: { rating: true },
    });
    return {
      rating: Math.round((result._avg.rating ?? 0) * 10) / 10,
      count: result._count.rating,
    };
  },

  /**
   * Add a review for a marketplace store (public, status=pending).
   */
  async add(params: {
    storeId: string;
    name: string;
    text: string;
    rating: number;
    phone?: string;
  }) {
    // Verify store exists
    const store = await prisma.store.findUnique({
      where: { id: params.storeId },
      select: { id: true, tenantId: true },
    });
    if (!store) throw new Error("Tienda no encontrada");

    const review = await prisma.review.create({
      data: {
        id: crypto.randomUUID(),
        name: params.name,
        text: params.text,
        rating: params.rating,
        phone: params.phone ?? null,
        storeId: params.storeId,
        tenantId: store.tenantId,
        status: "pending",
        date: new Date(),
      },
      select: {
        id: true, name: true, text: true, rating: true,
        date: true, status: true,
      },
    });

    return review;
  },

  /**
   * Verifica que el orderId pertenece al customerPhone y está entregado
   * o confirmado dentro del tenant del store. Used para garantizar que
   * solo clientes con compra real puedan reseñar.
   *
   * Audit project-wide 2026-05-19 — migracion de marketplace/stores/[slug]/reviews.
   */
  async verifyOrderForReview(
    tenantId: string,
    orderId: string,
    customerPhone: string,
  ): Promise<boolean> {
    const row = await prisma.order.findFirst({
      where: {
        id: orderId,
        customerPhone,
        status: { in: ["entregado", "confirmado"] },
        tenantId,
      },
      select: { id: true },
    });
    return !!row;
  },

  /**
   * Lista las órdenes del cliente (por phone) en este tenant que son
   * elegibles para reseñar: status entregado/confirmado y SIN review previa.
   * Usado por el modal "Dar opinión" del storefront para auto-vincular la
   * compra sin que el cliente tenga que escribir nada.
   */
  async getReviewableOrders(
    tenantId: string,
    customerPhone: string,
  ): Promise<Array<{ id: string; createdAt: Date; total: number; itemsCount: number }>> {
    const orders = await prisma.order.findMany({
      where: {
        tenantId,
        customerPhone,
        status: { in: ["entregado", "confirmado"] },
      },
      select: {
        id: true,
        createdAt: true,
        total: true,
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    if (orders.length === 0) return [];

    // Excluir las que ya tienen review de este cliente.
    const reviewed = await prisma.review.findMany({
      where: {
        tenantId,
        phone: customerPhone,
        deletedAt: null,
        orderId: { in: orders.map((o) => o.id) },
      },
      select: { orderId: true },
    });
    const reviewedIds = new Set(reviewed.map((r) => r.orderId));

    return orders
      .filter((o) => !reviewedIds.has(o.id))
      .map((o) => ({
        id: o.id,
        createdAt: o.createdAt,
        total: Number(o.total),
        itemsCount: o._count.items,
      }));
  },

  /**
   * Chequea si ya existe review del customer para este orderId (dedup).
   */
  async hasReviewForOrder(
    tenantId: string,
    orderId: string,
    customerPhone: string,
  ): Promise<boolean> {
    const row = await prisma.review.findFirst({
      where: { orderId, phone: customerPhone, tenantId, deletedAt: null },
      select: { id: true },
    });
    return !!row;
  },

  /**
   * Crea review aprobada de tienda + recalcula rating/reviewCount del Store
   * en una transaccion atomica. Devuelve la review + nuevos contadores.
   */
  async addVerifiedStoreReview(params: {
    store: { id: string; tenantId: string; rating: number; reviewCount: number };
    reviewerName: string;
    rating: number;
    comment: string;
    customerPhone: string;
    orderId: string;
    imageUrls: string[];
  }): Promise<{
    review: {
      id: string;
      name: string;
      text: string | null;
      rating: number;
      date: Date;
    };
    storeRating: number;
    storeReviewCount: number;
  }> {
    const { store } = params;
    const newCount = store.reviewCount + 1;
    const newRating =
      Math.round(((store.rating * store.reviewCount + params.rating) / newCount) * 10) / 10;

    const [review] = await prisma.$transaction([
      prisma.review.create({
        data: {
          id: crypto.randomUUID(),
          name: params.reviewerName,
          text: params.comment,
          rating: params.rating,
          phone: params.customerPhone,
          orderId: params.orderId,
          storeId: store.id,
          tenantId: store.tenantId,
          status: "approved",
          photosJson: params.imageUrls.length > 0 ? JSON.stringify(params.imageUrls) : null,
        },
        select: { id: true, name: true, text: true, rating: true, date: true },
      }),
      prisma.store.update({
        where: { id: store.id },
        data: { rating: newRating, reviewCount: newCount },
      }),
    ]);
    return { review, storeRating: newRating, storeReviewCount: newCount };
  },
};
