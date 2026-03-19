export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CustomersDB, normalizePhone } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { invalidate } from "@/lib/cache";

const CustomerPatchSchema = z.object({
  privateNotes: z.string().max(2000).optional(),
  creditDelta: z.number().optional(),
  aiNotes: z.string().max(5000).optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  const { phone } = await params;
  const normalized = normalizePhone(phone);
  if (!/^\d{6,15}$/.test(normalized)) {
    return NextResponse.json({ error: "Teléfono inválido" }, { status: 400 });
  }
  try {
    const customer = await CustomersDB.getByPhone(normalized);
    if (!customer) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    // Return only public-safe fields (no privateNotes, aiNotes, creditBalance)
    return NextResponse.json({
      name: customer.name,
      phone: customer.phone,
      location: customer.location,
      reference: customer.reference,
      locations: customer.locations ?? [],
      activeLocationId: customer.activeLocationId ?? null,
      birthday: customer.birthday ?? null,
    });
  } catch (e) {
    logger.error("[customers/phone] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const rl = applyRateLimit(req, "MODERATE", "customers-patch");
  if (rl) return rl;

  const { phone } = await params;
  const normalized = normalizePhone(phone);
  try {
    const raw = await req.json();
    const parsed = CustomerPatchSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }
    if (parsed.data.privateNotes !== undefined) {
      await CustomersDB.updatePrivateNotes(normalized, parsed.data.privateNotes);
    }
    if (parsed.data.creditDelta !== undefined && parsed.data.creditDelta !== 0) {
      await CustomersDB.updateCreditBalance(normalized, parsed.data.creditDelta);
    }
    if (parsed.data.aiNotes !== undefined) {
      await CustomersDB.updateAiNotes(normalized, parsed.data.aiNotes);
    }
    // Audit log — fire-and-forget
    const detail = Object.keys(parsed.data).join(", ");
    prisma.activityLog.create({
      data: { action: "update", entity: "customer", entityId: normalized, detail: `Campos actualizados: ${detail}`, user: auth.username, tenantId: auth.tenantId },
    }).catch(() => {});
    invalidate(`dashboard:${auth.tenantId}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[customers PATCH] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const rl = applyRateLimit(req, "MODERATE", "customers-delete");
  if (rl) return rl;

  const { phone } = await params;
  const normalized = normalizePhone(phone);
  if (!/^\d{6,15}$/.test(normalized)) {
    return NextResponse.json({ error: "Teléfono inválido" }, { status: 400 });
  }
  try {
    await CustomersDB.delete(normalized);
    prisma.activityLog.create({
      data: { action: "delete", entity: "customer", entityId: normalized, detail: `Cliente eliminado: ${normalized}`, user: auth.username, tenantId: auth.tenantId },
    }).catch(() => {});
    invalidate(`dashboard:${auth.tenantId}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[customers DELETE] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
