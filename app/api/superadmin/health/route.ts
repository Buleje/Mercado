export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TenantHealth = {
  tenantId: string;
  slug: string;
  name: string;
  status: "healthy" | "warning" | "critical";
  checks: IsolationCheck[];
  stats: {
    products: number;
    orders: number;
    customers: number;
    ordersLast24h: number;
    errorsLast24h: number;
  };
};

export type IsolationCheck = {
  name: string;
  passed: boolean;
  detail: string;
};

export type HealthResponse = {
  overall: "healthy" | "warning" | "critical";
  tenants: TenantHealth[];
  isolationTests: IsolationCheck[];
  checkedAt: string;
};

// ── Isolation probes ──────────────────────────────────────────────────────────

/** Verify no orders reference a tenantId that doesn't exist */
async function checkOrphanOrders(): Promise<IsolationCheck> {
  try {
    const orphans = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM "Order" o
      WHERE NOT EXISTS (SELECT 1 FROM "Tenant" t WHERE t.id = o."tenantId")
    `;
    const count = Number(orphans[0]?.count ?? 0);
    return {
      name: "Pedidos sin tenant válido",
      passed: count === 0,
      detail: count === 0
        ? "Todos los pedidos pertenecen a un tenant existente"
        : `${count} pedido(s) con tenantId huérfano`,
    };
  } catch {
    return { name: "Pedidos sin tenant válido", passed: false, detail: "Error al verificar" };
  }
}

/** Verify no products reference a tenantId that doesn't exist */
async function checkOrphanProducts(): Promise<IsolationCheck> {
  try {
    const orphans = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM "Product" p
      WHERE NOT EXISTS (SELECT 1 FROM "Tenant" t WHERE t.id = p."tenantId")
    `;
    const count = Number(orphans[0]?.count ?? 0);
    return {
      name: "Productos sin tenant válido",
      passed: count === 0,
      detail: count === 0
        ? "Todos los productos pertenecen a un tenant existente"
        : `${count} producto(s) con tenantId huérfano`,
    };
  } catch {
    return { name: "Productos sin tenant válido", passed: false, detail: "Error al verificar" };
  }
}

/** Verify no customers reference a tenantId that doesn't exist */
async function checkOrphanCustomers(): Promise<IsolationCheck> {
  try {
    const orphans = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM "Customer" c
      WHERE NOT EXISTS (SELECT 1 FROM "Tenant" t WHERE t.id = c."tenantId")
    `;
    const count = Number(orphans[0]?.count ?? 0);
    return {
      name: "Clientes sin tenant válido",
      passed: count === 0,
      detail: count === 0
        ? "Todos los clientes pertenecen a un tenant existente"
        : `${count} cliente(s) con tenantId huérfano`,
    };
  } catch {
    return { name: "Clientes sin tenant válido", passed: false, detail: "Error al verificar" };
  }
}

/** Verify orders don't contain items from products of a different tenant */
async function checkCrossTenantOrderItems(): Promise<IsolationCheck> {
  try {
    const crossTenant = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM "OrderItem" oi
      JOIN "Order" o ON o.id = oi."orderId"
      JOIN "Product" p ON p.id = oi."productId"
      WHERE o."tenantId" != p."tenantId"
    `;
    const count = Number(crossTenant[0]?.count ?? 0);
    return {
      name: "Items de pedido cross-tenant",
      passed: count === 0,
      detail: count === 0
        ? "Ningún pedido contiene productos de otro tenant"
        : `⚠️ ${count} item(s) de pedido referencian productos de otro tenant`,
    };
  } catch {
    return { name: "Items de pedido cross-tenant", passed: false, detail: "Error al verificar" };
  }
}

/** Verify each tenant has properly scoped admin users */
async function checkAdminUsersScoped(): Promise<IsolationCheck> {
  try {
    const orphans = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM "AdminUser" u
      WHERE NOT EXISTS (SELECT 1 FROM "Tenant" t WHERE t.id = u."tenantId")
    `;
    const count = Number(orphans[0]?.count ?? 0);
    return {
      name: "Admins sin tenant válido",
      passed: count === 0,
      detail: count === 0
        ? "Todos los admins pertenecen a un tenant existente"
        : `${count} admin(s) con tenantId huérfano`,
    };
  } catch {
    return { name: "Admins sin tenant válido", passed: false, detail: "Error al verificar" };
  }
}

// ── GET /api/superadmin/health ────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Auth: only superadmin (proxy.ts already validates platform session for /api/superadmin/*,
  // but double-check as defense in depth)
  const platformToken = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!platformToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const session = await getPlatformSession(platformToken);
  if (!session) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const checkedAt = new Date().toISOString();
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Run all isolation checks in parallel
  const isolationTests = await Promise.all([
    checkOrphanOrders(),
    checkOrphanProducts(),
    checkOrphanCustomers(),
    checkCrossTenantOrderItems(),
    checkAdminUsersScoped(),
  ]);

  // Get all tenants with stats
  const tenants = await prisma.tenant.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
    },
    orderBy: { name: "asc" },
  });

  const tenantHealths: TenantHealth[] = await Promise.all(
    tenants.map(async (t) => {
      const [products, orders, customers, ordersLast24h] = await Promise.all([
        prisma.product.count({ where: { tenantId: t.id } }).catch(() => -1),
        prisma.order.count({ where: { tenantId: t.id } }).catch(() => -1),
        prisma.customer.count({ where: { tenantId: t.id } }).catch(() => -1),
        prisma.order.count({
          where: { tenantId: t.id, createdAt: { gte: twentyFourHoursAgo } },
        }).catch(() => -1),
      ]);

      // Per-tenant isolation: check if this tenant's orders have cross-tenant items
      let crossItems = 0;
      try {
        const result = await prisma.$queryRaw<{ count: bigint }[]>`
          SELECT COUNT(*) as count FROM "OrderItem" oi
          JOIN "Order" o ON o.id = oi."orderId"
          JOIN "Product" p ON p.id = oi."productId"
          WHERE o."tenantId" = ${t.id} AND o."tenantId" != p."tenantId"
        `;
        crossItems = Number(result[0]?.count ?? 0);
      } catch { /* ignore */ }

      const checks: IsolationCheck[] = [
        {
          name: "Datos propios",
          passed: products >= 0 && orders >= 0 && customers >= 0,
          detail: `${products} productos, ${orders} pedidos, ${customers} clientes`,
        },
        {
          name: "Sin items cross-tenant",
          passed: crossItems === 0,
          detail: crossItems === 0
            ? "Todos los items pertenecen a esta tienda"
            : `⚠️ ${crossItems} items referencian productos de otro tenant`,
        },
      ];

      const allPassed = checks.every((c) => c.passed);
      const hasCritical = crossItems > 0;

      return {
        tenantId: t.id,
        slug: t.slug,
        name: t.name || t.slug,
        status: hasCritical ? "critical" as const : allPassed ? "healthy" as const : "warning" as const,
        checks,
        stats: {
          products,
          orders,
          customers,
          ordersLast24h,
          errorsLast24h: 0, // Could integrate with Sentry API in the future
        },
      };
    })
  );

  const allIsolationPassed = isolationTests.every((t) => t.passed);
  const allTenantsHealthy = tenantHealths.every((t) => t.status === "healthy");
  const hasCritical = tenantHealths.some((t) => t.status === "critical") || !allIsolationPassed;

  const overall = hasCritical ? "critical" : allTenantsHealthy && allIsolationPassed ? "healthy" : "warning";

  const response: HealthResponse = {
    overall,
    tenants: tenantHealths,
    isolationTests,
    checkedAt,
  };

  return NextResponse.json(response);
}
