import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ExpensesDB } from "@/lib/jsondb";
import { GastoConCajaDB, RetiroEnCajaError } from "@/lib/db/gasto-con-caja.db";
import { requireAdmin } from "@/lib/require-admin";
import { requireActiveSubscription } from "@/lib/billing/require-active-subscription";
import { assertCsrf } from "@/lib/auth/csrf";
import { toErrorPayload } from "@/lib/api-error";
import { applyRateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { leerJson } from "@/lib/errores/sin-dato";
import { corregirComprobante } from "@/lib/gastos/corregir-comprobante";

/**
 * GET legacy — devuelve summary de TODOS los gastos del tenant.
 * Nota: el route es `[id]` pero el handler ignora el id por historia legacy.
 * Se mantiene para no romper consumidores existentes; mover summary a /api/expenses/summary
 * en un futuro refactor (ADR-recomendable).
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    // `?detalle=1` = el gasto entero (comprobante, foto, IGV): lo pide «Corregir
    // gasto», porque el historial sólo trae lo que muestra la tabla.
    if (req.nextUrl.searchParams.get("detalle") === "1") {
      const { id } = await ctx.params;
      const gasto = id ? await ExpensesDB.getById(auth.tenantId, id) : null;
      if (!gasto) return NextResponse.json({ error: "Gasto no encontrado en este tenant" }, { status: 404 });
      return NextResponse.json(gasto);
    }
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
 * fecha corrida, proveedor que faltaba, y el comprobante (tipo, N°, RUC, IGV,
 * foto) revisado con la misma regla del alta. `recurring` no se toca acá — convertir
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
    documentType: "Comprobante", documentNumber: "N°", supplierRuc: "RUC", igvAmount: "IGV",
    attachmentUrl: "Foto",
  };
  const partes: string[] = [];
  for (const [campo, etiqueta] of Object.entries(etiquetas)) {
    const a = antes[campo] ?? "";
    const b = despues[campo] ?? "";
    // Las fechas viajan como ISO completo; comparar el día evita registrar un
    // cambio por la hora que el propio update normaliza.
    // La foto es una URL larga: en el registro basta con «con foto / sin foto».
    const norm = (v: unknown) =>
      campo === "date" ? String(v).slice(0, 10) : campo === "attachmentUrl" ? (v ? "con foto" : "") : String(v);
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
  // El papel del gasto: se revisa con `corregirComprobante` (la misma regla del alta).
  documentType: z.string().max(30).nullable().optional(),
  documentNumber: z.string().max(60).nullable().optional(),
  supplierRuc: z.string().max(20).nullable().optional(),
  igvAmount: z.number().min(0).max(9_999_999).nullable().optional(),
  afectoIgv: z.boolean().nullable().optional(),
  // Sólo http(s): la URL se pinta como enlace y un `javascript:` sería XSS.
  attachmentUrl: z.string().max(2000).regex(/^https?:\/\//i, "La foto tiene que ser un enlace http(s)").nullable().optional(),
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

    const raw = await leerJson(req);
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
    if (!antes) {
      return NextResponse.json({ error: "Gasto no encontrado en este tenant" }, { status: 404 });
    }
    const { documentType, documentNumber, supplierRuc, igvAmount, afectoIgv, attachmentUrl, ...base } = parsed.data;
    // El papel se revisa ANTES de escribir nada: un RUC mal tipeado no deja el
    // monto corregido a medias.
    const revision = corregirComprobante(antes, { amount: base.amount, documentType, documentNumber, supplierRuc, igvAmount, afectoIgv });
    if (revision && !revision.ok) {
      return NextResponse.json({ error: revision.error, campo: revision.campo }, { status: 400 });
    }
    const papel = {
      ...(revision?.ok ? revision.datos : {}),
      ...(attachmentUrl !== undefined ? { attachmentUrl } : {}),
    };
    // Si el gasto sacó plata de la caja, su retiro se corrige con él (caja
    // abierta) o la respuesta avisa que quedó en una caja ya cerrada.
    let expense: typeof antes | null = antes;
    let caja: Awaited<ReturnType<typeof GastoConCajaDB.corregirGasto>>["caja"] = null;
    if (Object.keys(base).length > 0) {
      ({ gasto: expense, caja } = await GastoConCajaDB.corregirGasto(auth.tenantId, id, base));
    }
    // El papel va aparte: la corrección con caja escribe en su propia tx sólo
    // los campos de plata, y el comprobante no mueve la caja.
    if (expense && Object.keys(papel).length > 0) {
      expense = (await ExpensesDB.update(auth.tenantId, id, papel)) ?? expense;
    }
    if (!expense) {
      return NextResponse.json({ error: "Gasto no encontrado en este tenant" }, { status: 404 });
    }
    const cambios = describirCambios(antes, expense);
    if (cambios) {
      logActivity(
        "update", "Expense", cambios, id, auth.username ?? "admin", undefined, auth.tenantId,
      ).catch((err) => logger.warn("[expenses/:id] activity log falló", { error: String(err) }));
    }
    return NextResponse.json(caja ? { ...expense, caja } : expense);
  } catch (err) {
    if (err instanceof RetiroEnCajaError) {
      return NextResponse.json({ error: err.message, campo: "paymentMethod" }, { status: 409 });
    }
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
    // Si sacó plata de una caja que sigue abierta, la plata vuelve con él.
    const { borrado, caja } = await GastoConCajaDB.borrarGasto(auth.tenantId, id);
    if (!borrado) {
      return NextResponse.json({ error: "Gasto no encontrado en este tenant" }, { status: 404 });
    }
    logActivity(
      "delete", "Expense",
      `Borró el gasto «${borrado.description}» de ${borrado.amount}`,
      id, auth.username ?? "admin", undefined, auth.tenantId,
    ).catch((err) => logger.warn("[expenses/:id] activity log falló", { error: String(err) }));
    return NextResponse.json({ ok: true, deleted: borrado, ...(caja ? { caja } : {}) });
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}
