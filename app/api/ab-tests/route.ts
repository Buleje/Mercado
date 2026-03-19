export const dynamic = "force-dynamic";
import { NextResponse, type NextRequest } from "next/server";
import { ABTestDB } from "@/lib/ab-testing";
import { requireAdmin } from "@/lib/require-admin";

// GET: list all tests (admin) or get active tests (public with ?active=1)
export async function GET(req: NextRequest) {
  const active = req.nextUrl.searchParams.get("active");
  if (active === "1") {
    const tests = await ABTestDB.getActive();
    return NextResponse.json(tests);
  }
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const tests = await ABTestDB.getAll();
  return NextResponse.json(tests);
}

// POST: create a new A/B test (admin)
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { name, description, variants } = await req.json();
  if (!name?.trim() || !Array.isArray(variants) || variants.length < 2) {
    return NextResponse.json({ error: "name y al menos 2 variants requeridos" }, { status: 400 });
  }
  for (const v of variants) {
    if (!v.id || !v.label || typeof v.weight !== "number" || v.weight <= 0) {
      return NextResponse.json({ error: "Cada variant necesita id, label y weight > 0" }, { status: 400 });
    }
  }
  const test = await ABTestDB.create(name.trim(), description || "", variants);
  return NextResponse.json(test, { status: 201 });
}

// DELETE: delete a test (admin)
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  await ABTestDB.delete(id);
  return NextResponse.json({ ok: true });
}

// PATCH: toggle active state (admin)
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  await ABTestDB.toggle(id);
  return NextResponse.json({ ok: true });
}
