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
import { CustomerDataDB } from "@/lib/db/customer-data.db";
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

  // Audit project-wide 2026-05-19: migrado a CustomerDataDB.
  // SECURITY 2026-05-05 (CT-12 IDOR Ley 29733 PE): scope tenantId.
  const customer = await CustomerDataDB.findCustomerWithCarts(auth.tenantId, phone);
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }
  const orders = await CustomerDataDB.listOrdersByCustomer(auth.tenantId, customer.phone);
  const reviews = await CustomerDataDB.listReviewsByPhone(auth.tenantId, phone);

  let savedCartItems: unknown = null;
  const firstSavedCart = customer.savedCarts?.[0];
  if (firstSavedCart) {
    try { savedCartItems = JSON.parse(firstSavedCart.itemsJson); } catch { /* corrupted data */ }
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
    savedCart: savedCartItems,
    orders,
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

  // SECURITY 2026-05-06 (pentest H009): scope por tenant.
  const existing = await CustomerDataDB.findCustomerWithCarts(auth.tenantId, phone);
  if (!existing) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  // 1. Anonymise reviews (remove PII name + phone, keep analytics data)
  await CustomerDataDB.anonymizeReviews(auth.tenantId, phone);

  // 2. Delete the customer record (con guard por tenant).
  //    Cascade: SavedCart, SavedLocation, CustomerNotification (onDelete: Cascade).
  //    Orders: customerPhone set to NULL (onDelete: SetNull).
  await CustomerDataDB.deleteCustomer(auth.tenantId, phone);

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
