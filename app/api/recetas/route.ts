import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { RecetasDB } from "@/lib/db/recetas.db";
import { ProductsDB } from "@/lib/db/products.db";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

const IngredienteSchema = z.object({
  productoId: z.number().int().positive(),
  cantidad: z.number().positive(),
  unidad: z.string().max(30).optional(),
});

const CreateRecetaSchema = z.object({
  nombre: z.string().min(1).max(200),
  descripcion: z.string().max(1000).optional(),
  productoId: z.number().int().positive().optional(),
  ingredientes: z.array(IngredienteSchema).min(1),
});

// GET /api/recetas — list recetas for tenant
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const recetas = await RecetasDB.list(auth.tenantId);
    return NextResponse.json(recetas, {
      headers: { "X-Total-Count": String(recetas.length) },
    });
  } catch (e) {
    logger.error("[recetas] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

// POST /api/recetas — create receta with ingredientes
export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "recetas"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const raw = await req.json();
    const parsed = CreateRecetaSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }

    // CRITICAL FIX 2026-05-11 (audit P0 CRIT-2): validar que TODOS los
    // productoId de ingredientes (y el productoId final si existe) pertenecen
    // al tenant. Sin esto, un admin de tenant A creaba receta con productoId
    // de tenant B, y al producir leakaba/decrementaba stock ajeno.
    // Audit project-wide 2026-05-19: migrado a ProductsDB.countOwnedByIds.
    const productIds = parsed.data.ingredientes.map((i) => i.productoId);
    if (parsed.data.productoId) productIds.push(parsed.data.productoId);
    const ownedCount = await ProductsDB.countOwnedByIds(auth.tenantId, productIds);
    if (ownedCount !== new Set(productIds).size) {
      return NextResponse.json(
        { error: "Uno o más productos no fueron encontrados en tu inventario" },
        { status: 404 },
      );
    }

    const receta = await RecetasDB.create({
      tenantId: auth.tenantId,
      nombre: parsed.data.nombre,
      descripcion: parsed.data.descripcion,
      productoId: parsed.data.productoId,
      ingredientes: parsed.data.ingredientes,
    });

    logActivity(
      "Crear", "receta",
      `Receta "${parsed.data.nombre}" creada con ${parsed.data.ingredientes.length} ingredientes`,
      receta.id, auth.username,
    ).catch((err) => logger.error("[recetas] activity log failed", { err: String(err) }));

    return NextResponse.json(receta, { status: 201 });
  } catch (e) {
    logger.error("[recetas] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
