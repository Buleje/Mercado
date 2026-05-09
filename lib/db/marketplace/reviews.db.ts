import "server-only";
import { prisma } from "@/lib/prisma";

// ─── MarketplaceReviewsDB ─────────────────────────────────────────────────────

export const MarketplaceReviewsDB = {
  /**
   * Get approved reviews for a store (public).
   */
  async getByStore(storeId: string) {
    return prisma.review.findMany({
      where: { storeId, status: "approved", deletedAt: null },
      select: {
        id: true, name: true, text: true, rating: true,
        date: true, adminReply: true, adminReplyDate: true,
      },
      orderBy: { date: "desc" },
      take: 50,
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
};
