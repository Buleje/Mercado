import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";
import { hash } from "bcryptjs";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { getTenantUsage } from "@/lib/usage";
import { getPlanLimits } from "@/lib/plans";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";

async function requirePlatform(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getPlatformSession(token);
}

/**
 * Lógica completa del listado de tenants, cacheada via Next 16 "use cache".
 * Antes: 5 queries en paralelo + Promise.all de getTenantUsage por tenant
 * + mapping completo en serie por request (~9s con N tenants).
 * Ahora: 60s revalidate, 30s stale OK, 5 min hard expire — la lista de
 * tenants cambia con altas (raras) e impacta KPIs financieros que se
 * recalculan al inicio de cada mes. Invalidable con
 * invalidate("superadmin:tenants") tras crear/borrar tenant.
 */
async function getTenantsData() {
  "use cache";
  cacheLife({ revalidate: 60, stale: 30, expire: 300 });
  // v2: cuando agregamos pendingOrders necesitamos invalidar el cache.
  // El cambio del tag fuerza un cache-miss garantizado.
  cacheTag("superadmin:tenants:v4");

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [tenants, userCounts, stores, monthlyOrders, monthlyExpenses, pendingOrders, settingsLogos] = await Promise.all([
      prisma.tenant.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          slug: true,
          name: true,
          active: true,
          plan: true,
          trialEndsAt: true,
          createdAt: true,
          ownerEmail: true,
          ownerPhone: true,
          customDomain: true,
          logoUrl: true,
          stripeCustomerId: true,
          stripeSubscriptionId: true,
          stripePriceId: true,
          stripeCurrentPeriodEnd: true,
          cancelAtPeriodEnd: true,
        },
      }),
      prisma.adminUser.groupBy({ by: ["tenantId"], _count: { id: true } }),
      prisma.store.findMany({
        select: {
          id: true,
          tenantId: true,
          slug: true,
          name: true,
          isPublished: true,
          rating: true,
          reviewCount: true,
          category: true,
          zone: true,
          commission: true,
          _count: { select: { products: true } },
        },
      }),
      // Revenue this month per tenant (tenantId = slug in Order model)
      prisma.order.groupBy({
        by: ["tenantId"],
        where: { createdAt: { gte: monthStart }, status: { not: "cancelado" } },
        _sum: { total: true },
        _count: { _all: true },
      }),
      // Pending orders per tenant — pedidos sin entregar/cancelar.
      // Status del enum OrderStatus: pendiente | confirmado | en_camino.
      prisma.order.groupBy({
        by: ["tenantId"],
        where: {
          status: { in: ["pendiente", "confirmado", "en_camino"] },
          deletedAt: null,
        },
        _count: { _all: true },
      }),
      // Expenses this month per tenant (tenantId = slug in Expense model)
      prisma.expense.groupBy({
        by: ["tenantId"],
        where: { date: { gte: monthStart } },
        _sum: { amount: true },
      }).catch(() => [] as Array<{ tenantId: string; _sum: { amount: number | null } }>),
      // Logos configurados por el admin de cada tenant en Settings.
      // Tienen prioridad sobre Tenant.logoUrl porque reflejan lo último que el dueño puso.
      prisma.settings.findMany({
        select: { tenantId: true, logoUrl: true },
        where: { logoUrl: { not: null } },
      }).catch(() => [] as Array<{ tenantId: string; logoUrl: string | null }>),
    ]);

    // AdminUser.tenantId = slug, Order.tenantId = slug OR cuid (varies by tenant)
    const countMap = Object.fromEntries(userCounts.map((r) => [r.tenantId, r._count.id]));

    // Store.tenantId can be Tenant.id (cuid) OR Tenant.slug — build map for both
    const storeMap = new Map<string, typeof stores>();
    for (const s of stores) {
      const arr = storeMap.get(s.tenantId) ?? [];
      arr.push(s);
      storeMap.set(s.tenantId, arr);
    }

    // Order & Expense tenantId can be either slug OR cuid, so index by the raw tenantId
    const revenueMap = Object.fromEntries(
      monthlyOrders.map((r) => [r.tenantId, { revenue: Number(r._sum?.total ?? 0), orders: r._count?._all ?? 0 }])
    );
    const expenseMap = Object.fromEntries(
      (monthlyExpenses as unknown as Array<{ tenantId: string; _sum: { amount: number | null } }>).map((r) => [r.tenantId, Number(r._sum?.amount ?? 0)])
    );
    const pendingMap = Object.fromEntries(
      (pendingOrders as unknown as Array<{ tenantId: string; _count: { _all: number } }>).map((r) => [r.tenantId, r._count?._all ?? 0])
    );
    // Settings.logoUrl indexado por tenantId (que en Settings es el slug)
    const settingsLogoMap = Object.fromEntries(
      (settingsLogos as Array<{ tenantId: string; logoUrl: string | null }>)
        .filter((r) => r.logoUrl)
        .map((r) => [r.tenantId, r.logoUrl as string])
    );

    // Fetch usage for all tenants in parallel (capped at 50 concurrent)
    const usageList = await Promise.all(
      tenants.map((t) => getTenantUsage(t.slug))
    );

    const rows = tenants.map((t, i) => {
      const usage = usageList[i];
      const limits = getPlanLimits(t.plan);
      // Store.tenantId can be cuid or slug — check both
      const tenantStores = storeMap.get(t.id) ?? storeMap.get(t.slug) ?? [];
      // Order/Expense tenantId could be slug OR cuid — check both
      const revBySlug = revenueMap[t.slug];
      const revById = revenueMap[t.id];
      const rev = revBySlug && revBySlug.revenue > 0
        ? revBySlug
        : revById ?? revBySlug ?? { revenue: 0, orders: 0 };
      const expBySlug = expenseMap[t.slug];
      const expById = expenseMap[t.id];
      const expenses = (expBySlug && expBySlug > 0 ? expBySlug : expById) ?? expBySlug ?? 0;
      // Admin user count could also be under slug or cuid
      const adminCount = countMap[t.slug] ?? countMap[t.id] ?? 0;
      // Pending orders — same trick (slug OR cuid)
      const pendingCount = (pendingMap[t.slug] ?? 0) + (pendingMap[t.id] ?? 0);
      // Logo: Settings primero (lo que el admin sube), Tenant.logoUrl como fallback
      const settingsLogo = settingsLogoMap[t.slug] ?? settingsLogoMap[t.id] ?? null;
      const effectiveLogo = settingsLogo ?? t.logoUrl ?? null;
      return {
        ...t,
        logoUrl: effectiveLogo,
        _count: { AdminUser: adminCount },
        usage,
        limits: {
          maxProducts: limits.maxProducts,
          maxUsers: limits.maxUsers,
          maxOrdersPerMonth: limits.maxOrdersPerMonth,
        },
        stores: tenantStores,
        monthRevenue: rev.revenue,
        monthOrders: rev.orders,
        monthExpenses: expenses,
        monthProfit: rev.revenue - expenses,
        pendingOrders: pendingCount,
      };
    });

    return rows;
}

// GET /api/superadmin/tenants
// Returns all tenants with plan, billing, usage, store, and financial data
export async function GET(req: NextRequest) {
  try {
    const session = await requirePlatform(req);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const rows = await getTenantsData();
    return NextResponse.json({ tenants: rows });
  } catch (error) {
    logger.error("[superadmin/tenants] Error fetching tenants", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: "Error loading tenants data" },
      { status: 500 }
    );
  }
}

// ─── POST /api/superadmin/tenants — create a new tenant ────────────────────

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

// SECURITY 2026-05-07 (audit MT5): bloquear slugs que empiecen con "custom--".
// Si se permite, un atacante puede registrar `custom--victima-com` y luego
// apuntar DNS de victima.com → app. El middleware mintea synthetic slug
// `custom--victima.com` que coincide con el slug del atacante → phishing.
const RESERVED_SLUG_PREFIX = "custom--";

const CreateTenantSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z
    .string()
    .regex(SLUG_RE, "Solo letras minúsculas, números y guiones")
    .refine((s) => !s.startsWith(RESERVED_SLUG_PREFIX), {
      message: `El prefijo "${RESERVED_SLUG_PREFIX}" está reservado por el sistema`,
    }),
  plan: z.enum(["free", "pro", "business", "enterprise"]).default("free"),
  adminUsername: z.string().min(3).max(32).regex(/^[a-z0-9_.]+$/i, "Solo letras, números, punto o guión bajo"),
  adminPassword: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  ownerEmail: z.string().email(),
});

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "GENEROUS", "superadmin-tenants"); if (_rl) return _rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  try {
    const session = await requirePlatform(req);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    let rawBody: unknown;
    try { rawBody = await req.json(); } catch { rawBody = {}; }

    const parsed = CreateTenantSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { name, slug, plan, adminUsername, adminPassword, ownerEmail } = parsed.data;

    // Check slug uniqueness
    const existing = await prisma.tenant.findUnique({ where: { slug } });
    if (existing) {
      return NextResponse.json({ error: "El slug ya está en uso" }, { status: 409 });
    }

    // Create Tenant + AdminUser + Settings in a single transaction
    const passwordHash = await hash(adminPassword, 12);
    const tenant = await prisma.$transaction(async (tx) => {
      const t = await tx.tenant.create({
        data: { slug, name, plan, active: true, ownerEmail },
      });

      await tx.adminUser.create({
        data: {
          tenantId: t.id,
          username: adminUsername,
          passwordHash,
          role: "admin",
          name: `Admin ${name}`,
          active: true,
        },
      });

      await tx.settings.create({
        data: {
          tenantId: t.id,
          businessName: name,
          mode: "checkout",
          cashEnabled: true,
          yapeEnabled: false,
        },
      });

      await tx.store.create({
        data: {
          tenantId: t.id,
          slug,
          name,
          isPublished: false,
        },
      });

      return t;
    });

    logActivity("crear_tenant", "superadmin", `Tenant '${slug}' creado por superadmin con plan ${plan}`, tenant.id, "superadmin").catch((err) => logger.error("[superadmin/tenants] activity log failed", { error: String(err) }));

    return NextResponse.json({ tenant }, { status: 201 });
  } catch (error) {
    logger.error("[superadmin/tenants POST] Error creating tenant", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: "Error creating tenant" },
      { status: 500 }
    );
  }
}
