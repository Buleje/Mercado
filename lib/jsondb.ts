import "server-only";
import { prisma } from "./prisma";
import type {
  Product as PProduct,
  Customer as PCustomer,
  SavedLocation as PSavedLocation,
  Review as PReview,
  Order as POrder,
  OrderItem as POrderItem,
  Settings as PSettings,
  Supplier as PSupplier,
  PurchaseOrder as PPurchaseOrder,
  PurchaseItem as PPurchaseItem,
  Sale as PSale,
  SaleItem as PSaleItem,
  Promotion as PPromotion,
  Payable as PPayable,
  Payment as PPayment,
  CashRegister as PCashRegister,
  CashMovement as PCashMovement,
  InventoryMovement as PInventoryMovement,
  Coupon as PCoupon,
  Return as PReturn,
  ReturnItem as PReturnItem,
  ShoppingList as PShoppingList,
  ShoppingListItem as PShoppingListItem,
  PriceHistory as PPriceHistory,
  DeliverySlot as PDeliverySlot,
  AdminMessage as PAdminMessage,
  SupplierEvaluation as PSupplierEvaluation,
  Expense as PExpense,
  Bundle as PBundle,
  BundleItem as PBundleItem,
  NotificationLog as PNotificationLog,
  SurveyResponse as PSurveyResponse,
  Warehouse as PWarehouse,
} from "@/lib/generated/prisma/client";

// ── Types (same shapes the route handlers expect) ─────────────────────────────

export type DbSavedLocation = { id: string; location: string; reference: string };

export type DbCustomer = {
  phone: string;
  name: string;
  location: string;
  reference: string;
  locations: DbSavedLocation[];
  activeLocationId: string | null;
  birthday?: string;
  aiNotes?: string;
  aiNotesDate?: string;
  loyaltyPoints: number;
  loyaltyTier: string;
  totalSpent: number;
  privateNotes?: string;
  referralCode?: string;
  referredBy?: string;
  creditBalance: number;
  notifOrderUpdates: boolean;
  notifPromotions: boolean;
  notifRestock: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DbReview = {
  id: string;
  name: string;
  location: string;
  text: string;
  rating: number;
  phone: string | null;
  productId?: number | null;
  status: "pending" | "approved" | "rejected";
  date: string;
  adminReply?: string;
  adminReplyDate?: string;
};

export type DbProduct = {
  id: number;
  name: string;
  category: string;
  price: number;
  costPrice?: number;
  image: string;
  description?: string;
  unit: string;
  badge?: string;
  barcode?: string;
  stock?: number;
  stockMin?: number;
  stockMax?: number;
  active: boolean;
};

export type DbOrderItem = {
  id: number;
  name: string;
  price: number;
  costPrice?: number;
  quantity: number;
  unit: string;
  image: string;
  note?: string;
};

export type DbOrderCustomer = {
  name: string;
  phone?: string;
  location: string;
  reference: string;
};

export type OrderStatus = "pendiente" | "confirmado" | "en_camino" | "entregado" | "cancelado";

export type DbOrder = {
  id: string;
  customer: DbOrderCustomer;
  items: DbOrderItem[];
  total: number;
  totalCogs?: number;
  status: OrderStatus;
  notes?: string;
  paymentMethod?: "yape" | "efectivo";
  yapeOperationNumber?: string;
  /** true = efectivo order with pending debt (not yet collected) */
  deuda?: boolean;
  appliedCouponCode?: string;
  couponDiscount?: number;
  appliedPromoId?: string;
  discountAmount?: number;
  deliverySlot?: string;
  /** Idempotency key: if set, duplicate requests with the same key return the existing order */
  idempotencyKey?: string;
  /** Repartidor asignado al pedido */
  riderName?: string;
  /** Soft delete timestamp — null means the order is active */
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StoreMode = "whatsapp" | "checkout";

export type NavLinkItem = { id: string; visible: boolean };

export type DbSettings = {
  mode: StoreMode;
  businessName?: string;
  businessPhone?: string;
  businessAddress?: string;
  businessLat?: number;
  businessLon?: number;
  logoUrl?: string;
  description?: string;
  hours?: string;
  deliveryZone?: string;
  yapeEnabled?: boolean;
  yapeImage?: string;
  yapeName?: string;
  yapePhone?: string;
  cashEnabled?: boolean;
  navLinks?: NavLinkItem[];
  adminPassword?: string;
  maintenanceMode?: boolean;
  maintenanceMessage?: string;
  adminBypassLogin?: boolean;
  homepageContent?: Record<string, unknown>;
  comboTemplates?: Array<{ id: string; name: string; description: string; emoji: string; categories: string[]; size: number; discount: number }>;
};

export type DbSupplier = {
  id: string;
  name: string;
  ruc?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  createdAt: string;
};

export type PurchaseStatus = "pendiente" | "recibido" | "parcial" | "cancelado";

export type DbPurchaseItem = {
  productId: number;
  name: string;
  quantity: number;
  unitCost: number;
  unit: string;
};

export type DbPurchaseOrder = {
  id: string;
  supplierId: string;
  supplierName: string;
  items: DbPurchaseItem[];
  total: number;
  status: PurchaseStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type DbSaleItem = {
  productId: number;
  name: string;
  price: number;
  costPrice?: number;
  quantity: number;
  unit: string;
};

export type DbSale = {
  id: string;
  items: DbSaleItem[];
  total: number;
  totalCogs?: number;
  payment: "efectivo" | "yape" | "plin" | "tarjeta";
  amountPaid: number;
  change: number;
  customerPhone?: string;
  cashierId?: string;
  createdAt: string;
};

export type DbPromotion = {
  id: string;
  name: string;
  description: string;
  discountPercent: number;
  minPurchase?: number;
  imageUrl?: string;
  message?: string;
  targetType: string;
  targetPhones?: string;
  active: boolean;
  createdAt: string;
  expiresAt?: string;
};

export type PaymentMethod = "efectivo" | "yape" | "plin" | "transferencia";

export type DbPayment = {
  id: string;
  amount: number;
  method: PaymentMethod;
  date: string;
  reference?: string;
};

export type DbPayable = {
  id: string;
  supplierId: string;
  supplierName: string;
  purchaseOrderId?: string;
  description: string;
  amount: number;
  paidAmount: number;
  status: "pendiente" | "parcial" | "pagado";
  dueDate: string;
  payments: DbPayment[];
  createdAt: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : digits;
}

function toISO(d: Date): string {
  return d.toISOString();
}

// ── Mappers (Prisma row → legacy shape) ───────────────────────────────────────

function mapProduct(p: PProduct): DbProduct {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    price: p.price,
    ...(p.costPrice != null && { costPrice: p.costPrice }),
    image: p.image,
    ...(p.description != null && { description: p.description }),
    unit: p.unit,
    ...(p.badge != null && { badge: p.badge }),
    ...(p.barcode != null && { barcode: p.barcode }),
    ...(p.stock != null && { stock: p.stock }),
    ...(p.stockMin != null && { stockMin: p.stockMin }),
    ...(p.stockMax != null && { stockMax: p.stockMax }),
    active: p.active,
  };
}

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

function mapOrder(o: POrder & { items: POrderItem[] }): DbOrder {
  return {
    id: o.id,
    customer: {
      name: o.customerName,
      ...(o.customerPhone && { phone: o.customerPhone }),
      location: o.customerLocation,
      reference: o.customerReference,
    },
    items: o.items.map((i: POrderItem) => ({ id: i.productId ?? 0, name: i.name, price: i.price, ...(i.costPrice != null && { costPrice: i.costPrice }), quantity: i.quantity, unit: i.unit, image: i.image })),
    total: o.total,
    ...(o.totalCogs != null && { totalCogs: o.totalCogs }),
    status: o.status as OrderStatus,
    ...(o.notes != null && { notes: o.notes }),
    ...(o.paymentMethod != null && { paymentMethod: o.paymentMethod as "yape" | "efectivo" }),
    ...(o.yapeOperationNumber != null && { yapeOperationNumber: o.yapeOperationNumber }),
    ...(o.deuda != null && { deuda: o.deuda }),
    ...(o.appliedCouponCode != null && { appliedCouponCode: o.appliedCouponCode }),
    ...(o.couponDiscount != null && { couponDiscount: o.couponDiscount }),
    ...(o.appliedPromoId != null && { appliedPromoId: o.appliedPromoId }),
    ...(o.discountAmount != null && { discountAmount: o.discountAmount }),
    ...((o as Record<string, unknown>).idempotencyKey != null && { idempotencyKey: (o as Record<string, unknown>).idempotencyKey as string }),
    ...((o as Record<string, unknown>).riderName != null && { riderName: (o as Record<string, unknown>).riderName as string }),
    ...((o as Record<string, unknown>).deletedAt != null && { deletedAt: toISO((o as Record<string, unknown>).deletedAt as Date) }),
    createdAt: toISO(o.createdAt),
    updatedAt: toISO(o.updatedAt),
  };
}

function mapSettings(s: PSettings): DbSettings {
  let navLinks: NavLinkItem[] | undefined;
  if (s.navLinksJson) {
    try { navLinks = JSON.parse(s.navLinksJson); } catch { /* ignore */ }
  }
  let parsedComboTemplates: DbSettings["comboTemplates"] | undefined;
  if ((s as Record<string, unknown>).comboTemplatesJson) {
    try { parsedComboTemplates = JSON.parse((s as Record<string, unknown>).comboTemplatesJson as string); } catch { /* ignore */ }
  }
  return {
    mode: s.mode as StoreMode,
    ...(s.businessName != null && { businessName: s.businessName }),
    ...(s.businessPhone != null && { businessPhone: s.businessPhone }),
    ...(s.businessAddress != null && { businessAddress: s.businessAddress }),
    ...(s.businessLat != null && { businessLat: s.businessLat }),
    ...(s.businessLon != null && { businessLon: s.businessLon }),
    ...(s.logoUrl != null && { logoUrl: s.logoUrl }),
    ...(s.description != null && { description: s.description }),
    ...(s.hours != null && { hours: s.hours }),
    ...(s.deliveryZone != null && { deliveryZone: s.deliveryZone }),
    yapeEnabled: s.yapeEnabled,
    ...(s.yapeImage != null && { yapeImage: s.yapeImage }),
    ...(s.yapeName != null && { yapeName: s.yapeName }),
    ...(s.yapePhone != null && { yapePhone: s.yapePhone }),
    cashEnabled: s.cashEnabled,
    ...(navLinks && { navLinks }),
    ...(s.adminPassword != null && { adminPassword: s.adminPassword }),
    maintenanceMode: s.maintenanceMode,
    ...(s.maintenanceMessage != null && { maintenanceMessage: s.maintenanceMessage }),
    adminBypassLogin: s.adminBypassLogin,
    ...(parsedComboTemplates && { comboTemplates: parsedComboTemplates }),
  };
}

function mapSupplier(s: PSupplier): DbSupplier {
  return {
    id: s.id, name: s.name,
    ...(s.ruc != null && { ruc: s.ruc }),
    ...(s.phone != null && { phone: s.phone }),
    ...(s.email != null && { email: s.email }),
    ...(s.address != null && { address: s.address }),
    ...(s.notes != null && { notes: s.notes }),
    createdAt: toISO(s.createdAt),
  };
}

function mapPurchaseOrder(po: PPurchaseOrder & { items: PPurchaseItem[] }): DbPurchaseOrder {
  return {
    id: po.id, supplierId: po.supplierId, supplierName: po.supplierName,
    items: po.items.map((i: PPurchaseItem) => ({ productId: i.productId, name: i.name, quantity: i.quantity, unitCost: i.unitCost, unit: i.unit })),
    total: po.total, status: po.status as PurchaseStatus,
    ...(po.notes != null && { notes: po.notes }),
    createdAt: toISO(po.createdAt), updatedAt: toISO(po.updatedAt),
  };
}

function mapSale(s: PSale & { items: PSaleItem[] }): DbSale {
  return {
    id: s.id,
    items: s.items.map((i: PSaleItem) => ({ productId: i.productId, name: i.name, price: i.price, ...(i.costPrice != null && { costPrice: i.costPrice }), quantity: i.quantity, unit: i.unit })),
    total: s.total, ...(s.totalCogs != null && { totalCogs: s.totalCogs }), payment: s.payment as DbSale["payment"],
    amountPaid: s.amountPaid, change: s.change,
    ...(s.customerPhone != null && { customerPhone: s.customerPhone }),
    ...(s.cashierId != null && { cashierId: s.cashierId }),
    createdAt: toISO(s.createdAt),
  };
}

function mapPromotion(p: PPromotion): DbPromotion {
  return {
    id: p.id, name: p.name, description: p.description, discountPercent: p.discountPercent,
    ...(p.minPurchase != null && { minPurchase: p.minPurchase }),
    ...(p.imageUrl != null && { imageUrl: p.imageUrl }),
    ...(p.message != null && { message: p.message }),
    targetType: p.targetType,
    ...(p.targetPhones != null && { targetPhones: p.targetPhones }),
    active: p.active, createdAt: toISO(p.createdAt),
    ...(p.expiresAt != null && { expiresAt: toISO(p.expiresAt) }),
  };
}

function mapPayable(p: PPayable & { payments: PPayment[] }): DbPayable {
  return {
    id: p.id, supplierId: p.supplierId, supplierName: p.supplierName,
    ...(p.purchaseOrderId != null && { purchaseOrderId: p.purchaseOrderId }),
    description: p.description, amount: p.amount, paidAmount: p.paidAmount,
    status: p.status as DbPayable["status"],
    dueDate: toISO(p.dueDate),
    payments: p.payments.map((pm: PPayment) => ({
      id: pm.id, amount: pm.amount, method: pm.method as PaymentMethod,
      date: toISO(pm.date),
      ...(pm.reference != null && { reference: pm.reference }),
    })),
    createdAt: toISO(p.createdAt),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
//  DB MODULES — all async, same API shape as the old JSON-based ones
// ══════════════════════════════════════════════════════════════════════════════

// ── Products ──────────────────────────────────────────────────────────────────

export const ProductsDB = {
  async getAll(): Promise<DbProduct[]> {
    // Fetch all, then filter soft-deleted in-memory until `prisma generate` runs after migration 20260316
    const allRows = await prisma.product.findMany({ orderBy: { id: "asc" } });
    const rows = allRows.filter(r => (r as Record<string, unknown>).deletedAt == null);
    if (rows.length === 0) {
      const { products } = await import("@/data/products");
      for (const p of products) {
        await prisma.product.upsert({
          where: { id: p.id },
          create: { id: p.id, name: p.name, category: p.category, price: p.price, image: p.image, description: p.description ?? null, unit: p.unit, badge: p.badge, active: true },
          update: { image: p.image, description: p.description ?? null }, // keep image + description in sync
        });
      }
      const seeded = await prisma.product.findMany({ orderBy: { id: "asc" } });
      return seeded.filter(r => (r as Record<string, unknown>).deletedAt == null).map(mapProduct);
    }
    return rows.map(mapProduct);
  },
  async getById(id: number): Promise<DbProduct | null> {
    const p = await prisma.product.findUnique({ where: { id } });
    return p ? mapProduct(p) : null;
  },
  async upsert(product: DbProduct): Promise<DbProduct> {
    const d = {
      name: product.name, category: product.category, price: product.price,
      costPrice: product.costPrice, image: product.image,
      description: product.description ?? null,
      unit: product.unit,
      badge: product.badge, barcode: product.barcode, stock: product.stock,
      stockMin: product.stockMin, stockMax: product.stockMax, active: product.active,
    };
    const row = await prisma.product.upsert({
      where: { id: product.id },
      create: { id: product.id, ...d },
      update: d,
    });
    return mapProduct(row);
  },
  /** Soft-delete: sets deletedAt instead of physically removing the row. */
  async delete(id: number): Promise<void> {
    // Use raw SQL until `prisma generate` is re-run after migration 20260316
    await prisma.$executeRaw`UPDATE "Product" SET "deletedAt" = NOW() WHERE id = ${id}`.catch(() => {});
  },
  /** Hard-delete: permanently removes the row (admin use only). */
  async hardDelete(id: number): Promise<void> {
    await prisma.product.delete({ where: { id } }).catch(() => {});
  },
};

// ── Customers ─────────────────────────────────────────────────────────────────

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

// ── Loyalty ───────────────────────────────────────────────────────────────────

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

// ── Reviews ───────────────────────────────────────────────────────────────────

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
};

// ── Orders ────────────────────────────────────────────────────────────────────

export const OrdersDB = {
  async getAll(): Promise<DbOrder[]> {
    return (await prisma.order.findMany({ include: { items: true }, orderBy: { createdAt: "desc" } })).map(mapOrder);
  },

  /**
   * Fetch orders with optional DB-level filtering (no in-memory scan).
   * Use this instead of getAll() + array.filter() in the legacy GET path.
   */
  async getAllFiltered(opts?: {
    status?: string;
    since?: string;
    phone?: string;
  }): Promise<DbOrder[]> {
    const where: Record<string, unknown> = {};
    if (opts?.status) {
      const statuses = opts.status.split(",").map((s) => s.trim());
      where.status = { in: statuses };
    }
    if (opts?.since) {
      const since = new Date(opts.since);
      if (!isNaN(since.getTime())) {
        where.createdAt = { gte: since };
      }
    }
    if (opts?.phone) {
      where.customerPhone = normalizePhone(opts.phone);
    }
    return (await prisma.order.findMany({
      where,
      include: { items: true },
      orderBy: { createdAt: "desc" },
    })).map(mapOrder);
  },

  /**
   * Cursor-based pagination — efficient for large order volumes.
   * Returns up to `limit` orders plus the cursor for the next page.
   */
  async getPage(opts: {
    cursor?: string;
    limit?: number;
    status?: string;
    since?: string;
    phone?: string;
  }): Promise<{ orders: DbOrder[]; nextCursor: string | null; total: number }> {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);

    // Build DB-level where clause (pushed to Postgres, no in-memory scan)
    const where: Record<string, unknown> = {};
    if (opts.status) {
      const statuses = opts.status.split(",").map((s) => s.trim());
      where.status = { in: statuses };
    }
    if (opts.since) {
      const since = new Date(opts.since);
      if (!isNaN(since.getTime())) {
        where.createdAt = { gte: since };
      }
    }
    if (opts.phone) {
      where.customerPhone = normalizePhone(opts.phone);
    }

    const [rows, total] = await prisma.$transaction([
      prisma.order.findMany({
        where,
        include: { items: true },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
      }),
      prisma.order.count({ where }),
    ]);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return { orders: items.map(mapOrder), nextCursor, total };
  },

  async getById(id: string): Promise<DbOrder | null> {
    const row = await prisma.order.findUnique({ where: { id }, include: { items: true } });
    return row ? mapOrder(row) : null;
  },
  async getByCustomerPhone(phone: string): Promise<DbOrder[]> {
    return (await prisma.order.findMany({
      where: { customerPhone: normalizePhone(phone) },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    })).map(mapOrder);
  },
  async add(order: DbOrder, tenantId = "main"): Promise<DbOrder> {
    // Ensure the customer exists in the DB before linking via FK
    const phone = order.customer.phone ? normalizePhone(order.customer.phone) : null;
    if (phone) {
      await prisma.customer.upsert({
        where: { phone },
        create: {
          phone,
          name: order.customer.name,
          location: order.customer.location ?? "",
          reference: order.customer.reference ?? "",
        },
        update: {
          name: order.customer.name,
          location: order.customer.location ?? "",
          reference: order.customer.reference ?? "",
        },
      });
    }
    // Ensure all catalog products exist in the Product table so the FK constraint is
    // always satisfied. Store-catalog IDs come from data/products.ts and may differ
    // from the admin-managed DB product IDs.
    const uniqueIds = [...new Set(order.items.map((i) => i.id).filter((id) => id > 0))];
    if (uniqueIds.length > 0) {
      const existing = new Set(
        (await prisma.product.findMany({ where: { id: { in: uniqueIds } }, select: { id: true } }))
          .map((p) => p.id)
      );
      let needsSequenceReset = false;
      for (const item of order.items) {
        if (item.id > 0 && !existing.has(item.id)) {
          // Insert stub record for catalog product not yet in admin Product table
          await prisma.$executeRaw`
            INSERT INTO "Product" (id, name, category, price, unit, image)
            VALUES (${item.id}, ${item.name}, 'tienda', ${item.price}, ${item.unit}, ${item.image ?? ''})
            ON CONFLICT (id) DO NOTHING
          `;
          needsSequenceReset = true;
        }
      }
      if (needsSequenceReset) {
        // Keep the autoincrement sequence in sync so admin-created products get correct IDs
        await prisma.$executeRaw`SELECT setval(pg_get_serial_sequence('"Product"', 'id'), (SELECT MAX(id) FROM "Product"))`;
      }
    }
    const row = await prisma.order.create({
      data: {
        id: order.id,
        tenantId,
        customerName: order.customer.name,
        customerPhone: phone,
        customerLocation: order.customer.location ?? "",
        customerReference: order.customer.reference ?? "",
        total: order.total, totalCogs: order.totalCogs ?? null, status: order.status as never,
        notes: order.notes, paymentMethod: order.paymentMethod,
        yapeOperationNumber: order.yapeOperationNumber,
        deuda: order.deuda ?? null,
        appliedCouponCode: order.appliedCouponCode ?? null,
        couponDiscount: order.couponDiscount ?? null,
        appliedPromoId: order.appliedPromoId ?? null,
        discountAmount: order.discountAmount ?? null,
        items: {
          create: order.items.map((i) => ({
            productId: i.id > 0 ? i.id : null,
            name: i.name, price: i.price, costPrice: i.costPrice ?? null,
            quantity: i.quantity, unit: i.unit, image: i.image,
          })),
        },
      },
      include: { items: true },
    });
    // Persist idempotency key via raw SQL (field added in migration 20260316; types update after prisma generate)
    if (order.idempotencyKey) {
      await prisma.$executeRaw`UPDATE "Order" SET "idempotencyKey" = ${order.idempotencyKey} WHERE id = ${row.id}`.catch(() => {});
    }
    return mapOrder(row);
  },
  async update(id: string, patch: Partial<DbOrder>): Promise<DbOrder | null> {
    const existing = await prisma.order.findUnique({ where: { id } });
    if (!existing) return null;
    const data: Record<string, unknown> = {};
    if (patch.status) data.status = patch.status;
    if (patch.notes !== undefined) data.notes = patch.notes;
    if (patch.paymentMethod !== undefined) data.paymentMethod = patch.paymentMethod;
    if (patch.yapeOperationNumber !== undefined) data.yapeOperationNumber = patch.yapeOperationNumber;
    if (patch.deuda !== undefined) data.deuda = patch.deuda;
    if (patch.total !== undefined) data.total = patch.total;
    if (patch.riderName !== undefined) data.riderName = patch.riderName;
    if (patch.customer) {
      if (patch.customer.name) data.customerName = patch.customer.name;
      if (patch.customer.phone) data.customerPhone = normalizePhone(patch.customer.phone);
      if (patch.customer.location) data.customerLocation = patch.customer.location;
      if (patch.customer.reference) data.customerReference = patch.customer.reference;
    }
    const row = await prisma.order.update({ where: { id }, data, include: { items: true } });
    return mapOrder(row);
  },
  async delete(id: string): Promise<void> {
    await prisma.order.delete({ where: { id } }).catch(() => {});
  },
};

// ── Settings ──────────────────────────────────────────────────────────────────

export const SettingsDB = {
  async get(): Promise<DbSettings> {
    try {
      const row = await prisma.settings.findUnique({ where: { id: 1 } });
      if (!row) return { mode: "whatsapp", adminBypassLogin: false };
      return mapSettings(row);
    } catch (error) {
      console.warn("[settings] falling back to defaults:", error instanceof Error ? error.message : String(error));
      return { mode: "whatsapp", adminBypassLogin: false };
    }
  },
  async set(s: DbSettings): Promise<DbSettings> {
    const d = {
      mode: s.mode, businessName: s.businessName, businessPhone: s.businessPhone,
      businessAddress: s.businessAddress, logoUrl: s.logoUrl, description: s.description,
      hours: s.hours, deliveryZone: s.deliveryZone, yapeEnabled: s.yapeEnabled ?? false,
      yapeImage: s.yapeImage, yapeName: s.yapeName, yapePhone: s.yapePhone,
      cashEnabled: s.cashEnabled ?? true,
      ...(s.navLinks !== undefined && { navLinksJson: JSON.stringify(s.navLinks) }),
      ...(s.businessLat !== undefined && { businessLat: s.businessLat }),
      ...(s.businessLon !== undefined && { businessLon: s.businessLon }),
      ...(s.adminPassword !== undefined && { adminPassword: s.adminPassword }),
      ...(s.maintenanceMode !== undefined && { maintenanceMode: s.maintenanceMode }),
      ...(s.maintenanceMessage !== undefined && { maintenanceMessage: s.maintenanceMessage }),
      ...(s.adminBypassLogin !== undefined && { adminBypassLogin: s.adminBypassLogin }),
      ...(s.comboTemplates !== undefined && { comboTemplatesJson: JSON.stringify(s.comboTemplates) }),
    };
    const row = await prisma.settings.upsert({ where: { id: 1 }, create: { id: 1, ...d }, update: d });
    return mapSettings(row);
  },
};

// ── Suppliers ─────────────────────────────────────────────────────────────────

export const SuppliersDB = {
  async getAll(): Promise<DbSupplier[]> {
    return (await prisma.supplier.findMany({ orderBy: { createdAt: "desc" } })).map(mapSupplier);
  },
  async getById(id: string): Promise<DbSupplier | null> {
    const row = await prisma.supplier.findUnique({ where: { id } });
    return row ? mapSupplier(row) : null;
  },
  async add(s: DbSupplier): Promise<DbSupplier> {
    const row = await prisma.supplier.create({
      data: { id: s.id, name: s.name, ruc: s.ruc, phone: s.phone, email: s.email, address: s.address, notes: s.notes },
    });
    return mapSupplier(row);
  },
  async update(id: string, patch: Partial<DbSupplier>): Promise<DbSupplier | null> {
    const existing = await prisma.supplier.findUnique({ where: { id } });
    if (!existing) return null;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, createdAt: _c, ...data } = patch;
    const row = await prisma.supplier.update({ where: { id }, data });
    return mapSupplier(row);
  },
  async delete(id: string): Promise<void> {
    await prisma.supplier.delete({ where: { id } }).catch(() => {});
  },
};

// ── Purchase Orders ───────────────────────────────────────────────────────────

export const PurchasesDB = {
  async getAll(): Promise<DbPurchaseOrder[]> {
    return (await prisma.purchaseOrder.findMany({ include: { items: true }, orderBy: { createdAt: "desc" } })).map(mapPurchaseOrder);
  },
  async getById(id: string): Promise<DbPurchaseOrder | null> {
    const row = await prisma.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
    return row ? mapPurchaseOrder(row) : null;
  },
  async add(po: DbPurchaseOrder): Promise<DbPurchaseOrder> {
    const row = await prisma.purchaseOrder.create({
      data: {
        id: po.id, supplierId: po.supplierId, supplierName: po.supplierName,
        total: po.total, status: po.status as never, notes: po.notes,
        items: { create: po.items.map((i) => ({ productId: i.productId, name: i.name, quantity: i.quantity, unitCost: i.unitCost, unit: i.unit })) },
      },
      include: { items: true },
    });
    return mapPurchaseOrder(row);
  },
  async update(id: string, patch: Partial<DbPurchaseOrder>): Promise<DbPurchaseOrder | null> {
    const existing = await prisma.purchaseOrder.findUnique({ where: { id } });
    if (!existing) return null;
    const data: Record<string, unknown> = {};
    if (patch.status) data.status = patch.status;
    if (patch.notes !== undefined) data.notes = patch.notes;
    if (patch.total !== undefined) data.total = patch.total;
    if (patch.supplierName !== undefined) data.supplierName = patch.supplierName;
    const row = await prisma.purchaseOrder.update({ where: { id }, data, include: { items: true } });
    return mapPurchaseOrder(row);
  },
  async delete(id: string): Promise<void> {
    await prisma.purchaseOrder.delete({ where: { id } }).catch(() => {});
  },
};

// ── POS Sales ─────────────────────────────────────────────────────────────────

export const SalesDB = {
  async getAll(): Promise<DbSale[]> {
    return (await prisma.sale.findMany({ include: { items: true }, orderBy: { createdAt: "desc" } })).map(mapSale);
  },
  async getById(id: string): Promise<DbSale | null> {
    const row = await prisma.sale.findUnique({ where: { id }, include: { items: true } });
    return row ? mapSale(row) : null;
  },
  async add(sale: DbSale): Promise<DbSale> {
    const row = await prisma.sale.create({
      data: {
        id: sale.id, total: sale.total, totalCogs: sale.totalCogs ?? null, payment: sale.payment,
        amountPaid: sale.amountPaid, change: sale.change, customerPhone: sale.customerPhone, cashierId: sale.cashierId ?? null,
        items: { create: sale.items.map((i) => ({ productId: i.productId, name: i.name, price: i.price, costPrice: i.costPrice ?? null, quantity: i.quantity, unit: i.unit })) },
      },
      include: { items: true },
    });
    return mapSale(row);
  },
  async delete(id: string): Promise<void> {
    await prisma.sale.delete({ where: { id } }).catch(() => {});
  },
};

// ── Promotions ────────────────────────────────────────────────────────────────

export const PromotionsDB = {
  async getAll(): Promise<DbPromotion[]> {
    return (await prisma.promotion.findMany({ orderBy: { createdAt: "desc" } })).map(mapPromotion);
  },
  async add(p: DbPromotion): Promise<DbPromotion> {
    const row = await prisma.promotion.create({
      data: {
        id: p.id, name: p.name, description: p.description, discountPercent: p.discountPercent,
        minPurchase: p.minPurchase, imageUrl: p.imageUrl, message: p.message,
        targetType: p.targetType ?? "all", targetPhones: p.targetPhones,
        active: p.active, expiresAt: p.expiresAt ? new Date(p.expiresAt) : null,
      },
    });
    return mapPromotion(row);
  },
  async update(id: string, patch: Partial<DbPromotion>): Promise<DbPromotion | null> {
    const existing = await prisma.promotion.findUnique({ where: { id } });
    if (!existing) return null;
    const data: Record<string, unknown> = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.discountPercent !== undefined) data.discountPercent = patch.discountPercent;
    if (patch.minPurchase !== undefined) data.minPurchase = patch.minPurchase;
    if (patch.imageUrl !== undefined) data.imageUrl = patch.imageUrl;
    if (patch.message !== undefined) data.message = patch.message;
    if (patch.targetType !== undefined) data.targetType = patch.targetType;
    if (patch.targetPhones !== undefined) data.targetPhones = patch.targetPhones;
    if (patch.active !== undefined) data.active = patch.active;
    if (patch.expiresAt !== undefined) data.expiresAt = patch.expiresAt ? new Date(patch.expiresAt) : null;
    const row = await prisma.promotion.update({ where: { id }, data });
    return mapPromotion(row);
  },
  async delete(id: string): Promise<void> {
    await prisma.promotion.delete({ where: { id } }).catch(() => {});
  },
};

// ── Payables (Cuentas por Pagar) ──────────────────────────────────────────────

export const PayablesDB = {
  async getAll(): Promise<DbPayable[]> {
    return (await prisma.payable.findMany({ include: { payments: true }, orderBy: { createdAt: "desc" } })).map(mapPayable);
  },
  async getById(id: string): Promise<DbPayable | null> {
    const row = await prisma.payable.findUnique({ where: { id }, include: { payments: true } });
    return row ? mapPayable(row) : null;
  },
  async getBySupplierId(supplierId: string): Promise<DbPayable[]> {
    return (await prisma.payable.findMany({ where: { supplierId }, include: { payments: true }, orderBy: { createdAt: "desc" } })).map(mapPayable);
  },
  async add(p: DbPayable): Promise<DbPayable> {
    const row = await prisma.payable.create({
      data: {
        id: p.id, supplierId: p.supplierId, supplierName: p.supplierName,
        purchaseOrderId: p.purchaseOrderId, description: p.description,
        amount: p.amount, paidAmount: p.paidAmount, status: p.status,
        dueDate: new Date(p.dueDate),
      },
      include: { payments: true },
    });
    return mapPayable(row);
  },
  async update(id: string, patch: Partial<DbPayable>): Promise<DbPayable | null> {
    const existing = await prisma.payable.findUnique({ where: { id } });
    if (!existing) return null;
    const data: Record<string, unknown> = {};
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.amount !== undefined) data.amount = patch.amount;
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.dueDate !== undefined) data.dueDate = new Date(patch.dueDate);
    if (patch.supplierName !== undefined) data.supplierName = patch.supplierName;
    const row = await prisma.payable.update({ where: { id }, data, include: { payments: true } });
    return mapPayable(row);
  },
  async addPayment(id: string, payment: DbPayment): Promise<DbPayable | null> {
    const existing = await prisma.payable.findUnique({ where: { id }, include: { payments: true } });
    if (!existing) return null;
    await prisma.payment.create({
      data: { id: payment.id, payableId: id, amount: payment.amount, method: payment.method, date: new Date(payment.date), reference: payment.reference },
    });
    const allPay = await prisma.payment.findMany({ where: { payableId: id } });
    const paidAmount = allPay.reduce((s: number, p: PPayment) => s + p.amount, 0);
    const status = paidAmount >= existing.amount ? "pagado" : paidAmount > 0 ? "parcial" : "pendiente";
    const row = await prisma.payable.update({ where: { id }, data: { paidAmount, status }, include: { payments: true } });
    return mapPayable(row);
  },
  async delete(id: string): Promise<void> {
    await prisma.payable.delete({ where: { id } }).catch(() => {});
  },
};

// ── Cash Register Types ───────────────────────────────────────────────────────

export type CashRegisterStatus = "abierta" | "cerrada";

export type DbCashMovement = {
  id: string;
  cashRegisterId: string;
  type: string; // venta, ingreso, egreso, apertura, cierre
  amount: number;
  method: string;
  description: string;
  saleId?: string;
  createdAt: string;
};

export type DbCashRegister = {
  id: string;
  openedAt: string;
  closedAt?: string;
  openingAmount: number;
  closingAmount?: number;
  expectedAmount?: number;
  difference?: number;
  status: CashRegisterStatus;
  notes?: string;
  movements: DbCashMovement[];
};

// ── Inventory Movement Types ──────────────────────────────────────────────────

export type InventoryMovementType = "compra" | "venta" | "venta_online" | "devolucion" | "ajuste_positivo" | "ajuste_negativo" | "merma";

export type DbInventoryMovement = {
  id: string;
  productId: number;
  type: InventoryMovementType;
  lossType?: string;
  quantity: number;
  previousStock: number;
  newStock: number;
  reference?: string;
  notes?: string;
  warehouseId?: string;
  createdBy?: string;
  createdAt: string;
};

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapCashMovement(m: PCashMovement): DbCashMovement {
  return {
    id: m.id, cashRegisterId: m.cashRegisterId, type: m.type,
    amount: m.amount, method: m.method, description: m.description,
    ...(m.saleId != null && { saleId: m.saleId }),
    createdAt: toISO(m.createdAt),
  };
}

function mapCashRegister(r: PCashRegister & { movements: PCashMovement[] }): DbCashRegister {
  return {
    id: r.id, openedAt: toISO(r.openedAt),
    ...(r.closedAt != null && { closedAt: toISO(r.closedAt) }),
    openingAmount: r.openingAmount,
    ...(r.closingAmount != null && { closingAmount: r.closingAmount }),
    ...(r.expectedAmount != null && { expectedAmount: r.expectedAmount }),
    ...(r.difference != null && { difference: r.difference }),
    status: r.status as CashRegisterStatus,
    ...(r.notes != null && { notes: r.notes }),
    movements: r.movements.map(mapCashMovement),
  };
}

function mapInventoryMovement(m: PInventoryMovement): DbInventoryMovement {
  return {
    id: m.id, productId: m.productId, type: m.type as InventoryMovementType,
    ...(m.lossType != null && { lossType: m.lossType }),
    quantity: m.quantity, previousStock: m.previousStock, newStock: m.newStock,
    ...(m.reference != null && { reference: m.reference }),
    ...(m.notes != null && { notes: m.notes }),
    ...((m as unknown as { warehouseId?: string | null }).warehouseId != null && { warehouseId: (m as unknown as { warehouseId: string }).warehouseId }),
    ...((m as unknown as { createdBy?: string | null }).createdBy != null && { createdBy: (m as unknown as { createdBy: string }).createdBy }),
    createdAt: toISO(m.createdAt),
  };
}

// ── Cash Registers DB ─────────────────────────────────────────────────────────

export const CashRegistersDB = {
  async getAll(): Promise<DbCashRegister[]> {
    return (await prisma.cashRegister.findMany({ include: { movements: { orderBy: { createdAt: "desc" } } }, orderBy: { openedAt: "desc" } })).map(mapCashRegister);
  },
  async getAllPaginated(limit = 25, cursor?: string): Promise<{ items: DbCashRegister[]; nextCursor: string | null }> {
    const rows = await prisma.cashRegister.findMany({
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { movements: { orderBy: { createdAt: "desc" } } },
      orderBy: { openedAt: "desc" },
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items: items.map(mapCashRegister), nextCursor: hasMore ? items[items.length - 1].id : null };
  },
  async getOpen(): Promise<DbCashRegister | null> {
    const row = await prisma.cashRegister.findFirst({ where: { status: "abierta" }, include: { movements: { orderBy: { createdAt: "desc" } } } });
    return row ? mapCashRegister(row) : null;
  },
  async getById(id: string): Promise<DbCashRegister | null> {
    const row = await prisma.cashRegister.findUnique({ where: { id }, include: { movements: { orderBy: { createdAt: "desc" } } } });
    return row ? mapCashRegister(row) : null;
  },
  async open(openingAmount: number, notes?: string): Promise<DbCashRegister> {
    const row = await prisma.cashRegister.create({
      data: {
        openingAmount, notes,
        movements: { create: { type: "apertura", amount: openingAmount, method: "efectivo", description: "Apertura de caja" } },
      },
      include: { movements: { orderBy: { createdAt: "desc" } } },
    });
    return mapCashRegister(row);
  },
  async close(id: string, closingAmount: number, notes?: string): Promise<DbCashRegister | null> {
    const reg = await prisma.cashRegister.findUnique({ where: { id }, include: { movements: true } });
    if (!reg) return null;
    const totalSales = reg.movements.filter(m => m.type === "venta" && m.method === "efectivo").reduce((s, m) => s + m.amount, 0);
    const totalIn = reg.movements.filter(m => m.type === "ingreso").reduce((s, m) => s + m.amount, 0);
    const totalOut = reg.movements.filter(m => m.type === "egreso").reduce((s, m) => s + m.amount, 0);
    const expectedAmount = reg.openingAmount + totalSales + totalIn - totalOut;
    const difference = closingAmount - expectedAmount;
    await prisma.cashMovement.create({
      data: { cashRegisterId: id, type: "cierre", amount: closingAmount, method: "efectivo", description: "Cierre de caja" },
    });
    const row = await prisma.cashRegister.update({
      where: { id },
      data: { status: "cerrada", closedAt: new Date(), closingAmount, expectedAmount, difference, notes },
      include: { movements: { orderBy: { createdAt: "desc" } } },
    });
    return mapCashRegister(row);
  },
  async addMovement(cashRegisterId: string, movement: { type: string; amount: number; method: string; description: string; saleId?: string }): Promise<DbCashMovement> {
    const row = await prisma.cashMovement.create({
      data: { cashRegisterId, ...movement },
    });
    return mapCashMovement(row);
  },
};

// ── Inventory Movements DB ────────────────────────────────────────────────────

export const InventoryMovementsDB = {
  async getAll(limit = 200): Promise<DbInventoryMovement[]> {
    return (await prisma.inventoryMovement.findMany({ orderBy: { createdAt: "desc" }, take: limit })).map(mapInventoryMovement);
  },
  async getByProduct(productId: number): Promise<DbInventoryMovement[]> {
    return (await prisma.inventoryMovement.findMany({ where: { productId }, orderBy: { createdAt: "desc" } })).map(mapInventoryMovement);
  },
  async record(data: { productId: number; type: string; lossType?: string; quantity: number; reference?: string; warehouseId?: string; notes?: string; createdBy?: string }): Promise<DbInventoryMovement> {
    // Atomic: read current stock, compute new stock, update product, create movement
    const product = await prisma.product.findUnique({ where: { id: data.productId } });
    const prevStock = product?.stock ?? 0;
    const isIncrease = ["compra", "devolucion", "ajuste_positivo"].includes(data.type);
    const newStock = isIncrease ? prevStock + data.quantity : prevStock - data.quantity;
    await prisma.product.update({ where: { id: data.productId }, data: { stock: Math.max(0, newStock) } });
    const row = await prisma.inventoryMovement.create({
      data: {
        productId: data.productId, type: data.type, lossType: data.lossType, quantity: data.quantity,
        previousStock: prevStock, newStock: Math.max(0, newStock),
        reference: data.reference, notes: data.notes,
        ...(data.warehouseId ? { warehouseId: data.warehouseId } : {}),
        ...(data.createdBy ? { createdBy: data.createdBy } : {}),
      },
    });
    return mapInventoryMovement(row);
  },
  async adjust(productId: number, newStock: number, warehouseId?: string, notes?: string, createdBy?: string): Promise<DbInventoryMovement> {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    const prevStock = product?.stock ?? 0;
    const diff = newStock - prevStock;
    const type = diff >= 0 ? "ajuste_positivo" : "ajuste_negativo";
    await prisma.product.update({ where: { id: productId }, data: { stock: Math.max(0, newStock) } });
    const row = await prisma.inventoryMovement.create({
      data: { productId, type, quantity: Math.abs(diff), previousStock: prevStock, newStock: Math.max(0, newStock), notes,
        ...(warehouseId ? { warehouseId } : {}),
        ...(createdBy ? { createdBy } : {}) },
    });
    return mapInventoryMovement(row);
  },
};

// ══════════════════════════════════════════════════════════════════════════════
//  ROUND 5 — NEW MODULES
// ══════════════════════════════════════════════════════════════════════════════

// ── Coupon Types & DB ─────────────────────────────────────────────────────────

export type DbCoupon = {
  id: string;
  code: string;
  description: string;
  discountType: "percent" | "fixed" | "giftcard";
  discountValue: number;
  balance?: number;
  minPurchase?: number;
  maxUses?: number;
  usedCount: number;
  active: boolean;
  expiresAt?: string;
  createdAt: string;
};

function mapCoupon(c: PCoupon): DbCoupon {
  return {
    id: c.id, code: c.code, description: c.description,
    discountType: c.discountType as "percent" | "fixed" | "giftcard", discountValue: c.discountValue,
    ...(c.balance != null && { balance: c.balance }),
    ...(c.minPurchase != null && { minPurchase: c.minPurchase }),
    ...(c.maxUses != null && { maxUses: c.maxUses }),
    usedCount: c.usedCount, active: c.active,
    ...(c.expiresAt != null && { expiresAt: toISO(c.expiresAt) }),
    createdAt: toISO(c.createdAt),
  };
}

export const CouponsDB = {
  async getAll(): Promise<DbCoupon[]> {
    return (await prisma.coupon.findMany({ orderBy: { createdAt: "desc" } })).map(mapCoupon);
  },
  async getByCode(code: string): Promise<DbCoupon | null> {
    const row = await prisma.coupon.findFirst({ where: { code: code.toUpperCase().trim() } });
    return row ? mapCoupon(row) : null;
  },
  async add(c: Omit<DbCoupon, "id" | "createdAt" | "usedCount">): Promise<DbCoupon> {
    const row = await prisma.coupon.create({
      data: {
        code: c.code.toUpperCase().trim(), description: c.description,
        discountType: c.discountType, discountValue: c.discountValue,
        balance: c.discountType === "giftcard" ? (c.balance ?? c.discountValue) : null,
        minPurchase: c.minPurchase, maxUses: c.maxUses,
        active: c.active, expiresAt: c.expiresAt ? new Date(c.expiresAt) : null,
      },
    });
    return mapCoupon(row);
  },
  async update(id: string, patch: Partial<DbCoupon>): Promise<DbCoupon | null> {
    const existing = await prisma.coupon.findUnique({ where: { id } });
    if (!existing) return null;
    const data: Record<string, unknown> = {};
    if (patch.code !== undefined) data.code = patch.code.toUpperCase().trim();
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.discountType !== undefined) data.discountType = patch.discountType;
    if (patch.discountValue !== undefined) data.discountValue = patch.discountValue;
    if (patch.balance !== undefined) data.balance = patch.balance;
    if (patch.minPurchase !== undefined) data.minPurchase = patch.minPurchase;
    if (patch.maxUses !== undefined) data.maxUses = patch.maxUses;
    if (patch.active !== undefined) data.active = patch.active;
    if (patch.expiresAt !== undefined) data.expiresAt = patch.expiresAt ? new Date(patch.expiresAt) : null;
    const row = await prisma.coupon.update({ where: { id }, data });
    return mapCoupon(row);
  },
  async redeem(code: string, deductAmount?: number): Promise<DbCoupon | null> {
    const row = await prisma.coupon.findFirst({ where: { code: code.toUpperCase().trim() } });
    if (!row || !row.active) return null;
    if (row.expiresAt && row.expiresAt < new Date()) return null;
    if (row.maxUses && row.usedCount >= row.maxUses) return null;
    const data: Record<string, unknown> = { usedCount: row.usedCount + 1 };
    // Deduct balance for giftcard type
    if (row.discountType === "giftcard" && deductAmount != null) {
      const currentBalance = row.balance ?? row.discountValue;
      const newBalance = Math.max(0, currentBalance - deductAmount);
      data.balance = newBalance;
      if (newBalance <= 0) data.active = false;
    }
    const updated = await prisma.coupon.update({ where: { id: row.id }, data });
    return mapCoupon(updated);
  },
  async delete(id: string): Promise<void> {
    await prisma.coupon.delete({ where: { id } }).catch(() => {});
  },
};

// ── Returns DB ────────────────────────────────────────────────────────────────

export type DbReturnItem = {
  id: number;
  productId: number;
  name: string;
  quantity: number;
  price: number;
  unit: string;
};

export type DbReturn = {
  id: string;
  saleId?: string;
  orderId?: string;
  reason: string;
  total: number;
  photoUrl?: string;
  customerPhone?: string;
  creditApplied: boolean;
  items: DbReturnItem[];
  createdAt: string;
};

function mapReturn(r: PReturn & { items: PReturnItem[] }): DbReturn {
  return {
    id: r.id,
    ...(r.saleId != null && { saleId: r.saleId }),
    ...(r.orderId != null && { orderId: r.orderId }),
    reason: r.reason, total: r.total,
    ...(r.photoUrl != null && { photoUrl: r.photoUrl }),
    ...(r.customerPhone != null && { customerPhone: r.customerPhone }),
    creditApplied: r.creditApplied ?? false,
    items: r.items.map((i: PReturnItem) => ({ id: i.id, productId: i.productId, name: i.name, quantity: i.quantity, price: i.price, unit: i.unit })),
    createdAt: toISO(r.createdAt),
  };
}

export const ReturnsDB = {
  async getAll(): Promise<DbReturn[]> {
    return (await prisma.return.findMany({ include: { items: true }, orderBy: { createdAt: "desc" } })).map(mapReturn);
  },
  async add(r: { saleId?: string; orderId?: string; reason: string; photoUrl?: string; customerPhone?: string; creditApplied?: boolean; items: Omit<DbReturnItem, "id">[] }): Promise<DbReturn> {
    const total = r.items.reduce((s, i) => s + i.price * i.quantity, 0);
    const row = await prisma.return.create({
      data: {
        saleId: r.saleId, orderId: r.orderId, reason: r.reason, total,
        photoUrl: r.photoUrl, customerPhone: r.customerPhone ? normalizePhone(r.customerPhone) : undefined,
        creditApplied: r.creditApplied ?? false,
        items: { create: r.items.map(i => ({ productId: i.productId, name: i.name, quantity: i.quantity, price: i.price, unit: i.unit })) },
      },
      include: { items: true },
    });
    return mapReturn(row);
  },
};

// ── Shopping Lists DB ─────────────────────────────────────────────────────────

export type DbShoppingListItem = { id: number; productId: number; quantity: number };

export type DbShoppingList = {
  id: string;
  customerPhone: string;
  name: string;
  items: DbShoppingListItem[];
  createdAt: string;
  updatedAt: string;
};

function mapShoppingList(l: PShoppingList & { items: PShoppingListItem[] }): DbShoppingList {
  return {
    id: l.id, customerPhone: l.customerPhone, name: l.name,
    items: l.items.map((i: PShoppingListItem) => ({ id: i.id, productId: i.productId, quantity: i.quantity })),
    createdAt: toISO(l.createdAt), updatedAt: toISO(l.updatedAt),
  };
}

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

// ── Price History DB ──────────────────────────────────────────────────────────

export type DbPriceHistory = {
  id: number;
  productId: number;
  oldPrice: number;
  newPrice: number;
  changedAt: string;
};

function mapPriceHistory(p: PPriceHistory): DbPriceHistory {
  return { id: p.id, productId: p.productId, oldPrice: p.oldPrice, newPrice: p.newPrice, changedAt: toISO(p.changedAt) };
}

export const PriceHistoryDB = {
  async getByProduct(productId: number): Promise<DbPriceHistory[]> {
    return (await prisma.priceHistory.findMany({ where: { productId }, orderBy: { changedAt: "desc" } })).map(mapPriceHistory);
  },
  async getAll(limit = 100): Promise<DbPriceHistory[]> {
    return (await prisma.priceHistory.findMany({ orderBy: { changedAt: "desc" }, take: limit })).map(mapPriceHistory);
  },
  async record(productId: number, oldPrice: number, newPrice: number): Promise<DbPriceHistory> {
    if (oldPrice === newPrice) return { id: 0, productId, oldPrice, newPrice, changedAt: new Date().toISOString() };
    const row = await prisma.priceHistory.create({ data: { productId, oldPrice, newPrice } });
    return mapPriceHistory(row);
  },
};

// ── Delivery Slots DB ─────────────────────────────────────────────────────────

export type DbDeliverySlot = {
  id: string;
  orderId: string;
  date: string;
  slot: string;
  notes?: string;
  createdAt: string;
};

function mapDeliverySlot(d: PDeliverySlot): DbDeliverySlot {
  return {
    id: d.id, orderId: d.orderId, date: d.date, slot: d.slot,
    ...(d.notes != null && { notes: d.notes }),
    createdAt: toISO(d.createdAt),
  };
}

export const DeliverySlotsDB = {
  async getByDate(date: string): Promise<DbDeliverySlot[]> {
    return (await prisma.deliverySlot.findMany({ where: { date }, orderBy: { createdAt: "asc" } })).map(mapDeliverySlot);
  },
  async getByOrderId(orderId: string): Promise<DbDeliverySlot | null> {
    const row = await prisma.deliverySlot.findUnique({ where: { orderId } });
    return row ? mapDeliverySlot(row) : null;
  },
  async set(data: { orderId: string; date: string; slot: string; notes?: string }): Promise<DbDeliverySlot> {
    const row = await prisma.deliverySlot.upsert({
      where: { orderId: data.orderId },
      create: data,
      update: { date: data.date, slot: data.slot, notes: data.notes },
    });
    return mapDeliverySlot(row);
  },
};

// ── Admin Chat DB ─────────────────────────────────────────────────────────────

export type DbAdminMessage = {
  id: string;
  sender: string;
  message: string;
  createdAt: string;
};

function mapAdminMessage(m: PAdminMessage): DbAdminMessage {
  return { id: m.id, sender: m.sender, message: m.message, createdAt: toISO(m.createdAt) };
}

export const AdminChatDB = {
  async getAll(limit = 100): Promise<DbAdminMessage[]> {
    return (await prisma.adminMessage.findMany({ orderBy: { createdAt: "desc" }, take: limit })).map(mapAdminMessage).reverse();
  },
  async add(sender: string, message: string): Promise<DbAdminMessage> {
    const row = await prisma.adminMessage.create({ data: { sender, message } });
    return mapAdminMessage(row);
  },
};

// ── Customer Live Chat DB ─────────────────────────────────────────────────────

type PChatMessage = { id: string; customerPhone: string; customerName: string; sender: string; message: string; read: boolean; createdAt: Date };

export type DbChatMessage = {
  id: string;
  customerPhone: string;
  customerName: string;
  sender: "customer" | "admin";
  message: string;
  read: boolean;
  createdAt: string;
};

function mapChatMessage(m: PChatMessage): DbChatMessage {
  return { id: m.id, customerPhone: m.customerPhone, customerName: m.customerName, sender: m.sender as DbChatMessage["sender"], message: m.message, read: m.read, createdAt: toISO(m.createdAt) };
}

export const ChatDB = {
  async getByPhone(phone: string, limit = 50): Promise<DbChatMessage[]> {
    return (await prisma.chatMessage.findMany({ where: { customerPhone: phone }, orderBy: { createdAt: "asc" }, take: limit })).map(mapChatMessage);
  },
  async getConversations(): Promise<{ phone: string; name: string; lastMessage: string; lastAt: string; unread: number }[]> {
    const msgs = await prisma.chatMessage.findMany({ orderBy: { createdAt: "desc" } });
    const map = new Map<string, { name: string; lastMessage: string; lastAt: Date; unread: number }>();
    for (const m of msgs) {
      if (!map.has(m.customerPhone)) {
        map.set(m.customerPhone, { name: m.customerName, lastMessage: m.message, lastAt: m.createdAt, unread: 0 });
      }
      if (m.sender === "customer" && !m.read) {
        const c = map.get(m.customerPhone)!;
        c.unread++;
      }
    }
    return Array.from(map.entries()).map(([phone, c]) => ({ phone, name: c.name, lastMessage: c.lastMessage, lastAt: toISO(c.lastAt), unread: c.unread }));
  },
  async add(customerPhone: string, customerName: string, sender: "customer" | "admin", message: string): Promise<DbChatMessage> {
    const row = await prisma.chatMessage.create({ data: { customerPhone, customerName, sender, message } });
    return mapChatMessage(row);
  },
  async markRead(customerPhone: string): Promise<void> {
    await prisma.chatMessage.updateMany({ where: { customerPhone, sender: "customer", read: false }, data: { read: true } });
  },
};

// ── Supplier Evaluations DB ───────────────────────────────────────────────────

export type DbSupplierEvaluation = {
  id: string;
  supplierId: string;
  purchaseId?: string;
  punctuality: number;
  quality: number;
  price: number;
  notes?: string;
  createdAt: string;
};

function mapSupplierEvaluation(e: PSupplierEvaluation): DbSupplierEvaluation {
  return {
    id: e.id, supplierId: e.supplierId,
    ...(e.purchaseId != null && { purchaseId: e.purchaseId }),
    punctuality: e.punctuality, quality: e.quality, price: e.price,
    ...(e.notes != null && { notes: e.notes }),
    createdAt: toISO(e.createdAt),
  };
}

export const SupplierEvaluationsDB = {
  async getBySupplierId(supplierId: string): Promise<DbSupplierEvaluation[]> {
    return (await prisma.supplierEvaluation.findMany({ where: { supplierId }, orderBy: { createdAt: "desc" } })).map(mapSupplierEvaluation);
  },
  async getAll(): Promise<DbSupplierEvaluation[]> {
    return (await prisma.supplierEvaluation.findMany({ orderBy: { createdAt: "desc" } })).map(mapSupplierEvaluation);
  },
  async add(data: Omit<DbSupplierEvaluation, "id" | "createdAt">): Promise<DbSupplierEvaluation> {
    const row = await prisma.supplierEvaluation.create({ data });
    return mapSupplierEvaluation(row);
  },
  async getAverages(supplierId: string): Promise<{ punctuality: number; quality: number; price: number; count: number }> {
    const agg = await prisma.supplierEvaluation.aggregate({
      where: { supplierId },
      _avg: { punctuality: true, quality: true, price: true },
      _count: true,
    });
    return {
      punctuality: Math.round((agg._avg.punctuality ?? 3) * 10) / 10,
      quality: Math.round((agg._avg.quality ?? 3) * 10) / 10,
      price: Math.round((agg._avg.price ?? 3) * 10) / 10,
      count: agg._count,
    };
  },
};

// ── Survey / NPS ───────────────────────────────────────────────────────────────

export type DbSurveyResponse = {
  id: string;
  orderId: string;
  customerPhone: string | null;
  rating: number;
  comment: string;
  type: string;
  createdAt: Date;
};

function mapSurvey(r: PSurveyResponse): DbSurveyResponse {
  return {
    id: r.id,
    orderId: r.orderId,
    customerPhone: r.customerPhone,
    rating: r.rating,
    comment: r.comment,
    type: r.type,
    createdAt: r.createdAt,
  };
}

export const SurveyDB = {
  async submit(data: {
    orderId: string;
    customerPhone?: string;
    rating: number;
    comment?: string;
    type?: string;
  }): Promise<DbSurveyResponse> {
    const r = await prisma.surveyResponse.upsert({
      where: { orderId_type: { orderId: data.orderId, type: data.type ?? "nps" } },
      update: { rating: data.rating, comment: data.comment ?? "", customerPhone: data.customerPhone ?? null },
      create: {
        orderId: data.orderId,
        customerPhone: data.customerPhone ?? null,
        rating: data.rating,
        comment: data.comment ?? "",
        type: data.type ?? "nps",
      },
    });
    return mapSurvey(r);
  },

  async getByOrder(orderId: string): Promise<DbSurveyResponse | null> {
    const r = await prisma.surveyResponse.findFirst({ where: { orderId } });
    return r ? mapSurvey(r) : null;
  },

  async getAll(limit = 100): Promise<DbSurveyResponse[]> {
    const rows = await prisma.surveyResponse.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map(mapSurvey);
  },

  async stats(): Promise<{
    total: number;
    average: number;
    distribution: Record<number, number>;
  }> {
    const [agg, all] = await Promise.all([
      prisma.surveyResponse.aggregate({
        where: { type: "nps" },
        _avg: { rating: true },
        _count: true,
      }),
      prisma.surveyResponse.findMany({
        where: { type: "nps" },
        select: { rating: true },
      }),
    ]);
    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of all) {
      distribution[r.rating] = (distribution[r.rating] || 0) + 1;
    }
    return {
      total: agg._count,
      average: Math.round((agg._avg.rating ?? 0) * 10) / 10,
      distribution,
    };
  },
};

// ── Expenses DB ───────────────────────────────────────────────────────────────

export type DbExpense = {
  id: string;
  category: string;
  description: string;
  amount: number;
  date: string;
  recurring: boolean;
  createdAt: string;
};

function mapExpense(e: PExpense): DbExpense {
  return { id: e.id, category: e.category, description: e.description, amount: e.amount, date: toISO(e.date), recurring: e.recurring, createdAt: toISO(e.createdAt) };
}

export const ExpensesDB = {
  async getAll(): Promise<DbExpense[]> {
    return (await prisma.expense.findMany({ orderBy: { date: "desc" } })).map(mapExpense);
  },
  async getByDateRange(from: Date, to: Date): Promise<DbExpense[]> {
    return (await prisma.expense.findMany({ where: { date: { gte: from, lte: to } }, orderBy: { date: "desc" } })).map(mapExpense);
  },
  async add(data: Omit<DbExpense, "id" | "createdAt">): Promise<DbExpense> {
    const row = await prisma.expense.create({ data: { category: data.category, description: data.description, amount: data.amount, date: new Date(data.date), recurring: data.recurring } });
    return mapExpense(row);
  },
  async delete(id: string): Promise<void> {
    await prisma.expense.delete({ where: { id } }).catch(() => {});
  },
  async getSummary(): Promise<{ category: string; total: number; count: number }[]> {
    const groups = await prisma.expense.groupBy({ by: ["category"], _sum: { amount: true }, _count: true, orderBy: { _sum: { amount: "desc" } } });
    return groups.map(g => ({ category: g.category, total: g._sum.amount ?? 0, count: g._count }));
  },
};

// ── Bundles DB ────────────────────────────────────────────────────────────────

export type DbBundleItem = { id: number; productId: number; quantity: number };
export type DbBundle = {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  active: boolean;
  createdAt: string;
  items: DbBundleItem[];
};

function mapBundle(b: PBundle & { items: PBundleItem[] }): DbBundle {
  return {
    id: b.id, name: b.name, description: b.description, price: b.price,
    image: b.image, active: b.active, createdAt: toISO(b.createdAt),
    items: b.items.map(i => ({ id: i.id, productId: i.productId, quantity: i.quantity })),
  };
}

export const BundlesDB = {
  async getAll(): Promise<DbBundle[]> {
    return (await prisma.bundle.findMany({ include: { items: true }, orderBy: { createdAt: "desc" } })).map(mapBundle);
  },
  async getActive(): Promise<DbBundle[]> {
    return (await prisma.bundle.findMany({ where: { active: true }, include: { items: true }, orderBy: { createdAt: "desc" } })).map(mapBundle);
  },
  async add(data: { name: string; description?: string; price: number; image?: string; items: { productId: number; quantity: number }[] }): Promise<DbBundle> {
    const row = await prisma.bundle.create({
      data: { name: data.name, description: data.description ?? "", price: data.price, image: data.image ?? "", items: { create: data.items } },
      include: { items: true },
    });
    return mapBundle(row);
  },
  async update(id: string, data: { name?: string; description?: string; price?: number; image?: string; active?: boolean }): Promise<DbBundle | null> {
    const row = await prisma.bundle.update({ where: { id }, data, include: { items: true } }).catch(() => null);
    return row ? mapBundle(row) : null;
  },
  async delete(id: string): Promise<void> {
    await prisma.bundle.delete({ where: { id } }).catch(() => {});
  },
};

// ── Notification Logs DB ──────────────────────────────────────────────────────

export type DbNotificationLog = {
  id: string;
  type: string;
  recipient: string;
  message: string;
  status: string;
  orderId?: string;
  createdAt: string;
};

function mapNotificationLog(n: PNotificationLog): DbNotificationLog {
  return { id: n.id, type: n.type, recipient: n.recipient, message: n.message, status: n.status, ...(n.orderId != null && { orderId: n.orderId }), createdAt: toISO(n.createdAt) };
}

export const NotificationLogsDB = {
  async getAll(): Promise<DbNotificationLog[]> {
    return (await prisma.notificationLog.findMany({ orderBy: { createdAt: "desc" }, take: 200 })).map(mapNotificationLog);
  },
  async getByRecipient(phone: string): Promise<DbNotificationLog[]> {
    return (await prisma.notificationLog.findMany({
      where: { recipient: normalizePhone(phone) },
      orderBy: { createdAt: "desc" },
      take: 100,
    })).map(mapNotificationLog);
  },
  async add(data: Omit<DbNotificationLog, "id" | "createdAt">): Promise<DbNotificationLog> {
    const row = await prisma.notificationLog.create({ data });
    return mapNotificationLog(row);
  },
};

// ── Auto-Reorder Helper ───────────────────────────────────────────────────────

export const AutoReorderDB = {
  async getLowStockProducts(): Promise<{ id: number; name: string; stock: number; stockMin: number; stockMax: number; category: string; unit: string }[]> {
    const prods = await prisma.product.findMany({
      where: { active: true, stock: { not: null }, stockMin: { not: null } },
    });
    return prods
      .filter(p => p.stock !== null && p.stockMin !== null && p.stock <= p.stockMin)
      .map(p => ({ id: p.id, name: p.name, stock: p.stock ?? 0, stockMin: p.stockMin ?? 0, stockMax: p.stockMax ?? (p.stockMin ?? 0) * 3, category: p.category, unit: p.unit }));
  },
};

// ── Warehouses DB ─────────────────────────────────────────────────────────────

export type DbWarehouse = {
  id: string;
  name: string;
  code: string;
  type: string;
  location: string;
  manager: string;
  capacity: number;
  active: boolean;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
};

function mapWarehouse(w: PWarehouse): DbWarehouse {
  return {
    id: w.id,
    name: w.name,
    code: w.code,
    type: w.type,
    location: w.location,
    manager: w.manager,
    capacity: w.capacity,
    active: w.active,
    tenantId: w.tenantId,
    createdAt: toISO(w.createdAt),
    updatedAt: toISO(w.updatedAt),
  };
}

export const WarehousesDB = {
  async getAll(tenantId = "main"): Promise<DbWarehouse[]> {
    return (await prisma.warehouse.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } })).map(mapWarehouse);
  },
  async getById(id: string): Promise<DbWarehouse | null> {
    const row = await prisma.warehouse.findUnique({ where: { id } });
    return row ? mapWarehouse(row) : null;
  },
  async create(data: { name: string; code: string; type?: string; location?: string; manager?: string; capacity?: number }): Promise<DbWarehouse> {
    const row = await prisma.warehouse.create({ data });
    return mapWarehouse(row);
  },
  async update(id: string, data: Partial<{ name: string; location: string; manager: string; capacity: number; active: boolean }>): Promise<DbWarehouse | null> {
    const row = await prisma.warehouse.update({ where: { id }, data });
    return mapWarehouse(row);
  },
  async delete(id: string): Promise<boolean> {
    try {
      await prisma.warehouse.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  },
  /** Ensure the default "Almacén Principal" exists; returns all warehouses. */
  async ensureDefault(): Promise<DbWarehouse[]> {
    const all = await this.getAll();
    if (all.length === 0) {
      await prisma.warehouse.create({ data: { name: "Almacén Principal", code: "ALM-001", type: "principal", location: "Tienda San Martín" } });
      return this.getAll();
    }
    return all;
  },
};
