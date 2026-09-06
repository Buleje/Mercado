import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { resolveTenantIdForRoute } from "@/lib/resolve-tenant";
import { JuntasDB } from "@/lib/db/juntas.db";
import { customerPhoneFromReq } from "@/lib/junta/customer";

const CreateSchema = z.object({
  zoneLabel: z.string().min(1).max(80),
  productLabel: z.string().max(120).optional(),
  targetMembers: z.number().int().min(2).max(12).optional(),
  windowHours: z.number().int().min(1).max(72).optional(),
});

/** POST /api/juntas — arma una junta (el iniciador queda como primer miembro). */
export async function POST(req: NextRequest): Promise<Response> {
  const limited = applyRateLimit(req, "STRICT", "juntas-create");
  if (limited) return limited;

  const tenantId = await resolveTenantIdForRoute(req);
  const phone = await customerPhoneFromReq(req);
  if (!phone) {
    return NextResponse.json(
      { error: "Inicia sesión para armar una junta" },
      { status: 401 },
    );
  }

  const raw = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const windowHours = parsed.data.windowHours ?? 24;
  const windowEnd = new Date(Date.now() + windowHours * 3600 * 1000);
  const junta = await JuntasDB.create(tenantId, {
    initiatorId: phone,
    zoneLabel: parsed.data.zoneLabel,
    productLabel: parsed.data.productLabel,
    targetMembers: parsed.data.targetMembers,
    windowEnd,
  });
  return NextResponse.json({ code: junta.code, junta });
}

/** GET /api/juntas?zone=Centro — juntas OPEN vigentes en una zona (strip home). */
export async function GET(req: NextRequest): Promise<Response> {
  const limited = applyRateLimit(req, "GENEROUS", "juntas-list");
  if (limited) return limited;

  const tenantId = await resolveTenantIdForRoute(req);
  const zone = req.nextUrl.searchParams.get("zone")?.trim();

  // Sin zona → juntas abiertas del tenant (cualquier zona), para el strip del
  // home. Con zona → solo las de esa zona.
  const juntas = zone
    ? await JuntasDB.listOpenByZone(tenantId, zone)
    : await JuntasDB.listOpenRecent(tenantId);
  return NextResponse.json({ juntas });
}
