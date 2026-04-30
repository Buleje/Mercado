import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/jsondb";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { toNumOrZero } from "@/lib/decimal-utils";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";

// GET /api/customers/[phone]/favorite-products
// Top 5 productos mas comprados por el cliente (ventas POS + orders)
// Admin-only: requiere sesion valida con tenantId canonico del JWT.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  // Auth primero — antes del rate-limit para no gastar cuota en anonimos
  const auth = await requireAdmin(req, ["admin", "cajero", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const ip = getClientIp(req);
  const { allowed } = rateLimit(`fav-products:${ip}`, 20, 60);
  if (!allowed) return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });

  const { phone } = await params;
  const normalized = normalizePhone(phone);
  const tenantId = auth.tenantId;

  try {
    // Oracle defense: verificar que el customer existe en este tenant antes de exponer datos.
    // Devuelve 404 uniforme tanto si no existe como si pertenece a otro tenant (no revela existencia).
    // eslint-disable-next-line no-restricted-properties -- lookup tenant-scoped; migration a lib/db pendiente.
    const customer = await prisma.customer.findFirst({
      where: { phone: normalized, tenantId },
      select: { phone: true },
    });
    if (!customer) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Aggregate from SaleItems (POS sales) — filtrado por tenantId
    // eslint-disable-next-line no-restricted-properties -- nested where filter por sale.tenantId; migration pendiente.
    const saleItems = await prisma.saleItem.findMany({
      where: {
        sale: { customerPhone: normalized, tenantId },
      },
      select: {
        productId: true,
        name: true,
        quantity: true,
        price: true,
        sale: { select: { createdAt: true } },
      },
    });

    // Aggregate from OrderItems (online orders) — filtrado por tenantId, excluir cancelados
    // eslint-disable-next-line no-restricted-properties -- nested where filter por order.tenantId; migration pendiente.
    const orderItems = await prisma.orderItem.findMany({
      where: {
        order: {
          customerPhone: normalized,
          tenantId,
          status: { not: "cancelado" },
        },
      },
      select: {
        productId: true,
        name: true,
        quantity: true,
        price: true,
        order: { select: { createdAt: true } },
      },
    });

    // Merge both sources
    const productMap = new Map<
      number,
      { productId: number; name: string; totalQty: number; totalSpent: number; purchaseCount: number; firstDate: Date; lastDate: Date }
    >();

    for (const item of saleItems) {
      const pid = item.productId;
      const existing = productMap.get(pid);
      const date = item.sale.createdAt;
      const lineTotal = toNumOrZero(item.price) * item.quantity;
      if (existing) {
        existing.totalQty += item.quantity;
        existing.totalSpent += lineTotal;
        existing.purchaseCount += 1;
        if (date < existing.firstDate) existing.firstDate = date;
        if (date > existing.lastDate) existing.lastDate = date;
      } else {
        productMap.set(pid, {
          productId: pid,
          name: item.name,
          totalQty: item.quantity,
          totalSpent: lineTotal,
          purchaseCount: 1,
          firstDate: date,
          lastDate: date,
        });
      }
    }

    for (const item of orderItems) {
      if (!item.productId) continue;
      const pid = item.productId;
      const existing = productMap.get(pid);
      const date = item.order.createdAt;
      const lineTotal = toNumOrZero(item.price) * item.quantity;
      if (existing) {
        existing.totalQty += item.quantity;
        existing.totalSpent += lineTotal;
        existing.purchaseCount += 1;
        if (date < existing.firstDate) existing.firstDate = date;
        if (date > existing.lastDate) existing.lastDate = date;
      } else {
        productMap.set(pid, {
          productId: pid,
          name: item.name,
          totalQty: item.quantity,
          totalSpent: lineTotal,
          purchaseCount: 1,
          firstDate: date,
          lastDate: date,
        });
      }
    }

    // Sort by totalQty desc, take top 5
    const sorted = Array.from(productMap.values())
      .sort((a, b) => b.totalQty - a.totalQty)
      .slice(0, 5);

    // Calculate frequency (purchases per month)
    const result = sorted.map((p) => {
      const spanMs = Math.max(p.lastDate.getTime() - p.firstDate.getTime(), 30 * 24 * 60 * 60 * 1000);
      const spanMonths = spanMs / (30 * 24 * 60 * 60 * 1000);
      const freqPerMonth = p.purchaseCount / spanMonths;
      return {
        productId: p.productId,
        name: p.name,
        totalQty: p.totalQty,
        totalSpent: Math.round(p.totalSpent * 100) / 100,
        purchaseCount: p.purchaseCount,
        freqPerMonth: Math.round(freqPerMonth * 10) / 10,
      };
    });

    return NextResponse.json(result);
  } catch (e) {
    logger.error("[favorite-products] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
