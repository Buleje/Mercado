import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { SubscribeBodySchema } from "@/lib/validators/socio-buleje";
import { SocioBulejeDB } from "@/lib/db/socio-buleje.db";

/**
 * POST /api/socio-buleje/subscribe
 *
 * Activa una membership Socio Buleje para el usuario en el tenant actual.
 * Body: { plan: "monthly" | "yearly", userId }
 *
 * MVP demo: usa mock DB. Prod: crea Stripe subscription + persiste en Prisma.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = SubscribeBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const tenantId = req.headers.get("x-tenant-id") ?? "main";
    const { plan, userId } = parsed.data;
    const membership = await SocioBulejeDB.subscribe(tenantId, userId, plan);

    return NextResponse.json({ ok: true, membership });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
