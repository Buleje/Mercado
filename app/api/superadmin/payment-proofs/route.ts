import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { PaymentProofsDB } from "@/lib/db/payment-proofs.db";

/**
 * GET /api/superadmin/payment-proofs?status=pending|all
 *
 * Auth ya validada por el middleware /api/superadmin/* — la cookie
 * `buleje-platform-sess` debe ser válida.
 */
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status") ?? "pending";
  const proofs = status === "all"
    ? await PaymentProofsDB.listAll()
    : await PaymentProofsDB.listPending();
  return NextResponse.json({ proofs });
}
