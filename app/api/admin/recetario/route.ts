import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";

const IngredienteSchema = z.object({
  nombre: z.string().min(1),
  cantidad: z.number().positive(),
  unidad: z.string().min(1),
  precio: z.number().min(0),
  productoId: z.number().optional().nullable(),
});

const RecetarioSchema = z.object({
  nombre: z.string().min(1, "Nombre requerido"),
  descripcion: z.string().optional().default(""),
  emoji: z.string().optional().default(""),
  tiempoMinutos: z.number().int().positive().optional().default(30),
  porciones: z.number().int().positive().optional().default(4),
  dificultad: z.enum(["Facil", "Media", "Dificil"]).optional().default("Facil"),
  categoria: z.string().optional().default("Platos de fondo"),
  videoUrl: z.string().nullable().optional().default(null),
  ingredientes: z.array(IngredienteSchema).min(1, "Al menos un ingrediente"),
  pasos: z.array(z.string().min(1)).min(1, "Al menos un paso"),
  activa: z.boolean().optional().default(true),
});

// GET: list all recetario recipes (admin-managed public recipes)
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    // Audit 2026-05-17 X-P0-1: agregado tenantId al where para cerrar
    // cross-tenant leak. Antes cualquier admin veía recetas de TODOS los
    // tenants. POST sí pasaba tenantId — solo GET era leak.
    const notes = await prisma.note.findMany({
      where: { tenantId: auth.tenantId, title: "__RECETARIO__" },
      orderBy: { createdAt: "desc" },
    });

    const recetas = notes
      .map(n => {
        try {
          const data = JSON.parse(n.content);
          return { ...data, _noteId: n.id, createdAt: n.createdAt, updatedAt: n.updatedAt };
        } catch {
          return null;
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    return NextResponse.json(recetas);
  } catch {
    return NextResponse.json([]);
  }
}

// POST: create a new recetario recipe
export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "admin-recetario"); if (_rl) return _rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const parsed = RecetarioSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((e: { message: string }) => e.message).join(", ") },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const totalIngredientes = data.ingredientes.reduce(
      (sum, ing) => sum + ing.precio * ing.cantidad,
      0
    );

    const recetaData = {
      id: `recetario-${Date.now().toString(36)}`,
      nombre: data.nombre,
      descripcion: data.descripcion,
      emoji: data.emoji,
      tiempoMinutos: data.tiempoMinutos,
      porciones: data.porciones,
      dificultad: data.dificultad,
      categoria: data.categoria,
      videoUrl: data.videoUrl,
      ingredientes: data.ingredientes.map(ing => ({
        nombre: ing.nombre,
        cantidad: ing.cantidad,
        unidad: ing.unidad,
        precio: ing.precio,
        productoId: ing.productoId ?? null,
        imagen: null,
        stock: 0,
      })),
      totalIngredientes,
      pasos: data.pasos,
      activa: data.activa,
    };

    const note = await prisma.note.create({
      data: {
        tenantId: auth.tenantId,
        title: "__RECETARIO__",
        content: JSON.stringify(recetaData),
        color: "green",
        pinned: false,
      },
    });

    return NextResponse.json({ ...recetaData, _noteId: note.id }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al crear receta" },
      { status: 500 }
    );
  }
}
