/**
 * @prisma-direct ok — operación con scope explícito por `auth.tenantId` o
 * por `tenantId` resuelto desde slug del URL antes de la query. Aislamiento
 * cross-tenant verificado manualmente. Migrar a clase `lib/db/*.db.ts`
 * dedicada cuando se centralice el patrón.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { toErrorPayload, newTraceId, ApiError } from "@/lib/api-error";
import { LoyaltyDB } from "@/lib/db/loyalty.db";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { resolveMarketplaceTenant } from "@/lib/auth/resolve-marketplace-tenant";

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

    // Resolución de tenant:
    //  1. Si hay admin auth → su propio tenantId (ve solo sus loyalty points)
    //  2. Si es read público del marketplace → usar el tenantId REAL del
    //     customer en DB (platform-level: el cliente existe en "main" típico).
    //     Evita 403 LOYALTY_CROSS_TENANT cuando el header trae otro tenant
    //     (ej. marketplace en subdominio `luis` pero el customer vive en `main`).
    let tenantId = resolveMarketplaceTenant(req, { context: "marketplace/loyalty" });
    let adminMode = false;
    try {
      const auth = await requireAdmin(req, ["admin", "manager", "cajero"]);
      if (!(auth instanceof NextResponse)) {
        tenantId = auth.tenantId;
        adminMode = true;
      }
    } catch {
      // No admin — seguimos como read público
    }

    if (!adminMode) {
      // SECURITY (2026-04-29): solo lookupeamos customer dentro del
      // tenant del request — antes era findUnique({phone}) cross-tenant.
      const customerInDb = await prisma.customer.findFirst({
        where: { phone, tenantId },
        select: { tenantId: true },
      });
      if (!customerInDb) {
        // Sin customer en este tenant → balance público vacío.
        return NextResponse.json({
          data: {
            phone,
            name: "",
            points: 0,
            tier: tierFromPoints(0),
            totalSpent: 0,
            transactions: [],
            total: 0,
          },
        });
      }
      // Mantenemos tenantId del request (ya validado).
    }

    // Lookup tolerante — si la DB tira cross-tenant u otro error, devolvemos
    // balance 0 en vez de 403. Solo admins ven errores reales.
    const [pageResult, customer] = await Promise.all([
      LoyaltyDB.getHistory(tenantId, phone, limit, offset).catch((err) => {
        logger.warn("[marketplace/loyalty] GetHistory fallback", {
          phone,
          tenantId,
          error: err instanceof Error ? err.message : String(err),
        });
        return { transactions: [], balance: 0, total: 0 };
      }),
      // PII (name, totalSpent) solo dentro del tenant correcto.
      prisma.customer.findFirst({
        where: { phone, tenantId },
        select: { name: true, totalSpent: true },
      }).catch((err) => { logger.warn("[marketplace/loyalty] customer lookup failed", { tenantId, error: String(err) }); return null; }),
    ]);

    const page = pageResult;

    // SECURITY: en read público (no admin) NO exponemos `name` ni `totalSpent`
    // — solo puntos/tier (agregados públicos del programa de loyalty).
    return NextResponse.json({
      data: {
        phone,
        name: adminMode ? (customer?.name ?? "") : "",
        points: page.balance,
        tier: tierFromPoints(page.balance),
        totalSpent: adminMode ? Number(customer?.totalSpent ?? 0) : 0,
        transactions: adminMode ? page.transactions : [],
        total: adminMode ? page.total : 0,
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

    const body = await req.json().catch((err) => { logger.error("[marketplace/loyalty] parse JSON body failed", { error: String(err) }); return null; });
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
