import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit-logger";
import { logger } from "@/lib/logger";

// ── Schemas ─────────────────────────────────────────────────────────────────

const UpdateContratoSchema = z.object({
  tipo: z.enum([
    "VENTA", "SERVICIO", "TRABAJO", "PROVEEDOR",
    "DISTRIBUCION", "ALQUILER", "COMPRAVENTA", "SUMINISTRO",
  ]).optional(),
  estado: z.enum(["BORRADOR", "ACTIVO", "VENCIDO", "ANULADO", "RENOVADO"]).optional(),
  clienteNombre: z.string().min(1).max(200).optional(),
  clienteDoc: z.string().min(1).max(20).optional(),
  descripcion: z.string().min(1).max(2000).optional(),
  monto: z.number().nonnegative().optional(),
  moneda: z.enum(["PEN", "USD"]).optional(),
  fecha: z.string().min(10).optional(),
  fechaVencimiento: z.string().optional().nullable(),
  clausulas: z.array(z.string().max(1000)).optional(),
  condiciones: z.string().max(2000).optional(),
  lugarFirma: z.string().max(200).optional(),
  parte2Nombre: z.string().max(200).optional(),
  parte2Doc: z.string().max(20).optional(),
});

// ── GET — Get single contract by ID ──────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    // eslint-disable-next-line no-restricted-properties -- contratos almacenados como Note tenant-scoped por auth guard.
    const nota = await prisma.note.findFirst({
      where: {
        id,
        tenantId: auth.tenantId,
        title: { startsWith: "CONTRATO:" },
      },
    });

    if (!nota) {
      return NextResponse.json({ error: "Contrato no encontrado" }, { status: 404 });
    }

    let contratoData: Record<string, unknown>;
    try {
      contratoData = JSON.parse(nota.content);
    } catch {
      return NextResponse.json({ error: "Datos del contrato corruptos" }, { status: 500 });
    }

    return NextResponse.json({
      id: nota.id,
      ...contratoData,
      createdAt: nota.createdAt.toISOString(),
      updatedAt: nota.updatedAt.toISOString(),
    });
  } catch (e) {
    logger.error("[contratos/id] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

// ── PUT — Update contract fields or change status ────────────────────────────

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const updates = parsed.data;

  try {
    // eslint-disable-next-line no-restricted-properties -- contratos almacenados como Note tenant-scoped por auth guard.
    const nota = await prisma.note.findFirst({
      where: {
        id,
        tenantId: auth.tenantId,
        title: { startsWith: "CONTRATO:" },
      },
    });

    if (!nota) {
      return NextResponse.json({ error: "Contrato no encontrado" }, { status: 404 });
    }

    let existingData: Record<string, unknown>;
    try {
      existingData = JSON.parse(nota.content);
    } catch {
      return NextResponse.json({ error: "Datos del contrato corruptos" }, { status: 500 });
    }

    // Prevent editing anulled contracts (only allow re-activating)
    if (existingData.estado === "ANULADO" && updates.estado !== "ACTIVO") {
      return NextResponse.json(
        { error: "No se puede editar un contrato anulado. Solo se puede reactivar." },
        { status: 400 }
      );
    }

    // Merge updates into existing data
    const mergedData = { ...existingData };
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        mergedData[key] = value;
      }
    }
    mergedData.ultimaModificacion = new Date().toISOString();
    mergedData.modificadoPor = auth.username;

    // Update the title to reflect potential name/type changes
    const titulo = `CONTRATO: ${mergedData.numero} — ${mergedData.tipo} — ${mergedData.clienteNombre}`;

    // eslint-disable-next-line no-restricted-properties -- contratos almacenados como Note tenant-scoped por auth guard.
    const updated = await prisma.note.update({
      where: { id },
      data: {
        title: titulo,
        content: JSON.stringify(mergedData),
      },
    });

    // Build audit detail
    const changedFields = Object.keys(updates).join(", ");
    logAudit({
      req,
      action: "UPDATE",
      entity: "Order",
      entityId: id,
      detail: `Contrato ${mergedData.numero} actualizado. Campos: ${changedFields}`,
      user: auth.username,
      tenantId: auth.tenantId,
    });

    return NextResponse.json({
      id: updated.id,
      ...mergedData,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (e) {
    logger.error("[contratos/id] PUT error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

// ── DELETE — Soft delete (anullar contrato) ──────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    // eslint-disable-next-line no-restricted-properties -- contratos almacenados como Note tenant-scoped por auth guard.
    const nota = await prisma.note.findFirst({
      where: {
        id,
        tenantId: auth.tenantId,
        title: { startsWith: "CONTRATO:" },
      },
    });

    if (!nota) {
      return NextResponse.json({ error: "Contrato no encontrado" }, { status: 404 });
    }

    let existingData: Record<string, unknown>;
    try {
      existingData = JSON.parse(nota.content);
    } catch {
      return NextResponse.json({ error: "Datos del contrato corruptos" }, { status: 500 });
    }

    if (existingData.estado === "ANULADO") {
      return NextResponse.json(
        { error: "El contrato ya esta anulado" },
        { status: 400 }
      );
    }

    // Soft delete: change status to ANULADO
    existingData.estado = "ANULADO";
    existingData.fechaAnulacion = new Date().toISOString();
    existingData.anuladoPor = auth.username;

    // eslint-disable-next-line no-restricted-properties -- contratos almacenados como Note tenant-scoped por auth guard.
    const updated = await prisma.note.update({
      where: { id },
      data: {
        content: JSON.stringify(existingData),
      },
    });

    logAudit({
      req,
      action: "DELETE",
      entity: "Order",
      entityId: id,
      detail: `Contrato ${existingData.numero} anulado por ${auth.username}`,
      user: auth.username,
      tenantId: auth.tenantId,
    });

    return NextResponse.json({
      id: updated.id,
      ...existingData,
      message: "Contrato anulado correctamente",
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (e) {
    logger.error("[contratos/id] DELETE error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
