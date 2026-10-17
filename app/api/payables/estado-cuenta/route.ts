import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { withDbRetry } from "@/lib/db-retry";
import { logger } from "@/lib/logger";
import { limaDateKey } from "@/lib/utils";
import { CuentasPorPagarDB } from "@/lib/db/cuentas-por-pagar.db";

const Query = z.object({
  proveedor: z.string().min(1).max(100),
  corte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * GET /api/payables/estado-cuenta?proveedor=<id>&corte=AAAA-MM-DD — cargos,
 * abonos y saldo con UN proveedor a la fecha de corte (C48). Lo arma el
 * servidor (sin caché) para que el archivo que se descarga sea reproducible y
 * sólo traiga las cuentas de ese proveedor. Mismo permiso que la lista.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const parsed = Query.safeParse({ proveedor: sp.get("proveedor") ?? "", corte: sp.get("corte") || undefined });
  if (!parsed.success) return NextResponse.json({ error: "Elige el proveedor y una fecha de corte válida." }, { status: 400 });
  const corte = parsed.data.corte ?? limaDateKey();
  try {
    const estado = await withDbRetry(() => CuentasPorPagarDB.estadoDeCuenta(auth.tenantId, parsed.data.proveedor, corte));
    if (!estado) return NextResponse.json({ error: "No encontramos ese proveedor." }, { status: 404 });
    return NextResponse.json(estado);
  } catch (e) {
    logger.error("[payables/estado-cuenta] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo armar el estado de cuenta." }, { status: 503 });
  }
}
