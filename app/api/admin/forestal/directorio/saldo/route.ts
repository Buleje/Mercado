import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { ForestCuentaDB } from "@/lib/db/forest-cuenta.db";
import { ParteNoEncontradaError } from "@/lib/db/forest-parte-tarifa.db";

/**
 * GET /api/admin/forestal/directorio/saldo?parteId= → `SaldoConsolidado` (ADR-430).
 *
 * El saldo de la cuenta de una parte y, al lado, el de cada parte vinculada.
 * Sólo lectura: nunca mezcla libretas — cada deuda sigue en su cuenta.
 *
 * Errores: 400 sin `parteId` · 403 rol/módulo · 404 la parte no es de este tenant.
 * Leer: admin/owner/almacenero/manager, como la cuenta corriente.
 * Guard: `spec:forestal:ctp-libro` · rate limit GENEROUS bucket 'ctp'.
 */

/* La LECTURA va en su propio balde («ctp-ficha»): el balde «ctp» lo comparten
   76 rutas del libro, y abrir unas 10 fichas seguidas lo agotaba (429 medido
   en el navegador el 22-09). Las escrituras siguen en «ctp». */
export const GET = withApiHandler("forestal-directorio-saldo-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner", "almacenero", "manager"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp-ficha");
  if (rl) return rl;
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"))) {
    return NextResponse.json(
      { error: "specialization_disabled", message: "El módulo CTP no está habilitado para este tenant." },
      { status: 403 },
    );
  }

  const parteId = (req.nextUrl.searchParams.get("parteId") ?? "").trim();
  if (!parteId) {
    return NextResponse.json({ error: "missing_parteId", message: "Falta decir de qué parte." }, { status: 400 });
  }
  try {
    return NextResponse.json(await ForestCuentaDB.saldoConsolidado(auth.tenantId, parteId));
  } catch (err) {
    if (err instanceof ParteNoEncontradaError) {
      return NextResponse.json({ error: "not_found", message: err.message }, { status: 404 });
    }
    logger.error("[directorio.saldo.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
