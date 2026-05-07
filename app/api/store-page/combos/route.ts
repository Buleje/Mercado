/**
 * GET/POST /api/store-page/combos — stub de combos de tienda.
 *
 * TODO(ADR-pending): migrar a DB real con Prisma (StorePageCombo).
 * Por ahora devuelve array vacio para evitar 404 en AdminStorePageTab.
 */
import { NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";

export async function GET() {
  return NextResponse.json([], {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(req: Request) {
  const _rl = await applyRateLimit(req, "STRICT", "store-page-combos"); if (_rl) return _rl;
  try {
    const body = await req.json().catch(() => ({}));
    // stub: acusa recibo, no persiste
    return NextResponse.json(
      { ok: true, stub: true, received: body },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
