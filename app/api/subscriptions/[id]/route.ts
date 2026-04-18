import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireCustomer } from "@/lib/auth/require-customer";
import { SubscriptionsDB } from "@/lib/db/subscriptions.db";
import { ApiError, toErrorPayload } from "@/lib/api-error";
import { logger } from "@/lib/logger";

/**
 * GET    /api/subscriptions/[id]      — obtener una suscripción del cliente
 * PATCH  /api/subscriptions/[id]      — actualizar status o frequency
 * DELETE /api/subscriptions/[id]      — cancelar (alias de PATCH status=cancelled)
 *
 * Auth: requireCustomer. Cross-tenant guard via SubscriptionsDB.
 * ADR-076.
 */

const PatchBody = z.object({
  status: z.enum(["active", "paused", "cancelled"]).optional(),
  frequency: z.enum(["weekly", "biweekly", "monthly", "bimonthly"]).optional(),
  cancelReason: z.string().max(500).optional(),
});

function ensureSameUser(
  subUserId: string,
  customerUserId: string,
): NextResponse | null {
  if (subUserId !== customerUserId) {
    return NextResponse.json(
      { error: "forbidden", message: "Suscripción pertenece a otro cliente" },
      { status: 403 },
    );
  }
  return null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const customer = await requireCustomer(req);
  if (customer instanceof NextResponse) return customer;
  const { tenantId, customerId: userId } = customer;
  if (!userId) {
    return NextResponse.json(
      { error: "Cuenta no vinculada a perfil de cliente" },
      { status: 400 },
    );
  }
  const { id } = await params;

  try {
    const sub = await SubscriptionsDB.getById(tenantId, id);
    const forbidden = ensureSameUser(sub.userId, userId);
    if (forbidden) return forbidden;

    // Include deliveries on detail view (small list, cache included).
    const deliveries = await SubscriptionsDB.listDeliveries(tenantId, id);
    return NextResponse.json({ item: sub, deliveries });
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    if (!(err instanceof ApiError)) {
      logger.error("[api/subscriptions/[id]] GET failed", {
        tenantId,
        id,
        error: String(err),
      });
    }
    return NextResponse.json(payload, { status });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const customer = await requireCustomer(req);
  if (customer instanceof NextResponse) return customer;
  const { tenantId, customerId: userId } = customer;
  if (!userId) {
    return NextResponse.json(
      { error: "Cuenta no vinculada a perfil de cliente" },
      { status: 400 },
    );
  }
  const { id } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = PatchBody.safeParse(raw);
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

  // At least one of status / frequency must be present.
  if (
    parsed.data.status === undefined &&
    parsed.data.frequency === undefined
  ) {
    return NextResponse.json(
      { error: "Falta status o frequency" },
      { status: 400 },
    );
  }

  try {
    // Verify ownership BEFORE mutating.
    const existing = await SubscriptionsDB.getById(tenantId, id);
    const forbidden = ensureSameUser(existing.userId, userId);
    if (forbidden) return forbidden;

    let item = existing;
    if (parsed.data.frequency !== undefined) {
      item = await SubscriptionsDB.changeFrequency(tenantId, id, {
        frequency: parsed.data.frequency,
      });
    }
    if (parsed.data.status !== undefined) {
      item = await SubscriptionsDB.updateStatus(tenantId, id, {
        status: parsed.data.status,
        cancelReason: parsed.data.cancelReason,
      });
    }

    return NextResponse.json({ item });
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    if (!(err instanceof ApiError)) {
      logger.error("[api/subscriptions/[id]] PATCH failed", {
        tenantId,
        id,
        error: String(err),
      });
    }
    return NextResponse.json(payload, { status });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const customer = await requireCustomer(req);
  if (customer instanceof NextResponse) return customer;
  const { tenantId, customerId: userId } = customer;
  if (!userId) {
    return NextResponse.json(
      { error: "Cuenta no vinculada a perfil de cliente" },
      { status: 400 },
    );
  }
  const { id } = await params;

  try {
    const existing = await SubscriptionsDB.getById(tenantId, id);
    const forbidden = ensureSameUser(existing.userId, userId);
    if (forbidden) return forbidden;

    const item = await SubscriptionsDB.updateStatus(tenantId, id, {
      status: "cancelled",
    });
    return NextResponse.json({ item });
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    if (!(err instanceof ApiError)) {
      logger.error("[api/subscriptions/[id]] DELETE failed", {
        tenantId,
        id,
        error: String(err),
      });
    }
    return NextResponse.json(payload, { status });
  }
}
