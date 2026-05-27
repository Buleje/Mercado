import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { enqueueActivityLog } from "@/lib/queue";

const PhoneSchema = z.string().min(7).max(20).regex(/^\+?[0-9\- ]+$/, "Teléfono inválido");

/**
 * GET /api/customers/[phone]/last-purchase
 * Returns the last sale/order for a customer with item details.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> },
) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const rl = applyRateLimit(req, "MODERATE", "customers-phone-last-purchase");
  if (rl) return rl;

  const { phone } = await params;

  const phoneParsed = PhoneSchema.safeParse(phone);
  if (!phoneParsed.success) {
    return NextResponse.json({ error: "Teléfono inválido" }, { status: 400 });
  }
  const safePhone = phoneParsed.data;

  // SECURITY 2026-05-17 (audit C1): nunca fallback a "main".
  // Lecturas de PII de cliente deben fallar 401 si el JWT no trae tenantId.
  if (!auth.tenantId) {
    return NextResponse.json({ error: "Sesión sin tenant válido" }, { status: 401 });
  }
  const tenantId = auth.tenantId;

  try {
    // Try Sale first (POS sales)
     
    const lastSale = await prisma.sale.findFirst({
      where: { customerPhone: safePhone, tenantId },
      orderBy: { createdAt: "desc" },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, price: true, image: true, unit: true, active: true } },
          },
        },
      },
    });

    if (lastSale) {
      enqueueActivityLog({
        action: "leer",
        resource: "cliente_pii",
        resourceId: safePhone,
        userId: auth.username,
        tenantId,
        details: { description: `Lectura PII cliente ${safePhone.slice(-4)} desde /api/customers/${safePhone}/last-purchase` },
        timestamp: new Date().toISOString(),
      }).catch(() => { /* fire-and-forget */ });
      return NextResponse.json({
        type: "sale",
        id: lastSale.id,
        date: lastSale.createdAt.toISOString(),
        total: lastSale.total,
        items: lastSale.items.map(i => ({
          productId: i.productId,
          name: i.name,
          quantity: i.quantity,
          price: i.price,
          unit: i.unit,
          image: i.product?.image || "",
          active: i.product?.active ?? true,
        })),
      });
    }

    // Fallback: try Order
     
    const lastOrder = await prisma.order.findFirst({
      where: { customerPhone: safePhone, tenantId },
      orderBy: { createdAt: "desc" },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, price: true, image: true, unit: true, active: true } },
          },
        },
      },
    });

    if (lastOrder) {
      enqueueActivityLog({
        action: "leer",
        resource: "cliente_pii",
        resourceId: safePhone,
        userId: auth.username,
        tenantId,
        details: { description: `Lectura PII cliente ${safePhone.slice(-4)} desde /api/customers/${safePhone}/last-purchase` },
        timestamp: new Date().toISOString(),
      }).catch(() => { /* fire-and-forget */ });
      return NextResponse.json({
        type: "order",
        id: lastOrder.id,
        date: lastOrder.createdAt.toISOString(),
        total: lastOrder.total,
        items: lastOrder.items.map(i => ({
          productId: i.productId,
          name: i.name,
          quantity: i.quantity,
          price: i.price,
          unit: i.unit,
          image: i.product?.image || "",
          active: i.product?.active ?? true,
        })),
      });
    }

    return NextResponse.json(null);
  } catch (e) {
    // Degradado intencional (audit 2026-05-17): la "última compra" es info
    // opcional para enriquecer el POS. Si Prisma falla devolvemos null+200
    // en vez de 503 — el cliente entiende "no hay datos" en lugar de crashear
    // el modal de cobro. El error queda en logs para diagnóstico.
    logger.error("[customers/phone/last-purchase] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json(null);
  }
}
