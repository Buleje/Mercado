export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { sendPushToPhone } from "@/lib/push-sender";
import { timingSafeCompare } from "@/lib/timing-safe";

/**
 * Cron: Multi-tenant isolation monitor
 * Runs isolation checks and alerts SuperAdmin if any fail.
 * Schedule: every 6 hours
 * Auth: Bearer CRON_SECRET
 */

type IsolationCheck = {
  name: string;
  passed: boolean;
  detail: string;
};

/**
 * Generic orphan check: counts rows in `table` whose tenantId
 * does not match any existing Tenant.id.
 */
async function checkOrphans(table: string, label: string): Promise<IsolationCheck> {
  try {
    const result = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*) as count FROM "${table}" r
       WHERE NOT EXISTS (SELECT 1 FROM "Tenant" t WHERE t.id = r."tenantId")`
    );
    const count = Number(result[0]?.count ?? 0);
    return {
      name: `${label} huérfanos`,
      passed: count === 0,
      detail: count === 0 ? "OK" : `${count} registro(s) sin tenant válido`,
    };
  } catch {
    return { name: `${label} huérfanos`, passed: false, detail: "Error al verificar" };
  }
}

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
      name: "OrderItems cross-tenant",
      passed: count === 0,
      detail: count === 0 ? "OK" : `${count} items referencian productos de otro tenant`,
    };
  } catch {
    return { name: "OrderItems cross-tenant", passed: false, detail: "Error al verificar" };
  }
}

async function checkCrossTenantSaleItems(): Promise<IsolationCheck> {
  try {
    const crossTenant = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM "SaleItem" si
      JOIN "Sale" s ON s.id = si."saleId"
      JOIN "Product" p ON p.id = si."productId"
      WHERE s."tenantId" != p."tenantId"
    `;
    const count = Number(crossTenant[0]?.count ?? 0);
    return {
      name: "SaleItems cross-tenant",
      passed: count === 0,
      detail: count === 0 ? "OK" : `${count} sale items referencian productos de otro tenant`,
    };
  } catch {
    return { name: "SaleItems cross-tenant", passed: false, detail: "Error al verificar" };
  }
}

async function checkCrossTenantPurchaseItems(): Promise<IsolationCheck> {
  try {
    const crossTenant = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM "PurchaseItem" pi
      JOIN "PurchaseOrder" po ON po.id = pi."purchaseOrderId"
      JOIN "Product" p ON p.id = pi."productId"
      WHERE po."tenantId" != p."tenantId"
    `;
    const count = Number(crossTenant[0]?.count ?? 0);
    return {
      name: "PurchaseItems cross-tenant",
      passed: count === 0,
      detail: count === 0 ? "OK" : `${count} purchase items referencian productos de otro tenant`,
    };
  } catch {
    return { name: "PurchaseItems cross-tenant", passed: false, detail: "Error al verificar" };
  }
}

async function checkCrossTenantBatches(): Promise<IsolationCheck> {
  try {
    const crossTenant = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM "Batch" b
      JOIN "Product" p ON p.id = b."productId"
      WHERE b."productId" IS NOT NULL AND b."tenantId" != p."tenantId"
    `;
    const count = Number(crossTenant[0]?.count ?? 0);
    return {
      name: "Batches cross-tenant",
      passed: count === 0,
      detail: count === 0 ? "OK" : `${count} lotes referencian productos de otro tenant`,
    };
  } catch {
    return { name: "Batches cross-tenant", passed: false, detail: "Error al verificar" };
  }
}

async function checkCrossTenantTransfers(): Promise<IsolationCheck> {
  try {
    const crossTenant = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM "Transfer" tr
      JOIN "Warehouse" wf ON wf.id = tr."fromWarehouseId"
      WHERE tr."tenantId" != wf."tenantId"
    `;
    const count = Number(crossTenant[0]?.count ?? 0);
    return {
      name: "Transfers cross-tenant",
      passed: count === 0,
      detail: count === 0 ? "OK" : `${count} transferencias referencian almacenes de otro tenant`,
    };
  } catch {
    return { name: "Transfers cross-tenant", passed: false, detail: "Error al verificar" };
  }
}

// ─── Tables to check for orphan records ──────────────────────
const ORPHAN_CHECKS: [string, string][] = [
  ["Order", "Pedidos"],
  ["Product", "Productos"],
  ["AdminUser", "Admins"],
  ["Customer", "Clientes"],
  ["Settings", "Configuraciones"],
  ["Supplier", "Proveedores"],
  ["Sale", "Ventas"],
  ["PurchaseOrder", "Órdenes de compra"],
  ["CashRegister", "Cajas"],
  ["Warehouse", "Almacenes"],
  ["Batch", "Lotes"],
  ["InventoryMovement", "Mov. inventario"],
  ["Fiado", "Fiados"],
  ["Expense", "Gastos"],
  ["Notification", "Notificaciones"],
  ["Campaign", "Campañas"],
  ["Store", "Tiendas marketplace"],
  ["CreditProfile", "Perfiles crédito"],
  ["SupportTicket", "Tickets soporte"],
];

export async function GET(req: NextRequest) {
  // Auth: Bearer CRON_SECRET
  const auth = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET;

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Run all orphan checks in parallel
  const orphanChecks = ORPHAN_CHECKS.map(([table, label]) => checkOrphans(table, label));

  const checks = await Promise.all([
    ...orphanChecks,
    checkCrossTenantOrderItems(),
    checkCrossTenantSaleItems(),
    checkCrossTenantPurchaseItems(),
    checkCrossTenantBatches(),
    checkCrossTenantTransfers(),
  ]);

  const failures = checks.filter((c) => !c.passed);
  const allPassed = failures.length === 0;

  // If any check fails, alert the SuperAdmin
  if (!allPassed) {
    const alertLines = failures.map((f) => `- ${f.name}: ${f.detail}`);
    const message = [
      "*ALERTA DE AISLAMIENTO MULTI-TENANT*",
      "",
      `Se detectaron ${failures.length} problema(s):`,
      "",
      ...alertLines,
      "",
      `Verificado: ${new Date().toLocaleString("es-PE", { timeZone: "America/Lima" })}`,
      "",
      "Revisar en: /superadmin/dashboard",
    ].join("\n");

    // Send alerts to SuperAdmin phone (from env)
    const adminPhone = process.env.SUPERADMIN_PHONE;
    if (adminPhone) {
      sendWhatsAppText(adminPhone, message).catch(() => {});
      sendPushToPhone(adminPhone, {
        title: "Alerta de Aislamiento",
        body: `${failures.length} problema(s) detectado(s) en el aislamiento multi-tenant`,
        url: "/superadmin/dashboard",
      }).catch(() => {});
    }
  }

  return NextResponse.json({
    status: allPassed ? "healthy" : "alert",
    totalChecks: checks.length,
    checks,
    failures: failures.length,
    checkedAt: new Date().toISOString(),
  });
}
