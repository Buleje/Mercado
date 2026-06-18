import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { resolveTenantIdForRoute } from "@/lib/resolve-tenant";
import { JuntasDB } from "@/lib/db/juntas.db";
import { customerPhoneFromReq } from "@/lib/junta/customer";
import { normalizePhone } from "@/lib/db/misc.db";

/** Body de invitado: solo el WhatsApp (la junta es de barrio, sin cuenta). */
const guestJoinSchema = z.object({ phone: z.string().min(6).max(20) });

/** Móvil peruano normalizado: 9 dígitos que empiezan en 9. */
const PE_MOBILE = /^9\d{8}$/;

/**
 * POST /api/juntas/[code]/join — un vecino se suma a la junta.
 * Si hay sesión usa su teléfono; si no, acepta el WhatsApp del invitado para
 * que cualquier vecino del barrio pueda sumarse sin crear cuenta.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  const limited = applyRateLimit(req, "STRICT", "juntas-join");
  if (limited) return limited;

  const tenantId = await resolveTenantIdForRoute(req);

  let phone = await customerPhoneFromReq(req);
  if (!phone) {
    const body = await req.json().catch(() => null);
    const parsed = guestJoinSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ingresa tu WhatsApp para sumarte" },
        { status: 400 },
      );
    }
    const candidate = normalizePhone(parsed.data.phone);
    if (!PE_MOBILE.test(candidate)) {
      return NextResponse.json(
        { error: "Pon un número de WhatsApp válido (9 dígitos)" },
        { status: 400 },
      );
    }
    phone = candidate;
  }

  const { code } = await params;
  try {
    const junta = await JuntasDB.join(tenantId, code, phone);
    return NextResponse.json({ junta });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al unirse";
    const status = /no encontrada/i.test(msg)
      ? 404
      : /venció/i.test(msg)
        ? 400
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
