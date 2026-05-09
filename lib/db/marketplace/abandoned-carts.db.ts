import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { type AbandonedCartItem, type AbandonedCartRecord } from "./types";

// ─── MarketplaceAbandonedCartsDB ──────────────────────────────────────────────

export const MarketplaceAbandonedCartsDB = {
  /**
   * Save/update a marketplace cart for recovery tracking.
   * Called when user enters customer info in checkout.
   * Upserts by storeSlug + customerPhone to avoid duplicates.
   */
  async save(params: {
    storeSlug: string;
    customerName: string;
    customerPhone: string;
    items: AbandonedCartItem[];
    total: number;
  }): Promise<AbandonedCartRecord | null> {
    try {
      const itemsJson = JSON.stringify(params.items);
      // Try to find existing non-recovered cart for this customer+store
      const existing = await prisma.marketplaceAbandonedCart.findFirst({
        where: {
          storeSlug: params.storeSlug,
          customerPhone: params.customerPhone,
          recovered: false,
        },
        select: { id: true },
      });

      if (existing) {
        const updated = await prisma.marketplaceAbandonedCart.update({
          where: { id: existing.id },
          data: {
            customerName: params.customerName,
            itemsJson,
            total: params.total,
            reminderSentAt: null, // reset so new reminder can be sent
          },
        });
        return updated as AbandonedCartRecord;
      }

      const created = await prisma.marketplaceAbandonedCart.create({
        data: {
          storeSlug: params.storeSlug,
          customerName: params.customerName,
          customerPhone: params.customerPhone,
          itemsJson,
          total: params.total,
        },
      });
      return created as AbandonedCartRecord;
    } catch (e) {
      logger.error("trackAbandonedCart failed", { err: e instanceof Error ? e.message : String(e), op: "MarketplaceDB.trackAbandonedCart" });
      return null;
    }
  },

  /**
   * Mark a cart as converted (order was placed).
   */
  async markConverted(storeSlug: string, customerPhone: string): Promise<void> {
    try {
      await prisma.marketplaceAbandonedCart.updateMany({
        where: {
          storeSlug,
          customerPhone,
          recovered: false,
        },
        data: {
          recovered: true,
          convertedAt: new Date(),
        },
      });
    } catch (e) {
      logger.error("markConverted failed", { err: e instanceof Error ? e.message : String(e), op: "MarketplaceDB.markConverted" });
    }
  },

  /**
   * Get abandoned carts that haven't been converted and haven't received a reminder.
   * Only carts older than `hoursOld` hours and younger than 24h.
   */
  async getAbandoned(hoursOld = 2): Promise<AbandonedCartRecord[]> {
    try {
      const cutoff = new Date(Date.now() - hoursOld * 60 * 60 * 1000);
      const maxAge = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const carts = await prisma.marketplaceAbandonedCart.findMany({
        where: {
          recovered: false,
          reminderSentAt: null,
          createdAt: { lt: cutoff, gt: maxAge },
        },
        orderBy: { createdAt: "asc" },
        take: 50,
      });
      return carts as AbandonedCartRecord[];
    } catch (e) {
      logger.error("getAbandoned failed", { err: e instanceof Error ? e.message : String(e), op: "MarketplaceDB.getAbandoned" });
      return [];
    }
  },

  /**
   * Mark reminder as sent for a cart.
   */
  async markReminderSent(id: string): Promise<void> {
    try {
      await prisma.marketplaceAbandonedCart.update({
        where: { id },
        data: { reminderSentAt: new Date() },
      });
    } catch (e) {
      logger.error("markReminderSent failed", { err: e instanceof Error ? e.message : String(e), op: "MarketplaceDB.markReminderSent" });
    }
  },
};
