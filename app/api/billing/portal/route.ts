import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { BillingPortalDB } from "@/lib/db/billing-portal.db";
import { createBillingPortalSession } from "@/lib/stripe";
import { applyRateLimit } from "@/lib/rate-limit";

// POST /api/billing/portal
// Opens the Stripe Customer Portal for managing subscription / payment method
export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "billing-portal"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { tenantId } = auth;

  const tenant = await BillingPortalDB.getTenantStripeFields(tenantId);
  if (!tenant) return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });

  if (!tenant.stripeCustomerId) {
    return NextResponse.json(
      { error: "No tienes una suscripción activa de Stripe. Actualiza tu plan primero." },
      { status: 404 }
    );
  }

  const origin = req.headers.get("origin") ?? `https://${tenantId}.${process.env.ROOT_DOMAIN ?? "localhost:3000"}`;

  const url = await createBillingPortalSession({
    customerId: tenant.stripeCustomerId,
    returnUrl: `${origin}/admin?tab=plan`,
  });

  return NextResponse.json({ url });
}
