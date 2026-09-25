import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { ForestCtpDB } from "@/lib/db/forest-ctp.db";
import { ForestCtpConsumoDB } from "@/lib/db/forest-ctp-consumo.db";
import { ForestCtpCierreDB } from "@/lib/db/forest-ctp-cierre.db";
import { monthRange, type CtpCierrePeriodo } from "@/lib/forestal/ctp-cierre-types";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/forestal/ctp/cierre — cierre de período fiscal del LO-CTP (ADR-139).
 *
 * GET  → lista los períodos cerrados (para el panel).
 * POST { action:"cerrar", year, month }   → congela costos del mes + snapshotea
 *        la existencia de cierre + bloquea el período. admin/owner.
 * POST { action:"reabrir", periodKey, motivo } → deja de bloquear (los costos ya
 *        congelados siguen congelados). owner. Motivo obligatorio (auditable).
 */

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cerrar"), year: z.number().int().min(2000).max(2100), month: z.number().int().min(1).max(12) }),
  z.object({ action: z.literal("reabrir"), periodKey: z.string().trim().regex(/^\d{4}-\d{2}$/), motivo: z.string().trim().min(3, "El motivo es obligatorio").max(500) }),
]);

export const GET = withApiHandler("forestal-ctp-cierre-list", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"))) {
    return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
  }
  const cierres = await ForestCtpCierreDB.list(auth.tenantId);
  return NextResponse.json({ cierres });
});

export const POST = withApiHandler("forestal-ctp-cierre", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]); // cerrar los libros = gestión
  if (auth instanceof NextResponse) return auth;

  // Bucket propio: cerrar es infrecuente, pero no debe compartir cuota con el
  // tráfico de imports/escritura del libro (que agota el bucket "ctp").
  const rl = await applyRateLimit(req, "STRICT", "ctp-cierre");
  if (rl) return rl;

  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"))) {
    return NextResponse.json({ error: "specialization_disabled", message: "El módulo Libro de Operaciones CTP no está habilitado." }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });

  const user = auth.username ?? "unknown";

  // ── Reabrir ────────────────────────────────────────────────────────────
  if (parsed.data.action === "reabrir") {
    const cierre = await ForestCtpCierreDB.findByKey(auth.tenantId, parsed.data.periodKey);
    if (!cierre) return NextResponse.json({ error: "not_found", message: "Ese período no está cerrado." }, { status: 404 });
    if (cierre.reabierto) return NextResponse.json({ error: "already_reopened", message: "El período ya está reabierto." }, { status: 409 });
    const cierres = await ForestCtpCierreDB.reabrir(auth.tenantId, parsed.data.periodKey, parsed.data.motivo, user);
    return NextResponse.json({ ok: true, cierres });
  }

  // ── Cerrar ─────────────────────────────────────────────────────────────
  const { year, month } = parsed.data;
  const { from, to, periodKey, label } = monthRange(year, month - 1);

  // No se cierra un mes que aún no empezó.
  if (from.getTime() > Date.now()) {
    return NextResponse.json({ error: "future_period", message: "No se puede cerrar un mes que todavía no empezó." }, { status: 400 });
  }
  const existente = await ForestCtpCierreDB.findByKey(auth.tenantId, periodKey);
  if (existente && !existente.reabierto) {
    return NextResponse.json({ error: "already_closed", message: `El período ${label} ya está cerrado.` }, { status: 409 });
  }

  // 1) Existencia de cierre = acumulada hasta `to` (será la apertura del mes siguiente).
  const saldoAll = await ForestCtpDB.saldos(auth.tenantId, { toDate: to });
  // 2) Movimientos del propio mes (para los totales del cierre).
  const saldoMes = await ForestCtpDB.saldos(auth.tenantId, { fromDate: from, toDate: to });
  const corridasMes = await ForestCtpDB.list(auth.tenantId, { section: "produccion", fromDate: from, toDate: to, includeAnnulled: false });
  const despachosMes = await ForestCtpDB.list(auth.tenantId, { section: "despacho", fromDate: from, toDate: to, includeAnnulled: false });

  // 3) Congelar costos de las corridas del mes (best-effort: una corrida sin
  //    factura o sin materia prima no bloquea el cierre — el libro admite huecos).
  let corridasCongeladas = 0, corridasSinCostear = 0;
  for (const corrida of corridasMes.entries) {
    try {
      await ForestCtpConsumoDB.congelarCosto(auth.tenantId, corrida.id, user);
      corridasCongeladas++;
    } catch (e) {
      corridasSinCostear++;
      logger.warn("[ctp.cierre] corrida sin congelar", { id: corrida.id, error: String(e) });
    }
  }

  const cierre: CtpCierrePeriodo = {
    periodKey,
    from: from.toISOString(),
    to: to.toISOString(),
    label,
    closedAt: new Date().toISOString(),
    closedBy: user,
    saldoCierre: {
      materiaPrima: saldoAll.porEspecie.map((e) => ({ especie: e.especie, cientifico: e.scientific, cites: e.cites, existenciaM3: e.saldoM3 })),
      productos: saldoAll.productos.map((p) => ({ producto: p.producto, existencia: p.stock })),
    },
    totales: {
      ingresosCount: saldoMes.materiaPrima.ingresosCount,
      volumenIngresado: saldoMes.materiaPrima.ingresoM3,
      corridas: corridasMes.entries.length,
      despachos: despachosMes.entries.length,
      corridasCongeladas,
      corridasSinCostear,
      especiesEnNegativo: saldoAll.materiaPrima.especiesEnNegativo,
    },
    reabierto: null,
  };

  const cierres = await ForestCtpCierreDB.save(auth.tenantId, cierre, user);
  return NextResponse.json({ ok: true, cierre, cierres });
});
