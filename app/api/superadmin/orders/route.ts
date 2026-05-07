import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * GET /api/superadmin/orders
 *
 * Lista cross-tenant de pedidos para el módulo /superadmin/orders.
 * Query params:
 *   tenant   — slug específico (opcional)
 *   status   — pendiente | confirmado | preparando | en_camino | entregado | cancelado
 *   q        — texto: cliente o id
 *   limit    — default 50, max 200
 *   cursor   — orderId desde donde continuar (pagination)
 */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const session = await getPlatformSession(token);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const tenantParam = sp.get("tenant");
  const statusParam = sp.get("status");
  // SECURITY 2026-05-06: validar enum antes de pasarlo a Prisma — `as never`
  // bypaseaba el type system y exponía un stack trace si llegaba un valor
  // inválido del enum OrderStatus.
  const VALID_STATUS = ["pendiente", "confirmado", "preparando", "en_camino", "entregado", "cancelado"] as const;
  type ValidStatus = (typeof VALID_STATUS)[number];
  const status: ValidStatus | null =
    statusParam && (VALID_STATUS as readonly string[]).includes(statusParam)
      ? (statusParam as ValidStatus)
      : null;
  const q = sp.get("q");
  const limit = Math.min(parseInt(sp.get("limit") ?? "50", 10) || 50, 200);
  const cursor = sp.get("cursor");

  try {
    let tenantFilter: string[] | undefined;
    if (tenantParam) {
      const t = await prisma.tenant.findFirst({
        where: { OR: [{ id: tenantParam }, { slug: tenantParam }] },
        select: { id: true, slug: true },
      });
      if (t) tenantFilter = [t.id, t.slug];
    }

    const where = {
      deletedAt: null,
      ...(tenantFilter ? { tenantId: { in: tenantFilter } } : {}),
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { customerName: { contains: q, mode: "insensitive" as const } },
              { id: { contains: q, mode: "insensitive" as const } },
              { customerPhone: { contains: q } },
            ],
          }
        : {}),
    };

    const orders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        tenantId: true,
        customerName: true,
        customerPhone: true,
        customerLocation: true,
        customerReference: true,
        total: true,
        status: true,
        paymentMethod: true,
        source: true,
        notes: true,
        riderName: true,
        deliveryStatus: true,
        createdAt: true,
        updatedAt: true,
        items: {
          select: {
            id: true,
            name: true,
            quantity: true,
            unit: true,
            price: true,
            image: true,
          },
        },
      },
    });

    const hasMore = orders.length > limit;
    const slice = hasMore ? orders.slice(0, limit) : orders;
    const nextCursor = hasMore ? slice[slice.length - 1].id : null;

    // Hydrate tenant name + slug + logo for each order
    const tenantIds = [...new Set(slice.map((o) => o.tenantId))];
    const tenants =
      tenantIds.length === 0
        ? []
        : await prisma.tenant.findMany({
            where: { OR: [{ id: { in: tenantIds } }, { slug: { in: tenantIds } }] },
            select: { id: true, slug: true, name: true, logoUrl: true },
          });
    const tenantMap = new Map<string, { name: string; slug: string; logoUrl: string | null }>();
    for (const t of tenants) {
      tenantMap.set(t.id, { name: t.name, slug: t.slug, logoUrl: t.logoUrl });
      tenantMap.set(t.slug, { name: t.name, slug: t.slug, logoUrl: t.logoUrl });
    }

    // Settings.logoUrl override
    if (tenantIds.length > 0) {
      const settingsRows = await prisma.settings.findMany({
        where: { tenantId: { in: tenantIds }, logoUrl: { not: null } },
        select: { tenantId: true, logoUrl: true },
      }).catch(() => [] as Array<{ tenantId: string; logoUrl: string | null }>);
      for (const s of settingsRows) {
        const existing = tenantMap.get(s.tenantId);
        if (existing && s.logoUrl) {
          tenantMap.set(s.tenantId, { ...existing, logoUrl: s.logoUrl });
        }
      }
    }

    const result = slice.map((o) => ({
      id: o.id,
      tenant: tenantMap.get(o.tenantId) ?? { name: o.tenantId, slug: o.tenantId, logoUrl: null },
      customer: {
        name: o.customerName,
        phone: o.customerPhone,
        location: o.customerLocation,
        reference: o.customerReference,
      },
      total: Number(o.total),
      status: o.status,
      paymentMethod: o.paymentMethod,
      source: o.source,
      notes: o.notes,
      riderName: o.riderName,
      deliveryStatus: o.deliveryStatus,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
      items: o.items.map((it) => ({
        id: it.id,
        name: it.name,
        quantity: it.quantity,
        unit: it.unit,
        price: Number(it.price),
        image: it.image,
      })),
    }));

    return NextResponse.json({ orders: result, nextCursor });
  } catch (err) {
    logger.error("[superadmin/orders] list failed", { err: String(err) });
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
