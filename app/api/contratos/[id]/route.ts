import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { ContractsDB } from "@/lib/db/contracts.db";
import { logAudit } from "@/lib/audit-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { CONTRACT_TIPOS, CONTRACT_ESTADOS } from "@/lib/types/contracts";
import type { ContractEstado } from "@/lib/types/contracts";

// ── Schemas ─────────────────────────────────────────────────────────────────

const UpdateContratoSchema = z.object({
  tipo: z.enum(CONTRACT_TIPOS).optional(),
  // "ACTIVO" es el nombre viejo de VIGENTE; se acepta para no romper llamadas antiguas.
  estado: z.enum([...CONTRACT_ESTADOS, "ACTIVO"]).optional(),
  clienteNombre: z.string().min(1).max(200).optional(),
  clienteDoc: z.string().max(20).optional(),
  descripcion: z.string().max(2000).optional(),
  resumen: z.string().max(2000).optional(),
  monto: z.number().nonnegative().optional(),
  moneda: z.enum(["PEN", "USD"]).optional(),
  fecha: z.string().min(10).optional(),
  fechaVencimiento: z.string().min(10).nullish(),
  clausulas: z.array(z.string().max(4000)).max(40).optional(),
  contenido: z.string().max(120_000).optional(),
  datos: z.record(z.string(), z.string()).nullish(),
  condiciones: z.string().max(2000).optional(),
  lugarFirma: z.string().max(200).optional(),
  customerId: z.string().max(40).nullish(),
  supplierId: z.string().max(40).nullish(),
});

function fechaValida(v: string): Date | null {
  const d = new Date(v.length === 10 ? `${v}T12:00:00.000Z` : v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ── GET — Un contrato con sus firmantes y su historial ───────────────────────

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const contrato = await ContractsDB.getById(auth.tenantId, id);
    if (!contrato) {
      return NextResponse.json({ error: "Contrato no encontrado" }, { status: 404 });
    }
    return NextResponse.json(contrato);
  } catch (e) {
    logger.error("[contratos/id] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

// ── PUT — Editar / cambiar de estado ─────────────────────────────────────────

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const _rl = await applyRateLimit(req, "MODERATE", "contratos-X");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = UpdateContratoSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const updates = parsed.data;
  const nuevoEstado: ContractEstado | undefined =
    updates.estado === "ACTIVO" ? "VIGENTE" : (updates.estado as ContractEstado | undefined);

  try {
    const actual = await ContractsDB.getById(auth.tenantId, id);
    if (!actual) {
      return NextResponse.json({ error: "Contrato no encontrado" }, { status: 404 });
    }

    // Un contrato anulado se puede reactivar, pero no editar por la puerta de atrás.
    if (actual.estado === "ANULADO" && nuevoEstado !== "VIGENTE" && nuevoEstado !== "BORRADOR") {
      return NextResponse.json(
        { error: "No se puede editar un contrato anulado. Primero hay que reactivarlo." },
        { status: 400 },
      );
    }

    // Un contrato ya firmado es un documento cerrado: sólo cambia de estado.
    const tocaContenido =
      updates.contenido !== undefined ||
      updates.clausulas !== undefined ||
      updates.monto !== undefined ||
      updates.clienteNombre !== undefined;
    if (actual.firmadoEn && tocaContenido) {
      return NextResponse.json(
        { error: "El contrato ya está firmado: no se puede cambiar su contenido." },
        { status: 409 },
      );
    }

    let fechaInicio: string | undefined;
    if (updates.fecha) {
      const d = fechaValida(updates.fecha);
      if (!d) return NextResponse.json({ error: { fecha: ["Fecha inválida"] } }, { status: 400 });
      fechaInicio = d.toISOString();
    }

    let fechaVencimiento: string | null | undefined;
    if (updates.fechaVencimiento !== undefined) {
      if (updates.fechaVencimiento === null) {
        fechaVencimiento = null;
      } else {
        const d = fechaValida(updates.fechaVencimiento);
        if (!d) {
          return NextResponse.json({ error: { fechaVencimiento: ["Fecha inválida"] } }, { status: 400 });
        }
        const inicio = new Date(fechaInicio ?? actual.fechaInicio);
        if (d < inicio) {
          return NextResponse.json(
            { error: { fechaVencimiento: ["El vencimiento no puede ser anterior al inicio"] } },
            { status: 400 },
          );
        }
        fechaVencimiento = d.toISOString();
      }
    }

    const contrato = await ContractsDB.update(auth.tenantId, id, {
      tipo: updates.tipo,
      estado: nuevoEstado,
      clienteNombre: updates.clienteNombre,
      clienteDoc: updates.clienteDoc,
      customerId: updates.customerId,
      supplierId: updates.supplierId,
      descripcion: updates.descripcion,
      resumen: updates.resumen,
      monto: updates.monto,
      moneda: updates.moneda,
      fechaInicio,
      fechaVencimiento,
      clausulas: updates.clausulas,
      contenido: updates.contenido,
      datos: updates.datos,
      condiciones: updates.condiciones,
      lugarFirma: updates.lugarFirma,
    });
    if (!contrato) {
      return NextResponse.json({ error: "Contrato no encontrado" }, { status: 404 });
    }

    const campos = Object.keys(updates).join(", ");
    const cambioDeEstado = Boolean(nuevoEstado && nuevoEstado !== actual.estado);
    await ContractsDB.addEvent(
      auth.tenantId,
      id,
      "EDITADO",
      cambioDeEstado ? `Estado: ${actual.estado} → ${nuevoEstado}` : `Campos actualizados: ${campos}`,
      auth.username,
    );

    logAudit({
      req,
      action: "UPDATE",
      entity: "Order",
      entityId: id,
      detail: `Contrato ${contrato.numero} actualizado. Campos: ${campos}`,
      user: auth.username,
      tenantId: auth.tenantId,
    });

    return NextResponse.json(contrato);
  } catch (e) {
    logger.error("[contratos/id] PUT error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

// ── DELETE — Anular ──────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const _rl = await applyRateLimit(req, "MODERATE", "contratos-X");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const actual = await ContractsDB.getById(auth.tenantId, id);
    if (!actual) {
      return NextResponse.json({ error: "Contrato no encontrado" }, { status: 404 });
    }
    if (actual.estado === "ANULADO") {
      return NextResponse.json({ error: "El contrato ya está anulado" }, { status: 400 });
    }

    const contrato = await ContractsDB.update(auth.tenantId, id, { estado: "ANULADO" });

    await ContractsDB.addEvent(
      auth.tenantId,
      id,
      "ANULADO",
      `Contrato ${actual.numero} anulado`,
      auth.username,
    );

    logAudit({
      req,
      action: "DELETE",
      entity: "Order",
      entityId: id,
      detail: `Contrato ${actual.numero} anulado por ${auth.username}`,
      user: auth.username,
      tenantId: auth.tenantId,
    });

    return NextResponse.json({ ...contrato, message: "Contrato anulado correctamente" });
  } catch (e) {
    logger.error("[contratos/id] DELETE error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
