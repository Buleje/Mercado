/**
 * GET /api/sales/resumen-hoy — «Hoy» del POS sumado en el servidor (2026-10-09).
 *
 * Antes la tira «Hoy» y el historial (F4) pedían `GET /api/sales?today=1&limit=1000`
 * y sumaban en el navegador: hasta 1.000 ventas con sus ítems para tres cifras.
 * Además `today=1` corta a la medianoche del SERVIDOR (UTC en Vercel = 19:00 de
 * Lima): las ventas de la noche caían en el «hoy» del día siguiente. Acá el día
 * es siempre el de Lima.
 *
 * Query: `dia=YYYY-MM-DD` (opcional, día de Lima; por defecto hoy; nunca futuro).
 * Roles: los mismos que la lista de ventas. Un cajero ve sólo SUS ventas
 * (misma regla que `GET /api/sales`), y entonces no recibe las devoluciones del local.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { RUTAS_PANEL } from "@/lib/auth/roles-rutas-panel";
import { logger } from "@/lib/logger";
import { withDbRetry } from "@/lib/db-retry";
import { SalesDB } from "@/lib/db/sales.db";
import { limaDateKey } from "@/lib/utils";

const QuerySchema = z.object({
  dia: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "dia debe ser YYYY-MM-DD")
    .refine((d) => !Number.isNaN(new Date(`${d}T00:00:00.000-05:00`).getTime()), "dia inválido")
    .optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, RUTAS_PANEL["/api/sales"]);
  if (auth instanceof NextResponse) return auth;

  const parsed = QuerySchema.safeParse({ dia: req.nextUrl.searchParams.get("dia") ?? undefined });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const hoy = limaDateKey();
  const dia = parsed.data.dia ?? hoy;
  // «YYYY-MM-DD» compara bien como texto.
  if (dia > hoy) {
    return NextResponse.json({ error: { dia: ["No hay ventas de un día que no llegó"] } }, { status: 400 });
  }

  try {
    const resumen = await withDbRetry(() =>
      SalesDB.resumenDelDia(auth.tenantId, {
        dia,
        cashierId: auth.role === "cajero" ? auth.username : undefined,
      }),
    );
    return NextResponse.json(resumen, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    logger.error("[sales/resumen-hoy] GET error", {
      err: e instanceof Error ? e.message : String(e),
      tenantId: auth.tenantId,
    });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
