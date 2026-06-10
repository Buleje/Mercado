import "server-only";
import { randomBytes } from "crypto";
// TD-116 (2026-06-10): lecturas de Customer envueltas en withRlsTx (ver orders.db).
import { withRlsTx } from "@/lib/prisma-rls";
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

/**
 * ADR-119 fix — Datos legacy: `upsert` escribe `data.phone` SIN normalizar, así
 * que conviven clientes guardados como "999111222", "51999111222" y
 * "+51999111222". Los lectores normalizan a 9 dígitos y nunca matcheaban las
 * filas con prefijo → 404 en Customer 360. Este helper arma los candidatos de
 * formato comunes (Perú) para una lectura tolerante. NO cambia writes ni
 * normalizePhone (blast radius). Root-cause real (normalizar-al-escribir +
 * migración) queda como follow-up de su propio sprint.
 */
function phoneMatchCandidates(phone: string): string[] {
  const normalized = normalizePhone(phone); // últimos 9 dígitos
  return Array.from(
    new Set([normalized, `51${normalized}`, `+51${normalized}`, phone.trim()].filter(Boolean))
  );
}

// ── CustomersDB ───────────────────────────────────────────────────────────────

export const CustomersDB = {
  async getAll(tenantId: string, limit = 2000): Promise<DbCustomer[]> {
    const where: Record<string, unknown> = { tenantId };
    const rows = await withRlsTx(tenantId, (tx) => tx.customer.findMany({ where, include: { locations: true }, orderBy: { updatedAt: "desc" }, take: limit }));
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

    // TD-116: batch-tx → Promise.all dentro de la tx RLS (ver orders.getPage)
    const [rows, total] = await withRlsTx(opts.tenantId, (tx) =>
      Promise.all([
        tx.customer.findMany({
          where,
          include: { locations: true },
          orderBy: { updatedAt: "desc" },
          take: limit + 1,
          ...(opts.cursor ? { skip: 1, cursor: { phone: opts.cursor } } : {}),
        }),
        tx.customer.count({ where }),
      ]),
    );

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
    // Lectura tolerante a formatos legacy (999.../51.../+51...). Ver phoneMatchCandidates.
    const row = await withRlsTx(tenantId, (tx) => tx.customer.findFirst({
      where: { phone: { in: phoneMatchCandidates(phone) }, tenantId },
      include: { locations: true },
    }));
    return row ? mapCustomer(row) : null;
  },
  /** Find the first customer with a given email within a tenant. */
  async getByEmail(email: string, tenantId: string): Promise<DbCustomer | null> {
    const row = await withRlsTx(tenantId, (tx) => tx.customer.findFirst({
      where: { email, tenantId },
      include: { locations: true },
    }));
    return row ? mapCustomer(row) : null;
  },

  /**
   * existsInTenant: solo verifica si el customer (por phone normalizado)
   * pertenece al tenant. Usado para gates de read publico que requieren
   * scope explicito sin descargar PII.
   * Audit project-wide 2026-05-19 — migracion de marketplace/loyalty.
   */
  async existsInTenant(tenantId: string, phone: string): Promise<boolean> {
    if (!tenantId) throw new Error("CustomersDB.existsInTenant: tenantId requerido");
    const normalized = normalizePhone(phone);
    const row = await withRlsTx(tenantId, (tx) => tx.customer.findFirst({
      where: { phone: normalized, tenantId },
      select: { tenantId: true },
    }));
    return !!row;
  },

  /**
   * getPiiSummary: lee name + totalSpent del customer dentro del tenant.
   * Devuelve null si no existe. Solo expone los campos PII estrictamente
   * necesarios para el dashboard admin (no toda la entidad).
   */
  async getPiiSummary(
    tenantId: string,
    phone: string,
  ): Promise<{ name: string; totalSpent: number } | null> {
    if (!tenantId) throw new Error("CustomersDB.getPiiSummary: tenantId requerido");
    const normalized = normalizePhone(phone);
    const row = await withRlsTx(tenantId, (tx) => tx.customer.findFirst({
      where: { phone: normalized, tenantId },
      select: { name: true, totalSpent: true },
    }));
    if (!row) return null;
    return { name: row.name, totalSpent: Number(row.totalSpent) };
  },

  /**
   * Lee las preferencias de notificacion del customer (Ley 29733 consent).
   * Audit project-wide 2026-05-19 — migracion de /api/customer-preferences.
   */
  async getPreferences(
    tenantId: string,
    phone: string,
  ): Promise<{ notifOrderUpdates: boolean; notifPromotions: boolean; notifRestock: boolean } | null> {
    if (!tenantId) throw new Error("CustomersDB.getPreferences: tenantId requerido");
    const normalized = normalizePhone(phone);
    return prisma.customer.findFirst({
      where: { phone: normalized, tenantId },
      select: { notifOrderUpdates: true, notifPromotions: true, notifRestock: true },
    });
  },

  /**
   * Actualiza preferencias de notif. updateMany con doble filtro (phone +
   * tenantId) para evitar cross-tenant write (Customer.phone es @unique
   * global, TD-040 fase 3 pendiente — CRITICAL FIX 2026-05-11 P0-1).
   * Retorna las prefs actualizadas o null si no existia.
   */
  async updatePreferences(
    tenantId: string,
    phone: string,
    data: Partial<{ notifOrderUpdates: boolean; notifPromotions: boolean; notifRestock: boolean }>,
  ): Promise<{ notifOrderUpdates: boolean; notifPromotions: boolean; notifRestock: boolean } | null> {
    if (!tenantId) throw new Error("CustomersDB.updatePreferences: tenantId requerido");
    const normalized = normalizePhone(phone);
    return withRlsTx(tenantId, async (tx) => {
      const result = await tx.customer.updateMany({
        where: { phone: normalized, tenantId },
        data,
      });
      if (result.count === 0) return null;
      return tx.customer.findFirst({
        where: { phone: normalized, tenantId },
        select: { notifOrderUpdates: true, notifPromotions: true, notifRestock: true },
      });
    });
  },
  async upsert(data: Omit<DbCustomer, "createdAt" | "updatedAt">, tenantId: string): Promise<DbCustomer> {
    if (!tenantId) throw new Error("CustomersDB.upsert: tenantId requerido");
    const locs = (data.locations ?? []).map((l) => ({ id: l.id, location: l.location, reference: l.reference }));

    // Brandon 2026-05-28 P0 (auditoría seguridad #3 — multi-tenant data integrity):
    // Antes este método hacía `prisma.customer.upsert({ where: { phone } })` lo cual
    // ignoraba `tenantId` porque `phone` tiene `@unique` global (scaffolding temporal
    // TD-040 Phase 1). Si dos tenants tenían un cliente con el mismo número (común en
    // Pucallpa con familiares), el upsert del tenant B sobrescribía datos del tenant A.
    // Fix sin cambio de schema: findFirst({ phone, tenantId }) → update | create,
    // scopeado por tenantId en ambas ramas. La constraint global de `phone @unique`
    // sigue vigente hasta TD-040 Phase 3 (drop @unique → @@unique([tenantId, phone])),
    // entonces si la creación falla por colisión cross-tenant, retornamos error explícito.
    // TD-116: findFirst + update|create en UNA tx RLS (atómico).
    return withRlsTx(tenantId, async (tx) => {
    const existing = await tx.customer.findFirst({
      where: { phone: data.phone, tenantId },
      select: { id: true },
    });

    if (existing) {
      const row = await tx.customer.update({
        where: { id: existing.id },
        data: {
          name: data.name, location: data.location ?? "", reference: data.reference ?? "",
          activeLocationId: data.activeLocationId ?? null,
          ...(data.email && { email: data.email }),
          ...(data.birthday !== undefined && { birthday: data.birthday ? new Date(data.birthday) : null }),
          locations: { deleteMany: {}, create: locs },
        },
        include: { locations: true },
      });
      return mapCustomer(row);
    }

    // No existe en este tenant. Crear — si `phone` ya está tomado por otro tenant,
    // Prisma lanza P2002 (unique constraint). Lo capturamos para devolver mensaje
    // claro hasta que TD-040 Phase 3 elimine el global @unique.
    try {
      const row = await tx.customer.create({
        data: {
          phone: data.phone, name: data.name,
          location: data.location ?? "", reference: data.reference ?? "",
          activeLocationId: data.activeLocationId ?? null,
          tenantId,
          ...(data.email && { email: data.email }),
          ...(data.birthday && { birthday: new Date(data.birthday) }),
          locations: { create: locs },
        },
        include: { locations: true },
      });
      return mapCustomer(row);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "P2002") {
        // El teléfono ya existe en otro tenant — schema global @unique aún vigente.
        throw new Error(
          `El teléfono ${data.phone} ya está registrado en otra tienda. ` +
            "Esta restricción es temporal (TD-040 Phase 3 pendiente).",
        );
      }
      throw err;
    }
    });
  },
  async delete(tenantId: string, phone: string): Promise<void> {
    await withRlsTx(tenantId, (tx) => tx.customer.deleteMany({ where: { phone: normalizePhone(phone), tenantId } })).catch((err) => logger.error("[customers.db] customer delete failed", { error: String(err), phone }));
  },
  async updateAiNotes(tenantId: string, phone: string, aiNotes: string): Promise<void> {
    await withRlsTx(tenantId, (tx) => tx.customer.updateMany({ where: { phone: normalizePhone(phone), tenantId }, data: { aiNotes, aiNotesDate: new Date() } }));
  },
  async updatePrivateNotes(tenantId: string, phone: string, privateNotes: string): Promise<void> {
    await withRlsTx(tenantId, (tx) => tx.customer.updateMany({ where: { phone: normalizePhone(phone), tenantId }, data: { privateNotes } }));
  },
  async updateCreditBalance(tenantId: string, phone: string, delta: number): Promise<number> {
    // SECURITY 2026-05-06 (audit DB #5): si delta > 0 (gasta más fiado),
    // verificar que `creditBalance + delta <= creditLimit` atómicamente vía
    // raw SQL. Antes 2 orders concurrentes podían pasar el check de límite
    // y luego ambas hacer increment → exceder creditLimit (fraude).
    const normalized = normalizePhone(phone);
    // TD-116: guard + readback en UNA tx RLS (el guard atómico se preserva).
    return withRlsTx(tenantId, async (tx) => {
    if (delta > 0) {
      // guard atómico de credit limit (audit DB #5).
      const result = await tx.$executeRawUnsafe(
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
      await tx.customer.updateMany({
        where: { phone: normalized, tenantId },
        data: { creditBalance: { increment: delta } },
      });
    }
    const c = await tx.customer.findFirst({ where: { phone: normalized, tenantId }, select: { creditBalance: true } });
    return toNumOrZero(c?.creditBalance);
    });
  },
  /** Generate a unique referral code for a customer if they don't have one */
  async ensureReferralCode(tenantId: string, phone: string): Promise<string> {
    const normalized = normalizePhone(phone);
    const c = await withRlsTx(tenantId, (tx) => tx.customer.findFirst({ where: { phone: normalized, tenantId }, select: { referralCode: true } }));
    if (c?.referralCode) return c.referralCode;
    // Generate 6-char alphanumeric code
    const code = randomBytes(6).toString("base64url").slice(0, 8).toUpperCase();
    await withRlsTx(tenantId, (tx) => tx.customer.updateMany({ where: { phone: normalized, tenantId }, data: { referralCode: code } })).catch((err) => logger.error("[customers.db] referralCode assign failed", { error: String(err), phone: normalized }));
    return code;
  },
  /** Apply a referral code: credits 50 points to referrer, links referredBy */
  async applyReferralCode(tenantId: string, phone: string, code: string): Promise<{ success: boolean; message: string }> {
    const normalized = normalizePhone(phone);
    // TD-116: todo el flujo en UNA tx RLS (de paso: premio + link atómicos).
    return withRlsTx(tenantId, async (tx) => {
      const c = await tx.customer.findFirst({ where: { phone: normalized, tenantId } });
      if (!c) return { success: false, message: "Cliente no encontrado" };
      if (c.referredBy) return { success: false, message: "Ya usaste un código de referido" };
      if (c.referralCode === code) return { success: false, message: "No puedes usar tu propio código" };
      const referrer = await tx.customer.findFirst({ where: { referralCode: code, tenantId } });
      if (!referrer) return { success: false, message: "Código no válido" };
      // Award 50 points to referrer (tenant-scoped)
      await tx.customer.updateMany({ where: { phone: referrer.phone, tenantId }, data: { loyaltyPoints: { increment: 50 } } });
      // Link referredBy on the new customer
      await tx.customer.updateMany({ where: { phone: normalized, tenantId }, data: { referredBy: referrer.phone } });
      return { success: true, message: "Código aplicado correctamente" };
    });
  },

  /**
   * Cuenta cuantos customers usaron el referral code de un usuario.
   * Audit project-wide 2026-05-19 (CodeReview P0 #1): migracion de
   * prisma.customer.count directo en /api/marketplace/referral.
   *
   * @cross-tenant intentional — el referredBy phone es global del
   * ecosistema Buleje (ADR-082). El count es cross-tenant por diseno.
   */
  async countReferralsByPhone(phone: string): Promise<number> {
    return prisma.customer.count({
      where: { referredBy: phone },
    });
  },
};

// ── LoyaltyDB ─────────────────────────────────────────────────────────────────

export const LoyaltyDB = {
  async getByPhone(tenantId: string, phone: string) {
    const normalized = normalizePhone(phone);
    const c = await withRlsTx(tenantId, (tx) => tx.customer.findFirst({ where: { phone: normalized, tenantId } }));
    if (!c) return null;
    return { phone: c.phone, name: c.name, loyaltyPoints: c.loyaltyPoints, loyaltyTier: c.loyaltyTier, totalSpent: c.totalSpent, referralCode: c.referralCode ?? null, creditBalance: c.creditBalance };
  },
  /** Accrue points for a completed order/sale */
  async accruePoints(tenantId: string, phone: string, amount: number) {
    const normalized = normalizePhone(phone);
    // TD-116: read-modify-write en UNA tx RLS (de paso cierra la carrera
    // entre dos accruals concurrentes del mismo customer).
    return withRlsTx(tenantId, async (tx) => {
      const c = await tx.customer.findFirst({ where: { phone: normalized, tenantId } });
      if (!c) return null;
      const newTotal = toNumOrZero(c.totalSpent) + amount;
      const newPoints = c.loyaltyPoints + computePoints(amount);
      const newTier = computeTier(newTotal);
      await tx.customer.updateMany({
        where: { phone: normalized, tenantId },
        data: { totalSpent: newTotal, loyaltyPoints: newPoints, loyaltyTier: newTier },
      });
      return { phone: normalized, loyaltyPoints: newPoints, loyaltyTier: newTier, totalSpent: newTotal };
    });
  },
  /** Redeem points (returns false if insufficient) */
  async redeemPoints(tenantId: string, phone: string, points: number) {
    const normalized = normalizePhone(phone);
    // TD-116: check + decremento en UNA tx RLS (cierra doble-canje concurrente).
    return withRlsTx(tenantId, async (tx) => {
      const c = await tx.customer.findFirst({ where: { phone: normalized, tenantId } });
      if (!c || c.loyaltyPoints < points) return false;
      await tx.customer.updateMany({
        where: { phone: normalized, tenantId },
        data: { loyaltyPoints: c.loyaltyPoints - points },
      });
      return true;
    });
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
