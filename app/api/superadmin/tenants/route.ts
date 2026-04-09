import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hash } from "bcryptjs";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { getTenantUsage } from "@/lib/usage";
import { getPlanLimits } from "@/lib/plans";
import { logActivity } from "@/lib/activity-logger";

async function requirePlatform(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getPlatformSession(token);
}

// GET /api/superadmin/tenants
// Returns all tenants with plan, billing, usage, store, and financial data
export async function GET(req: NextRequest) {
  const session = await requirePlatform(req);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [tenants, userCounts, stores, monthlyOrders, monthlyExpenses] = await Promise.all([
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
    // Expenses this month per tenant (tenantId = slug in Expense model)
    prisma.expense.groupBy({
      by: ["tenantId"],
      where: { date: { gte: monthStart } },
      _sum: { amount: true },
    }).catch(() => [] as Array<{ tenantId: string; _sum: { amount: number | null } }>),
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
    (monthlyExpenses as Array<{ tenantId: string; _sum: { amount: number | null } }>).map((r) => [r.tenantId, Number(r._sum?.amount ?? 0)])
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
    return {
      ...t,
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
    };
  });

  return NextResponse.json({ tenants: rows });
}

// ─── POST /api/superadmin/tenants — create a new tenant ────────────────────

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

const CreateTenantSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().regex(SLUG_RE, "Solo letras minúsculas, números y guiones"),
  plan: z.enum(["free", "pro", "business", "enterprise"]).default("free"),
  adminUsername: z.string().min(3).max(32).regex(/^[a-z0-9_.]+$/i, "Solo letras, números, punto o guión bajo"),
  adminPassword: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  ownerEmail: z.string().email(),
});

export async function POST(req: NextRequest) {
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

  logActivity("crear_tenant", "superadmin", `Tenant '${slug}' creado por superadmin con plan ${plan}`, tenant.id, "superadmin").catch(() => {});

  return NextResponse.json({ tenant }, { status: 201 });
}
