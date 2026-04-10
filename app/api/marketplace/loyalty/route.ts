import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { toErrorPayload, newTraceId, ApiError } from "@/lib/api-error";
import { LoyaltyDB } from "@/lib/db/loyalty.db";

/**
 * Marketplace loyalty route — TD-030 / ADR-024
 *
 * Thin wrapper around `LoyaltyDB`. The route does not own any business math:
 * the DB class enforces tenant isolation, balance non-negativity and atomic
 * `$transaction([insert, increment])` writes.
 */

// ── Schemas ──────────────────────────────────────────────────────────────────

const HistoryQuerySchema = z.object({
  phone: z.string().min(5),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

const EarnSchema = z.object({
  action: z.literal("earn"),
  phone: z.string().min(5),
  points: z.number().int().positive(),
  reason: z.string().min(1).max(64).optional(),
  description: z.string().max(200).optional(),
  orderId: z.string().optional(),
});

const RedeemSchema = z.object({
  action: z.literal("redeem"),
  phone: z.string().min(5),
  points: z.number().int().positive(),
  reason: z.string().min(1).max(64).optional(),
  description: z.string().max(200).optional(),
  orderId: z.string().optional(),
});

const PostSchema = z.discriminatedUnion("action", [EarnSchema, RedeemSchema]);

// ── Helpers ──────────────────────────────────────────────────────────────────

function tierFromPoints(points: number): "oro" | "plata" | "bronce" {
  if (points >= 1000) return "oro";
  if (points >= 500) return "plata";
  return "bronce";
}

function buildMetadata(input: {
  description?: string;
  orderId?: string;
  user?: string;
}): Record<string, unknown> | undefined {
  const meta: Record<string, unknown> = {};
  if (input.description) meta.description = input.description;
  if (input.orderId) meta.orderId = input.orderId;
  if (input.user) meta.user = input.user;
  return Object.keys(meta).length > 0 ? meta : undefined;
}

// ── GET ──────────────────────────────────────────────────────────────────────

/**
 * GET /api/marketplace/loyalty?phone=...&limit=20&offset=0
 * Returns the customer's loyalty history (paginated, newest first) and the
 * current materialized balance.
 */
export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin", "manager", "cajero"]);
    if (auth instanceof NextResponse) return auth;

    const parsed = HistoryQuerySchema.safeParse({
      phone: req.nextUrl.searchParams.get("phone"),
      limit: req.nextUrl.searchParams.get("limit") ?? undefined,
      offset: req.nextUrl.searchParams.get("offset") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Parámetros inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { phone, limit, offset } = parsed.data;

    const page = await LoyaltyDB.getHistory(auth.tenantId, phone, limit, offset);

    return NextResponse.json({
      data: {
        phone,
        points: page.balance,
        tier: tierFromPoints(page.balance),
        transactions: page.transactions,
        total: page.total,
      },
    });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}

// ── POST ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/marketplace/loyalty
 * body: { action: "earn" | "redeem", phone, points, reason?, description?, orderId? }
 *
 * Delegates to `LoyaltyDB.earn` / `LoyaltyDB.redeem`. The DB class writes the
 * ledger row and the materialized balance atomically inside one $transaction.
 */
export async function POST(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin", "manager", "cajero"]);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Body JSON requerido" }, { status: 400 });
    }

    const parsed = PostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Body inválido", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { action, phone, points, reason, description, orderId } = parsed.data;
    const metadata = buildMetadata({ description, orderId, user: auth.username });

    const tx =
      action === "earn"
        ? await LoyaltyDB.earn(auth.tenantId, phone, points, reason ?? "manual", metadata)
        : await LoyaltyDB.redeem(auth.tenantId, phone, points, reason ?? "redemption", metadata);

    const newBalance = await LoyaltyDB.getBalance(auth.tenantId, phone);

    return NextResponse.json({
      data: tx,
      newBalance,
      tier: tierFromPoints(newBalance),
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json(err.toPayload(traceId), { status: err.httpStatus });
    }
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
