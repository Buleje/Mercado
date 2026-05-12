import "server-only";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type {
  Customer as PCustomer,
  SavedLocation as PSavedLocation,
  Review as PReview,
  ShoppingList as PShoppingList,
  ShoppingListItem as PShoppingListItem,
} from "@/lib/generated/prisma/client";
import type { DbCustomer, DbReview } from "./misc.db";
import { normalizePhone } from "./misc.db";
import { toNumOrZero } from "@/lib/decimal-utils";

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
    email: c.email ?? undefined,
    location: c.location,
    reference: c.reference,
    locations: c.locations.map((l: PSavedLocation) => ({ id: l.id, location: l.location, reference: l.reference })),
    activeLocationId: c.activeLocationId,
    birthday: c.birthday ? toISO(c.birthday) : undefined,
    aiNotes: c.aiNotes ?? undefined,
    aiNotesDate: c.aiNotesDate ? toISO(c.aiNotesDate) : undefined,
    loyaltyPoints: c.loyaltyPoints,
    loyaltyTier: c.loyaltyTier,
    totalSpent: toNumOrZero(c.totalSpent),
    privateNotes: c.privateNotes ?? undefined,
    referralCode: c.referralCode ?? undefined,
    referredBy: c.referredBy ?? undefined,
    creditBalance: toNumOrZero(c.creditBalance),
    creditLimit: toNumOrZero(c.creditLimit),
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
  async getAll(tenantId: string): Promise<DbCustomer[]> {
    const where: Record<string, unknown> = { tenantId };
    const rows = await prisma.customer.findMany({ where, include: { locations: true }, orderBy: { updatedAt: "desc" } });
    return rows.map(mapCustomer);
  },

  /**
   * Cursor-based paginated listing of customers.
   * Uses phone as the cursor since it's the PK. Returns up to `limit` rows.
   */
  async getPage(opts: {
    tenantId: string;
    cursor?: string;
    limit?: number;
    search?: string;
  }): Promise<{ customers: DbCustomer[]; nextCursor: string | null; total: number }> {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);

    const where: Record<string, unknown> = {};
    if (opts.tenantId) where.tenantId = opts.tenantId;
    if (opts.search) {
      where.OR = [
        { name: { contains: opts.search, mode: "insensitive" } },
        { phone: { contains: opts.search } },
      ];
    }

    const [rows, total] = await prisma.$transaction([
      prisma.customer.findMany({
        where,
        include: { locations: true },
        orderBy: { updatedAt: "desc" },
        take: limit + 1,
        ...(opts.cursor ? { skip: 1, cursor: { phone: opts.cursor } } : {}),
      }),
      prisma.customer.count({ where }),
    ]);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1].phone : null;

    return { customers: items.map(mapCustomer), nextCursor, total };
  },
  async getByPhone(phone: string, tenantId: string): Promise<DbCustomer | null> {
    // SECURITY 2026-05-07 (audit MT1): tenantId REQUERIDO. Antes era opcional —
    // caller que omitía resolvía customer cross-tenant porque Customer.phone
    // tiene unique global. Phone se reusa entre tenants = fuga.
    if (!tenantId) throw new Error("CustomersDB.getByPhone: tenantId requerido");
    const normalized = normalizePhone(phone);
    const row = await prisma.customer.findFirst({
      where: { phone: normalized, tenantId },
      include: { locations: true },
    });
    return row ? mapCustomer(row) : null;
  },
  /** Find the first customer with a given email within a tenant. */
  async getByEmail(email: string, tenantId: string): Promise<DbCustomer | null> {
    const row = await prisma.customer.findFirst({
      where: { email, tenantId },
      include: { locations: true },
    });
    return row ? mapCustomer(row) : null;
  },
  async upsert(data: Omit<DbCustomer, "createdAt" | "updatedAt">, tenantId: string): Promise<DbCustomer> {
    const locs = (data.locations ?? []).map((l) => ({ id: l.id, location: l.location, reference: l.reference }));
    const row = await prisma.customer.upsert({
      where: { phone: data.phone },
      create: {
        phone: data.phone, name: data.name,
        location: data.location ?? "", reference: data.reference ?? "",
        activeLocationId: data.activeLocationId ?? null,
        tenantId,
        ...(data.email && { email: data.email }),
        ...(data.birthday && { birthday: new Date(data.birthday) }),
        locations: { create: locs },
      },
      update: {
        name: data.name, location: data.location ?? "", reference: data.reference ?? "",
        activeLocationId: data.activeLocationId ?? null,
        ...(data.email && { email: data.email }),
        ...(data.birthday !== undefined && { birthday: data.birthday ? new Date(data.birthday) : null }),
        locations: { deleteMany: {}, create: locs },
      },
      include: { locations: true },
    });
    return mapCustomer(row);
  },
  async delete(tenantId: string, phone: string): Promise<void> {
    await prisma.customer.deleteMany({ where: { phone: normalizePhone(phone), tenantId } }).catch((err) => logger.error("[customers.db] customer delete failed", { error: String(err), phone }));
  },
  async updateAiNotes(tenantId: string, phone: string, aiNotes: string): Promise<void> {
    await prisma.customer.updateMany({ where: { phone: normalizePhone(phone), tenantId }, data: { aiNotes, aiNotesDate: new Date() } });
  },
  async updatePrivateNotes(tenantId: string, phone: string, privateNotes: string): Promise<void> {
    await prisma.customer.updateMany({ where: { phone: normalizePhone(phone), tenantId }, data: { privateNotes } });
  },
  async updateCreditBalance(tenantId: string, phone: string, delta: number): Promise<number> {
    // SECURITY 2026-05-06 (audit DB #5): si delta > 0 (gasta más fiado),
    // verificar que `creditBalance + delta <= creditLimit` atómicamente vía
    // raw SQL. Antes 2 orders concurrentes podían pasar el check de límite
    // y luego ambas hacer increment → exceder creditLimit (fraude).
    const normalized = normalizePhone(phone);
    if (delta > 0) {
      // guard atómico de credit limit (audit DB #5).
      const result = await prisma.$executeRawUnsafe(
        `UPDATE "Customer"
            SET "creditBalance" = "creditBalance" + $1
          WHERE phone = $2 AND "tenantId" = $3
            AND "creditBalance" + $1 <= "creditLimit"`,
        delta,
        normalized,
        tenantId,
      );
      if (result === 0) {
        throw new Error("CREDIT_LIMIT_EXCEEDED");
      }
    } else {
      // delta <= 0: pago/reverso, no necesita guard.
      await prisma.customer.updateMany({
        where: { phone: normalized, tenantId },
        data: { creditBalance: { increment: delta } },
      });
    }
    const c = await prisma.customer.findFirst({ where: { phone: normalized, tenantId }, select: { creditBalance: true } });
    return toNumOrZero(c?.creditBalance);
  },
  /** Generate a unique referral code for a customer if they don't have one */
  async ensureReferralCode(tenantId: string, phone: string): Promise<string> {
    const normalized = normalizePhone(phone);
    const c = await prisma.customer.findFirst({ where: { phone: normalized, tenantId }, select: { referralCode: true } });
    if (c?.referralCode) return c.referralCode;
    // Generate 6-char alphanumeric code
    const code = randomBytes(6).toString("base64url").slice(0, 8).toUpperCase();
    await prisma.customer.updateMany({ where: { phone: normalized, tenantId }, data: { referralCode: code } }).catch((err) => logger.error("[customers.db] referralCode assign failed", { error: String(err), phone: normalized }));
    return code;
  },
  /** Apply a referral code: credits 50 points to referrer, links referredBy */
  async applyReferralCode(tenantId: string, phone: string, code: string): Promise<{ success: boolean; message: string }> {
    const normalized = normalizePhone(phone);
    const c = await prisma.customer.findFirst({ where: { phone: normalized, tenantId } });
    if (!c) return { success: false, message: "Cliente no encontrado" };
    if (c.referredBy) return { success: false, message: "Ya usaste un código de referido" };
    if (c.referralCode === code) return { success: false, message: "No puedes usar tu propio código" };
    const referrer = await prisma.customer.findFirst({ where: { referralCode: code, tenantId } });
    if (!referrer) return { success: false, message: "Código no válido" };
    // Award 50 points to referrer (tenant-scoped)
    await prisma.customer.updateMany({ where: { phone: referrer.phone, tenantId }, data: { loyaltyPoints: { increment: 50 } } });
    // Link referredBy on the new customer
    await prisma.customer.updateMany({ where: { phone: normalized, tenantId }, data: { referredBy: referrer.phone } });
    return { success: true, message: "Código aplicado correctamente" };
  },
};

// ── LoyaltyDB ─────────────────────────────────────────────────────────────────

export const LoyaltyDB = {
  async getByPhone(tenantId: string, phone: string) {
    const normalized = normalizePhone(phone);
    const c = await prisma.customer.findFirst({ where: { phone: normalized, tenantId } });
    if (!c) return null;
    return { phone: c.phone, name: c.name, loyaltyPoints: c.loyaltyPoints, loyaltyTier: c.loyaltyTier, totalSpent: c.totalSpent, referralCode: c.referralCode ?? null, creditBalance: c.creditBalance };
  },
  /** Accrue points for a completed order/sale */
  async accruePoints(tenantId: string, phone: string, amount: number) {
    const normalized = normalizePhone(phone);
    const c = await prisma.customer.findFirst({ where: { phone: normalized, tenantId } });
    if (!c) return null;
    const newTotal = toNumOrZero(c.totalSpent) + amount;
    const newPoints = c.loyaltyPoints + computePoints(amount);
    const newTier = computeTier(newTotal);
    await prisma.customer.updateMany({
      where: { phone: normalized, tenantId },
      data: { totalSpent: newTotal, loyaltyPoints: newPoints, loyaltyTier: newTier },
    });
    return { phone: normalized, loyaltyPoints: newPoints, loyaltyTier: newTier, totalSpent: newTotal };
  },
  /** Redeem points (returns false if insufficient) */
  async redeemPoints(tenantId: string, phone: string, points: number) {
    const normalized = normalizePhone(phone);
    const c = await prisma.customer.findFirst({ where: { phone: normalized, tenantId } });
    if (!c || c.loyaltyPoints < points) return false;
    await prisma.customer.updateMany({
      where: { phone: normalized, tenantId },
      data: { loyaltyPoints: c.loyaltyPoints - points },
    });
    return true;
  },
  TIERS: LOYALTY_TIERS,
};

// ── ReviewsDB ─────────────────────────────────────────────────────────────────

export const ReviewsDB = {
  async getAll(tenantId: string): Promise<DbReview[]> {
    const where: Record<string, unknown> = { tenantId };
    // Round 7 fix: cap a 1000 rows. Sin take, un tenant con 50k reviews trae todo a memoria.
    return (await prisma.review.findMany({ where, orderBy: { date: "desc" }, take: 1000 })).map(mapReview);
  },
  async getApproved(tenantId: string, productId?: number): Promise<DbReview[]> {
    const where = productId != null
      ? { status: "approved", productId, tenantId }
      : { status: "approved", tenantId };
    return (await prisma.review.findMany({ where, orderBy: { date: "desc" }, take: 1000 })).map(mapReview);
  },
  async add(r: DbReview, tenantId: string): Promise<DbReview> {
    const productIdVal = r.productId ?? null;
    // Pre-check: if a review with this id exists, it must belong to this tenant
    const existing = await prisma.review.findUnique({ where: { id: r.id }, select: { tenantId: true } });
    if (existing && existing.tenantId !== tenantId) throw new Error("cross-tenant upsert denied");
    const row = await prisma.review.upsert({
      where: { id: r.id },
      create: { id: r.id, name: r.name, location: r.location, text: r.text, rating: r.rating, phone: r.phone, ...(productIdVal != null && { productId: productIdVal }), status: r.status ?? "pending", date: new Date(r.date), tenantId },
      update: { name: r.name, location: r.location, text: r.text, rating: r.rating, phone: r.phone, ...(productIdVal != null && { productId: productIdVal }), status: r.status ?? "pending", date: new Date(r.date) },
    });
    return mapReview(row);
  },
  async updateStatus(tenantId: string, id: string, status: DbReview["status"]): Promise<void> {
    await prisma.review.updateMany({ where: { id, tenantId }, data: { status } }).catch((err) => logger.error("[customers.db] review status update failed", { error: String(err), id, status }));
  },
  async updateReply(tenantId: string, id: string, adminReply: string | null): Promise<void> {
    await prisma.review.updateMany({
      where: { id, tenantId },
      data: { adminReply, adminReplyDate: adminReply != null ? new Date() : null } as Record<string, unknown>,
    }).catch((err) => logger.error("[customers.db] review adminReply update failed", { error: String(err), id }));
  },
  async delete(tenantId: string, id: string): Promise<void> {
    await prisma.review.deleteMany({ where: { id, tenantId } }).catch((err) => logger.error("[customers.db] review delete failed", { error: String(err), id }));
  },

  /** Aggregate ratings per product (approved reviews only) */
  async getAggregatedRatings(tenantId: string): Promise<Record<number, { rating: number; reviewCount: number }>> {
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
  async getByPhone(tenantId: string, phone: string): Promise<DbShoppingList[]> {
    return (await prisma.shoppingList.findMany({
      where: { customerPhone: normalizePhone(phone), tenantId },
      include: { items: true },
      orderBy: { updatedAt: "desc" },
    })).map(mapShoppingList);
  },
  async add(data: { customerPhone: string; name: string; items: { productId: number; quantity: number }[]; tenantId: string }): Promise<DbShoppingList> {
    const row = await prisma.shoppingList.create({
      data: {
        customerPhone: normalizePhone(data.customerPhone), name: data.name,
        tenantId: data.tenantId,
        items: { create: data.items },
      },
      include: { items: true },
    });
    return mapShoppingList(row);
  },
  async update(tenantId: string, id: string, data: { name?: string; items?: { productId: number; quantity: number }[] }): Promise<DbShoppingList | null> {
    const existing = await prisma.shoppingList.findFirst({ where: { id, tenantId } });
    if (!existing) return null;
    if (data.items) {
      // eslint-disable-next-line no-restricted-syntax -- ShoppingListItem indirecto (ADR-101) FK→ShoppingList. shoppingListId pre-validado via findFirst con tenantId arriba.
      await prisma.shoppingListItem.deleteMany({ where: { shoppingListId: id } });
      await prisma.shoppingListItem.createMany({ data: data.items.map(i => ({ shoppingListId: id, productId: i.productId, quantity: i.quantity })) });
    }
    if (data.name) await prisma.shoppingList.updateMany({ where: { id, tenantId }, data: { name: data.name } });
    const row = await prisma.shoppingList.findFirst({ where: { id, tenantId }, include: { items: true } });
    return row ? mapShoppingList(row) : null;
  },
  async delete(tenantId: string, id: string): Promise<void> {
    await prisma.shoppingList.deleteMany({ where: { id, tenantId } }).catch((err) => logger.error("[customers.db] shoppingList delete failed", { error: String(err), id }));
  },
};
