import { NextResponse, type NextRequest } from "next/server";
import { ABTestDB } from "@/lib/ab-testing";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { toErrorPayload } from "@/lib/api-error";
import { applyRateLimit } from "@/lib/rate-limit";

// GET: list all tests (admin) or get active tests (public with ?active=1)
export async function GET(req: NextRequest) {
  try {
    const active = req.nextUrl.searchParams.get("active");
    if (active === "1") {
      const tests = await ABTestDB.getActive();
      return NextResponse.json(tests);
    }
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;
    const tests = await ABTestDB.getAll();
    const filtered = tests.filter((t: any) => t.tenantId === auth.tenantId);
    return NextResponse.json(filtered);
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}

// POST: create a new A/B test (admin)
export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "ab-tests"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { name, description, variants } = await req.json();
    if (!name?.trim() || !Array.isArray(variants) || variants.length < 2) {
      return NextResponse.json({ error: "name y al menos 2 variants requeridos" }, { status: 400 });
    }
    for (const v of variants) {
      if (!v.id || !v.label || typeof v.weight !== "number" || v.weight <= 0) {
        return NextResponse.json({ error: "Cada variant necesita id, label y weight > 0" }, { status: 400 });
      }
    }
    const test = await ABTestDB.create(name.trim(), description || "", variants, auth.tenantId);
    return NextResponse.json(test, { status: 201 });
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}

// DELETE: delete a test (admin)
export async function DELETE(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "ab-tests"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
    
    // Verify tenantId before deletion (IDOR check)
    const test = await prisma.aBTest.findUnique({ where: { id } });
    if (!test || test.tenantId !== auth.tenantId) {
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    }
    
    await ABTestDB.delete(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}

// PATCH: toggle active state (admin)
export async function PATCH(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "ab-tests"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
    
    // Verify tenantId before toggle (IDOR check)
    const test = await prisma.aBTest.findUnique({ where: { id } });
    if (!test || test.tenantId !== auth.tenantId) {
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    }
    
    await ABTestDB.toggle(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}
