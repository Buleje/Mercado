import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * ROADMAP ITEM #47 — Flash sales cross-vendor
 *
 * Flash sale es un descuento time-boxed (inicio + fin) que aplica a un
 * conjunto de productos o a toda una tienda. Se guarda en Settings.metadata
 * sin migration. El frontend consulta `getActiveFlashSales(tenantId)` para
 * renderizar banners y aplicar el descuento en el precio visible.
 */

export interface FlashSale {
  id: string;
  tenantId: string;
  title: string;
  discountPercent: number;
  startsAt: string;
  endsAt: string;
  productIds?: number[];
  categoryIds?: string[];
  active: boolean;
}

async function readSales(tenantId: string): Promise<FlashSale[]> {
  try {
    const row = await prisma.settings.findFirst({
      where: { tenantId },
      select: { featureFlagsJson: true },
    });
    if (!row?.featureFlagsJson) return [];
    try {
      const parsed = JSON.parse(row.featureFlagsJson) as Record<string, unknown>;
      const list = parsed.flashSales;
      return Array.isArray(list) ? (list as FlashSale[]) : [];
    } catch {
      return [];
    }
  } catch (err) {
    logger.warn("[flash-sales] read failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

async function writeSales(tenantId: string, sales: FlashSale[]): Promise<boolean> {
  try {
    const row = await prisma.settings.findFirst({
      where: { tenantId },
      select: { id: true, featureFlagsJson: true },
    });
    if (!row) return false;
    const existing = row.featureFlagsJson
      ? (JSON.parse(row.featureFlagsJson) as Record<string, unknown>)
      : {};
    const nextFlags = { ...existing, flashSales: sales };
    await prisma.settings.update({
      where: { id: row.id },
      data: { featureFlagsJson: JSON.stringify(nextFlags) },
    });
    return true;
  } catch (err) {
    logger.error("[flash-sales] write failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

export async function getActiveFlashSales(
  tenantId: string,
  now = new Date(),
): Promise<FlashSale[]> {
  const all = await readSales(tenantId);
  return all.filter(
    (s) =>
      s.active &&
      new Date(s.startsAt) <= now &&
      new Date(s.endsAt) >= now,
  );
}

export async function applyFlashSaleDiscount(
  tenantId: string,
  productId: number,
  originalPrice: number,
): Promise<{ finalPrice: number; discountPercent: number; saleId?: string }> {
  const active = await getActiveFlashSales(tenantId);
  if (active.length === 0) return { finalPrice: originalPrice, discountPercent: 0 };

  const matching = active.find(
    (s) =>
      !s.productIds ||
      s.productIds.length === 0 ||
      s.productIds.includes(productId),
  );
  if (!matching) return { finalPrice: originalPrice, discountPercent: 0 };

  const discount = Math.max(0, Math.min(90, matching.discountPercent));
  const finalPrice = Math.round(originalPrice * (1 - discount / 100) * 100) / 100;
  return { finalPrice, discountPercent: discount, saleId: matching.id };
}

export async function createFlashSale(
  input: Omit<FlashSale, "id" | "active">,
): Promise<FlashSale> {
  const all = await readSales(input.tenantId);
  const sale: FlashSale = {
    ...input,
    id: `fs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    active: true,
  };
  all.push(sale);
  await writeSales(input.tenantId, all);
  return sale;
}
