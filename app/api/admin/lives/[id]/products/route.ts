import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { LiveSessionsDB } from "@/lib/db/live-sessions.db";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

const AddProductBody = z.object({
  productId: z.number().int().min(1),
  featuredOrder: z.number().int().min(0).optional(),
});

const HighlightBody = z.object({
  productId: z.number().int().min(1),
});

/**
 * POST /api/admin/lives/[id]/products — agrega un producto destacado a la live.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const _rl = await applyRateLimit(req, "MODERATE", "admin-lives-X-products"); if (_rl) return _rl;
  const auth = await requireAdmin(req, [
    "admin",
    "tienda_owner",
    "owner",
    "manager",
  ]);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = AddProductBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const { id } = await params;
    const product = await LiveSessionsDB.addProductToLive(
      auth.tenantId,
      id,
      parsed.data.productId,
      parsed.data.featuredOrder,
    );
    return NextResponse.json({ data: product }, { status: 201 });
  } catch (err) {
    logger.error("[api/admin/lives/products] POST failed", { err: String(err) });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/lives/[id]/products — marca un producto como "destacado ahora".
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const _rl = await applyRateLimit(req, "MODERATE", "admin-lives-X-products"); if (_rl) return _rl;
  const auth = await requireAdmin(req, [
    "admin",
    "tienda_owner",
    "owner",
    "manager",
  ]);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = HighlightBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const { id } = await params;
    await LiveSessionsDB.highlightProduct(
      auth.tenantId,
      id,
      parsed.data.productId,
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[api/admin/lives/products] PATCH failed", { err: String(err) });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
