import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { getAtRiskCustomers } from "@/lib/churn/customer-churn";

/**
 * GET /api/customers/at-risk
 *
 * Returns top 20 at-risk B2C customers with churn score and WhatsApp link.
 * Auth: requireAdmin(["admin"]) — only admin can see customer churn data.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const customers = await getAtRiskCustomers(auth.tenantId, 20);

    return NextResponse.json({
      ok: true,
      total: customers.length,
      customers,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
