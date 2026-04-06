import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface HealthScoreResult {
  tenantId: string;
  score: number;
  loginsLast7d: number;
  loginsLast30d: number;
  ordersLast7d: number;
  ordersLast30d: number;
  featuresUsed: number;
  daysSinceLastOrder: number;
  daysSinceLastLogin: number;
  trialDaysLeft: number | null;
  riskLevel: RiskLevel;
}

export interface ChurnSignalDetected {
  signalType: string;
  severity: RiskLevel;
  detail: string;
}

// Total de recursos RBAC disponibles en el sistema (47 según role-permissions.ts)
const TOTAL_RBAC_RESOURCES = 47;

// ─── Lógica de scoring ───────────────────────────────────────────────────────

/**
 * Pesos por categoría (suman 100):
 * - Logins (7d + 30d): 25
 * - Pedidos (7d + 30d): 30
 * - Features usadas: 20
 * - Días sin pedido: 15
 * - Trial days left: 10
 */

function scoreLogins(loginsLast7d: number, loginsLast30d: number): number {
  // 7 logins en 7 días = máximo; 20 en 30 días = saturado
  const score7d = Math.min(loginsLast7d / 7, 1) * 60;
  const score30d = Math.min(loginsLast30d / 20, 1) * 40;
  return Math.round((score7d + score30d) * 0.25);
}

function scoreOrders(ordersLast7d: number, ordersLast30d: number): number {
  // 3 pedidos en 7 días = activo; 10 en 30 días = muy activo
  const score7d = Math.min(ordersLast7d / 3, 1) * 60;
  const score30d = Math.min(ordersLast30d / 10, 1) * 40;
  return Math.round((score7d + score30d) * 0.30);
}

function scoreFeatures(featuresUsed: number): number {
  // Usar >50% de los recursos = excelente adopción
  const ratio = Math.min(featuresUsed / TOTAL_RBAC_RESOURCES, 1);
  return Math.round(ratio * 100 * 0.20);
}

function scoreDaysSinceLastOrder(days: number): number {
  // 0 días = 100%; más de 30 días = 0%
  if (days <= 0) return Math.round(100 * 0.15);
  if (days >= 30) return 0;
  return Math.round(((30 - days) / 30) * 100 * 0.15);
}

function scoreTrialDaysLeft(trialDaysLeft: number | null): number {
  // null = no está en trial → no penalizar, aportar puntaje completo
  if (trialDaysLeft === null) return Math.round(100 * 0.10);
  // Más de 7 días = full; 0 = 0
  if (trialDaysLeft <= 0) return 0;
  return Math.round(Math.min(trialDaysLeft / 7, 1) * 100 * 0.10);
}

// ─── Clasificación de riesgo ─────────────────────────────────────────────────

export function classifyRisk(score: number): RiskLevel {
  if (score > 70) return "low";
  if (score >= 50) return "medium";
  if (score >= 30) return "high";
  return "critical";
}

// ─── Calculo principal ───────────────────────────────────────────────────────

export async function calculateHealthScore(tenantSlug: string): Promise<HealthScoreResult> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, slug: true, trialEndsAt: true, plan: true },
  });

  if (!tenant) {
    throw new Error(`Tenant no encontrado: ${tenantSlug}`);
  }

  // Conteo de logins via ActivityLog (action = "login")
  const [loginsLast7d, loginsLast30d] = await Promise.all([
    prisma.activityLog.count({
      where: {
        entity: "auth",
        action: "login",
        // ActivityLog no tiene tenantId directo — filtramos por entityId que es el tenantId
        entityId: tenant.id,
        createdAt: { gte: sevenDaysAgo },
      },
    }).catch(() => 0),
    prisma.activityLog.count({
      where: {
        entity: "auth",
        action: "login",
        entityId: tenant.id,
        createdAt: { gte: thirtyDaysAgo },
      },
    }).catch(() => 0),
  ]);

  // Conteo de pedidos
  const [ordersLast7d, ordersLast30d, lastOrder] = await Promise.all([
    prisma.order.count({
      where: { tenantId: tenant.id, createdAt: { gte: sevenDaysAgo } },
    }).catch(() => 0),
    prisma.order.count({
      where: { tenantId: tenant.id, createdAt: { gte: thirtyDaysAgo } },
    }).catch(() => 0),
    prisma.order.findFirst({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }).catch(() => null),
  ]);

  // Features usadas: contar recursos distintos en ActivityLog últimos 30 días
  let featuresUsed = 0;
  try {
    const activityEntities = await prisma.activityLog.findMany({
      where: {
        entityId: tenant.id,
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { entity: true },
      distinct: ["entity"],
    });
    featuresUsed = activityEntities.length;
  } catch {
    featuresUsed = 0;
  }

  // Días desde último pedido
  const daysSinceLastOrder = lastOrder
    ? Math.floor((now.getTime() - lastOrder.createdAt.getTime()) / (1000 * 60 * 60 * 24))
    : 999;

  // Días desde último login (via ActivityLog)
  let daysSinceLastLogin = 999;
  try {
    const lastLogin = await prisma.activityLog.findFirst({
      where: { entity: "auth", action: "login", entityId: tenant.id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (lastLogin) {
      daysSinceLastLogin = Math.floor(
        (now.getTime() - lastLogin.createdAt.getTime()) / (1000 * 60 * 60 * 24)
      );
    }
  } catch {
    daysSinceLastLogin = 999;
  }

  // Días de trial restantes
  let trialDaysLeft: number | null = null;
  if (tenant.trialEndsAt) {
    const diff = tenant.trialEndsAt.getTime() - now.getTime();
    trialDaysLeft = Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  }

  // Score final
  const score = Math.min(
    100,
    scoreLogins(loginsLast7d, loginsLast30d) +
    scoreOrders(ordersLast7d, ordersLast30d) +
    scoreFeatures(featuresUsed) +
    scoreDaysSinceLastOrder(daysSinceLastOrder) +
    scoreTrialDaysLeft(trialDaysLeft)
  );

  const riskLevel = classifyRisk(score);

  logger.info("[health-scorer] Score calculado", {
    tenantSlug,
    score,
    riskLevel,
    loginsLast7d,
    ordersLast7d,
    featuresUsed,
  });

  return {
    tenantId: tenant.id,
    score,
    loginsLast7d,
    loginsLast30d,
    ordersLast7d,
    ordersLast30d,
    featuresUsed,
    daysSinceLastOrder: daysSinceLastOrder === 999 ? 0 : daysSinceLastOrder,
    daysSinceLastLogin: daysSinceLastLogin === 999 ? 0 : daysSinceLastLogin,
    trialDaysLeft,
    riskLevel,
  };
}

// ─── Detección de señales ────────────────────────────────────────────────────

export async function detectSignals(
  tenantSlug: string,
  current: HealthScoreResult,
  previous: HealthScoreResult | null
): Promise<ChurnSignalDetected[]> {
  const signals: ChurnSignalDetected[] = [];

  // Señal: trial expirando (quedan ≤3 días)
  if (current.trialDaysLeft !== null && current.trialDaysLeft <= 3 && current.trialDaysLeft >= 0) {
    signals.push({
      signalType: "trial_expiring",
      severity: current.trialDaysLeft <= 1 ? "critical" : "high",
      detail: `Trial expira en ${current.trialDaysLeft} día(s). Tenant: ${tenantSlug}`,
    });
  }

  // Señal: caída de logins (>50% respecto a semana anterior)
  if (previous && previous.loginsLast7d > 2) {
    const loginDrop = (previous.loginsLast7d - current.loginsLast7d) / previous.loginsLast7d;
    if (loginDrop >= 0.5) {
      signals.push({
        signalType: "login_drop",
        severity: loginDrop >= 0.8 ? "critical" : "high",
        detail: `Logins cayeron ${Math.round(loginDrop * 100)}% (de ${previous.loginsLast7d} a ${current.loginsLast7d} en 7 días). Tenant: ${tenantSlug}`,
      });
    }
  }

  // Señal: sin login en 7 días
  if (current.daysSinceLastLogin >= 7) {
    signals.push({
      signalType: "login_drop",
      severity: current.daysSinceLastLogin >= 14 ? "critical" : "high",
      detail: `Sin login en ${current.daysSinceLastLogin} días. Tenant: ${tenantSlug}`,
    });
  }

  // Señal: caída de pedidos (>50% vs mes anterior)
  if (previous && previous.ordersLast30d > 3) {
    const orderDrop = (previous.ordersLast30d - current.ordersLast30d) / previous.ordersLast30d;
    if (orderDrop >= 0.5) {
      signals.push({
        signalType: "order_drop",
        severity: orderDrop >= 0.8 ? "critical" : "high",
        detail: `Pedidos cayeron ${Math.round(orderDrop * 100)}% (de ${previous.ordersLast30d} a ${current.ordersLast30d} en 30 días). Tenant: ${tenantSlug}`,
      });
    }
  }

  // Señal: score crítico general
  if (current.score < 20) {
    signals.push({
      signalType: "login_drop",
      severity: "critical",
      detail: `Score crítico: ${current.score}/100. Requiere intervención manual. Tenant: ${tenantSlug}`,
    });
  }

  return signals;
}

// ─── Persistencia del score ──────────────────────────────────────────────────

export async function saveHealthScore(result: HealthScoreResult): Promise<void> {
  await prisma.tenantHealthScore.create({
    data: {
      tenantId: result.tenantId,
      score: result.score,
      loginsLast7d: result.loginsLast7d,
      loginsLast30d: result.loginsLast30d,
      ordersLast7d: result.ordersLast7d,
      ordersLast30d: result.ordersLast30d,
      featuresUsed: result.featuresUsed,
      daysSinceLastOrder: result.daysSinceLastOrder,
      daysSinceLastLogin: result.daysSinceLastLogin,
      trialDaysLeft: result.trialDaysLeft,
      riskLevel: result.riskLevel,
    },
  });
}

// ─── Score previo ────────────────────────────────────────────────────────────

export async function getPreviousScore(tenantId: string): Promise<HealthScoreResult | null> {
  const row = await prisma.tenantHealthScore.findFirst({
    where: { tenantId },
    orderBy: { calculatedAt: "desc" },
  });
  if (!row) return null;

  return {
    tenantId: row.tenantId,
    score: row.score,
    loginsLast7d: row.loginsLast7d,
    loginsLast30d: row.loginsLast30d,
    ordersLast7d: row.ordersLast7d,
    ordersLast30d: row.ordersLast30d,
    featuresUsed: row.featuresUsed,
    daysSinceLastOrder: row.daysSinceLastOrder,
    daysSinceLastLogin: row.daysSinceLastLogin,
    trialDaysLeft: row.trialDaysLeft ?? null,
    riskLevel: row.riskLevel as RiskLevel,
  };
}
