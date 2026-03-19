export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from "next/server";
import { LoyaltyDB, normalizePhone } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { z } from "zod";

// -- GET /api/loyalty/[phone] -- public, rate-limited -------------------------
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  const ip = getClientIp(req);
  const { allowed } = rateLimit(`loyalty-get:${ip}`, 60, 60);
  if (!allowed) return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });

  const { phone } = await params;
  try {
    const data = await LoyaltyDB.getByPhone(normalizePhone(phone));
    if (!data) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    return NextResponse.json({ ...data, tiers: LoyaltyDB.TIERS });
  } catch (e) {
    console.error("[loyalty] GET error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

const AdjustSchema = z.object({
  points: z.number().int().refine((n) => n !== 0, "points must be non-zero"),
  reason: z.string().max(200).optional(),
});

// -- PATCH /api/loyalty/[phone] -- admin only, manual point adjustment --------
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { phone } = await params;
  let raw: unknown;
  try { raw = await req.json(); } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const parsed = AdjustSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos invalidos", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 }
    );
  }

  try {
    const normalized = normalizePhone(phone);
    const { points } = parsed.data;
    if (points > 0) {
      const result = await LoyaltyDB.accruePoints(normalized, points);
      if (!result) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
      return NextResponse.json(result);
    } else {
      const ok = await LoyaltyDB.redeemPoints(normalized, Math.abs(points));
      if (!ok) return NextResponse.json({ error: "Puntos insuficientes" }, { status: 422 });
      const data = await LoyaltyDB.getByPhone(normalized);
      return NextResponse.json(data);
    }
  } catch (e) {
    console.error("[loyalty] PATCH error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
