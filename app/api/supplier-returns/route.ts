import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SupplierReturnsDB } from "@/lib/db/supplier-returns.db";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

const TENANT = "main";

const ItemSchema = z.object({
  nombre:   z.string().min(1).max(200),
  cantidad: z.number().positive(),
  unidad:   z.string().max(20).default("und"),
});

const ReturnSchema = z.object({
  proveedorId:     z.string().optional(),
  proveedorNombre: z.string().min(1).max(200),
  motivo:          z.string().min(1).max(500),
  notas:           z.string().max(1000).optional(),
  items:           z.array(ItemSchema).min(1),
});

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req, ["admin", "almacenero"]);
    if (auth instanceof NextResponse) return auth;

    const returns = await SupplierReturnsDB.listWithItems(TENANT);
    return NextResponse.json(returns);
  } catch (e) {
    logger.error("[supplier-returns] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error al obtener devoluciones" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "supplier-returns"); if (_rl) return _rl;
  try {
    const auth = await requireAdmin(req, ["admin", "almacenero"]);
    if (auth instanceof NextResponse) return auth;

    const raw = await req.json();
    const parsed = ReturnSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

    const record = await SupplierReturnsDB.createWithItems(TENANT, parsed.data);
    return NextResponse.json(record, { status: 201 });
  } catch (e) {
    logger.error("[supplier-returns] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error al registrar devolución" }, { status: 500 });
  }
}
