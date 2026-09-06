import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestCtpDB } from "@/lib/db/forest-ctp.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { withApiHandler } from "@/lib/api-handler";
import { ctpErrorResponse, ctpValidationResponse } from "@/lib/forestal/ctp-api-errors";

/**
 * /api/admin/forestal/ctp/movimiento — el tablero de Control.
 *
 *   GET ?from=&to=            → el período que se pide
 *   GET ?from=&to=&comparar=1 → además, el período INMEDIATAMENTE anterior de
 *                               igual largo, para leer cada número contra algo
 *
 * Un total sin con qué compararlo no dice si el mes fue bueno; por eso la
 * comparación se sirve del mismo lado y no se arma en el navegador con una
 * segunda llamada que podría caer en otro rango.
 *
 * Guard: spec:forestal:ctp-libro · rate-limit GENEROUS bucket 'ctp'.
 */

const querySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  comparar: z.string().trim().max(4).optional(),
});

export const GET = withApiHandler("forestal-ctp-movimiento-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;

  const habilitado = await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro");
  if (!habilitado) {
    return NextResponse.json(
      { error: "specialization_disabled", message: "El módulo CTP no está habilitado para este tenant." },
      { status: 403 },
    );
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return ctpValidationResponse(parsed.error);
  const { from, to, comparar } = parsed.data;

  try {
    const actual = await ForestCtpDB.movimientoDelLibro(auth.tenantId, { fromDate: from, toDate: to });

    /* El período anterior sólo se puede calcular con los DOS extremos: sin
       ellos no hay largo que correr hacia atrás y devolver algo sería inventar
       una referencia. */
    let previo = null;
    if (comparar && from && to) {
      const largoMs = to.getTime() - from.getTime();
      const finPrevio = new Date(from.getTime() - 86_400_000);
      const iniPrevio = new Date(finPrevio.getTime() - largoMs);
      previo = (await ForestCtpDB.movimientoDelLibro(auth.tenantId, {
        fromDate: iniPrevio,
        toDate: finPrevio,
      })).totales;
    }

    return NextResponse.json({ movimiento: actual, previo });
  } catch (err) {
    return ctpErrorResponse(err, "ctp-movimiento.GET", auth.tenantId);
  }
});
