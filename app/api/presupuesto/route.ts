import { NextRequest, NextResponse } from "next/server";
import { NotesDB } from "@/lib/db/notes.db";
import { ExpensesDB } from "@/lib/db/expenses.db";
import { requireAdmin } from "@/lib/require-admin";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";

// Barrido a raíz del reporte QA Compras 2026-08-12 (mismo patrón que
// /api/supplier-returns). Este endpoint tenía DOS agujeros:
//   1. `const TENANT_ID = "main"`: el techo de gasto y los gastos del mes de
//      CUALQUIER tenant se leían y escribían sobre el tenant "main" — dos
//      empresas compartiendo el mismo presupuesto, pisándose entre sí.
//   2. Ni GET ni POST llamaban a `requireAdmin`: sin ninguna cookie, `GET
//      /api/presupuesto` devolvía 200 con el gasto del mes por categoría, y el
//      POST dejaba sobrescribir el presupuesto a cualquiera.
// Ahora el tenant sale de la sesión y ambos verbos exigen admin.
const NOTE_TITLE = "__PRESUPUESTO_MENSUAL__";

const CategoriaSchema = z.object({
  nombre: z.string().min(1),
  limite: z.number().positive(),
});

const PostSchema = z.object({
  categorias: z.array(CategoriaSchema).min(1).max(20),
});

// ── GET: retorna presupuesto del mes actual ────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req, ["admin"]);
    if (auth instanceof NextResponse) return auth;

    const now = new Date();
    const mes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // Audit project-wide 2026-05-19: migrado a NotesDB.findFirstByTitle + ExpensesDB.listCurrentMonth.
    const note = await NotesDB.findFirstByTitle(auth.tenantId, NOTE_TITLE);

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
    const expenses = await ExpensesDB.listCurrentMonth(auth.tenantId);

    // Agrupar gastos por categoria (TD-018: amount ya viene como number de la DB class)
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
  const _rl = await applyRateLimit(req, "STRICT", "presupuesto"); if (_rl) return _rl;
  try {
    const auth = await requireAdmin(req, ["admin"]);
    if (auth instanceof NextResponse) return auth;

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

    // Audit project-wide 2026-05-19: migrado a NotesDB.upsertByTitle.
    await NotesDB.upsertByTitle(auth.tenantId, NOTE_TITLE, content, { color: "blue", pinned: true });

    return NextResponse.json({ ok: true, categorias: categorias.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
