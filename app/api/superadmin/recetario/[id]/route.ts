import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

async function requirePlatform(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getPlatformSession(token);
}

const UpdateRecetaSchema = z.object({
  nombre: z.string().min(1).max(200).optional(),
  descripcion: z.string().max(2000).optional(),
  emoji: z.string().max(10).optional().nullable(),
  tiempoMinutos: z.number().int().positive().optional().nullable(),
  porciones: z.number().int().positive().optional().nullable(),
  dificultad: z.enum(["Facil", "Media", "Dificil"]).optional().nullable(),
  categoria: z.string().max(100).optional().nullable(),
  pasosJson: z.string().optional().nullable(),
  imageUrl: z.string().url().max(2000).optional().nullable().or(z.literal("")),
  activa: z.boolean().optional(),
});

// GET /api/superadmin/recetario/[id] — get single recipe with ingredients
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requirePlatform(req);
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const receta = await prisma.receta.findUnique({
      where: { id },
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
        ingredientes: {
          include: {
            producto: {
              select: { id: true, name: true, price: true, image: true },
            },
          },
        },
      },
    });

    if (!receta) {
      return NextResponse.json(
        { error: "Receta no encontrada" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      id: receta.id,
      tenantId: receta.tenantId,
      tenantName: receta.tenant.name,
      tenantSlug: receta.tenant.slug,
      nombre: receta.nombre,
      descripcion: receta.descripcion,
      emoji: receta.emoji,
      tiempoMinutos: receta.tiempoMinutos,
      porciones: receta.porciones,
      dificultad: receta.dificultad,
      categoria: receta.categoria,
      pasosJson: receta.pasosJson,
      imageUrl: receta.imageUrl,
      costoTotal: Number(receta.costoTotal),
      activa: receta.activa,
      ingredientes: receta.ingredientes.map((ing) => ({
        id: ing.id,
        productoId: ing.productoId,
        productoNombre: ing.producto.name,
        cantidad: Number(ing.cantidad),
        unidad: ing.unidad,
      })),
      createdAt: receta.createdAt.toISOString(),
      updatedAt: receta.updatedAt.toISOString(),
    });
  } catch (e) {
    logger.error("[superadmin/recetario/id] GET error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

// PUT /api/superadmin/recetario/[id] — update recipe
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const _rl = await applyRateLimit(req, "GENEROUS", "superadmin-recetario-X"); if (_rl) return _rl;
  try {
    const session = await requirePlatform(req);
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const raw = await req.json().catch((err) => { logger.error("[superadmin/recetario/[id]] parse JSON body failed", { error: String(err) }); return null; });
    if (!raw) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    const parsed = UpdateRecetaSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Datos invalidos",
          issues: parsed.error.issues.map((i) => i.message),
        },
        { status: 400 },
      );
    }

    const existing = await prisma.receta.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Receta no encontrada" },
        { status: 404 },
      );
    }

    // Build update payload — only include fields that were sent
    const data: Record<string, unknown> = {};
    const d = parsed.data;
    if (d.nombre !== undefined) data.nombre = d.nombre;
    if (d.descripcion !== undefined) data.descripcion = d.descripcion;
    if (d.emoji !== undefined) data.emoji = d.emoji;
    if (d.tiempoMinutos !== undefined) data.tiempoMinutos = d.tiempoMinutos;
    if (d.porciones !== undefined) data.porciones = d.porciones;
    if (d.dificultad !== undefined) data.dificultad = d.dificultad;
    if (d.categoria !== undefined) data.categoria = d.categoria;
    if (d.pasosJson !== undefined) data.pasosJson = d.pasosJson;
    if (d.imageUrl !== undefined) data.imageUrl = d.imageUrl || null;
    if (d.activa !== undefined) data.activa = d.activa;

    const updated = await prisma.receta.update({
      where: { id },
      data,
    });

    return NextResponse.json({
      id: updated.id,
      nombre: updated.nombre,
      activa: updated.activa,
      message: "Receta actualizada",
    });
  } catch (e) {
    logger.error("[superadmin/recetario/id] PUT error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

// DELETE /api/superadmin/recetario/[id] — delete recipe permanently
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const _rl = await applyRateLimit(req, "GENEROUS", "superadmin-recetario-X"); if (_rl) return _rl;
  try {
    const session = await requirePlatform(req);
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const existing = await prisma.receta.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Receta no encontrada" },
        { status: 404 },
      );
    }

    // Delete ingredientes first (cascade should handle it, but be explicit)
    await prisma.recetaIngrediente.deleteMany({ where: { recetaId: id } });
    await prisma.receta.delete({ where: { id } });

    return NextResponse.json({ ok: true, message: "Receta eliminada" });
  } catch (e) {
    logger.error("[superadmin/recetario/id] DELETE error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
