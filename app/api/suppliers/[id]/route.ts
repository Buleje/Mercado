export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SuppliersDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";

const SupplierSchema = z.object({
  name: z.string().min(1, "name required").max(200),
  ruc: z.string().max(20).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().max(200).optional(),
  address: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    return NextResponse.json(await SuppliersDB.getAll());
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
  const supplier = SuppliersDB.add({
    id,
    name: data.name,
    ruc: data.ruc || undefined,
    phone: data.phone || undefined,
    email: data.email || undefined,
    address: data.address || undefined,
    notes: data.notes || undefined,
    createdAt: new Date().toISOString(),
  });
  return NextResponse.json(supplier, { status: 201 });
}
