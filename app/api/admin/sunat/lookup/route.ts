import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { applyRateLimit } from "@/lib/rate-limit";
import { consultarRUC, consultarDNI } from "@/lib/integrations/sunat-nubefact";

// ── GET /api/admin/sunat/lookup?tipo=ruc&numero=20... — consultar RUC/DNI ──

export async function GET(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req, "MODERATE", "sunat-lookup");
  if (rateLimitResponse) return rateLimitResponse;

  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin", "cajero"]);
    if (auth instanceof NextResponse) return auth;

    const url = new URL(req.url);
    const tipo = url.searchParams.get("tipo"); // ruc | dni
    const numero = url.searchParams.get("numero");

    if (!tipo || !numero || !["ruc", "dni"].includes(tipo)) {
      return NextResponse.json({ error: "Parámetros inválidos: tipo (ruc|dni) y numero requeridos" }, { status: 400 });
    }

    if (tipo === "ruc" && !/^\d{11}$/.test(numero)) {
      return NextResponse.json({ error: "RUC debe tener 11 dígitos" }, { status: 400 });
    }
    if (tipo === "dni" && !/^\d{8}$/.test(numero)) {
      return NextResponse.json({ error: "DNI debe tener 8 dígitos" }, { status: 400 });
    }

    const result = tipo === "ruc"
      ? await consultarRUC(numero)
      : await consultarDNI(numero);

    if (!result) {
      return NextResponse.json({ error: `No se encontró información para el ${tipo.toUpperCase()} proporcionado` }, { status: 404 });
    }

    return NextResponse.json({ data: result });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
