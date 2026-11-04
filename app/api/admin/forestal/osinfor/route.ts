import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/require-admin";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { applyRateLimit } from "@/lib/rate-limit";
import { consultarOsinfor } from "@/lib/integrations/osinfor";
import { codigoConsultable } from "@/lib/forestal/osinfor-supervisiones";

// ── GET /api/admin/forestal/osinfor?codigo=25-PUC/C-J-058-03 ──
// Qué publica OSINFOR de un permiso: lista roja/verde y proceso sancionador.
// Dato público (mapa de OSINFOR); no lee ni escribe nada del negocio.

const consulta = z.object({
  codigo: z.string().min(3, "Falta el código del permiso").max(60, "Código demasiado largo"),
});

export async function GET(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req, "MODERATE", "forestal-osinfor");
  if (rateLimitResponse) return rateLimitResponse;

  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
    if (auth instanceof NextResponse) return auth;

    const leido = consulta.safeParse({ codigo: req.nextUrl.searchParams.get("codigo") ?? "" });
    if (!leido.success) {
      return NextResponse.json({ error: leido.error.issues[0]?.message ?? "Parámetros inválidos" }, { status: 400 });
    }
    if (!codigoConsultable(leido.data.codigo)) {
      return NextResponse.json(
        { error: "Ese código tiene caracteres que no son de un permiso (solo letras, números, - / .)" },
        { status: 400 },
      );
    }

    const resumen = await consultarOsinfor(leido.data.codigo);
    if (!resumen) {
      return NextResponse.json({ error: "OSINFOR no respondió; prueba en unos minutos" }, { status: 503 });
    }
    return NextResponse.json({ data: resumen });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
