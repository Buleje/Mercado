import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCartToken } from "@/lib/auth/cart-token";

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
function authorize(req: NextRequest, rawPhone: string): string | null {
  const clean = rawPhone.replace(/\D/g, "");
  if (clean.length < 6) return null;
  const tenantId = req.cookies.get("active-tenant")?.value ?? "main";
  const token = req.nextUrl.searchParams.get("token");
  if (!verifyCartToken(tenantId, clean, token)) return null;
  return clean;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> },
) {
  const { phone } = await params;
  const clean = authorize(req, phone);
  if (!clean) return notFound();

  const saved = await prisma.savedCart.findUnique({
    where: { customerPhone: clean },
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
  const { phone } = await params;
  const clean = authorize(req, phone);
  if (!clean) return notFound();

  const body = await req.json();
  const items = body.items;
  if (!Array.isArray(items)) {
    return NextResponse.json({ error: "Invalid items" }, { status: 400 });
  }

  // If empty cart, delete the saved cart
  if (items.length === 0) {
    await prisma.savedCart.deleteMany({ where: { customerPhone: clean } });
    return NextResponse.json({ ok: true });
  }

  // Derive tenantId from cookie set by middleware (public endpoint — best-effort)
  const tenantId = req.cookies.get("active-tenant")?.value ?? "main";
  await prisma.savedCart.upsert({
    where: { customerPhone: clean },
    update: { itemsJson: JSON.stringify(items) },
    create: { customerPhone: clean, itemsJson: JSON.stringify(items), tenantId },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> },
) {
  const { phone } = await params;
  const clean = authorize(req, phone);
  if (!clean) return notFound();

  await prisma.savedCart.deleteMany({ where: { customerPhone: clean } });
  return NextResponse.json({ ok: true });
}
