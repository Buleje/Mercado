import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireCustomer } from "@/lib/auth/require-customer";
import { CUSTOMER_SESSION } from "@/lib/auth/customer-session";
import { SubscriptionsDB } from "@/lib/db/subscriptions.db";
import { ApiError, toErrorPayload } from "@/lib/api-error";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET  /api/subscriptions          — lista del cliente autenticado
 * POST /api/subscriptions          — crea una suscripción para el cliente
 *
 * Auth: requireCustomer (cookie buleje-customer-sess).
 * ADR-076. Multi-tenant: tenantId del payload del cookie (nunca del body).
 */

const StatusFilter = z.enum(["active", "paused", "cancelled"]).optional();

const CreateBody = z.object({
  productId: z.number().int().positive(),
  frequency: z.enum(["weekly", "biweekly", "monthly", "bimonthly"]),
  quantity: z.number().int().min(1).max(999).optional(),
  discount: z.number().min(0).max(0.9999).optional(),
});

export async function GET(req: NextRequest) {
  // Visitantes anónimos: 204 No Content en vez de 401 — evita ruido en consola
  // del marketplace público. Solo aplica a GET (listar es idempotente y seguro).
  // POST sigue devolviendo 401 via requireCustomer — mutar requiere auth.
  if (!req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)?.value) {
    return new NextResponse(null, { status: 204 });
  }

  const customer = await requireCustomer(req);
  if (customer instanceof NextResponse) return customer;

  const { tenantId, customerId: userId } = customer;
  if (!userId) {
    return NextResponse.json(
      { error: "Cuenta no vinculada a perfil de cliente" },
      { status: 400 },
    );
  }

  const rawStatus = req.nextUrl.searchParams.get("status");
  const parsedStatus = StatusFilter.safeParse(rawStatus ?? undefined);
  if (!parsedStatus.success) {
    return NextResponse.json(
      { error: "status inválido" },
      { status: 400 },
    );
  }

  try {
    const items = await SubscriptionsDB.listForUser(tenantId, userId, {
      status: parsedStatus.data,
    });
    return NextResponse.json({ items });
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    if (!(err instanceof ApiError)) {
      logger.error("[api/subscriptions] GET failed", {
        tenantId,
        userId,
        error: String(err),
      });
    }
    return NextResponse.json(payload, { status });
  }
}

export async function POST(req: NextRequest) {
  const customer = await requireCustomer(req);
  if (customer instanceof NextResponse) return customer;

  const { tenantId, customerId: userId } = customer;
  if (!userId) {
    return NextResponse.json(
      { error: "Cuenta no vinculada a perfil de cliente" },
      { status: 400 },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = CreateBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Datos inválidos",
        issues: parsed.error.issues.map((i) => ({
          path: i.path,
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }

  try {
    const item = await SubscriptionsDB.create(tenantId, {
      userId,
      productId: parsed.data.productId,
      frequency: parsed.data.frequency,
      quantity: parsed.data.quantity ?? 1,
      discount: parsed.data.discount ?? 0.05,
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    if (!(err instanceof ApiError)) {
      logger.error("[api/subscriptions] POST failed", {
        tenantId,
        userId,
        error: String(err),
      });
    }
    return NextResponse.json(payload, { status });
  }
}
