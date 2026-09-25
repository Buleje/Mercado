import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { isSpecializationEnabled } from "@/lib/specializations";
import { produccionSinLoteSchema } from "@/lib/forestal/declarar-produccion";
import { ESTADO_HTTP, ProduccionSinLoteError } from "@/lib/forestal/produccion-sin-lote";
import { ctpErrorResponse, ctpValidationResponse } from "@/lib/forestal/ctp-api-errors";
import { ForestCtpSinLoteDB } from "@/lib/db/forest-ctp-sin-lote.db";

/**
 * POST /api/admin/forestal/ctp/produccion-sin-lote — declarar producción sin
 * lote en UN pedido (ADR-429): una corrida por especie, todas o ninguna, y el
 * cobro del aserrío al tercero después.
 *
 * Sólo admin/owner (manager entra por el bypass de gestión de `requireAdmin`):
 * escribe el libro Y carga plata en la cuenta de un tercero. El almacenero, que
 * sí registra en el POST del libro, no llegaba al PATCH que declara y dejaba
 * corridas vacías; acá no entra.
 *
 * 201 `ProduccionSinLoteRespuesta` · 400 pedido mal armado · 404 la cuenta no
 * existe · 409 posible duplicado o código de paquete ya usado · 422 el dato no
 * cuadra (PT contra escuadría, especie, mes cerrado). Los errores del negocio
 * van `{ error: <código>, message, detail? }`, como el resto del libro.
 */
export const POST = withApiHandler("forestal-ctp-produccion-sin-lote", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  /* Además del de `proxy.ts`: carga deuda en la cuenta de un tercero. */
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"))) {
    return NextResponse.json(
      { error: "specialization_disabled", message: "El módulo CTP no está habilitado para este tenant." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json", message: "El pedido no es JSON." }, { status: 400 });
  }
  const parsed = produccionSinLoteSchema.safeParse(body);
  if (!parsed.success) return ctpValidationResponse(parsed.error);

  try {
    const respuesta = await ForestCtpSinLoteDB.producirSinLote(
      auth.tenantId,
      parsed.data,
      auth.username ?? "unknown",
    );
    return NextResponse.json(respuesta, { status: 201 });
  } catch (err) {
    if (err instanceof ProduccionSinLoteError) {
      return NextResponse.json(
        { error: err.code, message: err.message, ...(err.detail ? { detail: err.detail } : {}) },
        { status: ESTADO_HTTP[err.code] },
      );
    }
    /* Mes cerrado y demás invariantes del libro → 422 con su motivo; el resto,
       500 al log sin filtrar la base. */
    return ctpErrorResponse(err, "ctp.produccion-sin-lote", auth.tenantId);
  }
});
