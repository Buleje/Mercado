import { NextRequest, NextResponse } from "next/server";
import { assertCsrf } from "@/lib/auth/csrf";
import { withApiHandler } from "@/lib/api-handler";
import { createDistributedRateLimiter, getClientIp } from "@/lib/rate-limit";
import { crearParTv } from "@/lib/camaras/tv-emparejar.server";

/**
 * POST /api/tv/emparejar — SIN sesión (ADR-473). El televisor pide un código
 * para mostrar en pantalla. Respuesta `TvEmparejarRespuesta`
 * `{ codigo, secreto, expiraEn }`: el código se dicta, el secreto NO sale del
 * TV (lo usa para preguntar el estado).
 *
 * Cupo estricto por IP y compartido entre instancias (10 cada 10 min): cada
 * código ocupa una llave en Redis y no hace falta más de uno por TV.
 * El CSRF lo pide igual que cualquier POST: `/tv` siembra la cookie.
 */
const limite = createDistributedRateLimiter({ key: "tv:emparejar", maxRequests: 10, windowMs: 10 * 60_000 });

export const POST = withApiHandler("tv-emparejar", async (req: NextRequest) => {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  if (!(await limite.check(getClientIp(req)))) {
    return NextResponse.json(
      { error: "rate_limited", message: "Se pidieron demasiados códigos. Espera unos minutos." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limite.windowMs / 1000)) } },
    );
  }
  const par = await crearParTv();
  if (!par) {
    return NextResponse.json(
      { error: "sin_codigo", message: "No se pudo generar un código. Vuelve a intentarlo." },
      { status: 503 },
    );
  }
  return NextResponse.json(par, { status: 201, headers: { "Cache-Control": "no-store" } });
});
