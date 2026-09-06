import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { consultarDocumento } from "@/lib/documento/lookup";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/documento/lookup?numero=XXXXXXXX
 *
 * Un solo número, el padrón que corresponda: 8 dígitos van a RENIEC, 11 a
 * SUNAT. La pantalla no tiene que saber a cuál se llamó.
 *
 * Es ADMIN-ONLY a propósito. Los endpoints sueltos de `/api/reniec/*` quedaron
 * abiertos por su caso de uso (alta pública de vendors), pero éste consulta
 * datos personales de terceros desde el panel: sin `requireAdmin` sería un
 * buscador de nombres por DNI para cualquiera que encuentre la URL — justo lo
 * que la Ley 29733 no perdona.
 */
const QuerySchema = z.object({
  numero: z.string().min(6).max(20),
});

export async function GET(req: NextRequest) {
  /* Rate limit ANTES de autenticar: los padrones cobran por consulta y el
     límite protege la cuota, no la sesión. */
  const rl = applyRateLimit(req, "MODERATE", "documento-lookup");
  if (rl) return rl;

  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const parsed = QuerySchema.safeParse({ numero: new URL(req.url).searchParams.get("numero") ?? "" });
  if (!parsed.success) {
    return NextResponse.json(
      { encontrado: false, numero: "", motivo: "Escribí 8 dígitos para un DNI u 11 para un RUC." },
      { status: 400 },
    );
  }

  try {
    /* Siempre 200: «no encontrado» es una respuesta válida de negocio, no un
       error de la petición. Un 404 acá haría que la pantalla mostrara «falló la
       consulta» cuando lo que pasó es que el número no existe. */
    return NextResponse.json(await consultarDocumento(parsed.data.numero));
  } catch (e) {
    logger.error("[documento/lookup] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json(
      { encontrado: false, numero: parsed.data.numero, motivo: "No se pudo consultar ahora. Cargá los datos a mano." },
      { status: 200 },
    );
  }
}
