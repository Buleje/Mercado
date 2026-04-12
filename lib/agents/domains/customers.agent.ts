/**
 * lib/agents/domains/customers.agent.ts
 *
 * Domain agent for customer operations: RFM segmentation, top customers,
 * churn risk detection, birthday lookups, and full customer-360 profiles.
 */

import type { DomainAgent, AgentTask, AgentResult, AgentContext } from "@/lib/agents/types";
import { scopedLogger, scopedCache } from "@/lib/agents/context";
import { agentBus } from "@/lib/agents/bus";
import {
  CustomersDB,
  OrdersDB,
  ReviewsDB,
  LoyaltyDB,
} from "@/lib/db";

// ── Action handlers ──────────────────────────────────────────────────────────

async function segmentation(
  task: AgentTask,
  ctx: AgentContext,
): Promise<AgentResult> {
  const log = scopedLogger(ctx);
  const cache = scopedCache(ctx);

  log.info("Running RFM segmentation", { action: task.action });

  const customers = await cache.getOrSet("customers:all", 120, () =>
    CustomersDB.getAll(task.tenantId),
  );

  const now = Date.now();
  const segments: Record<
    string,
    Array<{
      phone: string;
      name: string;
      score: string;
      recency: number;
      frequency: number;
      monetary: number;
    }>
  > = {
    champions: [],
    loyal: [],
    potential: [],
    at_risk: [],
    hibernating: [],
  };

  for (const c of customers) {
    const daysSinceUpdate = Math.floor(
      (now - new Date(c.updatedAt).getTime()) / (1000 * 60 * 60 * 24),
    );

    // Recency: 1-5 (5 = most recent)
    const recency =
      daysSinceUpdate <= 7
        ? 5
        : daysSinceUpdate <= 14
          ? 4
          : daysSinceUpdate <= 30
            ? 3
            : daysSinceUpdate <= 60
              ? 2
              : 1;

    // Frequency approximation from loyalty points (1 point per S/1 spent)
    const frequency =
      c.loyaltyPoints >= 200
        ? 5
        : c.loyaltyPoints >= 100
          ? 4
          : c.loyaltyPoints >= 50
            ? 3
            : c.loyaltyPoints >= 20
              ? 2
              : 1;

    // Monetary from totalSpent
    const monetary =
      c.totalSpent >= 1000
        ? 5
        : c.totalSpent >= 500
          ? 4
          : c.totalSpent >= 200
            ? 3
            : c.totalSpent >= 50
              ? 2
              : 1;

    const avg = (recency + frequency + monetary) / 3;
    const score = `${recency}${frequency}${monetary}`;

    const entry = {
      phone: c.phone,
      name: c.name,
      score,
      recency,
      frequency,
      monetary,
    };

    if (avg >= 4) segments.champions.push(entry);
    else if (avg >= 3 && frequency >= 3) segments.loyal.push(entry);
    else if (avg >= 3) segments.potential.push(entry);
    else if (recency <= 2 && frequency >= 3) segments.at_risk.push(entry);
    else segments.hibernating.push(entry);
  }

  return {
    success: true,
    data: {
      totalCustomers: customers.length,
      segments: Object.entries(segments).map(([name, members]) => ({
        segment: name,
        count: members.length,
        customers: members.slice(0, 10),
      })),
    },
  };
}

async function topCustomers(
  task: AgentTask,
  ctx: AgentContext,
): Promise<AgentResult> {
  const log = scopedLogger(ctx);
  const cache = scopedCache(ctx);

  log.info("Fetching top customers", { action: task.action });

  const limit = (task.payload.limit as number) ?? 10;

  const customers = await cache.getOrSet("customers:all", 120, () =>
    CustomersDB.getAll(task.tenantId),
  );

  const sorted = [...customers]
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, limit);

  return {
    success: true,
    data: {
      limit,
      customers: sorted.map((c, i) => ({
        rank: i + 1,
        phone: c.phone,
        name: c.name,
        totalSpent: c.totalSpent,
        loyaltyTier: c.loyaltyTier,
        loyaltyPoints: c.loyaltyPoints,
        creditBalance: c.creditBalance,
      })),
    },
  };
}

async function churnRisk(
  task: AgentTask,
  ctx: AgentContext,
): Promise<AgentResult> {
  const log = scopedLogger(ctx);
  const cache = scopedCache(ctx);

  log.info("Identifying churn risk customers", { action: task.action });

  const inactiveDays = (task.payload.inactiveDays as number) ?? 30;
  const cutoff = Date.now() - inactiveDays * 24 * 60 * 60 * 1000;

  const customers = await cache.getOrSet("customers:all", 120, () =>
    CustomersDB.getAll(task.tenantId),
  );

  const atRisk = customers
    .filter((c) => {
      const lastActivity = new Date(c.updatedAt).getTime();
      return lastActivity < cutoff && c.totalSpent > 0;
    })
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .map((c) => ({
      phone: c.phone,
      name: c.name,
      totalSpent: c.totalSpent,
      loyaltyTier: c.loyaltyTier,
      daysSinceLastActivity: Math.floor(
        (Date.now() - new Date(c.updatedAt).getTime()) /
          (1000 * 60 * 60 * 24),
      ),
      riskLevel:
        Date.now() - new Date(c.updatedAt).getTime() >
        inactiveDays * 2 * 24 * 60 * 60 * 1000
          ? "high"
          : "medium",
    }));

  return {
    success: true,
    data: {
      inactiveDays,
      totalAtRisk: atRisk.length,
      highRisk: atRisk.filter((c) => c.riskLevel === "high").length,
      mediumRisk: atRisk.filter((c) => c.riskLevel === "medium").length,
      customers: atRisk.slice(0, 20),
    },
  };
}

async function birthdayUpcoming(
  task: AgentTask,
  ctx: AgentContext,
): Promise<AgentResult> {
  const log = scopedLogger(ctx);
  const cache = scopedCache(ctx);

  log.info("Finding upcoming birthdays", { action: task.action });

  const daysAhead = (task.payload.daysAhead as number) ?? 7;

  const customers = await cache.getOrSet("customers:all", 120, () =>
    CustomersDB.getAll(task.tenantId),
  );

  const now = new Date();
  const upcoming = customers
    .filter((c) => {
      if (!c.birthday) return false;
      const bday = new Date(c.birthday);
      // Compare month/day relative to current year
      const thisYearBday = new Date(
        now.getFullYear(),
        bday.getMonth(),
        bday.getDate(),
      );
      const diffMs = thisYearBday.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= daysAhead;
    })
    .map((c) => {
      const bday = new Date(c.birthday!);
      const thisYearBday = new Date(
        now.getFullYear(),
        bday.getMonth(),
        bday.getDate(),
      );
      return {
        phone: c.phone,
        name: c.name,
        birthday: c.birthday!,
        daysUntil: Math.ceil(
          (thisYearBday.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        ),
        loyaltyTier: c.loyaltyTier,
        totalSpent: c.totalSpent,
      };
    })
    .sort((a, b) => a.daysUntil - b.daysUntil);

  return {
    success: true,
    data: {
      daysAhead,
      totalUpcoming: upcoming.length,
      customers: upcoming,
    },
  };
}

async function customer360(
  task: AgentTask,
  ctx: AgentContext,
): Promise<AgentResult> {
  const log = scopedLogger(ctx);

  log.info("Building customer-360 profile", { action: task.action });

  const phone = task.payload.phone as string | undefined;
  if (!phone) {
    return {
      success: false,
      error: "Se requiere el parametro 'phone' para customer-360",
    };
  }

  const [customer, orders, loyalty, reviews] = await Promise.all([
    CustomersDB.getByPhone(phone),
    OrdersDB.getByCustomerPhone(ctx.tenantId, phone),
    LoyaltyDB.getByPhone(phone),
    ReviewsDB.getAll(task.tenantId),
  ]);

  if (!customer) {
    return {
      success: false,
      error: `Cliente no encontrado: ${phone}`,
    };
  }

  const customerReviews = reviews.filter((r) => r.phone === phone);
  const avgRating =
    customerReviews.length > 0
      ? customerReviews.reduce((sum, r) => sum + r.rating, 0) /
        customerReviews.length
      : null;

  const orderStats = {
    total: orders.length,
    totalSpent: orders.reduce((sum, o) => sum + o.total, 0),
    avgTicket:
      orders.length > 0
        ? orders.reduce((sum, o) => sum + o.total, 0) / orders.length
        : 0,
    lastOrder: orders.length > 0 ? orders[0].createdAt : null,
    byStatus: orders.reduce(
      (acc, o) => {
        acc[o.status] = (acc[o.status] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
  };

  return {
    success: true,
    data: {
      profile: {
        phone: customer.phone,
        name: customer.name,
        location: customer.location,
        birthday: customer.birthday,
        memberSince: customer.createdAt,
        lastActivity: customer.updatedAt,
      },
      loyalty: loyalty
        ? {
            points: loyalty.loyaltyPoints,
            tier: loyalty.loyaltyTier,
            totalSpent: loyalty.totalSpent,
            referralCode: loyalty.referralCode,
            creditBalance: loyalty.creditBalance,
          }
        : null,
      orders: {
        ...orderStats,
        avgTicket: Math.round(orderStats.avgTicket * 100) / 100,
        recentOrders: orders.slice(0, 5).map((o) => ({
          id: o.id,
          total: o.total,
          status: o.status,
          createdAt: o.createdAt,
        })),
      },
      reviews: {
        count: customerReviews.length,
        avgRating: avgRating
          ? Math.round(avgRating * 10) / 10
          : null,
      },
      preferences: {
        notifOrderUpdates: customer.notifOrderUpdates,
        notifPromotions: customer.notifPromotions,
        notifRestock: customer.notifRestock,
      },
    },
  };
}

// ── Agent definition ─────────────────────────────────────────────────────────

export const customersAgent: DomainAgent = {
  domain: "customers",
  actions: [
    "segmentation",
    "top-customers",
    "churn-risk",
    "birthday-upcoming",
    "customer-360",
  ],
  description:
    "Analisis de clientes: segmentacion, riesgo de churn, perfiles 360",

  async execute(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
    const log = scopedLogger(ctx);

    try {
      agentBus.emit("task:started", {
        taskId: task.id,
        domain: "customers",
        tenantId: task.tenantId,
      });

      let result: AgentResult;

      switch (task.action) {
        case "segmentation":
          result = await segmentation(task, ctx);
          break;
        case "top-customers":
          result = await topCustomers(task, ctx);
          break;
        case "churn-risk":
          result = await churnRisk(task, ctx);
          break;
        case "birthday-upcoming":
          result = await birthdayUpcoming(task, ctx);
          break;
        case "customer-360":
          result = await customer360(task, ctx);
          break;
        default:
          result = {
            success: false,
            error: `Accion desconocida: ${task.action}`,
          };
      }

      agentBus.emit("task:completed", {
        taskId: task.id,
        domain: "customers",
        success: result.success,
        tenantId: task.tenantId,
      });

      return result;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : String(err);
      log.error("Customers agent failed", {
        action: task.action,
        error: errorMessage,
      });

      agentBus.emit("task:failed", {
        taskId: task.id,
        domain: "customers",
        error: errorMessage,
        tenantId: task.tenantId,
      });

      return { success: false, error: errorMessage };
    }
  },
};
