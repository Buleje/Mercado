import { headers } from "next/headers";
import { cache } from "react";
import { prisma } from "@/lib/prisma";

/** Slug used by the original single-store deployment. */
export const DEFAULT_TENANT_SLUG = "main";

/**
 * Find a Tenant record by either its ID (CUID) or slug.
 * Use this everywhere you need to look up a Tenant from auth.tenantId
 * or x-tenant-id header — the value may be either format.
 *
 * PERF 2026-05-12 (audit N+1 fix): memoizado con React.cache por request.
 * Antes se detectaba el patron 3x tenant.findFirst dentro de una sola request
 * cuando varios componentes/rutas llamaban este helper en cascada. React.cache
 * deduplica dentro del mismo render tree server-side.
 */
export const findTenantByIdOrSlug = cache(async (tenantId: string) => {
  if (!tenantId) return null;
  return prisma.tenant.findFirst({
    where: { OR: [{ id: tenantId }, { slug: tenantId }] },
  });
});

/**
 * Variante con select restringido a campos de billing/trial — usada por
 * helpers en hot path (requireActiveSubscription, trial gates).
 * Memoizada por request via React.cache para deduplicar.
 *
 * Brandon 2026-05-16 (Fase 2 perf): consolidar 3+ findFirst con select
 * billing repetidos en lib/trial.ts, lib/billing/require-active-subscription.ts
 * y lib/db/tenant-billing.db.ts en un único call cacheado.
 */
export const findTenantBillingByIdOrSlug = cache(async (tenantId: string) => {
  if (!tenantId) return null;
  return prisma.tenant.findFirst({
    where: { OR: [{ id: tenantId }, { slug: tenantId }] },
    select: {
      id: true,
      slug: true,
      active: true,
      plan: true,
      trialEndsAt: true,
      stripeSubscriptionId: true,
      stripeCurrentPeriodEnd: true,
      mpSubscriptionId: true,
      cancelAtPeriodEnd: true,
    },
  });
});

/**
 * Read the tenant slug injected by Next.js edge middleware.
 * Parses the `x-tenant-id` header set from the subdomain.
 * Must be called from a Server Component, Server Action, or Route Handler.
 */
export async function getTenantId(): Promise<string> {
  const h = await headers();
  return h.get("x-tenant-id") ?? DEFAULT_TENANT_SLUG;
}

/**
 * Read the tenant slug from a Web API Request (for Route Handlers).
 */
export function getTenantIdFromRequest(req: Request): string {
  return req.headers.get("x-tenant-id") ?? DEFAULT_TENANT_SLUG;
}

/**
 * Prisma model names (camelCase) that are partitioned per tenant.
 * All create/read/update/delete operations on these models will be
 * automatically scoped to the current tenantId by prismaForTenant().
 */
const TENANT_MODELS = new Set([
  // ── Core commerce ──
  "product",
  "customer",
  "order",
  "sale",
  "savedCart",
  "review",
  "settings",
  // ── Suppliers & purchasing ──
  "supplier",
  "purchaseOrder",
  "payable",
  // ── Promotions & coupons ──
  "promotion",
  "coupon",
  "discountRule",
  // ── Returns ──
  "return",
  "supplierReturn",
  // ── Inventory & warehouse ──
  "inventoryMovement",
  "batch",
  "warehouse",
  "transfer",
  "location",
  "conteoFisico",
  // ── Cash register ──
  "cashRegister",
  "expense",
  "bundle",
  // ── Users & auth ──
  "adminUser",
  "pushSubscription",
  "apiKey",
  "tenantInvitation",
  // ── Shopping lists ──
  "shoppingList",
  // ── Audit & logs ──
  "activityLog",
  "notificationLog",
  // ── Chat & messaging ──
  "adminMessage",
  "chatMessage",
  // ── WhatsApp commerce ──
  "tenantWhatsAppConfig",
  "whatsAppConversation",
  // ── Notes, reminders, templates ──
  "note",
  "messageTemplate",
  "reminder",
  "savedFilter",
  // ── Marketing & campaigns ──
  "campaign",
  "newsletterSubscriber",
  "visitorWelcome",
  "aBTest",
  "aBTestEvent",
  "surveyResponse",
  // ── Cierre diario ──
  "dailySummary",
  // ── Fiados (crédito informal) ──
  "fiado",
  // ── Turnos ──
  "turno",
  // ── Recetas & producción ──
  "receta",
  "produccionLote",
  // ── Préstamos ──
  "prestamo",
  // ── Tesorería ──
  "treasuryCuenta",
  "treasuryMovimiento",
  "treasuryTransferencia",
  // ── Cotizaciones ──
  "cotizacion",
  // ── Guías de remisión ──
  "guiaRemision",
  // ── Notas de crédito ──
  "notaCredito",
  // ── Notifications ──
  "notification",
  "customerNotification",
  // ── Compliance & KPIs ──
  "complianceItem",
  "customKpi",
  "commissionRule",
  // ── Marketplace ──
  "store",
  // ── Support ──
  "supportTicket",
  // ── SUNAT facturación ──
  "tenantSunatConfig",
  "sunatInvoice",
  // ── Anti-churn ──
  "tenantHealthScore",
  "churnSignal",
  // ── Crédito BNPL ──
  "creditProfile",
  "creditInstallment",
  // ── AI Forecasting ──
  "forecastLog",
  // ── Supplier ratings ──
  "supplierRating",
  "supplierEvaluation",
  "supplierPriceVersion",
  "supplierOffer",
  // ── CMS ──
  "page",
  "media",
  "themeSettings",
  "navigation",
  // ── Delivery ──
  "deliverySlot",
  "deliveryPartner",
  "deliveryAssignment",
  // ── History & tracking ──
  "priceHistory",
  "orderStatusHistory",
  // ── Marketplace ledger ──
  "commissionLedger",
  // ── 2026-05-11 audit P2-1: 40+ modelos que faltaban ──
  // Catálogo extendido (todos tienen tenantId directo en schema)
  "productAnalytics",
  "productImage",
  "productVariant",
  "productModifierGroup",
  "productModifierOption",
  // Reviews
  "reviewVote",
  // Sales/analytics
  "salesAnomaly",
  "stockoutPrediction",
  // Loyalty + Subscriptions
  "loyaltyTransaction",
  "subscription",
  "subscriptionDelivery",
  // Gift cards (financial)
  "giftCard",
  "giftCardRedemption",
  // Payment approval (Yape vision, audit P0-2)
  "paymentApproval",
  // Documents (datos privados, drive enterprise)
  "document",
  "documentFolder",
  "documentShare",
  "documentTemplate",
  "documentAuditLog",
  // AI conversations
  "aIConversation",
  "conversationMessage",
  "conversationThread",
  // Live commerce
  "liveProduct",
  "liveSession",
  "liveChatMessage",
  "liveViewerEvent",
  // Sponsored / ads
  "sponsoredBoost",
  // Wholesale
  "wholesaleOrder",
  // Tenant pages / CMS
  "tenantFeatureFlag",
  "tenantPageProductOverride",
  "tenantPagePromotion",
  "tenantPageVisit",
  "tenantStorePage",
  "blockTemplate",
  "pageHero",
  "storeBanner",
  // Vendor lifecycle
  "vendorApplication",
  // Delivery extended
  "deliveryOffer",
  "deliveryRoute",
  "deliveryRouteStop",
  "deliveryTracking",
  // Credit extended
  "creditReminder",
  "creditScoreHistory",
  // Socio Buleje (programa de fidelidad cross-store)
  "socioBillingCycle",
  "socioCashbackEntry",
  "socioMembership",
  // Event sourcing
  "eventDeadLetter",
]);

/**
 * Build the tenant-scoped extension for a given tenantId.
 * Extracted into a helper so we can capture the return type.
 *
 * NOTA crítica multi-tenant: Prisma 7 entrega `model` en PascalCase
 * ("AdminUser") al callback de `$extends`. TENANT_MODELS está
 * declarado en camelCase ("adminUser") porque ese es el nombre del
 * accesor en el cliente. Normalizamos con `isScoped()` antes de
 * verificar pertenencia — sin esto, NINGÚN modelo se filtra y todo
 * el aislamiento multi-tenant queda anulado.
 */
function buildTenantExtension(tenantId: string) {
  const isScoped = (model: string): boolean => {
    if (TENANT_MODELS.has(model)) return true;
    const camel = model.charAt(0).toLowerCase() + model.slice(1);
    return TENANT_MODELS.has(camel);
  };

  return prisma.$extends({
    query: {
      $allModels: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async findMany({ args, query, model }: any) {
          if (isScoped(model)) args.where = { tenantId, ...args.where };
          return query(args);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async findFirst({ args, query, model }: any) {
          if (isScoped(model)) args.where = { tenantId, ...args.where };
          return query(args);
        },
        // findUnique only accepts unique constraints in `where`, so we cannot
        // inject `tenantId` there. Instead we run the query and post-check
        // that the row belongs to the current tenant — returning null if not.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async findUnique({ args, query, model }: any) {
          const row = await query(args);
          if (!isScoped(model) || row == null) return row;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (row as any).tenantId === tenantId ? row : null;
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async findUniqueOrThrow({ args, query, model }: any) {
          const row = await query(args);
          if (!isScoped(model)) return row;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((row as any).tenantId !== tenantId) {
            throw new Error(
              `[tenant-guard] findUniqueOrThrow on ${model}: cross-tenant access denied`,
            );
          }
          return row;
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async count({ args, query, model }: any) {
          if (isScoped(model)) args.where = { tenantId, ...args.where };
          return query(args);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async aggregate({ args, query, model }: any) {
          if (isScoped(model)) args.where = { tenantId, ...args.where };
          return query(args);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async create({ args, query, model }: any) {
          if (isScoped(model)) args.data = { ...args.data, tenantId };
          return query(args);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async createMany({ args, query, model }: any) {
          if (isScoped(model) && Array.isArray(args.data)) {
            args.data = (args.data as Record<string, unknown>[]).map((d) => ({
              ...d,
              tenantId,
            }));
          }
          return query(args);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async upsert({ args, query, model }: any) {
          if (isScoped(model)) {
            // Pre-check: if a row already matches the unique where but belongs
            // to a different tenant, refuse — otherwise upsert would overwrite
            // another tenant's data via the update branch.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ext = (prisma as any).$extends({});
            const accessor = model.charAt(0).toLowerCase() + model.slice(1);
            const existing = await ext[accessor].findUnique({
              where: args.where,
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (existing && (existing as any).tenantId !== tenantId) {
              throw new Error(
                `[tenant-guard] upsert on ${model}: cross-tenant access denied`,
              );
            }
            args.create = { ...args.create, tenantId };
          }
          return query(args);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async update({ args, query, model }: any) {
          if (isScoped(model)) args.where = { ...args.where, tenantId };
          return query(args);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async updateMany({ args, query, model }: any) {
          if (isScoped(model)) args.where = { tenantId, ...args.where };
          return query(args);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async delete({ args, query, model }: any) {
          if (isScoped(model)) args.where = { ...args.where, tenantId };
          return query(args);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async deleteMany({ args, query, model }: any) {
          if (isScoped(model)) args.where = { tenantId, ...args.where };
          return query(args);
        },
      },
    },
  });
}

/** Concrete type returned by prismaForTenant(). */
type TenantPrismaClient = ReturnType<typeof buildTenantExtension>;

/**
 * Cache of Prisma extensions keyed by tenantId.
 * Avoids re-creating the extension on every request for the same tenant.
 */
const extensionCache = new Map<string, TenantPrismaClient>();

/**
 * Returns a Prisma client extended with automatic tenantId injection.
 *
 * All CRUD operations on tenant-scoped models are transparently filtered
 * and tagged with `tenantId`. Non-scoped models (e.g. OrderItem, SaleItem)
 * are passed through unchanged — they inherit isolation via FK relations.
 *
 * Extensions are cached per tenantId to avoid re-creation overhead.
 *
 * Usage (in an API route):
 *   const tenantId = getTenantIdFromRequest(req);
 *   const db = prismaForTenant(tenantId);
 *   const products = await db.product.findMany(); // auto-filtered
 */
export function prismaForTenant(tenantId: string): TenantPrismaClient {
  const cached = extensionCache.get(tenantId);
  if (cached) return cached;

  const extended = buildTenantExtension(tenantId);
  extensionCache.set(tenantId, extended);
  return extended;
}
