import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SuppliersDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const SupplierPatchSchema = z.object({
  // Existing fields
  name: z.string().min(1).max(200).optional(),
  ruc: z.string().max(20).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().max(200).optional(),
  address: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
  // New ficha fields
  tipoPersona: z.string().max(20).optional().nullable(),
  tipoDocumento: z.string().max(20).optional().nullable(),
  documento: z.string().max(20).optional().nullable(),
  razonSocial: z.string().max(200).optional().nullable(),
  estado: z.string().max(20).optional().nullable(),
  whatsappSecundario: z.string().max(30).optional().nullable(),
  personaContacto: z.string().max(100).optional().nullable(),
  departamento: z.string().max(100).optional().nullable(),
  provincia: z.string().max(100).optional().nullable(),
  distrito: z.string().max(100).optional().nullable(),
  direccion: z.string().max(500).optional().nullable(),
  categoria: z.string().max(50).optional().nullable(),
  condicionPago: z.string().max(30).optional().nullable(),
  diasCredito: z.number().int().min(0).optional(),
  cuentaBancaria: z.string().max(50).optional().nullable(),
  banco: z.string().max(50).optional().nullable(),
  observaciones: z.string().max(2000).optional().nullable(),
}).partial();

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const supplier = await SuppliersDB.getById(auth.tenantId, id);
    if (!supplier) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    // Get full record with new fields from prisma
    // eslint-disable-next-line no-restricted-properties -- supplier lookup tenant-scoped por auth.tenantId guard arriba.
    const full = await prisma.supplier.findUnique({ where: { id } });
    return NextResponse.json({ ...supplier, ...full });
  } catch (e) {
    logger.error("[suppliers/id] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const raw = await req.json();
    const parsed = SupplierPatchSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos invalidos", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    // Build update data — includes both old and new fields
    const data: Record<string, unknown> = {};
    const d = parsed.data;
    if (d.name !== undefined) data.name = d.name;
    if (d.ruc !== undefined) data.ruc = d.ruc;
    if (d.phone !== undefined) data.phone = d.phone;
    if (d.email !== undefined) data.email = d.email;
    if (d.address !== undefined) data.address = d.address;
    if (d.notes !== undefined) data.notes = d.notes;
    if (d.tipoPersona !== undefined) data.tipoPersona = d.tipoPersona;
    if (d.tipoDocumento !== undefined) data.tipoDocumento = d.tipoDocumento;
    if (d.documento !== undefined) data.documento = d.documento;
    if (d.razonSocial !== undefined) data.razonSocial = d.razonSocial;
    if (d.estado !== undefined) data.estado = d.estado;
    if (d.whatsappSecundario !== undefined) data.whatsappSecundario = d.whatsappSecundario;
    if (d.personaContacto !== undefined) data.personaContacto = d.personaContacto;
    if (d.departamento !== undefined) data.departamento = d.departamento;
    if (d.provincia !== undefined) data.provincia = d.provincia;
    if (d.distrito !== undefined) data.distrito = d.distrito;
    if (d.direccion !== undefined) data.direccion = d.direccion;
    if (d.categoria !== undefined) data.categoria = d.categoria;
    if (d.condicionPago !== undefined) data.condicionPago = d.condicionPago;
    if (d.diasCredito !== undefined) data.diasCredito = d.diasCredito;
    if (d.cuentaBancaria !== undefined) data.cuentaBancaria = d.cuentaBancaria;
    if (d.banco !== undefined) data.banco = d.banco;
    if (d.observaciones !== undefined) data.observaciones = d.observaciones;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ ok: true });
    }

    // eslint-disable-next-line no-restricted-properties -- supplier update tenant-scoped por auth.tenantId guard arriba.
    const updated = await prisma.supplier.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (e) {
    logger.error("[suppliers/id] PATCH error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    await SuppliersDB.delete(auth.tenantId, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[suppliers/id] DELETE error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
