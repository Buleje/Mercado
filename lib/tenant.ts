import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

/** Slug used by the original single-store deployment. */
export const DEFAULT_TENANT_SLUG = "main";

/**
 * Find a Tenant record by either its ID (CUID) or slug.
 * Use this everywhere you need to look up a Tenant from auth.tenantId
 * or x-tenant-id header — the value may be either format.
 */
export async function findTenantByIdOrSlug(tenantId: string) {
  return prisma.tenant.findFirst({
    where: { OR: [{ id: tenantId }, { slug: tenantId }] },
  });
}

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
]);

/**
 * Build the tenant-scoped extension for a given tenantId.
 * Extracted into a helper so we can capture the return type.
 */
function buildTenantExtension(tenantId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async findMany({ args, query, model }: any) {
          if (TENANT_MODELS.has(model)) args.where = { tenantId, ...args.where };
          return query(args);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async findFirst({ args, query, model }: any) {
          if (TENANT_MODELS.has(model)) args.where = { tenantId, ...args.where };
          return query(args);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async count({ args, query, model }: any) {
          if (TENANT_MODELS.has(model)) args.where = { tenantId, ...args.where };
          return query(args);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async aggregate({ args, query, model }: any) {
          if (TENANT_MODELS.has(model)) args.where = { tenantId, ...args.where };
          return query(args);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async create({ args, query, model }: any) {
          if (TENANT_MODELS.has(model)) args.data = { ...args.data, tenantId };
          return query(args);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async createMany({ args, query, model }: any) {
          if (TENANT_MODELS.has(model) && Array.isArray(args.data)) {
            args.data = (args.data as Record<string, unknown>[]).map((d) => ({
              ...d,
              tenantId,
            }));
          }
          return query(args);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async upsert({ args, query, model }: any) {
          if (TENANT_MODELS.has(model)) {
            args.create = { ...args.create, tenantId };
          }
          return query(args);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async update({ args, query, model }: any) {
          if (TENANT_MODELS.has(model)) args.where = { ...args.where, tenantId };
          return query(args);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async updateMany({ args, query, model }: any) {
          if (TENANT_MODELS.has(model)) args.where = { tenantId, ...args.where };
          return query(args);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async delete({ args, query, model }: any) {
          if (TENANT_MODELS.has(model)) args.where = { ...args.where, tenantId };
          return query(args);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async deleteMany({ args, query, model }: any) {
          if (TENANT_MODELS.has(model)) args.where = { tenantId, ...args.where };
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
