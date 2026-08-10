import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ExpensesDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { requireActiveSubscription } from "@/lib/billing/require-active-subscription";
import { toErrorPayload } from "@/lib/api-error";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * Alta de un gasto. Los campos de ADR-374 son opcionales: un gasto cargado a
 * mano desde el panel sigue necesitando sólo categoría y monto.
 */
const BodySchema = z.object({
  category: z.string().min(1, "la categoría es obligatoria"),
  amount: z.coerce.number().positive("el monto tiene que ser mayor a cero"),
  description: z.string().max(2000).optional(),
  date: z.string().optional(),
  recurring: z.boolean().optional().default(false),
  frequency: z.enum(["mensual", "quincenal", "semanal", "anual", "unico"]).optional(),
  paymentDay: z.number().int().min(0).max(31).optional(),
  paymentMethod: z.enum(["efectivo", "yape", "plin", "transferencia", "tarjeta", "credito"]).optional(),
  supplierName: z.string().max(200).optional(),
  supplierId: z.string().max(64).optional(),
  documentType: z.enum(["boleta", "factura", "recibo", "ticket", "sin_comprobante"]).optional(),
  documentNumber: z.string().max(64).optional(),
  supplierRuc: z.string().max(20).optional(),
  igvAmount: z.coerce.number().min(0).optional(),
  afectoIgv: z.boolean().optional().default(false),
  attachmentUrl: z.string().max(2000).optional(),
  costCenter: z.string().max(100).optional(),
  notes: z.string().max(2000).optional(),
  templateId: z.string().max(64).optional(),
  paidAt: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const recurring = searchParams.get("recurring");
    const category = searchParams.get("category");

    // Audit 2026-05-17 (feature compras): ?recurring=true devuelve el catálogo
    // de gastos recurrentes que se muestran como cards en el Punto de Compra.
    if (from && to) {
      // `to=2026-08-10` es medianoche del 10, así que un gasto registrado ESE
      // día quedaba fuera del rango: el panel decía «Sin gastos registrados»
      // con el gasto recién cargado en la base. Una fecha sin hora significa
      // «todo ese día».
      //
      // Tiene que ser `setUTCHours`, no `setHours`: `new Date("2026-08-10")`
      // se parsea como medianoche UTC, y correrle las horas en hora local
      // (Lima, UTC-5) lo manda al 9 a las 23:59 — el rango terminaba ANTES de
      // empezar el día pedido. El cliente arma estas fechas con
      // `toISOString()`, así que el día se cierra en la misma escala.
      const hasta = new Date(to);
      if (!to.includes("T")) hasta.setUTCHours(23, 59, 59, 999);
      return NextResponse.json(await ExpensesDB.getByDateRange(auth.tenantId, new Date(from), hasta));
    }
    const filters: { recurring?: boolean; category?: string } = {};
    if (recurring === "true") filters.recurring = true;
    else if (recurring === "false") filters.recurring = false;
    if (category) filters.category = category;
    return NextResponse.json(await ExpensesDB.getAll(auth.tenantId, filters));
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "expenses"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const blocked = await requireActiveSubscription(auth.tenantId);
  if (blocked) return blocked;

  try {
    const raw = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
        { status: 400 },
      );
    }
    const body = parsed.data;
    const expense = await ExpensesDB.add(auth.tenantId, {
      category: body.category,
      description: body.description ?? "",
      amount: body.amount,
      date: body.date ?? new Date().toISOString(),
      recurring: body.recurring,
      // ADR-374 — la metadata ya no viaja serializada dentro de `description`.
      frequency: body.frequency ?? null,
      paymentDay: body.paymentDay ?? null,
      paymentMethod: body.paymentMethod ?? null,
      supplierName: body.supplierName ?? null,
      supplierId: body.supplierId ?? null,
      documentType: body.documentType ?? null,
      documentNumber: body.documentNumber ?? null,
      supplierRuc: body.supplierRuc ?? null,
      igvAmount: body.igvAmount ?? null,
      afectoIgv: body.afectoIgv,
      attachmentUrl: body.attachmentUrl ?? null,
      costCenter: body.costCenter ?? null,
      // Quién lo registró sale de la sesión, no del body: si lo mandara el
      // cliente, cualquiera podría firmar un gasto con el nombre de otro.
      createdBy: auth.username ?? null,
      notes: body.notes ?? null,
      templateId: body.templateId ?? null,
      paidAt: body.paidAt ?? null,
    });
    return NextResponse.json(expense, { status: 201 });
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}
