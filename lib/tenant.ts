import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

/** Slug used by the original single-store deployment. */
export const DEFAULT_TENANT_SLUG = "main";

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
  "product",
  "customer",
  "order",
  "settings",
  "supplier",
  "purchaseOrder",
  "sale",
  "promotion",
  "coupon",
  "return",
  "shoppingList",
  "expense",
  "bundle",
  "cashRegister",
  "adminUser",
  "pushSubscription",
  "review",
  "payable",
  "inventoryMovement",
  "savedCart",
  "activityLog",
  "notificationLog",
  "chatMessage",
  "adminMessage",
  "abTest",
  "surveyResponse",
  "page",
  "media",
  "deliverySlot",
]);

/**
 * Returns a Prisma client extended with automatic tenantId injection.
 *
 * All CRUD operations on tenant-scoped models are transparently filtered
 * and tagged with `tenantId`. Non-scoped models (e.g. OrderItem, SaleItem)
 * are passed through unchanged — they inherit isolation via FK relations.
 *
 * Usage (in an API route):
 *   const tenantId = getTenantIdFromRequest(req);
 *   const db = prismaForTenant(tenantId);
 *   const products = await db.product.findMany(); // auto-filtered
 */
export function prismaForTenant(tenantId: string) {
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
