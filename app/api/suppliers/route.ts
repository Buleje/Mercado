export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SuppliersDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";

const SupplierSchema = z.object({
  name: z.string().min(1, "name required").max(200),
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
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    return NextResponse.json(await SuppliersDB.getAll(auth.tenantId));
  } catch (e) {
    console.error("[suppliers] GET error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const raw = await req.json();
  const parsed = SupplierSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  const data = parsed.data;
  const id = `sup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  // Create using prisma directly to include all new fields
  const supplier = await prisma.supplier.create({
    data: {
      id,
      name: data.name,
      ruc: data.ruc || null,
      phone: data.phone || null,
      email: data.email || null,
      address: data.address || null,
      notes: data.notes || null,
      tipoPersona: data.tipoPersona || null,
      tipoDocumento: data.tipoDocumento || null,
      documento: data.documento || null,
      razonSocial: data.razonSocial || null,
      estado: data.estado || 'activo',
      whatsappSecundario: data.whatsappSecundario || null,
      personaContacto: data.personaContacto || null,
      departamento: data.departamento || null,
      provincia: data.provincia || null,
      distrito: data.distrito || null,
      direccion: data.direccion || null,
      categoria: data.categoria || null,
      condicionPago: data.condicionPago || null,
      diasCredito: data.diasCredito || 0,
      cuentaBancaria: data.cuentaBancaria || null,
      banco: data.banco || null,
      observaciones: data.observaciones || null,
    },
  });
  return NextResponse.json(supplier, { status: 201 });
}
