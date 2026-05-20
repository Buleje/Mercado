import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { RecetasDB } from "@/lib/db/recetas.db";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { RecetasDetailDB } from "@/lib/db/recetas-detail.db";
import { applyRateLimit } from "@/lib/rate-limit";

const IngredienteSchema = z.object({
  productoId: z.number().int().positive(),
  cantidad: z.number().positive(),
  unidad: z.string().max(30).optional(),
});

const PatchRecetaSchema = z.object({
  nombre: z.string().min(1).max(200).optional(),
  descripcion: z.string().max(1000).optional(),
  productoId: z.number().int().positive().nullable().optional(),
  ingredientes: z.array(IngredienteSchema).min(1).optional(),
});

// GET /api/recetas/[id] — detail with ingredientes and calculated cost
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const receta = await RecetasDB.getById(auth.tenantId, id);
    if (!receta) {
      return NextResponse.json({ error: "Receta no encontrada" }, { status: 404 });
    }

    // Recalculate cost to get fresh data
    const costoActualizado = await RecetasDB.calcularCosto(id);

    return NextResponse.json({ ...receta, costoTotal: costoActualizado });
  } catch (e) {
    logger.error("[recetas/id] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

// PATCH /api/recetas/[id] — update receta
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const _rl = await applyRateLimit(req, "MODERATE", "recetas-X"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const raw = await req.json();
    const parsed = PatchRecetaSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }

    const existing = await RecetasDB.getById(auth.tenantId, id);
    if (!existing) {
      return NextResponse.json({ error: "Receta no encontrada" }, { status: 404 });
    }

    // CRITICAL FIX 2026-05-11 (audit P0 CRIT-2): validar ownership de
    // productoId nuevo y de cada ingrediente antes de persistir el PATCH.
    const newProductIds: number[] = [];
    if (parsed.data.productoId) newProductIds.push(parsed.data.productoId);
    if (parsed.data.ingredientes) {
      for (const ing of parsed.data.ingredientes) newProductIds.push(ing.productoId);
    }
    if (newProductIds.length > 0) {
      // Audit project-wide 2026-05-19: migrado a RecetasDetailDB.
      const ownedCount = await RecetasDetailDB.countOwnedProducts(auth.tenantId, newProductIds);
      if (ownedCount !== new Set(newProductIds).size) {
        return NextResponse.json(
          { error: "Uno o más productos no fueron encontrados en tu inventario" },
          { status: 404 },
        );
      }
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (parsed.data.nombre !== undefined) updateData.nombre = parsed.data.nombre;
    if (parsed.data.descripcion !== undefined) updateData.descripcion = parsed.data.descripcion;
    if (parsed.data.productoId !== undefined) updateData.productoId = parsed.data.productoId;

    await RecetasDetailDB.updateRecetaInTenant(auth.tenantId, id, updateData);
    const updated = await RecetasDetailDB.findRecetaWithIngredientes(auth.tenantId, id);
    if (!updated) {
      return NextResponse.json({ error: "Receta no encontrada" }, { status: 404 });
    }

    // Replace ingredientes if provided
    if (parsed.data.ingredientes) {
      await RecetasDetailDB.replaceIngredientes(id, parsed.data.ingredientes);
    }

    // Recalculate cost
    await RecetasDB.calcularCosto(id);

    const result = await RecetasDB.getById(auth.tenantId, id);

    logActivity(
      "Actualizar", "receta",
      `Receta "${updated.nombre}" actualizada`,
      id, auth.username,
    ).catch((err) => logger.error("[recetas] activity log failed", { err: String(err) }));

    return NextResponse.json(result);
  } catch (e) {
    logger.error("[recetas/id] PATCH error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

// DELETE /api/recetas/[id] — soft delete (activa: false)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const _rl = await applyRateLimit(req, "MODERATE", "recetas-X"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const existing = await RecetasDB.getById(auth.tenantId, id);
    if (!existing) {
      return NextResponse.json({ error: "Receta no encontrada" }, { status: 404 });
    }

    await RecetasDetailDB.softDeleteReceta(auth.tenantId, id);

    logActivity(
      "Desactivar", "receta",
      `Receta "${existing.nombre}" desactivada`,
      id, auth.username,
    ).catch((err) => logger.error("[recetas] activity log failed", { err: String(err) }));

    return NextResponse.json({ ok: true, message: "Receta desactivada" });
  } catch (e) {
    logger.error("[recetas/id] DELETE error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
