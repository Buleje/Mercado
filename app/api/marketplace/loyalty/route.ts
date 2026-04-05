export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { z } from "zod";
import { logActivity } from "@/lib/activity-logger";

const EarnSchema = z.object({
  phone: z.string().min(5),
  points: z.number().int().positive(),
  description: z.string().max(200).optional(),
  orderId: z.string().optional(),
});

const RedeemSchema = z.object({
  phone: z.string().min(5),
  points: z.number().int().positive(),
  description: z.string().max(200).optional(),
  orderId: z.string().optional(),
});

/**
 * GET /api/marketplace/loyalty?phone=...
 * Get customer loyalty balance and recent transactions.
 */
export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin", "manager", "cajero"]);
    if (auth instanceof NextResponse) return auth;

    const phone = req.nextUrl.searchParams.get("phone");
    if (!phone) {
      return NextResponse.json({ error: "Teléfono requerido" }, { status: 400 });
    }

    const customer = await prisma.customer.findUnique({
      where: { phone },
      select: { phone: true, name: true, loyaltyPoints: true, loyaltyTier: true, totalSpent: true },
    });

    if (!customer) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }

    const transactions = await prisma.loyaltyTransaction.findMany({
      where: { phone, tenantId: auth.tenantId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    // Calculate tier based on points
    const tier = customer.loyaltyPoints >= 1000
      ? "oro"
      : customer.loyaltyPoints >= 500
        ? "plata"
        : "bronce";

    return NextResponse.json({
      data: {
        phone: customer.phone,
        name: customer.name,
        points: customer.loyaltyPoints,
        tier,
        totalSpent: customer.totalSpent,
        transactions,
      },
    });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}

/**
 * POST /api/marketplace/loyalty
 * Earn or redeem points.
 * body: { action: "earn" | "redeem", phone, points, description?, orderId? }
 */
export async function POST(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin", "manager", "cajero"]);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json();
    const action = body.action;

    if (action === "earn") {
      const parsed = EarnSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ issues: parsed.error.issues }, { status: 400 });
      }

      const { phone, points, description, orderId } = parsed.data;

      // Verify customer exists
      const customer = await prisma.customer.findUnique({ where: { phone } });
      if (!customer) {
        return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
      }

      const [tx] = await prisma.$transaction([
        prisma.loyaltyTransaction.create({
          data: {
            id: crypto.randomUUID(),
            phone,
            tenantId: auth.tenantId,
            type: "earn",
            points,
            description: description ?? `Puntos ganados por compra`,
            orderId,
          },
        }),
        prisma.customer.update({
          where: { phone },
          data: { loyaltyPoints: { increment: points } },
        }),
      ]);

      // Update tier
      const updated = await prisma.customer.findUnique({
        where: { phone },
        select: { loyaltyPoints: true },
      });
      const newTier = (updated?.loyaltyPoints ?? 0) >= 1000
        ? "oro"
        : (updated?.loyaltyPoints ?? 0) >= 500
          ? "plata"
          : "bronce";
      await prisma.customer.update({
        where: { phone },
        data: { loyaltyTier: newTier },
      });

      logActivity(
        "loyalty_earn",
        "Customer",
        `+${points} puntos a ${phone}`,
        phone,
        auth.username,
      ).catch(() => {});

      return NextResponse.json({ data: tx, newBalance: (updated?.loyaltyPoints ?? 0) });
    }

    if (action === "redeem") {
      const parsed = RedeemSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ issues: parsed.error.issues }, { status: 400 });
      }

      const { phone, points, description, orderId } = parsed.data;

      const customer = await prisma.customer.findUnique({
        where: { phone },
        select: { loyaltyPoints: true },
      });
      if (!customer) {
        return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
      }

      if (customer.loyaltyPoints < points) {
        return NextResponse.json({
          error: `Puntos insuficientes. Tiene ${customer.loyaltyPoints}, necesita ${points}.`,
        }, { status: 400 });
      }

      const [tx] = await prisma.$transaction([
        prisma.loyaltyTransaction.create({
          data: {
            id: crypto.randomUUID(),
            phone,
            tenantId: auth.tenantId,
            type: "redeem",
            points: -points,
            description: description ?? `Puntos canjeados`,
            orderId,
          },
        }),
        prisma.customer.update({
          where: { phone },
          data: { loyaltyPoints: { decrement: points } },
        }),
      ]);

      const updated = await prisma.customer.findUnique({
        where: { phone },
        select: { loyaltyPoints: true },
      });
      const newTier = (updated?.loyaltyPoints ?? 0) >= 1000
        ? "oro"
        : (updated?.loyaltyPoints ?? 0) >= 500
          ? "plata"
          : "bronce";
      await prisma.customer.update({
        where: { phone },
        data: { loyaltyTier: newTier },
      });

      logActivity(
        "loyalty_redeem",
        "Customer",
        `-${points} puntos de ${phone}`,
        phone,
        auth.username,
      ).catch(() => {});

      return NextResponse.json({ data: tx, newBalance: (updated?.loyaltyPoints ?? 0) });
    }

    return NextResponse.json({ error: "Acción no válida. Use 'earn' o 'redeem'." }, { status: 400 });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
