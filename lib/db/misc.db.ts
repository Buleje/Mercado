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
  email?: string;
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
  creditLimit: number;
  tags?: string | null;
  lat?: number;
  lng?: number;
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
  // null = stock ilimitado / no controla inventario (Prisma Int? nullable).
  stock?: number | null;
  stockMin?: number | null;
  stockMax?: number | null;
  active: boolean;
  tenantId: string;
  /** "product" (default) | "service". Servicio = sin stock/barcode/vencimiento. */
  type?: string;
  /** ADR-131: true = PREPARADA (comida al momento → solo ficha de tienda);
   *  false/undefined = EMPAQUETADA (→ Inicio + tienda). */
  isPrepared?: boolean;
  // ── Producto completo ──
  brand?: string;
  sku?: string;
  /** gravado | exonerado | inafecto (IGV). */
  taxType?: string;
  weightKg?: number;
  dimensions?: string;
  // ── Contenido rico (estilo Amazon) ──
  /** Ficha técnica editable: JSON string de [{ label, value }]. */
  specsJson?: string | null;
  /** Contenido A+: JSON string de [{ heading?, body?, imageUrl? }]. */
  richContentJson?: string | null;
  // ── Servicio ──
  durationLabel?: string;
  /** fijo | hora | m3 | unidad | dia. */
  pricingUnit?: string;
  notes?: string;
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

export type OrderStatus = "pendiente" | "confirmado" | "preparando" | "en_camino" | "entregado" | "cancelado";

export type DbOrder = {
  id: string;
  customer: DbOrderCustomer;
  items: DbOrderItem[];
  total: number;
  totalCogs?: number;
  status: OrderStatus;
  notes?: string;
  paymentMethod?: "yape" | "plin" | "transfer" | "efectivo" | "fiado";
  yapeOperationNumber?: string;
  /** FK opcional a PaymentApproval — contiene la captura del Yape/Plin/Transferencia. */
  paymentApprovalId?: string | null;
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
  /** Origen del pedido: direct = tienda propia, marketplace = marketplace multi-vendor */
  source?: "direct" | "marketplace" | "wholesale";
  /** Soft delete timestamp — null means the order is active */
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StoreMode = "whatsapp" | "checkout";

export type NavLinkItem = { id: string; visible: boolean };

/** Categoría del catálogo configurada por el comerciante (editor de categorías). */
export type CategoryConfigItem = {
  id: string;
  label: string;
  emoji?: string;
  visible: boolean;
  order: number;
  seo?: {
    metaTitle?: string;
    metaDescription?: string;
    keywords?: string[];
    ogImage?: string;
    canonical?: string;
    slug?: string;
  };
};

export type DbSettings = {
  mode: StoreMode;
  businessName?: string;
  businessPhone?: string;
  businessAddress?: string;
  businessLat?: number;
  businessLon?: number;
  logoUrl?: string;
  /** Portada — imagen principal (4:3) que se muestra en la card del listado /tiendas. */
  coverUrl?: string;
  /** Banner — hero wide (1600×500) que se muestra al entrar al storefront. */
  bannerUrl?: string;
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
  /** Categorías del catálogo definidas por el comerciante (editor de categorías).
   *  Vacío/undefined para negocios nuevos — NO se siembran categorías demo.
   *  Persiste en la columna TEXT `categoryOrderJson` (patrón raw como coverUrl). */
  categoryOrder?: CategoryConfigItem[];

  // ── Datos del negocio ──
  razonSocial?: string;
  ruc?: string;
  businessEmail?: string;
  currency?: string;
  timezone?: string;
  businessType?: string;
  /** Régimen tributario SUNAT: nrus | rer | rmt | general. */
  regimenTributario?: string;
  socialLinks?: { facebook?: string; instagram?: string; tiktok?: string };

  // ── Apariencia ──
  primaryColor?: string;
  secondaryColor?: string;
  slogan?: string;

  // ── Sistema ──
  dateFormat?: string;
  timeFormat?: string;
  decimals?: number;
  taxRate?: number;
  fiscalYearStart?: number;

  // ── Ventas y comprobantes ──
  invoiceSeries?: Record<string, string>;
  invoiceStart?: Record<string, number>;
  enabledDocTypes?: string;
  roundingMode?: string;
  maxDiscountPercent?: number;
  discountRequiresAuth?: boolean;
  invoiceFooterText?: string;
  sunatRuc?: string;
  sunatDenominacion?: string;
  sunatDireccion?: string;

  // ── Inventario ──
  defaultUnit?: string;
  globalMinStock?: number;
  stockAlertChannels?: string;
  adjustReasons?: string[];
  fefoEnabled?: boolean;
  fefoAlertDays?: number;
  inventoryCountFreq?: string;

  // ── Caja y pagos ──
  cashOpeningAmount?: number;
  cashAlertMax?: number;
  returnPolicyDays?: number;
  returnMaxNoAuth?: number;
  autoCloseTime?: string;

  // ── Delivery ──
  deliveryZones?: Array<{ name: string; fee: number; estimatedMin: number }>;
  freeDeliveryMin?: number;
  deliveryMaxRadius?: number;
  deliveryHours?: { morning?: string; afternoon?: string; evening?: string };
  riders?: Array<{ name: string; phone: string; zone: string }>;

  // ── Notificaciones ──
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  smtpFrom?: string;
  whatsappApiToken?: string;
  whatsappBusinessNum?: string;
  whatsappWebhookUrl?: string;
  notifChannels?: Record<string, boolean>;
  reorderReminderDays?: number;

  // ── Integraciones ──
  plinEnabled?: boolean;
  plinImage?: string;
  plinName?: string;
  plinPhone?: string;
  sunatProvider?: string;
  sunatApiKey?: string;
  googleAnalyticsId?: string;
  googleTagManagerId?: string;

  // ── Auditoría ──
  logRetentionDays?: number;
  logActions?: string;

  // ── Respaldo ──
  backupSchedule?: string;
  lastBackupAt?: string;

  // ── Suscripción ──
  planName?: string;
  planExpiresAt?: string;
  maxProducts?: number;
  maxUsers?: number;
  maxBranches?: number;
  enabledModules?: string[];

  // ── Métodos de pago adicionales ──
  transferEnabled?: boolean;
  transferBankName?: string;
  transferAccountNum?: string;
  transferAccountHolder?: string;

  // ── StoreCustomizer ──
  storeTheme?: Record<string, unknown>;
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

export type PurchaseStatus = "pendiente" | "recibido" | "parcial" | "cancelado" | "auto_generated";

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
  paymentMethod?: string;
  deliveryDate?: string;
  discount?: number;
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
  payment: "efectivo" | "yape" | "plin" | "tarjeta" | "MIXTO" | "fiado";
  amountPaid: number;
  change: number;
  customerPhone?: string;
  cashierId?: string;
  createdAt: string;
  // Mejora 1: Tipo de comprobante
  comprobanteTipo?: string;
  comprobanteRuc?: string;
  // Mejora 4: Descuento global
  descuentoMonto?: number;
  descuentoPorcentaje?: number;
  // Payment details for split/mixed payments
  paymentDetails?: string;
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
    tenantId: string;
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
        tenantId: data.tenantId,
      },
    });
    return mapSurvey(r);
  },

  async getByOrder(tenantId: string, orderId: string): Promise<DbSurveyResponse | null> {
    const r = await prisma.surveyResponse.findFirst({ where: { tenantId, orderId } });
    return r ? mapSurvey(r) : null;
  },

  async getAll(tenantId: string, limit = 100): Promise<DbSurveyResponse[]> {
    const where: Record<string, unknown> = { tenantId };
    const rows = await prisma.surveyResponse.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map(mapSurvey);
  },

  async stats(tenantId: string): Promise<{
    total: number;
    average: number;
    distribution: Record<number, number>;
  }> {
    const [agg, all] = await Promise.all([
      prisma.surveyResponse.aggregate({
        where: { tenantId, type: "nps" },
        _avg: { rating: true },
        _count: true,
      }),
      prisma.surveyResponse.findMany({
        where: { tenantId, type: "nps" },
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
