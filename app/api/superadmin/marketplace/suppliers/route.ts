import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import {
  SupplierSignupDB,
  SUPPLIER_STATUS,
  type SupplierStatus,
} from "@/lib/db/supplier-signup.db";
import { newTraceId, toErrorPayload } from "@/lib/api-error";

const VALID_STATUSES = new Set<SupplierStatus>([
  SUPPLIER_STATUS.PENDING,
  SUPPLIER_STATUS.APPROVED,
  SUPPLIER_STATUS.REJECTED,
  SUPPLIER_STATUS.SUSPENDED,
]);

function isValidStatus(s: string | null): s is SupplierStatus {
  return !!s && VALID_STATUSES.has(s as SupplierStatus);
}

/**
 * GET /api/superadmin/marketplace/suppliers
 *
 * Superadmin-only. Returns the supplier approval queue (pending_review +
 * approved + rejected). Accepts `?status=pending_review|approved|rejected`
 * to filter. Paginated via `?limit=N` (default 100, max 500).
 */
export async function GET(req: NextRequest) {
  const traceId = newTraceId();

  const limited = applyRateLimit(req, "MODERATE", "sa-marketplace-suppliers");
  if (limited) return limited;

  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const url = new URL(req.url);
    const statusParam = url.searchParams.get("status");
    const limitParam = Number(url.searchParams.get("limit") ?? "100");
    const limit = Math.min(
      Math.max(Number.isFinite(limitParam) ? limitParam : 100, 1),
      500,
    );

    const opts: { status?: SupplierStatus; limit: number } = { limit };
    if (isValidStatus(statusParam)) {
      opts.status = statusParam;
    }

    const suppliers = await SupplierSignupDB.listForQueue(opts);

    // Hide apiKey in list view (shown once at approval time)
    const safe = suppliers.map((s) => ({
      ...s,
      apiKey: null,
    }));

    // Aggregate counts per status for tab badges
    const [pending, approved, rejected] = await Promise.all([
      SupplierSignupDB.listForQueue({
        status: SUPPLIER_STATUS.PENDING,
        limit: 500,
      }),
      SupplierSignupDB.listForQueue({
        status: SUPPLIER_STATUS.APPROVED,
        limit: 500,
      }),
      SupplierSignupDB.listForQueue({
        status: SUPPLIER_STATUS.REJECTED,
        limit: 500,
      }),
    ]);

    return NextResponse.json({
      suppliers: safe,
      counts: {
        pending: pending.length,
        approved: approved.length,
        rejected: rejected.length,
      },
    });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
