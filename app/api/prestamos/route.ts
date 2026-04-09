import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PrestamosDB } from "@/lib/db/prestamos.db";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";

const CreatePrestamoSchema = z.object({
  customerId: z.string().max(20).optional(),
  tipo: z.enum(["PERSONAL", "BANCARIO", "TERCERO", "PROVEEDOR"]).optional(),
  direccion: z.enum(["DADO", "RECIBIDO"]).optional(),
  entidadNombre: z.string().max(200).optional(),
  entidadTipo: z.enum(["BANCO", "PERSONA_NATURAL", "EMPRESA", "PROVEEDOR"]).optional(),
  nroOperacion: z.string().max(100).optional(),
  monto: z.number().positive().max(9999999999),
  moneda: z.string().max(3).optional(),
  tasaInteres: z.number().min(0).max(100).optional(),
  tea: z.number().min(0).max(999).optional(),
  moraInteres: z.number().min(0).max(100).optional(),
  numeroCuotas: z.number().int().min(1).max(120).optional(),
  sistemaAmortizacion: z.enum(["FRANCES", "ALEMAN", "AMERICANO"]).optional(),
  periodoGracia: z.number().int().min(0).max(24).optional(),
  fechaDesembolso: z.string().optional(),
  fechaVencimiento: z.string().optional(),
  garantia: z.string().max(500).optional(),
  notas: z.string().max(1000).optional(),
});

// GET /api/prestamos — list prestamos with advanced filters
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const filters = {
      status: searchParams.get("status") ?? undefined,
      customerId: searchParams.get("customerId") ?? undefined,
      tipo: (searchParams.get("tipo") as "PERSONAL" | "BANCARIO" | "TERCERO" | "PROVEEDOR") ?? undefined,
      direccion: (searchParams.get("direccion") as "DADO" | "RECIBIDO") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
      montoMin: searchParams.get("montoMin") ? Number(searchParams.get("montoMin")) : undefined,
      montoMax: searchParams.get("montoMax") ? Number(searchParams.get("montoMax")) : undefined,
      search: searchParams.get("search") ?? undefined,
    };

    const prestamos = await PrestamosDB.list(auth.tenantId, filters);

    return NextResponse.json(prestamos, {
      headers: { "X-Total-Count": String(prestamos.length) },
    });
  } catch (e) {
    logger.error("[prestamos] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

// POST /api/prestamos — create prestamo with auto-generated cuotas
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const raw = await req.json();
    const parsed = CreatePrestamoSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }

    const d = parsed.data;
    // For DADO direction, customerId is required
    if ((!d.direccion || d.direccion === "DADO") && !d.customerId) {
      return NextResponse.json(
        { error: "Cliente requerido para préstamos dados" },
        { status: 400 },
      );
    }

    const prestamo = await PrestamosDB.create({
      tenantId: auth.tenantId,
      customerId: d.customerId,
      tipo: d.tipo,
      direccion: d.direccion,
      entidadNombre: d.entidadNombre,
      entidadTipo: d.entidadTipo,
      nroOperacion: d.nroOperacion,
      monto: d.monto,
      moneda: d.moneda,
      tasaInteres: d.tasaInteres,
      tea: d.tea,
      moraInteres: d.moraInteres,
      numeroCuotas: d.numeroCuotas,
      sistemaAmortizacion: d.sistemaAmortizacion,
      periodoGracia: d.periodoGracia,
      fechaDesembolso: d.fechaDesembolso,
      fechaVencimiento: d.fechaVencimiento,
      garantia: d.garantia,
      notas: d.notas,
    });

    const label = d.direccion === "RECIBIDO"
      ? `Préstamo recibido de ${d.entidadNombre ?? "entidad"} por S/${d.monto.toFixed(2)}`
      : `Préstamo S/${d.monto.toFixed(2)} a ${d.customerId} — ${prestamo.cuotas.length} cuotas (${d.sistemaAmortizacion ?? "FRANCES"})`;

    logActivity("Crear", "prestamo", label, prestamo.id, auth.username).catch(() => {});

    return NextResponse.json(prestamo, { status: 201 });
  } catch (e) {
    logger.error("[prestamos] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
