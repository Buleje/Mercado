import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCartToken } from "@/lib/auth/cart-token";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * GET    /api/cart/[phone]?token=...  — Retrieve saved cart for a customer
 * PUT    /api/cart/[phone]?token=...  — Save/update cart for a customer
 * DELETE /api/cart/[phone]?token=...  — Clear saved cart
 *
 * Access control (RED-009): the caller is anonymous but must prove
 * ownership of the phone by presenting an HMAC-SHA256 token generated
 * server-side via `signCartToken(phone)`. Any auth failure returns 404
 * (not 401/403) to avoid an existence oracle on phone numbers.
 */

function notFound(): NextResponse {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

/**
 * Validate the phone param and the `?token=` query string. Returns the
 * normalized phone on success or null on any auth/shape failure. Callers
 * must translate a null result into a 404 response.
 *
 * tenantId is read from the `active-tenant` cookie set by middleware —
 * the same value that was in scope when the token was originally signed.
 */
function authorize(req: NextRequest, rawPhone: string): { phone: string; tenantId: string } | null {
  const clean = rawPhone.replace(/\D/g, "");
  if (clean.length < 6) return null;
  const tenantId = req.cookies.get("active-tenant")?.value ?? "main";
  const token = req.nextUrl.searchParams.get("token");
  if (!verifyCartToken(tenantId, clean, token)) return null;
  // Round 23: devolver tenantId junto con phone — los handlers ahora lo usan
  // en el where para prevenir cross-tenant cart leak (Security Pentester P1).
  return { phone: clean, tenantId };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> },
) {
  const { phone } = await params;
  const ctx = authorize(req, phone);
  if (!ctx) return notFound();

  // Round 23 (Security Pentester P1): findFirst con tenantId previene leak
  // cross-tenant si el mismo phone aparece en 2 tenants (deuda P0-2 mientras
  // SavedCart.customerPhone siga siendo @unique global en lugar de compuesto).
  const saved = await prisma.savedCart.findFirst({
    where: { customerPhone: ctx.phone, tenantId: ctx.tenantId },
  });

  if (!saved) return NextResponse.json({ items: [] });

  try {
    const items = JSON.parse(saved.itemsJson);
    return NextResponse.json({ items, updatedAt: saved.updatedAt });
  } catch {
    return NextResponse.json({ items: [] });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> },
) {
  const _rl = await applyRateLimit(req, "STRICT", "cart-X"); if (_rl) return _rl;
  const { phone } = await params;
  const ctx = authorize(req, phone);
  if (!ctx) return notFound();

  const body = await req.json();
  const items = body.items;
  if (!Array.isArray(items)) {
    return NextResponse.json({ error: "Invalid items" }, { status: 400 });
  }

  // Round 23: deleteMany con tenantId garantiza no tocar cart del mismo phone
  // en otro tenant (defense-in-depth con HMAC token + tenantId scope).
  if (items.length === 0) {
    await prisma.savedCart.deleteMany({
      where: { customerPhone: ctx.phone, tenantId: ctx.tenantId },
    });
    return NextResponse.json({ ok: true });
  }

  // Round 23: como customerPhone aún es @unique global, no podemos hacer
  // upsert por (phone, tenantId). Estrategia: deleteMany del phone en este
  // tenant + create. Atómica suficiente para este flujo (cliente tiene HMAC).
  await prisma.savedCart.deleteMany({
    where: { customerPhone: ctx.phone, tenantId: ctx.tenantId },
  });
  await prisma.savedCart.create({
    data: { customerPhone: ctx.phone, itemsJson: JSON.stringify(items), tenantId: ctx.tenantId },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> },
) {
  const _rl = await applyRateLimit(req, "STRICT", "cart-X"); if (_rl) return _rl;
  const { phone } = await params;
  const ctx = authorize(req, phone);
  if (!ctx) return notFound();

  await prisma.savedCart.deleteMany({
    where: { customerPhone: ctx.phone, tenantId: ctx.tenantId },
  });
  return NextResponse.json({ ok: true });
}
