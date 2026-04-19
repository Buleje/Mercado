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
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const AddressBody = z.object({
  location: z.string().min(3, "Direccion muy corta").max(300),
  reference: z.string().max(200).optional().default(""),
});

const DeleteBody = z.object({
  id: z.string().min(1),
});

// ── GET: list addresses ─────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const anon = anonymousGate(req);
  if (anon) return anon;
  const customer = await requireCustomer(req);
  if (customer instanceof NextResponse) return customer;

  const { customerId: customerPhone } = customer;

  if (!customerPhone) {
    return NextResponse.json({ error: "Cuenta no vinculada" }, { status: 400 });
  }

  try {
    // SavedLocation no tiene tenantId en el schema — el aislamiento se da
    // porque customerPhone viene del session autenticado (no de query param).
    // TODO(P1 #15): migrar a CustomersDB + agregar tenantId a SavedLocation
    const addresses = await prisma.savedLocation.findMany({
      where: { customerPhone },
      orderBy: { id: "desc" },
      select: {
        id: true,
        location: true,
        reference: true,
      },
    });

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
  const customer = await requireCustomer(req);
  if (customer instanceof NextResponse) return customer;

  const { customerId: customerPhone } = customer;

  if (!customerPhone) {
    return NextResponse.json({ error: "Cuenta no vinculada" }, { status: 400 });
  }

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
    // TODO(P1 #15): agregar tenantId a SavedLocation para aislamiento estricto
    const count = await prisma.savedLocation.count({
      where: { customerPhone },
    });

    if (count >= 10) {
      return NextResponse.json(
        { error: "Maximo 10 direcciones guardadas. Elimina una para agregar otra." },
        { status: 400 },
      );
    }

    const address = await prisma.savedLocation.create({
      data: {
        customerPhone,
        location: parsed.data.location,
        reference: parsed.data.reference,
      },
      select: { id: true, location: true, reference: true },
    });

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
  const customer = await requireCustomer(req);
  if (customer instanceof NextResponse) return customer;

  const { customerId: customerPhone } = customer;

  if (!customerPhone) {
    return NextResponse.json({ error: "Cuenta no vinculada" }, { status: 400 });
  }

  const body = await req.json().catch((err) => {
    logger.warn("Invalid JSON body in me/addresses DELETE", { err: err instanceof Error ? err.message : String(err) });
    return null;
  });
  const parsed = DeleteBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "id requerido" }, { status: 400 });
  }

  try {
    // Verify ownership before delete
    const address = await prisma.savedLocation.findFirst({
      where: { id: parsed.data.id, customerPhone },
    });

    if (!address) {
      return NextResponse.json({ error: "Direccion no encontrada" }, { status: 404 });
    }

    await prisma.savedLocation.delete({
      where: { id: parsed.data.id },
    });

    return NextResponse.json({ ok: true, message: "Direccion eliminada" });
  } catch (err) {
    logger.error("[me/addresses] DELETE error", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
