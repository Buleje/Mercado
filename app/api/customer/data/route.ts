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
import { applyRateLimit } from "@/lib/rate-limit";
import { runWithAuditContext } from "@/lib/audit/audit-context";

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

  // SECURITY 2026-05-05 (CT-12 IDOR Ley 29733 PE): scope tenantId.
  // Customer.phone es @id global; antes admin de tenant A podía exportar
  // PII completo (orders, location, ...) del cliente con mismo phone en B.
  const customer = await prisma.customer.findFirst({
    where: { phone, tenantId: auth.tenantId },
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
  // SECURITY: tenantId scope — antes leakeaba reviews de mismo phone en otros tenants.
  const reviews = await prisma.review.findMany({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    where: { phone, tenantId: auth.tenantId, deletedAt: null } as any,
    select: { id: true, date: true, rating: true, text: true },
  });

  let savedCartItems: unknown = null;
  if (customer.savedCart) {
    try { savedCartItems = JSON.parse(customer.savedCart.itemsJson); } catch { /* corrupted data */ }
  }

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
    savedCart: savedCartItems,
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
  const _rl = await applyRateLimit(req, "MODERATE", "customer-data"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  // Round 17 M004: GDPR/Ley 29733 art. 21 — DELETE de Customer + anon Reviews.
  // Operación máxima criticidad. Audit con admin actor + IP obligatorio SBS.
  return runWithAuditContext(req, `gdpr:${auth.username}`, () => deleteHandler(req, auth));
}

async function deleteHandler(
  req: NextRequest,
  auth: { tenantId: string; username: string },
): Promise<NextResponse> {
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

  // SECURITY 2026-05-06 (pentest H009): scope por tenant. Antes admin de
  // tenant A podía borrar customer del tenant B con mismo phone (Customer.phone
  // es @id global, así que el `delete({where:{phone}})` no validaba tenant).
  const existing = await prisma.customer.findFirst({
    where: { phone, tenantId: auth.tenantId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  // 1. Anonymise reviews (remove PII name + phone, keep analytics data)
  await prisma.review.updateMany({
    where: { phone, tenantId: auth.tenantId },
    data: { name: "[deleted]", phone: null },
  });

  // 2. Delete the customer record (con guard por tenant).
  //    Cascade: SavedCart, SavedLocation, CustomerNotification (onDelete: Cascade).
  //    Orders: customerPhone set to NULL (onDelete: SetNull).
  await prisma.customer.deleteMany({ where: { phone, tenantId: auth.tenantId } });

  // COMPLIANCE 2026-05-06: máscara de PII en logs. Antes el phone completo
  // iba a Sentry/Vercel Logs (PII no debe persistir en logs operacionales).
  const maskedPhone = phone.length >= 4 ? `${"*".repeat(phone.length - 4)}${phone.slice(-4)}` : "****";
  console.info(
    `[GDPR] Customer ${maskedPhone} erased by admin ${auth.username} (tenant: ${auth.tenantId})`,
  );

  return NextResponse.json({
    deleted: true,
    phone,
    note: "Customer record and PII removed. Orders retained anonymously.",
  });
}
