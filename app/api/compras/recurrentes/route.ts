import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { withDbRetry } from "@/lib/db-retry";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { RecurringPurchasesDB } from "@/lib/db/recurring-purchases.db";

/**
 * Pedidos recurrentes a proveedores (ADR-377).
 *
 * Antes vivían en el `localStorage` del navegador: se perdían al cambiar de
 * equipo y nadie más del negocio los veía.
 */

const ItemSchema = z.object({
  productId: z.number().int().positive(),
  name: z.string().max(200).default(""),
  quantity: z.number().positive(),
  unitCost: z.number().nonnegative(),
  unit: z.string().max(50).default("und"),
});

const CrearSchema = z.object({
  supplierId: z.string().min(1).max(120),
  supplierName: z.string().max(200).default(""),
  items: z.array(ItemSchema).min(1, "hace falta al menos un producto"),
  intervalDays: z.number().int().min(1).max(365).default(15),
  nextDate: z.string().optional(),
  notifyDaysBefore: z.number().int().min(0).max(30).default(2),
  paymentMethod: z.string().max(40).optional(),
  notes: z.string().max(500).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const soloPorAvisar = req.nextUrl.searchParams.get("porAvisar") === "1";
    const data = soloPorAvisar
      ? await withDbRetry(() => RecurringPurchasesDB.getPorAvisar(auth.tenantId, new Date()))
      : await withDbRetry(() => RecurringPurchasesDB.getAll(auth.tenantId));
    return NextResponse.json(data);
  } catch (e) {
    logger.error("[compras/recurrentes] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "compras-recurrentes"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const parsed = CrearSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const data = parsed.data;

    // Sin fecha explícita, el primer pedido cae a un intervalo de hoy.
    const nextDate = data.nextDate
      ? new Date(data.nextDate)
      : new Date(Date.now() + data.intervalDays * 86400000);
    if (Number.isNaN(nextDate.getTime())) {
      return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
    }

    const creado = await RecurringPurchasesDB.add(auth.tenantId, {
      supplierId: data.supplierId,
      supplierName: data.supplierName,
      items: data.items,
      intervalDays: data.intervalDays,
      nextDate: nextDate.toISOString(),
      notifyDaysBefore: data.notifyDaysBefore,
      paymentMethod: data.paymentMethod,
      notes: data.notes,
    });
    return NextResponse.json(creado, { status: 201 });
  } catch (e) {
    logger.error("[compras/recurrentes] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error al crear el pedido recurrente" }, { status: 500 });
  }
}
