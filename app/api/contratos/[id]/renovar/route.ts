import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { ContractsDB } from "@/lib/db/contracts.db";
import { logAudit } from "@/lib/audit-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * Renueva un contrato: crea uno NUEVO con las mismas condiciones y las fechas
 * corridas, y deja el anterior marcado como RENOVADO apuntando al sucesor.
 *
 * Por qué un contrato nuevo y no mover la fecha del viejo: un contrato es un
 * hecho jurídico con su propio número y su propia vigencia. Estirarle la fecha
 * borraría la historia de lo que estuvo vigente entre tal y tal día — justo lo
 * que una fiscalización pide ver.
 */

const RenovarSchema = z.object({
  /** Cuántos meses dura la renovación. Por defecto, lo mismo que duró el original. */
  meses: z.number().int().min(1).max(120).optional(),
  /** Fecha de inicio de la renovación; por defecto, el día siguiente al vencimiento. */
  desde: z.string().min(10).optional(),
  /** Permite renegociar el monto en el mismo movimiento. */
  monto: z.number().nonnegative().optional(),
});

function soloFecha(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0));
}

function sumarMeses(base: Date, meses: number): Date {
  const d = new Date(base);
  d.setUTCMonth(d.getUTCMonth() + meses);
  return d;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const _rl = await applyRateLimit(req, "MODERATE", "contratos-renovar");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  let raw: unknown = {};
  try {
    raw = await req.json();
  } catch {
    // Renovar sin cuerpo es válido: significa "otra vuelta igual".
  }

  const parsed = RenovarSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const opciones = parsed.data;

  try {
    const original = await ContractsDB.getById(auth.tenantId, id);
    if (!original) return NextResponse.json({ error: "Contrato no encontrado" }, { status: 404 });
    if (original.estado === "RENOVADO") {
      return NextResponse.json({ error: "Ese contrato ya fue renovado" }, { status: 409 });
    }
    if (original.estado === "ANULADO") {
      return NextResponse.json({ error: "Un contrato anulado no se renueva" }, { status: 409 });
    }

    // Duración original en meses; si no tenía vencimiento, asumimos un año.
    const inicioViejo = new Date(original.fechaInicio);
    const finViejo = original.fechaVencimiento ? new Date(original.fechaVencimiento) : null;
    const mesesOriginal = finViejo
      ? Math.max(
          1,
          Math.round((finViejo.getTime() - inicioViejo.getTime()) / (30.44 * 86_400_000)),
        )
      : 12;
    const meses = opciones.meses ?? mesesOriginal;

    // Arranca al día siguiente del vencimiento para no solapar vigencias.
    const desde = opciones.desde
      ? soloFecha(new Date(`${opciones.desde}T12:00:00.000Z`))
      : finViejo
        ? soloFecha(new Date(finViejo.getTime() + 86_400_000))
        : soloFecha(new Date());
    if (Number.isNaN(desde.getTime())) {
      return NextResponse.json({ error: { desde: ["Fecha inválida"] } }, { status: 400 });
    }
    const hasta = sumarMeses(desde, meses);

    const nuevo = await ContractsDB.create(auth.tenantId, {
      tipo: original.tipo,
      estado: "VIGENTE",
      clienteNombre: original.clienteNombre,
      clienteDoc: original.clienteDoc,
      customerId: original.customerId,
      supplierId: original.supplierId,
      descripcion: original.descripcion,
      resumen: original.resumen,
      monto: opciones.monto ?? original.monto,
      moneda: original.moneda,
      fechaInicio: desde.toISOString(),
      fechaVencimiento: hasta.toISOString(),
      plantillaId: original.plantillaId,
      contenido: original.contenido,
      datos: original.datos,
      clausulas: original.clausulas,
      lugarFirma: original.lugarFirma,
      condiciones: original.condiciones,
      renovadoDeId: original.id,
      creadoPor: auth.username,
    });

    await ContractsDB.update(auth.tenantId, id, { estado: "RENOVADO" });
    await ContractsDB.addEvent(
      auth.tenantId,
      id,
      "RENOVADO",
      `Renovado por ${meses} mes(es) en el contrato ${nuevo.numero}`,
      auth.username,
      { sucesorId: nuevo.id, numero: nuevo.numero },
    );

    logAudit({
      req,
      action: "CREATE",
      entity: "Order",
      entityId: nuevo.id,
      detail: `Contrato ${original.numero} renovado como ${nuevo.numero} (${meses} meses)`,
      user: auth.username,
      tenantId: auth.tenantId,
    });

    return NextResponse.json({ ok: true, contrato: nuevo }, { status: 201 });
  } catch (e) {
    logger.error("[contratos/renovar] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo renovar el contrato" }, { status: 503 });
  }
}
