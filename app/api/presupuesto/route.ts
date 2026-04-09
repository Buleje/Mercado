import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const TENANT_ID = "main";
const NOTE_TITLE = "__PRESUPUESTO_MENSUAL__";

const CategoriaSchema = z.object({
  nombre: z.string().min(1),
  limite: z.number().positive(),
});

const PostSchema = z.object({
  categorias: z.array(CategoriaSchema).min(1).max(20),
});

// ── GET: retorna presupuesto del mes actual ────────────────────────────────────
export async function GET() {
  try {
    const now = new Date();
    const mes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // Buscar nota con presupuesto
    const note = await prisma.note.findFirst({
      where: { tenantId: TENANT_ID, title: NOTE_TITLE },
    });

    if (!note || !note.content) {
      return NextResponse.json({ mes, categorias: [] });
    }

    let categorias: { nombre: string; limite: number }[] = [];
    try {
      const parsed = JSON.parse(note.content);
      categorias = Array.isArray(parsed) ? parsed : [];
    } catch {
      return NextResponse.json({ mes, categorias: [] });
    }

    // Para cada categoria, calcular gastado del mes actual
    const expenses = await prisma.expense.findMany({
      where: {
        tenantId: TENANT_ID,
        date: { gte: startOfMonth, lte: endOfMonth },
      },
      select: { category: true, amount: true },
    });

    // Agrupar gastos por categoria
    const gastosPorCategoria: Record<string, number> = {};
    for (const exp of expenses) {
      const cat = exp.category.toLowerCase();
      gastosPorCategoria[cat] = (gastosPorCategoria[cat] || 0) + exp.amount;
    }

    const categoriasConGasto = categorias.map((cat) => {
      const gastado = gastosPorCategoria[cat.nombre.toLowerCase()] || 0;
      const porcentaje = cat.limite > 0 ? Math.round((gastado / cat.limite) * 100) : 0;
      return {
        nombre: cat.nombre,
        limite: cat.limite,
        gastado: Math.round(gastado * 100) / 100,
        porcentaje,
      };
    });

    return NextResponse.json({ mes, categorias: categoriasConGasto });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── POST: guardar/actualizar presupuesto ───────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = PostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { categorias } = parsed.data;
    const content = JSON.stringify(categorias);

    // Upsert: buscar nota existente o crear
    const existing = await prisma.note.findFirst({
      where: { tenantId: TENANT_ID, title: NOTE_TITLE },
    });

    if (existing) {
      await prisma.note.update({
        where: { id: existing.id },
        data: { content },
      });
    } else {
      await prisma.note.create({
        data: {
          tenantId: TENANT_ID,
          title: NOTE_TITLE,
          content,
          color: "blue",
          pinned: true,
        },
      });
    }

    return NextResponse.json({ ok: true, categorias: categorias.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
