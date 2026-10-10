import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { CacaoDB } from "@/lib/db/cacao.db";
import { CacaoCierreDB } from "@/lib/db/cacao-cierre.db";
import { monthRange, type CacaoCierrePeriodo } from "@/lib/cacao/cacao-cierre-types";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/cacao/cierre — cierre de período del acopio de cacao (ADR-303).
 * GET → períodos cerrados. POST {action:"cerrar",year,month} (admin/owner) congela
 * el acta + snapshot de stock + bloquea el mes. POST {action:"reabrir",periodKey,motivo}.
 */

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cerrar"), year: z.number().int().min(2000).max(2100), month: z.number().int().min(1).max(12) }),
  z.object({ action: z.literal("reabrir"), periodKey: z.string().trim().regex(/^\d{4}-\d{2}$/), motivo: z.string().trim().min(3).max(500) }),
]);

async function guard(req: NextRequest, roles: ("admin" | "almacenero" | "owner")[]) {
  const auth = await requireAdmin(req, roles);
  if (auth instanceof NextResponse) return { res: auth as NextResponse };
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:agricola:cacao-acopio"))) {
    return { res: NextResponse.json({ error: "specialization_disabled" }, { status: 403 }) };
  }
  return { auth };
}

export const GET = withApiHandler("cacao-cierre-list", async (req: NextRequest) => {
  const g = await guard(req, ["admin", "almacenero", "owner"]);
  if (g.res) return g.res;
  return NextResponse.json({ cierres: await CacaoCierreDB.list(g.auth.tenantId) });
});

export const POST = withApiHandler("cacao-cierre", async (req: NextRequest) => {
  const g = await guard(req, ["admin", "owner"]);
  if (g.res) return g.res;
  const auth = g.auth;

  const rl = await applyRateLimit(req, "STRICT", "cacao-cierre");
  if (rl) return rl;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });

  const user = auth.username ?? "unknown";

  if (parsed.data.action === "reabrir") {
    const cierre = await CacaoCierreDB.findByKey(auth.tenantId, parsed.data.periodKey);
    if (!cierre) return NextResponse.json({ error: "not_found", message: "Ese período no está cerrado." }, { status: 404 });
    if (cierre.reabierto) return NextResponse.json({ error: "already_reopened", message: "El período ya está reabierto." }, { status: 409 });
    return NextResponse.json({ ok: true, cierres: await CacaoCierreDB.reabrir(auth.tenantId, parsed.data.periodKey, parsed.data.motivo, user) });
  }

  const { year, month } = parsed.data;
  const { from, to, periodKey, label } = monthRange(year, month - 1);
  if (from.getTime() > Date.now()) return NextResponse.json({ error: "future_period", message: "No se puede cerrar un mes que todavía no empezó." }, { status: 400 });
  const existente = await CacaoCierreDB.findByKey(auth.tenantId, periodKey);
  if (existente && !existente.reabierto) return NextResponse.json({ error: "already_closed", message: `El período ${label} ya está cerrado.` }, { status: 409 });

  // Snapshot = acumulado hasta fin de mes (apertura del mes siguiente).
  const snap = await CacaoDB.movimientosPeriodo(auth.tenantId, { to });
  // Movimientos del propio mes (para el acta).
  const mes = await CacaoDB.movimientosPeriodo(auth.tenantId, { from, to });

  const cierre: CacaoCierrePeriodo = {
    periodKey, from: from.toISOString(), to: to.toISOString(), label,
    closedAt: new Date().toISOString(), closedBy: user,
    snapshot: { stockKg: snap.stockKg, acopioKg: snap.acopioKg, ventasKg: snap.ventasKg, mermasKg: snap.mermasKg, pagadoProductores: snap.pagadoProductores, cobradoVentas: snap.cobradoVentas, porGrado: snap.porGrado },
    totales: { lotes: mes.lotes, acopioKg: mes.acopioKg, ventas: mes.ventas, ventasKg: mes.ventasKg, montoVentasPen: mes.montoVentasPen, mermasKg: mes.mermasKg },
    reabierto: null,
  };
  return NextResponse.json({ ok: true, cierre, cierres: await CacaoCierreDB.save(auth.tenantId, cierre, user) });
});
