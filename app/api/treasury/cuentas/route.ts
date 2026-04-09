import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { TreasuryDB } from "@/lib/db/treasury.db";
import { requireAdmin } from "@/lib/require-admin";
import { enqueueActivityLog } from "@/lib/queue";
import { logger } from "@/lib/logger";

const CreateCuentaSchema = z.object({
  nombre: z.string().min(1).max(200),
  tipo: z.enum(["BANCO_AHORRO", "BANCO_CORRIENTE", "CAJA_FISICA", "MONEDERO_DIGITAL"]),
  banco: z.string().max(100).optional(),
  numeroCuenta: z.string().max(30).optional(),
  cci: z.string().max(30).optional(),
  moneda: z.string().max(3).optional(),
  saldoInicial: z.number().min(0).max(99999999).optional(),
  color: z.string().max(20).optional(),
  notas: z.string().max(500).optional(),
});

const UpdateCuentaSchema = z.object({
  nombre: z.string().min(1).max(200).optional(),
  banco: z.string().max(100).optional(),
  numeroCuenta: z.string().max(30).optional(),
  cci: z.string().max(30).optional(),
  color: z.string().max(20).optional(),
  notas: z.string().max(500).optional(),
  activa: z.boolean().optional(),
});

// GET /api/treasury/cuentas
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const includeInactive = req.nextUrl.searchParams.get("includeInactive") === "true";
    const cuentas = await TreasuryDB.listCuentas(auth.tenantId, includeInactive);
    return NextResponse.json(cuentas);
  } catch (e) {
    logger.error("[treasury/cuentas] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

// POST /api/treasury/cuentas
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const raw = await req.json();
    const parsed = CreateCuentaSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }

    const cuenta = await TreasuryDB.createCuenta({
      tenantId: auth.tenantId,
      ...parsed.data,
    });

    enqueueActivityLog({ action: "Crear", resource: "treasury", resourceId: cuenta.id, userId: auth.username, tenantId: auth.tenantId, details: { description: `Cuenta "${cuenta.nombre}" creada con saldo S/${cuenta.saldo.toFixed(2)}` }, timestamp: new Date().toISOString() }).catch(() => {});

    return NextResponse.json(cuenta, { status: 201 });
  } catch (e) {
    logger.error("[treasury/cuentas] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

// PATCH /api/treasury/cuentas — update
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const raw = await req.json();
    const { id, ...rest } = raw;
    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "ID requerido" }, { status: 400 });
    }

    const parsed = UpdateCuentaSchema.safeParse(rest);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }

    const cuenta = await TreasuryDB.updateCuenta(id, parsed.data);
    if (!cuenta) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    enqueueActivityLog({ action: "Editar", resource: "treasury", resourceId: cuenta.id, userId: auth.username, tenantId: auth.tenantId, details: { description: `Cuenta "${cuenta.nombre}" actualizada` }, timestamp: new Date().toISOString() }).catch(() => {});

    return NextResponse.json(cuenta);
  } catch (e) {
    logger.error("[treasury/cuentas] PATCH error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
