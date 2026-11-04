import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/require-admin";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { applyRateLimit } from "@/lib/rate-limit";
import { consultarInfractores } from "@/lib/integrations/serfor-infractores";

// ── GET /api/admin/forestal/serfor-infractores?doc=20603533811&nombre=…&codigo=… ──
// ¿El titular figura en el Registro Nacional de Infractores de SERFOR? Lista
// pública (datos abiertos); se busca en la memoria del servidor, no se envía
// el documento ni el nombre a ningún lado, y no se lee ni escribe nada del negocio.

const texto = (max: number) =>
  z
    .string()
    .max(max, "Demasiado largo")
    .transform((s) => s.trim())
    .optional();

const consulta = z
  .object({ doc: texto(20), nombre: texto(160), codigo: texto(60) })
  .refine((q) => Boolean(q.doc || q.nombre || q.codigo), { message: "Falta el RUC/DNI, el nombre o el código del permiso" });

export async function GET(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req, "MODERATE", "forestal-serfor-infractores");
  if (rateLimitResponse) return rateLimitResponse;

  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
    if (auth instanceof NextResponse) return auth;

    const sp = req.nextUrl.searchParams;
    const leido = consulta.safeParse({
      doc: sp.get("doc") ?? undefined,
      nombre: sp.get("nombre") ?? undefined,
      codigo: sp.get("codigo") ?? undefined,
    });
    if (!leido.success) {
      return NextResponse.json({ error: leido.error.issues[0]?.message ?? "Parámetros inválidos" }, { status: 400 });
    }

    const resumen = await consultarInfractores({
      documento: leido.data.doc,
      nombre: leido.data.nombre,
      codigo: leido.data.codigo,
    });
    if (!resumen) {
      return NextResponse.json({ error: "SERFOR no respondió; prueba en unos minutos" }, { status: 503 });
    }
    return NextResponse.json({ data: resumen });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
