/**
 * GET/POST/DELETE /api/me/addresses
 *
 * Customer saved delivery addresses (SavedLocation model).
 * CRUD for the customer's delivery addresses used during checkout.
 *
 * GET     → list all saved addresses
 * POST    → add new address { location, reference }
 * DELETE  → remove address { id }
 *
 * Auth: requireCustomer
 */

import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireCustomer } from "@/lib/auth/require-customer";
import { anonymousGate } from "@/lib/auth/anonymous-gate";
import { prisma } from "@/lib/prisma";
import { MeAddressesDB } from "@/lib/db/me-addresses.db";
import { CustomersDB } from "@/lib/db/customers.db";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

// Next 16 con cacheComponents: force-dynamic es incompatible. La route es
// dinamica implicitamente porque usa cookies/headers via requireCustomer.

const AddressBody = z.object({
  location: z.string().min(3, "Direccion muy corta").max(300),
  reference: z.string().max(200).optional().default(""),
});

const DeleteBody = z.object({
  id: z.string().min(1),
});

const SetActiveBody = z.object({
  id: z.string().min(1),
});

// ── GET: list addresses ─────────────────────────────────────────────

/**
 * Verifica que el Customer asociado a `phone` pertenece al `tenantId` del
 * session actual. Defense-in-depth ante el caso (improbable con ADR-083 que
 * tiene phone @id) de que un phone aparezca en otro tenant.
 *
 * Devuelve `null` si OK, o un NextResponse 403 si hay mismatch.
 */
async function assertCustomerBelongsToTenant(
  customerPhone: string,
  sessionTenantId: string,
): Promise<NextResponse | null> {
   
  const c = await prisma.customer.findUnique({
    where: { phone: customerPhone },
    select: { tenantId: true },
  });
  if (!c) {
    return NextResponse.json(
      { error: "Cliente no encontrado en este tenant" },
      { status: 404 },
    );
  }
  if (c.tenantId !== sessionTenantId) {
    logger.warn("[me/addresses] cross-tenant attempt blocked", {
      customerPhone,
      sessionTenant: sessionTenantId,
      customerTenant: c.tenantId,
    });
    return NextResponse.json(
      { error: "forbidden", message: "Cuenta de otro tenant" },
      { status: 403 },
    );
  }
  return null;
}

export async function GET(req: NextRequest) {
  const anon = anonymousGate(req);
  if (anon) return anon;
  const customer = await requireCustomer(req);
  if (customer instanceof NextResponse) return customer;

  const { customerId: customerPhone, tenantId: sessionTenantId } = customer;

  if (!customerPhone) {
    return NextResponse.json({ error: "Cuenta no vinculada" }, { status: 400 });
  }

  // Defense-in-depth: bloquear cross-tenant antes de tocar SavedLocation
  // (que no tiene tenantId field — ver TODO de migration ADR-085 pendiente).
  const blocked = await assertCustomerBelongsToTenant(customerPhone, sessionTenantId);
  if (blocked) return blocked;

  try {
    // Audit project-wide 2026-05-19: migrado a MeAddressesDB.list.
    const addresses = await MeAddressesDB.list(customerPhone);

    return NextResponse.json({
      addresses,
      count: addresses.length,
    });
  } catch (err) {
    logger.error("[me/addresses] GET error", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// ── POST: add address ───────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "me-addresses"); if (_rl) return _rl;
  const customer = await requireCustomer(req);
  if (customer instanceof NextResponse) return customer;

  const { customerId: customerPhone, tenantId: sessionTenantId } = customer;

  if (!customerPhone) {
    return NextResponse.json({ error: "Cuenta no vinculada" }, { status: 400 });
  }

  const blocked = await assertCustomerBelongsToTenant(customerPhone, sessionTenantId);
  if (blocked) return blocked;

  const body = await req.json().catch((err) => {
    logger.warn("Invalid JSON body in me/addresses POST", { err: err instanceof Error ? err.message : String(err) });
    return null;
  });
  const parsed = AddressBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos invalidos", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    // Limit to 10 addresses per customer
    // Audit project-wide 2026-05-19: migrado a MeAddressesDB.count.
    const count = await MeAddressesDB.count(customerPhone);

    if (count >= 10) {
      return NextResponse.json(
        { error: "Maximo 10 direcciones guardadas. Elimina una para agregar otra." },
        { status: 400 },
      );
    }

    // Audit project-wide 2026-05-19: migrado a MeAddressesDB.create.
    const address = await MeAddressesDB.create(
      sessionTenantId,
      customerPhone,
      parsed.data.location,
      parsed.data.reference,
    );

    return NextResponse.json({
      ok: true,
      address,
      message: "Direccion guardada",
    }, { status: 201 });
  } catch (err) {
    logger.error("[me/addresses] POST error", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// ── DELETE: remove address ──────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "me-addresses"); if (_rl) return _rl;
  const customer = await requireCustomer(req);
  if (customer instanceof NextResponse) return customer;

  const { customerId: customerPhone, tenantId: sessionTenantId } = customer;

  if (!customerPhone) {
    return NextResponse.json({ error: "Cuenta no vinculada" }, { status: 400 });
  }

  const blocked = await assertCustomerBelongsToTenant(customerPhone, sessionTenantId);
  if (blocked) return blocked;

  const body = await req.json().catch((err) => {
    logger.warn("Invalid JSON body in me/addresses DELETE", { err: err instanceof Error ? err.message : String(err) });
    return null;
  });
  const parsed = DeleteBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "id requerido" }, { status: 400 });
  }

  try {
    // Verify ownership before delete (customerPhone scope on top of tenant guard).
    // Audit project-wide 2026-05-19: migrado a MeAddressesDB.
    const address = await MeAddressesDB.findOwned(parsed.data.id, customerPhone);

    if (!address) {
      return NextResponse.json({ error: "Direccion no encontrada" }, { status: 404 });
    }

    await MeAddressesDB.delete(parsed.data.id);

    return NextResponse.json({ ok: true, message: "Direccion eliminada" });
  } catch (err) {
    logger.error("[me/addresses] DELETE error", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// ── PATCH: marcar dirección como principal (activeLocationId) ────────

export async function PATCH(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "me-addresses"); if (_rl) return _rl;
  const customer = await requireCustomer(req);
  if (customer instanceof NextResponse) return customer;

  const { customerId: customerPhone, tenantId: sessionTenantId } = customer;

  if (!customerPhone) {
    return NextResponse.json({ error: "Cuenta no vinculada" }, { status: 400 });
  }

  const blocked = await assertCustomerBelongsToTenant(customerPhone, sessionTenantId);
  if (blocked) return blocked;

  const body = await req.json().catch((err) => {
    logger.warn("Invalid JSON body in me/addresses PATCH", { err: err instanceof Error ? err.message : String(err) });
    return null;
  });
  const parsed = SetActiveBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "id requerido" }, { status: 400 });
  }

  try {
    // Verify ownership before marking active (customerPhone scope on top of tenant guard).
    const address = await MeAddressesDB.findOwned(parsed.data.id, customerPhone);

    if (!address) {
      return NextResponse.json({ error: "Direccion no encontrada" }, { status: 404 });
    }

    const ok = await CustomersDB.setActiveLocation(sessionTenantId, customerPhone, parsed.data.id);
    if (!ok) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, message: "Direccion principal actualizada" });
  } catch (err) {
    logger.error("[me/addresses] PATCH error", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
