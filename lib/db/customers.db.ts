import "server-only";
import { prisma } from "@/lib/prisma";
import type {
  Customer as PCustomer,
  SavedLocation as PSavedLocation,
  Review as PReview,
  ShoppingList as PShoppingList,
  ShoppingListItem as PShoppingListItem,
} from "@/lib/generated/prisma/client";
import type { DbCustomer, DbReview } from "./misc.db";
import { normalizePhone } from "./misc.db";

// ── Helpers ───────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return d.toISOString();
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type DbShoppingListItem = { id: number; productId: number; quantity: number };

export type DbShoppingList = {
  id: string;
  customerPhone: string;
  name: string;
  items: DbShoppingListItem[];
  createdAt: string;
  updatedAt: string;
};

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapCustomer(c: PCustomer & { locations: PSavedLocation[] }): DbCustomer {
  return {
    phone: c.phone,
    name: c.name,
    location: c.location,
    reference: c.reference,
    locations: c.locations.map((l: PSavedLocation) => ({ id: l.id, location: l.location, reference: l.reference })),
    activeLocationId: c.activeLocationId,
    birthday: c.birthday ? toISO(c.birthday) : undefined,
    aiNotes: c.aiNotes ?? undefined,
    aiNotesDate: c.aiNotesDate ? toISO(c.aiNotesDate) : undefined,
    loyaltyPoints: c.loyaltyPoints,
    loyaltyTier: c.loyaltyTier,
    totalSpent: c.totalSpent,
    privateNotes: c.privateNotes ?? undefined,
    referralCode: c.referralCode ?? undefined,
    referredBy: c.referredBy ?? undefined,
    creditBalance: c.creditBalance,
    creditLimit: c.creditLimit,
    tags: c.tags ?? null,
    lat: c.lat ?? undefined,
    lng: c.lng ?? undefined,
    notifOrderUpdates: c.notifOrderUpdates,
    notifPromotions: c.notifPromotions,
    notifRestock: c.notifRestock,
    createdAt: toISO(c.createdAt),
    updatedAt: toISO(c.updatedAt),
  };
}

function mapReview(r: PReview): DbReview {
  return {
    id: r.id, name: r.name, location: r.location, text: r.text, rating: r.rating,
    phone: r.phone ?? null, productId: (r.productId as number | null | undefined) ?? null,
    status: (r.status ?? "approved") as DbReview["status"],
    date: toISO(r.date),
    ...((r as Record<string, unknown>).adminReply != null && { adminReply: (r as Record<string, unknown>).adminReply as string }),
    ...((r as Record<string, unknown>).adminReplyDate != null && { adminReplyDate: toISO((r as Record<string, unknown>).adminReplyDate as Date) }),
  };
}

function mapShoppingList(l: PShoppingList & { items: PShoppingListItem[] }): DbShoppingList {
  return {
    id: l.id, customerPhone: l.customerPhone, name: l.name,
    items: l.items.map((i: PShoppingListItem) => ({ id: i.id, productId: i.productId, quantity: i.quantity })),
    createdAt: toISO(l.createdAt), updatedAt: toISO(l.updatedAt),
  };
}

// ── Loyalty helpers ───────────────────────────────────────────────────────────

const LOYALTY_TIERS = [
  { name: "bronce", minSpent: 0 },
  { name: "plata", minSpent: 500 },
  { name: "oro", minSpent: 1500 },
  { name: "diamante", minSpent: 5000 },
] as const;

function computeTier(totalSpent: number): string {
  let tier = "bronce";
  for (const t of LOYALTY_TIERS) {
    if (totalSpent >= t.minSpent) tier = t.name;
  }
  return tier;
}

/** 1 point per S/1 spent */
function computePoints(amount: number): number {
  return Math.floor(amount);
}

// ── CustomersDB ───────────────────────────────────────────────────────────────

export const CustomersDB = {
  async getAll(): Promise<DbCustomer[]> {
    const rows = await prisma.customer.findMany({ include: { locations: true }, orderBy: { updatedAt: "desc" } });
    return rows.map(mapCustomer);
  },
  async getByPhone(phone: string): Promise<DbCustomer | null> {
    const row = await prisma.customer.findUnique({ where: { phone: normalizePhone(phone) }, include: { locations: true } });
    return row ? mapCustomer(row) : null;
  },
  async upsert(data: Omit<DbCustomer, "createdAt" | "updatedAt">): Promise<DbCustomer> {
    const locs = (data.locations ?? []).map((l) => ({ id: l.id, location: l.location, reference: l.reference }));
    const row = await prisma.customer.upsert({
      where: { phone: data.phone },
      create: {
        phone: data.phone, name: data.name,
        location: data.location ?? "", reference: data.reference ?? "",
        activeLocationId: data.activeLocationId ?? null,
        ...(data.birthday && { birthday: new Date(data.birthday) }),
        locations: { create: locs },
      },
      update: {
        name: data.name, location: data.location ?? "", reference: data.reference ?? "",
        activeLocationId: data.activeLocationId ?? null,
        ...(data.birthday !== undefined && { birthday: data.birthday ? new Date(data.birthday) : null }),
        locations: { deleteMany: {}, create: locs },
      },
      include: { locations: true },
    });
    return mapCustomer(row);
  },
  async delete(phone: string): Promise<void> {
    await prisma.customer.delete({ where: { phone: normalizePhone(phone) } }).catch(() => {});
  },
  async updateAiNotes(phone: string, aiNotes: string): Promise<void> {
    await prisma.customer.update({ where: { phone: normalizePhone(phone) }, data: { aiNotes, aiNotesDate: new Date() } });
  },
  async updatePrivateNotes(phone: string, privateNotes: string): Promise<void> {
    await prisma.customer.update({ where: { phone: normalizePhone(phone) }, data: { privateNotes } });
  },
  async updateCreditBalance(phone: string, delta: number): Promise<number> {
    const c = await prisma.customer.update({
      where: { phone: normalizePhone(phone) },
      data: { creditBalance: { increment: delta } },
    });
    return c.creditBalance;
  },
  /** Generate a unique referral code for a customer if they don't have one */
  async ensureReferralCode(phone: string): Promise<string> {
    const normalized = normalizePhone(phone);
    const c = await prisma.customer.findUnique({ where: { phone: normalized }, select: { referralCode: true } });
    if (c?.referralCode) return c.referralCode;
    // Generate 6-char alphanumeric code
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    await prisma.customer.update({ where: { phone: normalized }, data: { referralCode: code } }).catch(() => {});
    return code;
  },
  /** Apply a referral code: credits 50 points to referrer, links referredBy */
  async applyReferralCode(phone: string, code: string): Promise<{ success: boolean; message: string }> {
    const normalized = normalizePhone(phone);
    const c = await prisma.customer.findUnique({ where: { phone: normalized } });
    if (!c) return { success: false, message: "Cliente no encontrado" };
    if (c.referredBy) return { success: false, message: "Ya usaste un código de referido" };
    if (c.referralCode === code) return { success: false, message: "No puedes usar tu propio código" };
    const referrer = await prisma.customer.findUnique({ where: { referralCode: code } });
    if (!referrer) return { success: false, message: "Código no válido" };
    // Award 50 points to referrer
    await prisma.customer.update({ where: { phone: referrer.phone }, data: { loyaltyPoints: { increment: 50 } } });
    // Link referredBy on the new customer
    await prisma.customer.update({ where: { phone: normalized }, data: { referredBy: referrer.phone } });
    return { success: true, message: "Código aplicado correctamente" };
  },
};

// ── LoyaltyDB ─────────────────────────────────────────────────────────────────

export const LoyaltyDB = {
  async getByPhone(phone: string) {
    const normalized = normalizePhone(phone);
    const c = await prisma.customer.findUnique({ where: { phone: normalized } });
    if (!c) return null;
    return { phone: c.phone, name: c.name, loyaltyPoints: c.loyaltyPoints, loyaltyTier: c.loyaltyTier, totalSpent: c.totalSpent, referralCode: c.referralCode ?? null, creditBalance: c.creditBalance };
  },
  /** Accrue points for a completed order/sale */
  async accruePoints(phone: string, amount: number) {
    const normalized = normalizePhone(phone);
    const c = await prisma.customer.findUnique({ where: { phone: normalized } });
    if (!c) return null;
    const newTotal = c.totalSpent + amount;
    const newPoints = c.loyaltyPoints + computePoints(amount);
    const newTier = computeTier(newTotal);
    await prisma.customer.update({
      where: { phone: normalized },
      data: { totalSpent: newTotal, loyaltyPoints: newPoints, loyaltyTier: newTier },
    });
    return { phone: normalized, loyaltyPoints: newPoints, loyaltyTier: newTier, totalSpent: newTotal };
  },
  /** Redeem points (returns false if insufficient) */
  async redeemPoints(phone: string, points: number) {
    const normalized = normalizePhone(phone);
    const c = await prisma.customer.findUnique({ where: { phone: normalized } });
    if (!c || c.loyaltyPoints < points) return false;
    await prisma.customer.update({
      where: { phone: normalized },
      data: { loyaltyPoints: c.loyaltyPoints - points },
    });
    return true;
  },
  TIERS: LOYALTY_TIERS,
};

// ── ReviewsDB ─────────────────────────────────────────────────────────────────

export const ReviewsDB = {
  async getAll(): Promise<DbReview[]> {
    return (await prisma.review.findMany({ orderBy: { date: "desc" } })).map(mapReview);
  },
  async getApproved(productId?: number): Promise<DbReview[]> {
    const where = productId != null
      ? { status: "approved", productId }
      : { status: "approved" };
    return (await prisma.review.findMany({ where, orderBy: { date: "desc" } })).map(mapReview);
  },
  async add(r: DbReview): Promise<DbReview> {
    const productIdVal = r.productId ?? null;
    const row = await prisma.review.upsert({
      where: { id: r.id },
      create: { id: r.id, name: r.name, location: r.location, text: r.text, rating: r.rating, phone: r.phone, ...(productIdVal != null && { productId: productIdVal }), status: r.status ?? "pending", date: new Date(r.date) },
      update: { name: r.name, location: r.location, text: r.text, rating: r.rating, phone: r.phone, ...(productIdVal != null && { productId: productIdVal }), status: r.status ?? "pending", date: new Date(r.date) },
    });
    return mapReview(row);
  },
  async updateStatus(id: string, status: DbReview["status"]): Promise<void> {
    await prisma.review.update({ where: { id }, data: { status } }).catch(() => {});
  },
  async updateReply(id: string, adminReply: string | null): Promise<void> {
    await prisma.$executeRaw`
      UPDATE "Review"
      SET "adminReply" = ${adminReply},
          "adminReplyDate" = ${adminReply != null ? new Date() : null}
      WHERE id = ${id}
    `.catch(() => {});
  },
  async delete(id: string): Promise<void> {
    await prisma.review.delete({ where: { id } }).catch(() => {});
  },

  /** Aggregate ratings per product (approved reviews only) */
  async getAggregatedRatings(tenantId = "main"): Promise<Record<number, { rating: number; reviewCount: number }>> {
    const rows = await prisma.review.groupBy({
      by: ["productId"],
      where: { status: "approved", productId: { not: null }, tenantId, deletedAt: null },
      _avg: { rating: true },
      _count: { rating: true },
    });
    const result: Record<number, { rating: number; reviewCount: number }> = {};
    for (const row of rows) {
      if (row.productId != null) {
        result[row.productId] = {
          rating: Math.round((row._avg.rating ?? 0) * 10) / 10,
          reviewCount: row._count.rating,
        };
      }
    }
    return result;
  },
};

// ── ShoppingListsDB ───────────────────────────────────────────────────────────

export const ShoppingListsDB = {
  async getByPhone(phone: string): Promise<DbShoppingList[]> {
    return (await prisma.shoppingList.findMany({
      where: { customerPhone: normalizePhone(phone) },
      include: { items: true },
      orderBy: { updatedAt: "desc" },
    })).map(mapShoppingList);
  },
  async add(data: { customerPhone: string; name: string; items: { productId: number; quantity: number }[] }): Promise<DbShoppingList> {
    const row = await prisma.shoppingList.create({
      data: {
        customerPhone: normalizePhone(data.customerPhone), name: data.name,
        items: { create: data.items },
      },
      include: { items: true },
    });
    return mapShoppingList(row);
  },
  async update(id: string, data: { name?: string; items?: { productId: number; quantity: number }[] }): Promise<DbShoppingList | null> {
    const existing = await prisma.shoppingList.findUnique({ where: { id } });
    if (!existing) return null;
    if (data.items) {
      await prisma.shoppingListItem.deleteMany({ where: { shoppingListId: id } });
      await prisma.shoppingListItem.createMany({ data: data.items.map(i => ({ shoppingListId: id, productId: i.productId, quantity: i.quantity })) });
    }
    if (data.name) await prisma.shoppingList.update({ where: { id }, data: { name: data.name } });
    const row = await prisma.shoppingList.findUnique({ where: { id }, include: { items: true } });
    return row ? mapShoppingList(row) : null;
  },
  async delete(id: string): Promise<void> {
    await prisma.shoppingList.delete({ where: { id } }).catch(() => {});
  },
};
