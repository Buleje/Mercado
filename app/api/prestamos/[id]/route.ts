import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PrestamosDB, type PrestamoUpdateInput } from "@/lib/db/prestamos.db";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";

const PatchPrestamoSchema = z.object({
  status: z.enum(["ACTIVO", "PAGADO", "VENCIDO", "CANCELADO"]),
});

const UpdatePrestamoSchema = z.object({
  customerId: z.string().max(20).optional(),
  tipo: z.enum(["PERSONAL", "BANCARIO", "TERCERO", "PROVEEDOR"]).optional(),
  direccion: z.enum(["DADO", "RECIBIDO"]).optional(),
  entidadNombre: z.string().max(200).optional(),
  entidadTipo: z.enum(["BANCO", "PERSONA_NATURAL", "EMPRESA", "PROVEEDOR"]).nullish(),
  nroOperacion: z.string().max(100).optional(),
  moneda: z.string().max(3).optional(),
  tea: z.number().min(0).max(999).nullish(),
  moraInteres: z.number().min(0).max(100).optional(),
  garantia: z.string().max(500).nullish(),
  notas: z.string().max(1000).nullish(),
  fechaDesembolso: z.string().nullish(),
  fechaVencimiento: z.string().nullish(),
});

// GET /api/prestamos/[id] — detail with cuotas, documents, and payment state
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const prestamo = await PrestamosDB.getById(auth.tenantId, id);
    if (!prestamo || prestamo.tenantId !== auth.tenantId) {
      return NextResponse.json({ error: "Préstamo no encontrado" }, { status: 404 });
    }

    const cuotasPagadas = prestamo.cuotas.filter((c) => c.pagadoEn).length;
    const totalPagado = prestamo.cuotas
      .filter((c) => c.montoPagado != null)
      .reduce((sum, c) => sum + (c.montoPagado ?? 0), 0);
    const saldoPendiente = prestamo.cuotas
      .filter((c) => !c.pagadoEn)
      .reduce((sum, c) => sum + c.monto, 0);
    const moraTotal = prestamo.cuotas.reduce((s, c) => s + c.moraCalculada, 0);

    return NextResponse.json({
      ...prestamo,
      cuotasPagadas,
      cuotasPendientes: prestamo.cuotas.length - cuotasPagadas,
      totalPagado,
      saldoPendiente,
      moraTotal,
    });
  } catch (e) {
    logger.error("[prestamos/id] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

// PUT /api/prestamos/[id] — full edit (metadata only, not cuotas)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const raw = await req.json();
    const parsed = UpdatePrestamoSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }

    const existing = await PrestamosDB.getById(auth.tenantId, id);
    if (!existing || existing.tenantId !== auth.tenantId) {
      return NextResponse.json({ error: "Préstamo no encontrado" }, { status: 404 });
    }

    const updated = await PrestamosDB.update(auth.tenantId, id, parsed.data as PrestamoUpdateInput);
    if (!updated) {
      return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
    }

    logActivity(
      "Actualizar", "prestamo",
      `Préstamo ${id.slice(-6)} editado`,
      id, auth.username,
    ).catch((err) => logger.error("[prestamos] logActivity PUT failed", { error: String(err) }));

    return NextResponse.json(updated);
  } catch (e) {
    logger.error("[prestamos/id] PUT error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

// PATCH /api/prestamos/[id] — update status
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const raw = await req.json();
    const parsed = PatchPrestamoSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }

    const existing = await PrestamosDB.getById(auth.tenantId, id);
    if (!existing || existing.tenantId !== auth.tenantId) {
      return NextResponse.json({ error: "Préstamo no encontrado" }, { status: 404 });
    }

    const updated = await PrestamosDB.updateStatus(auth.tenantId, id, parsed.data.status);

    logActivity(
      "Actualizar", "prestamo",
      `Préstamo ${id.slice(-6)} status -> ${parsed.data.status}`,
      id, auth.username,
    ).catch((err) => logger.error("[prestamos] logActivity PATCH failed", { error: String(err) }));

    return NextResponse.json(updated);
  } catch (e) {
    logger.error("[prestamos/id] PATCH error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
