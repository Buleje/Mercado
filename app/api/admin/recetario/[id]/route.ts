import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";

const IngredienteSchema = z.object({
  nombre: z.string().min(1),
  cantidad: z.number().positive(),
  unidad: z.string().min(1),
  precio: z.number().min(0),
  productoId: z.number().optional().nullable(),
});

const UpdateSchema = z.object({
  nombre: z.string().min(1).optional(),
  descripcion: z.string().optional(),
  emoji: z.string().optional(),
  tiempoMinutos: z.number().int().positive().optional(),
  porciones: z.number().int().positive().optional(),
  dificultad: z.enum(["Facil", "Media", "Dificil"]).optional(),
  categoria: z.string().optional(),
  videoUrl: z.string().nullable().optional(),
  ingredientes: z.array(IngredienteSchema).optional(),
  pasos: z.array(z.string().min(1)).optional(),
  activa: z.boolean().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

// GET: get a single recetario recipe by noteId
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const auth = await requireAdmin(_req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  
  try {
    const { id } = await params;
    // CRITICAL FIX 2026-05-11 (audit P0-4): findUnique({where:{id}}) + filtro
    // post-hoc creaba un timing oracle (200ms si id existe en otro tenant vs
    // 404 si no existe). Si alguien quitaba el guard, IDOR completo. Ahora
    // findFirst con tenantId en el WHERE elimina ambos riesgos.
     
    const note = await prisma.note.findFirst({
      where: { id, tenantId: auth.tenantId, title: "__RECETARIO__" },
    });
    if (!note) {
      return NextResponse.json({ error: "Receta no encontrada" }, { status: 404 });
    }
    const data = JSON.parse(note.content);
    return NextResponse.json({ ...data, _noteId: note.id, createdAt: note.createdAt, updatedAt: note.updatedAt });
  } catch {
    return NextResponse.json({ error: "Error al obtener receta" }, { status: 500 });
  }
}

// PATCH: update a recetario recipe
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const _rl = await applyRateLimit(req, "MODERATE", "admin-recetario-X"); if (_rl) return _rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  
  try {
    const { id } = await params;
    // CRITICAL FIX 2026-05-11 (audit P0-4): findUnique({where:{id}}) + filtro
    // post-hoc creaba un timing oracle (200ms si id existe en otro tenant vs
    // 404 si no existe). Si alguien quitaba el guard, IDOR completo. Ahora
    // findFirst con tenantId en el WHERE elimina ambos riesgos.
     
    const note = await prisma.note.findFirst({
      where: { id, tenantId: auth.tenantId, title: "__RECETARIO__" },
    });
    if (!note) {
      return NextResponse.json({ error: "Receta no encontrada" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((e: { message: string }) => e.message).join(", ") },
        { status: 400 }
      );
    }

    const existing = JSON.parse(note.content);
    const updated = { ...existing, ...parsed.data };

    // Recalculate total if ingredients changed
    if (parsed.data.ingredientes) {
      updated.totalIngredientes = parsed.data.ingredientes.reduce(
        (sum: number, ing: { precio: number; cantidad: number }) => sum + ing.precio * ing.cantidad,
        0
      );
      updated.ingredientes = parsed.data.ingredientes.map(ing => ({
        nombre: ing.nombre,
        cantidad: ing.cantidad,
        unidad: ing.unidad,
        precio: ing.precio,
        productoId: ing.productoId ?? null,
        imagen: null,
        stock: 0,
      }));
    }

     
    await prisma.note.updateMany({
      where: { id, tenantId: auth.tenantId, title: "__RECETARIO__" },
      data: { content: JSON.stringify(updated) },
    });

    return NextResponse.json({ ...updated, _noteId: id });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al actualizar" },
      { status: 500 }
    );
  }
}

// DELETE: delete a recetario recipe (marks inactive or hard delete)
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const _rl = await applyRateLimit(_req, "MODERATE", "admin-recetario-X"); if (_rl) return _rl;
  const csrfFail = assertCsrf(_req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(_req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  
  try {
    const { id } = await params;
    // CRITICAL FIX 2026-05-11 (audit P0-4): findUnique({where:{id}}) + filtro
    // post-hoc creaba un timing oracle (200ms si id existe en otro tenant vs
    // 404 si no existe). Si alguien quitaba el guard, IDOR completo. Ahora
    // findFirst con tenantId en el WHERE elimina ambos riesgos.
     
    const note = await prisma.note.findFirst({
      where: { id, tenantId: auth.tenantId, title: "__RECETARIO__" },
    });
    if (!note) {
      return NextResponse.json({ error: "Receta no encontrada" }, { status: 404 });
    }

     
    await prisma.note.deleteMany({
      where: { id, tenantId: auth.tenantId, title: "__RECETARIO__" },
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}
