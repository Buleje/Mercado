/**
 * lib/churn/customer-churn.ts
 *
 * B2C customer churn scoring: detects at-risk end customers per tenant.
 *
 * Score 0-100 where:
 *   > 70 = at risk (should get a win-back coupon)
 *   > 90 = likely lost (needs aggressive re-engagement)
 *
 * Factors:
 *   - Days since last purchase vs tenant avg inter-purchase interval
 *   - Reduction in average ticket vs historical
 *   - Drop in purchase frequency (last 30d vs prior 30d)
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrSet } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { toNumOrZero } from "@/lib/decimal-utils";

// ── Types ───────────────────────────────────────────────────────────────────

export interface CustomerChurnResult {
  phone: string;
  name: string;
  score: number;
  riskLevel: "safe" | "watch" | "at_risk" | "lost";
  daysSinceLastPurchase: number;
  avgTicketCurrent: number;
  avgTicketHistorical: number;
  recentOrderCount: number;
  priorOrderCount: number;
  lastPurchaseDate: string | null;
  whatsappLink: string;
}

// ── Constants ───────────────────────────────────────────────────────────────

const CACHE_TTL = 300; // 5 min

// Weight distribution (sums to 100)
const W_RECENCY = 45;
const W_TICKET_DROP = 25;
const W_FREQUENCY_DROP = 30;

// ── Helpers ─────────────────────────────────────────────────────────────────

function classifyChurnRisk(score: number): CustomerChurnResult["riskLevel"] {
  if (score > 90) return "lost";
  if (score > 70) return "at_risk";
  if (score > 40) return "watch";
  return "safe";
}

function buildWhatsappLink(phone: string, storeName: string): string {
  // Ensure phone has country code (Peru = 51)
  const cleaned = phone.replace(/\D/g, "");
  const intlPhone = cleaned.startsWith("51") ? cleaned : `51${cleaned}`;
  const message = encodeURIComponent(
    `Hola! Te extrañamos en ${storeName}. Tenemos ofertas especiales para ti. Escríbenos para más info.`
  );
  return `https://wa.me/${intlPhone}?text=${message}`;
}

// ── Main scoring function ───────────────────────────────────────────────────

/**
 * Calculate churn risk score for a single customer identified by phone.
 */
export async function calculateCustomerChurnScore(
  tenantId: string,
  customerPhone: string,
): Promise<CustomerChurnResult | null> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  // All completed orders for this customer
  const orders = await prisma.order.findMany({
    where: {
      tenantId,
      customerPhone,
      deletedAt: null,
      status: { in: ["confirmado", "en_camino", "entregado"] },
    },
    select: {
      id: true,
      total: true,
      createdAt: true,
      customerName: true,
    },
    orderBy: { createdAt: "desc" },
  });

  if (orders.length === 0) return null;

  const customerName = orders[0].customerName;
  const lastPurchaseDate = orders[0].createdAt;
  const daysSinceLastPurchase = Math.floor(
    (now.getTime() - lastPurchaseDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  // 1. Recency score: days since last purchase
  // If > 60 days, max risk contribution. If 0 days, zero risk.
  const recencyScore = Math.min(daysSinceLastPurchase / 60, 1) * W_RECENCY;

  // 2. Ticket drop: compare last 30d avg vs prior 30-60d avg
  const recentOrders = orders.filter((o) => o.createdAt >= thirtyDaysAgo);
  const priorOrders = orders.filter(
    (o) => o.createdAt >= sixtyDaysAgo && o.createdAt < thirtyDaysAgo,
  );

  const avgTicketRecent =
    recentOrders.length > 0
      ? recentOrders.reduce((sum, o) => sum + toNumOrZero(o.total), 0) / recentOrders.length
      : 0;
  const avgTicketPrior =
    priorOrders.length > 0
      ? priorOrders.reduce((sum, o) => sum + toNumOrZero(o.total), 0) / priorOrders.length
      : avgTicketRecent; // No prior data → no drop

  let ticketDropScore = 0;
  if (avgTicketPrior > 0 && avgTicketRecent < avgTicketPrior) {
    const dropRatio = (avgTicketPrior - avgTicketRecent) / avgTicketPrior;
    ticketDropScore = Math.min(dropRatio, 1) * W_TICKET_DROP;
  }

  // 3. Frequency drop: compare recent 30d count vs prior 30d count
  let frequencyDropScore = 0;
  if (priorOrders.length > 0 && recentOrders.length < priorOrders.length) {
    const dropRatio =
      (priorOrders.length - recentOrders.length) / priorOrders.length;
    frequencyDropScore = Math.min(dropRatio, 1) * W_FREQUENCY_DROP;
  } else if (recentOrders.length === 0 && orders.length > 0) {
    // No recent orders at all → max frequency risk
    frequencyDropScore = W_FREQUENCY_DROP;
  }

  const score = Math.round(recencyScore + ticketDropScore + frequencyDropScore);

  // Fetch tenant name for WhatsApp message
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });

  return {
    phone: customerPhone,
    name: customerName,
    score: Math.min(score, 100),
    riskLevel: classifyChurnRisk(score),
    daysSinceLastPurchase,
    avgTicketCurrent: Math.round(avgTicketRecent * 100) / 100,
    avgTicketHistorical: Math.round(avgTicketPrior * 100) / 100,
    recentOrderCount: recentOrders.length,
    priorOrderCount: priorOrders.length,
    lastPurchaseDate: lastPurchaseDate.toISOString(),
    whatsappLink: buildWhatsappLink(customerPhone, tenant?.name ?? "tu bodega"),
  };
}

// ── Top at-risk customers ───────────────────────────────────────────────────

/**
 * Returns the top N at-risk customers (score > 40) sorted by score desc.
 * Cached for 5 minutes to avoid heavy DB queries on repeated calls.
 */
export async function getAtRiskCustomers(
  tenantId: string,
  limit = 20,
): Promise<CustomerChurnResult[]> {
  const cacheKey = `churn:at-risk:${tenantId}:${limit}`;

  return getOrSet<CustomerChurnResult[]>(cacheKey, CACHE_TTL, async () => {
    logger.info("[customer-churn] Computing at-risk customers", { tenantId, limit });

    // Get distinct customer phones with orders in last 90 days
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const distinctCustomers = await prisma.order.findMany({
      where: {
        tenantId,
        deletedAt: null,
        customerPhone: { not: null },
        status: { in: ["confirmado", "en_camino", "entregado"] },
        createdAt: { gte: ninetyDaysAgo },
      },
      select: { customerPhone: true },
      distinct: ["customerPhone"],
    });

    const phones = distinctCustomers
      .map((c) => c.customerPhone)
      .filter((p): p is string => p != null && p.length > 0);

    // Score each customer
    const results: CustomerChurnResult[] = [];

    for (const phone of phones) {
      const result = await calculateCustomerChurnScore(tenantId, phone);
      if (result && result.score > 40) {
        results.push(result);
      }
    }

    // Sort by score descending (highest risk first) and take top N
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  });
}
