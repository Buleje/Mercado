/**
 * GDPR / Data Privacy Endpoints
 *
 * GET  /api/customer/data?phone=<phone>
 *   → Export all personal data for a customer (admin only).
 *   Returns a structured JSON bundle with customer profile, orders, reviews,
 *   saved cart, and saved locations.
 *
 * DELETE /api/customer/data
 *   Body: { phone: string, confirm: true }
 *   → Permanently anonymise or delete all PII for a customer (admin only).
 *   Orders are kept but detached (customerPhone set to NULL).
 *   The customer record, saved cart, saved locations, and notifications are deleted.
 */

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { z } from "zod";

// ── GET — data export ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const phone = req.nextUrl.searchParams.get("phone")?.trim();
  if (!phone) {
    return NextResponse.json(
      { error: "Missing required query parameter: phone" },
      { status: 400 },
    );
  }

  const customer = await prisma.customer.findUnique({
    where: { phone },
    include: {
      locations: true,
      savedCart: true,
      orders: {
        select: {
          id: true,
          createdAt: true,
          total: true,
          status: true,
          paymentMethod: true,
          customerLocation: true,
          customerReference: true,
          items: { select: { name: true, quantity: true, price: true } },
        },
      },
    },
  });

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  // Reviews linked by phone (not a FK relation, just a loose reference)
  const reviews = await prisma.review.findMany({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    where: { phone, deletedAt: null } as any,
    select: { id: true, date: true, rating: true, text: true },
  });

  const exportBundle = {
    exportedAt: new Date().toISOString(),
    requestedBy: auth.username,
    personal: {
      phone: customer.phone,
      name: customer.name,
      location: customer.location,
      reference: customer.reference,
      birthday: customer.birthday,
      aiNotes: customer.aiNotes,
      privateNotes: customer.privateNotes,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    },
    loyalty: {
      points: customer.loyaltyPoints,
      tier: customer.loyaltyTier,
      totalSpent: customer.totalSpent,
      creditBalance: customer.creditBalance,
      referralCode: customer.referralCode,
      referredBy: customer.referredBy,
    },
    savedLocations: customer.locations,
    savedCart: customer.savedCart
      ? JSON.parse(customer.savedCart.itemsJson)
      : null,
    orders: customer.orders,
    reviews,
  };

  return NextResponse.json(exportBundle);
}

// ── DELETE — right to erasure ─────────────────────────────────────────────────

const DeleteSchema = z.object({
  phone: z.string().min(7),
  confirm: z.literal(true),
});

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = DeleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { phone } = parsed.data;

  const existing = await prisma.customer.findUnique({ where: { phone } });
  if (!existing) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  // 1. Anonymise reviews (remove PII name + phone, keep analytics data)
  await prisma.review.updateMany({
    where: { phone },
    data: { name: "[deleted]", phone: null },
  });

  // 2. Delete the customer record.
  //    Cascade: SavedCart, SavedLocation, CustomerNotification (onDelete: Cascade).
  //    Orders: customerPhone set to NULL (onDelete: SetNull).
  await prisma.customer.delete({ where: { phone } });

  console.info(
    `[GDPR] Customer ${phone} erased by admin ${auth.username} (tenant: ${auth.tenantId})`,
  );

  return NextResponse.json({
    deleted: true,
    phone,
    note: "Customer record and PII removed. Orders retained anonymously.",
  });
}
