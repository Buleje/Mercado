/**
 * GET/POST /api/store-page/discounts — stub de descuentos de tienda.
 *
 * TODO(ADR-pending): migrar a DB real con Prisma (StorePageDiscount).
 * Devuelve array vacio para silenciar 404 en AdminStorePageTab.
 */
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json([], {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    return NextResponse.json(
      { ok: true, stub: true, received: body },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
