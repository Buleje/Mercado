import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ExpensesDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { requireActiveSubscription } from "@/lib/billing/require-active-subscription";
import { assertCsrf } from "@/lib/auth/csrf";
import { toErrorPayload } from "@/lib/api-error";
import { applyRateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";

/**
 * GET legacy — devuelve summary de TODOS los gastos del tenant.
 * Nota: el route es `[id]` pero el handler ignora el id por historia legacy.
 * Se mantiene para no romper consumidores existentes; mover summary a /api/expenses/summary
 * en un futuro refactor (ADR-recomendable).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const summary = await ExpensesDB.getSummary(auth.tenantId);
    return NextResponse.json(summary);
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}

/**
 * PUT /api/expenses/:id — corrige un gasto ya registrado.
 *
 * Sólo los campos de una corrección: monto mal tipeado, categoría equivocada,
 * fecha corrida, proveedor que faltaba. `recurring` no se toca acá — convertir
 * un pago en plantilla no es corregir, es crear otra cosa.
 */
/** «Monto: 80.00 → 85.50 · Categoría: Transporte → Combustible». */
function describirCambios(
  antes: Record<string, unknown> | null,
  despues: Record<string, unknown>,
): string {
  if (!antes) return "Corrigió el gasto";
  const etiquetas: Record<string, string> = {
    description: "Descripción", amount: "Monto", category: "Categoría",
    date: "Fecha", paymentMethod: "Método de pago", supplierName: "Proveedor", notes: "Notas",
  };
  const partes: string[] = [];
  for (const [campo, etiqueta] of Object.entries(etiquetas)) {
    const a = antes[campo] ?? "";
    const b = despues[campo] ?? "";
    // Las fechas viajan como ISO completo; comparar el día evita registrar un
    // cambio por la hora que el propio update normaliza.
    const norm = (v: unknown) => (campo === "date" ? String(v).slice(0, 10) : String(v));
    if (norm(a) !== norm(b)) partes.push(`${etiqueta}: ${norm(a) || "—"} → ${norm(b) || "—"}`);
  }
  return partes.join(" · ");
}

const PatchSchema = z.object({
  category: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  amount: z.number().positive().max(9_999_999).optional(),
  date: z.string().datetime().optional(),
  paymentMethod: z.string().max(60).nullable().optional(),
  supplierName: z.string().max(200).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "expenses");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;
  const blocked = await requireActiveSubscription(auth.tenantId);
  if (blocked) return blocked;

  try {
    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const raw = await req.json().catch(() => null);
    const parsed = PatchSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
        { status: 400 },
      );
    }

    // El «antes» se lee ANTES de escribir: con dinero de por medio, la
    // auditoría tiene que poder decir de cuánto a cuánto, no sólo que hubo un
    // cambio (Ley 29733 y, más terrenal, «¿quién le puso 850 al alquiler?»).
    const antes = await ExpensesDB.getById(auth.tenantId, id);
    const expense = await ExpensesDB.update(auth.tenantId, id, parsed.data);
    if (!expense) {
      return NextResponse.json({ error: "Gasto no encontrado en este tenant" }, { status: 404 });
    }
    const cambios = describirCambios(antes, expense);
    if (cambios) {
      logActivity(
        "update", "Expense", cambios, id, auth.username ?? "admin", undefined, auth.tenantId,
      ).catch((err) => logger.warn("[expenses/:id] activity log falló", { error: String(err) }));
    }
    return NextResponse.json(expense);
  } catch (err) {
    logger.error("[expenses/:id] PUT error", { err: err instanceof Error ? err.message : String(err) });
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}

/**
 * DELETE /api/expenses/:id — elimina un gasto (template recurrente o ejecutado).
 * RBAC: admin. Rate-limit MODERATE. ExpensesDB.delete usa deleteMany con
 * filtro de tenantId — multi-tenant safe.
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const _rl = await applyRateLimit(req, "MODERATE", "expenses");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const blocked = await requireActiveSubscription(auth.tenantId);
  if (blocked) return blocked;

  try {
    const { id } = await ctx.params;
    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    // Se devuelve el registro borrado: es lo que necesita el «deshacer» de la
    // UI para volver a crearlo igual, con los campos que ninguna pantalla
    // muestra incluidos.
    const borrado = await ExpensesDB.delete(auth.tenantId, id);
    if (!borrado) {
      return NextResponse.json({ error: "Gasto no encontrado en este tenant" }, { status: 404 });
    }
    logActivity(
      "delete", "Expense",
      `Borró el gasto «${borrado.description}» de ${borrado.amount}`,
      id, auth.username ?? "admin", undefined, auth.tenantId,
    ).catch((err) => logger.warn("[expenses/:id] activity log falló", { error: String(err) }));
    return NextResponse.json({ ok: true, deleted: borrado });
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}
