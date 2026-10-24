import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { reprocesosDeclarados } from "@/lib/db/forest-ctp-reproceso.db";

/**
 * Los reprocesos que la planta YA declaró (ADR-316 · ADR-407).
 *
 * `GET ?from&to` → una fila por reproceso, con sus corridas de origen. Los
 * parámetros son los MISMOS del resto del libro (`lib/forestal/ctp-period.ts`,
 * instantes ISO): un período que se escribe distinto en cada endpoint termina
 * mostrando meses distintos en dos pantallas del mismo libro.
 *
 * La merma y el juicio sobre la conversión se derivan en el cliente con
 * `lib/forestal/reprocesos-declarados.ts` — el mismo módulo puro que se testea
 * sin base.
 *
 * Sólo lectura: registrar un reproceso sigue siendo el POST de `../reproceso`.
 */

const Query = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limite: z.coerce.number().int().min(1).max(1000).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const rl = await applyRateLimit(req, "GENEROUS", "ctp:reproceso-declarados");
    if (rl) return rl;
    const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
    if (auth instanceof NextResponse) return auth;
    const ok = await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro");
    if (!ok) return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });

    const sp = req.nextUrl.searchParams;
    const parsed = Query.safeParse({
      from: sp.get("from") ?? undefined,
      to: sp.get("to") ?? undefined,
      limite: sp.get("limite") ?? undefined,
    });
    /* Un período ilegible NO es un 400: el resto del libro lo trata como «sin
       límite» y dos criterios distintos para el mismo parámetro dejan una
       pantalla vacía donde la de al lado muestra el histórico. */
    const reprocesos = await reprocesosDeclarados(auth.tenantId, {
      desde: parsed.success ? parsed.data.from : undefined,
      hasta: parsed.success ? parsed.data.to : undefined,
      limite: parsed.success ? parsed.data.limite : undefined,
    });

    return NextResponse.json({ reprocesos });
  } catch (e) {
    logger.error("[ctp.reproceso-declarados GET] error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
