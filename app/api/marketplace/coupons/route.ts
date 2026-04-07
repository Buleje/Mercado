export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { z } from "zod";
import { logActivity } from "@/lib/activity-logger";

const CreateCouponSchema = z.object({
  code: z
    .string()
    .min(3, "El código debe tener al menos 3 caracteres")
    .max(30)
    .transform((v) => v.toUpperCase().trim()),
  description: z.string().max(200).optional().default(""),
  discountType: z.enum(["percent", "fixed"]),
  discountValue: z.number().positive("El descuento debe ser mayor a 0"),
  minPurchase: z.number().min(0).optional().nullable(),
  maxUses: z.number().int().positive().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
});

/**
 * GET /api/marketplace/coupons
 * Lista cupones de la tienda del vendedor.
 */
export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin", "manager", "cajero"]);
    if (auth instanceof NextResponse) return auth;

    const store = await prisma.store.findFirst({
      where: { tenantId: auth.tenantId },
      select: { id: true },
    });

    if (!store) {
      return NextResponse.json({ data: [] });
    }

    // TECH-DEBT: campo storeId no está en schema Prisma (Coupon) — filtrar solo por tenant
    // TODO: agregar storeId al modelo Coupon para soporte de cupones de marketplace
    const coupons = await prisma.coupon.findMany({
      where: { tenantId: auth.tenantId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: coupons });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}

/**
 * POST /api/marketplace/coupons
 * Crear un nuevo cupón para la tienda del vendedor.
 */
export async function POST(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin", "manager"]);
    if (auth instanceof NextResponse) return auth;

    const store = await prisma.store.findFirst({
      where: { tenantId: auth.tenantId },
      select: { id: true },
    });

    if (!store) {
      return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = CreateCouponSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ issues: parsed.error.issues }, { status: 400 });
    }

    const { code, description, discountType, discountValue, minPurchase, maxUses, expiresAt } = parsed.data;

    // Check for duplicate code in this tenant
    const existing = await prisma.coupon.findUnique({
      where: { tenantId_code: { tenantId: auth.tenantId, code } },
    });
    if (existing) {
      return NextResponse.json({ error: "Ya existe un cupón con ese código" }, { status: 409 });
    }

    const coupon = await prisma.coupon.create({
      data: {
        id: crypto.randomUUID(),
        code,
        description,
        discountType,
        discountValue,
        minPurchase: minPurchase ?? null,
        maxUses: maxUses ?? null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        // TECH-DEBT: campo storeId no está en schema Prisma (Coupon) — removido temporalmente
        tenantId: auth.tenantId,
      },
    });

    logActivity(
      "coupon_created",
      "Coupon",
      `Cupón ${code} creado para marketplace`,
      coupon.id,
      auth.username,
    ).catch(() => {});

    return NextResponse.json({ data: coupon }, { status: 201 });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
