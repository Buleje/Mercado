import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { CtpInvariantError } from "@/lib/db/forest-ctp-consumo.db";
import {
  corridasReprocesables,
  origenesDeReproceso,
  setReprocesoOrigenes,
} from "@/lib/db/forest-ctp-reproceso.db";

/**
 * Reproceso — producto terminado que vuelve a la sierra (ADR-316).
 *
 * `GET  ?destinoEntryId=…`  → de qué corridas salió, y cuáles hay disponibles
 * `POST { destinoEntryId, lineas }` → atribuye el origen (valida I6)
 *
 * El saldo que se ofrece descuenta lo despachado Y lo ya reprocesado: es la
 * misma cuenta que valida el servidor, así que la lista no muestra madera que
 * después va a rechazar.
 */

const Body = z.object({
  destinoEntryId: z.string().trim().min(1).max(60),
  lineas: z
    .array(
      z.object({
        origenEntryId: z.string().trim().min(1).max(60),
        quantity: z.coerce.number().positive().max(9_999_999),
      }),
    )
    .max(50),
});

async function guard(req: NextRequest) {
  const rl = await applyRateLimit(req, "GENEROUS", "ctp:reproceso");
  if (rl) return { deny: rl };
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return { deny: auth };
  const ok = await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro");
  if (!ok) return { deny: NextResponse.json({ error: "specialization_disabled" }, { status: 403 }) };
  return { auth };
}

export async function GET(req: NextRequest) {
  try {
    const g = await guard(req);
    if (g.deny) return g.deny;
    const destinoEntryId = req.nextUrl.searchParams.get("destinoEntryId")?.trim() || undefined;

    const [disponibles, origenes] = await Promise.all([
      corridasReprocesables(g.auth.tenantId, destinoEntryId),
      destinoEntryId ? origenesDeReproceso(g.auth.tenantId, destinoEntryId) : Promise.resolve([]),
    ]);

    return NextResponse.json({
      disponibles,
      origenes: origenes.map((o) => ({
        origenEntryId: o.origenEntryId,
        quantity: Number(o.quantity),
        lineNo: o.origen.lineNo,
        fecha: o.origen.entryDate.toISOString(),
        productType: o.origen.productType,
        speciesCommon: o.origen.speciesCommon,
        unit: o.origen.unit,
        codigoRaiz: o.origen.codigoRaiz,
      })),
    });
  } catch (e) {
    logger.error("[ctp.reproceso GET] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const g = await guard(req);
    if (g.deny) return g.deny;

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
    }

    const r = await setReprocesoOrigenes(
      g.auth.tenantId,
      parsed.data.destinoEntryId,
      parsed.data.lineas,
      g.auth.username ?? "unknown",
    );
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof CtpInvariantError) {
      return NextResponse.json({ error: e.code, message: e.message, detail: e.detail }, { status: 409 });
    }
    logger.error("[ctp.reproceso POST] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
