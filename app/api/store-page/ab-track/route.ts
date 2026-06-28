import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { abIncr } from "@/lib/store-page/ab-store";

/**
 * POST /api/store-page/ab-track — beacon PÚBLICO del A/B test del hero (audit #13).
 * Lo llama el visitante (con cookie csrf-token, que proxy.ts setea en cada
 * respuesta) al ver el hero y al clickear un CTA. Sin auth (es un visitante),
 * pero rate-limited y con enums estrictos para no inflar claves. Suma 1 contador.
 */
const Body = z.object({
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/i),
  variant: z.enum(["A", "B"]),
  event: z.enum(["view", "click"]),
});

export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "MODERATE", "ab-track");
  if (rl) return rl;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const { slug, variant, event } = parsed.data;
  await abIncr(slug, variant, event).catch((err) => { console.warn("[ab-track] incr", err); });
  return new NextResponse(null, { status: 204 });
}
