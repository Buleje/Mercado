import "server-only";
import { prisma } from "@/lib/prisma";
import type {
  SurveyResponse as PSurveyResponse,
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

export type DbSurveyResponse = {
  id: string;
  orderId: string;
  customerPhone: string | null;
  rating: number;
  comment: string;
  type: string;
  createdAt: Date;
};

// ── Utilities ─────────────────────────────────────────────────────────────────

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : digits;
}

// ── Mappers ───────────────────────────────────────────────────────────────────

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

// ── SurveyDB ──────────────────────────────────────────────────────────────────

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
