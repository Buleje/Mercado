import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CotizacionesDB } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";
import { logAudit } from "@/lib/audit-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { vigenciaDesdeEntrada } from "@/lib/cotizaciones/vigencia";
import { CotizacionCambioDeEstadoError, ESTADOS_COTIZACION, revisarTransicionCotizacion } from "@/lib/cotizaciones/estados";

const UpdateCotizacionSchema = z.object({
  status: z.enum(ESTADOS_COTIZACION).optional(),
  notas: z.string().max(2000).optional(),
  validoHasta: z.string().datetime({ offset: true }).or(z.string().min(10)).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  try {
    const cotizacion = await CotizacionesDB.getById(id, auth.tenantId);
    if (!cotizacion) {
      return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
    }
    return NextResponse.json(cotizacion);
  } catch (e) {
    logger.error("[cotizaciones] GET by id error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const _rl = await applyRateLimit(req, "MODERATE", "cotizaciones-X"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  const raw: unknown = await req.json().catch(() => null);
  const parsed = UpdateCotizacionSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  try {
    // Seguridad 17-10 (punto 2): el estado sigue la tabla de transiciones;
    // CONVERTIDA es final y sólo se llega convirtiendo (crea el pedido).
    const actual = parsed.data.status ? await CotizacionesDB.getById(id, auth.tenantId) : null;
    if (parsed.data.status && !actual) {
      return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
    }
    const cambiaEstado = !!actual && !!parsed.data.status && parsed.data.status !== actual.status;
    if (cambiaEstado) {
      const r = revisarTransicionCotizacion(actual.status, parsed.data.status!);
      if (!r.ok) return NextResponse.json({ error: r.error, estado: actual.status }, { status: r.status });
    }

    const updated = await CotizacionesDB.update(
      id,
      auth.tenantId,
      {
        status: cambiaEstado ? parsed.data.status : undefined,
        notas: parsed.data.notas,
        validoHasta: parsed.data.validoHasta ? (vigenciaDesdeEntrada(parsed.data.validoHasta) ?? undefined) : undefined,
      },
      cambiaEstado ? { siEstadoEs: actual.status } : undefined,
    );
    if (!updated) {
      return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
    }

    logAudit({
      req,
      action: "UPDATE",
      entity: "Order",
      entityId: id,
      detail: `Cotización ${updated.numero} actualizada: ${JSON.stringify(parsed.data)}`,
      user: auth.username,
      tenantId: auth.tenantId,
    });

    // Fase 4 perf (2026-05-16): doc-badges refresca al cambiar status.
    try {
      const { invalidateAdminCache } = await import("@/lib/admin-cache");
      invalidateAdminCache.afterDocument(auth.tenantId);
    } catch { /* fire-and-forget */ }

    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof CotizacionCambioDeEstadoError) {
      return NextResponse.json(
        { error: "La cotización cambió mientras tanto (ahora está " + e.estado + "). Recarga y vuelve a intentar.", estado: e.estado },
        { status: 409 },
      );
    }
    logger.error("[cotizaciones] PATCH error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const _rl = await applyRateLimit(req, "MODERATE", "cotizaciones-X"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  try {
    const deleted = await CotizacionesDB.delete(id, auth.tenantId);
    if (!deleted) {
      return NextResponse.json(
        { error: "Cotización no encontrada o no está en estado BORRADOR" },
        { status: 404 }
      );
    }

    logAudit({
      req,
      action: "DELETE",
      entity: "Order",
      entityId: id,
      detail: `Cotización eliminada`,
      user: auth.username,
      tenantId: auth.tenantId,
    });

    // Fase 4 perf (2026-05-16): doc-badges refresca al eliminar.
    try {
      const { invalidateAdminCache } = await import("@/lib/admin-cache");
      invalidateAdminCache.afterDocument(auth.tenantId);
    } catch { /* fire-and-forget */ }

    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[cotizaciones] DELETE error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
