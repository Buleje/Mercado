import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { findTenantByIdOrSlug } from "@/lib/tenant";

/**
 * ROADMAP ITEM #84 — GDPR / Ley 29733 export para tenant.
 *
 * Complementa al export de cliente individual de ADR 036 con un export
 * completo del tenant: settings, productos, clientes (PII), órdenes,
 * ventas, etc. Solo invocable por el superadmin o el admin del tenant.
 */

export interface TenantDataExport {
  tenantId: string;
  exportedAt: string;
  requestedBy: string;
  scope: "full" | "minimal";
  data: Record<string, unknown>;
}

export async function buildTenantExport(
  tenantId: string,
  requestedBy: string,
  scope: "full" | "minimal" = "full",
): Promise<TenantDataExport> {
  const exportedAt = new Date().toISOString();

  try {
    const [tenant, settings, products, customers, orders, loyalty] = await Promise.all([
      // Brandon 2026-05-16 (Fase 3): helper memoizado React.cache.
      findTenantByIdOrSlug(tenantId),
      prisma.settings.findFirst({ where: { tenantId } }),
      prisma.product.findMany({ where: { tenantId } }),
      scope === "full"
        ? prisma.customer.findMany({ where: { tenantId } })
        : Promise.resolve([]),
      scope === "full"
        ? prisma.order.findMany({
            where: { tenantId },
            include: { items: true },
            orderBy: { createdAt: "desc" },
            take: 5000,
          })
        : Promise.resolve([]),
      scope === "full"
        ? prisma.loyaltyTransaction.findMany({ where: { tenantId }, take: 5000 })
        : Promise.resolve([]),
    ]);

    return {
      tenantId,
      exportedAt,
      requestedBy,
      scope,
      data: {
        tenant,
        settings,
        products,
        customers,
        orders,
        loyalty,
        counts: {
          products: products.length,
          customers: Array.isArray(customers) ? customers.length : 0,
          orders: Array.isArray(orders) ? orders.length : 0,
        },
      },
    };
  } catch (err) {
    logger.error("[gdpr-tenant-export] failed", {
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      tenantId,
      exportedAt,
      requestedBy,
      scope,
      data: { error: "export failed" },
    };
  }
}
