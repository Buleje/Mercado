import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { RecetasDB } from "@/lib/db/recetas.db";
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
    ).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });

    return NextResponse.json(receta, { status: 201 });
  } catch (e) {
    logger.error("[recetas] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
