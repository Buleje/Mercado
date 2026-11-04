import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/require-admin";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { applyRateLimit } from "@/lib/rate-limit";
import { hoyLima, tipoCambioDelDia } from "@/lib/integrations/tipo-cambio";

// ── GET /api/admin/tipo-cambio?fecha=2026-11-04 — dólar que SUNAT publica para esa fecha ──
// Dato público (SUNAT / BCRP): cualquier rol del panel puede leerlo; sin tenant.

const consulta = z.object({
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "fecha en formato AAAA-MM-DD")
    .optional(),
});

export async function GET(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req, "MODERATE", "tipo-cambio");
  if (rateLimitResponse) return rateLimitResponse;

  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const leido = consulta.safeParse({ fecha: req.nextUrl.searchParams.get("fecha") ?? undefined });
    if (!leido.success) {
      return NextResponse.json({ error: leido.error.issues[0]?.message ?? "Parámetros inválidos" }, { status: 400 });
    }
    const fecha = leido.data.fecha ?? hoyLima();
    if (fecha > hoyLima()) {
      return NextResponse.json({ error: "Todavía no hay tipo de cambio para una fecha futura" }, { status: 400 });
    }

    const tc = await tipoCambioDelDia(fecha);
    if (!tc) {
      return NextResponse.json(
        { error: "SUNAT y el BCRP no respondieron; escribe el tipo de cambio a mano" },
        { status: 503 },
      );
    }
    return NextResponse.json({ data: tc });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
