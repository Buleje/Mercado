export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CustomersDB, normalizePhone } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";

const LocationSchema = z.object({
  id: z.string().min(1),
  location: z.string().min(1).max(500),
  reference: z.string().max(300),
});

const CustomerPostSchema = z.object({
  phone: z.string().min(6).max(20),
  name: z.string().min(1).max(100),
  location: z.string().max(500).optional(),
  reference: z.string().max(300).optional(),
  locations: z.array(LocationSchema).optional(),
  activeLocationId: z.string().nullable().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    return NextResponse.json(await CustomersDB.getAll());
  } catch (e) {
    console.error("[customers] GET error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  try {
    const raw = await req.json();
    const parsed = CustomerPostSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invÃ¡lidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }
    const body = parsed.data;
    const record = await CustomersDB.upsert({
      phone: normalizePhone(body.phone),
      name: body.name,
      location: body.location ?? "",
      reference: body.reference ?? "",
      locations: body.locations ?? [],
      activeLocationId: body.activeLocationId ?? null,
      loyaltyPoints: 0,
      loyaltyTier: "Nuevo",
      totalSpent: 0,
    });
    return NextResponse.json(record);
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
}
