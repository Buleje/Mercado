/**
 * ROADMAP ITEM #57 — Tenant snapshot backup
 *
 * Uso:
 *   npx tsx scripts/tenant-snapshot-backup.ts --tenant main [--output backups/]
 *
 * Exporta una "foto" del tenant como JSON: settings, productos, clientes,
 * últimas 500 órdenes, últimas 500 ventas, coupons, loyalty transactions.
 * Idempotente y read-only — puede ejecutarse en cron nocturno sin riesgo.
 *
 * NO toca la DB de producción — solo lee.
 * Los archivos van a `backups/<tenantId>-<YYYYMMDD>.json` y se mantienen
 * rotativamente (últimos 14 días).
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

import { mkdir, writeFile, readdir, unlink, stat } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "../lib/prisma";

const RETENTION_DAYS = 14;
const ORDER_LIMIT = 500;
const SALE_LIMIT = 500;

function arg(flag: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

async function snapshotTenant(tenantId: string): Promise<Record<string, unknown>> {
  const [settings, products, customers, orders, sales, coupons, loyalty] =
    await Promise.all([
      prisma.settings.findFirst({ where: { tenantId } }),
      prisma.product.findMany({ where: { tenantId } }),
      prisma.customer.findMany({ where: { tenantId } }),
      prisma.order.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: ORDER_LIMIT,
        include: { items: true },
      }),
      prisma.sale.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: SALE_LIMIT,
      }),
      prisma.coupon.findMany({ where: { tenantId } }),
      prisma.loyaltyTransaction.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: 1000,
      }),
    ]);

  return {
    exportedAt: new Date().toISOString(),
    tenantId,
    counts: {
      products: products.length,
      customers: customers.length,
      orders: orders.length,
      sales: sales.length,
      coupons: coupons.length,
      loyaltyTransactions: loyalty.length,
    },
    settings,
    products,
    customers,
    orders,
    sales,
    coupons,
    loyalty,
  };
}

async function rotateOldBackups(dir: string, tenantId: string): Promise<void> {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const files = await readdir(dir).catch(() => [] as string[]);
  await Promise.all(
    files
      .filter((f) => f.startsWith(`${tenantId}-`) && f.endsWith(".json"))
      .map(async (f) => {
        const full = join(dir, f);
        const s = await stat(full).catch(() => null);
        if (s && s.mtimeMs < cutoff) await unlink(full).catch(() => {});
      }),
  );
}

async function main() {
  const tenantId = arg("--tenant") ?? "main";
  const outputDir = arg("--output") ?? "backups";

  await mkdir(outputDir, { recursive: true });
  const snapshot = await snapshotTenant(tenantId);

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const filename = `${tenantId}-${stamp}.json`;
  const path = join(outputDir, filename);

  await writeFile(path, JSON.stringify(snapshot, null, 2), "utf8");
  console.log(`[tenant-snapshot] wrote ${path}`);
  console.log(`[tenant-snapshot] counts:`, snapshot.counts);

  await rotateOldBackups(outputDir, tenantId);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[tenant-snapshot] failed:", err);
  process.exit(1);
});
