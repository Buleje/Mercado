import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { GuiasRemisionDB } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";
import { logAudit } from "@/lib/audit-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

const GuiaItemSchema = z.object({
  descripcion: z.string().min(1).max(500),
  cantidad: z.number().positive(),
  unidad: z.string().max(20).optional().default("NIU"),
  productoId: z.string().optional(),
  pesoUnitario: z.number().nonnegative().optional(),
});

const UpdateGuiaBorradorSchema = z.object({
  motivoTraslado: z.string().min(1).max(100).optional(),
  fechaTraslado: z.string().min(10).optional(),
  destinatarioNombre: z.string().min(1).max(200).optional(),
  destinatarioRuc: z.string().max(20).optional(),
  destinatarioDireccion: z.string().min(1).max(500).optional(),
  transportistaRuc: z.string().max(20).optional(),
  transportistaNombre: z.string().max(200).optional(),
  vehiculoPlaca: z.string().max(20).optional(),
  conductorNombre: z.string().max(200).optional(),
  conductorDni: z.string().max(8).optional(),
  bultos: z.number().int().nonnegative().optional(),
  documentoRef: z.string().max(200).optional(),
  puntoPartida: z.string().min(1).max(500).optional(),
  puntoLlegada: z.string().min(1).max(500).optional(),
  items: z.array(GuiaItemSchema).optional(),
  pesoBruto: z.number().nonnegative().optional(),
  notas: z.string().max(2000).optional(),
});

const PatchGuiaSchema = z
  .object({
    status: z
      .enum(["BORRADOR", "EMITIDA", "EN_TRANSITO", "ENTREGADA", "ANULADA"])
      .optional(),
    action: z.enum(["anular", "duplicar"]).optional(),
    motivo: z.string().min(1).max(500).optional(),
  })
  .refine((d) => d.status !== undefined || d.action !== undefined, {
    message: "Se requiere 'status' o 'action'",
  })
  .refine(
    (d) => d.action !== "anular" || (d.motivo !== undefined && d.motivo.length > 0),
    { message: "Se requiere 'motivo' para la acción 'anular'" }
  );

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager", "almacenero"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  try {
    const guia = await GuiasRemisionDB.getById(id, auth.tenantId);
    if (!guia) {
      return NextResponse.json({ error: "Guía de remisión no encontrada" }, { status: 404 });
    }
    return NextResponse.json(guia);
  } catch (e) {
    logger.error("[guias-remision] GET by id error", { error: String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  const _rl = await applyRateLimit(req, "MODERATE", "guias-remision-X"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "owner", "manager", "almacenero"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  const raw = await req.json();
  const parsed = UpdateGuiaBorradorSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  try {
    const data = parsed.data;
    const updated = await GuiasRemisionDB.update(id, auth.tenantId, {
      ...data,
      fechaTraslado: data.fechaTraslado ? new Date(data.fechaTraslado) : undefined,
    });
    if (!updated) {
      return NextResponse.json(
        { error: "Guía no encontrada o no está en estado BORRADOR" },
        { status: 404 }
      );
    }

    logAudit({
      req,
      action: "UPDATE",
      entity: "Order",
      entityId: id,
      detail: `Guía ${updated.numero} actualizada`,
      user: auth.username,
      tenantId: auth.tenantId,
    });

    return NextResponse.json(updated);
  } catch (e) {
    logger.error("[guias-remision] PUT error", { error: String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const _rl = await applyRateLimit(req, "MODERATE", "guias-remision-X"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "owner", "manager", "almacenero"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  const raw = await req.json();
  const parsed = PatchGuiaSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const data = parsed.data;

  try {
    if (data.action === "anular") {
      const updated = await GuiasRemisionDB.anular(
        id,
        auth.tenantId,
        data.motivo!,
        auth.username
      );
      if (!updated) {
        return NextResponse.json({ error: "Guía de remisión no encontrada" }, { status: 404 });
      }
      logAudit({
        req,
        action: "UPDATE",
        entity: "Order",
        entityId: id,
        detail: `Guía ${updated.numero} anulada: ${data.motivo}`,
        user: auth.username,
        tenantId: auth.tenantId,
      });
      return NextResponse.json(updated);
    }

    if (data.action === "duplicar") {
      const nueva = await GuiasRemisionDB.duplicate(id, auth.tenantId, auth.username);
      if (!nueva) {
        return NextResponse.json({ error: "Guía de remisión no encontrada" }, { status: 404 });
      }
      logAudit({
        req,
        action: "CREATE",
        entity: "Order",
        entityId: nueva.id,
        detail: `Guía ${nueva.numero} duplicada desde ${id}`,
        user: auth.username,
        tenantId: auth.tenantId,
      });
      return NextResponse.json(nueva, { status: 201 });
    }

    // Cambio de status estándar
    const updated = await GuiasRemisionDB.updateStatus(id, auth.tenantId, data.status!);
    if (!updated) {
      return NextResponse.json({ error: "Guía de remisión no encontrada" }, { status: 404 });
    }
    logAudit({
      req,
      action: "UPDATE",
      entity: "Order",
      entityId: id,
      detail: `Guía ${updated.numero} cambió a status ${data.status}`,
      user: auth.username,
      tenantId: auth.tenantId,
    });
    return NextResponse.json(updated);
  } catch (e) {
    logger.error("[guias-remision] PATCH error", { error: String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
