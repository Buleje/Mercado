import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestPlanDB } from "@/lib/db/forest-plan.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/forestal/loth/extraccion — la vista «Extracción» del Libro TH
 * (ADR-454): por permiso y por especie, el censo aprovechable contra lo
 * talado, trozado y despachado (un saldo por operación), la cadena hasta el
 * aserrado del CTP, KPIs, semanas y avisos 80/100 %.
 *
 * GET ?planId=X | ?contratoId=Y | (nada = todo el negocio, con «Sin plan»)
 *     [&desde=AAAA-MM-DD&hasta=AAAA-MM-DD] [&antDesde=…&antHasta=…]
 *   `planId=sin-plan` = sólo las líneas sin plan ni árbol en un censo.
 *   → ExtraccionResponse (`lib/forestal/loth-extraccion-tipos.ts`)
 *
 * Los saldos son acumulados a `hasta`; `desde` sólo recorta el flujo del
 * período. Guard: requireAdmin (sin plata: admin, almacenero y dueño) → rate
 * limit → spec:forestal:loth-libro → Zod. Sólo lectura, sin caché en v1: una
 * escritura del CTP no invalida el prefijo `forest-plan`.
 */

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const fecha = z
  .string()
  .regex(FECHA, "La fecha va como AAAA-MM-DD")
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Esa fecha no existe");

const querySchema = z
  .object({
    planId: z.string().trim().min(1).max(64).optional(),
    contratoId: z.string().trim().min(1).max(64).optional(),
    desde: fecha.optional(),
    hasta: fecha.optional(),
    antDesde: fecha.optional(),
    antHasta: fecha.optional(),
  })
  .superRefine((q, ctx) => {
    if (q.planId && q.contratoId) {
      ctx.addIssue({ code: "custom", path: ["contratoId"], message: "Pide un plan o un permiso, no los dos" });
    }
    if (q.desde && q.hasta && q.desde > q.hasta) {
      ctx.addIssue({ code: "custom", path: ["desde"], message: "«Desde» no puede ser después de «hasta»" });
    }
    if (!!q.antDesde !== !!q.antHasta) {
      ctx.addIssue({ code: "custom", path: ["antDesde"], message: "El período anterior va con sus dos fechas" });
    }
    if (q.antDesde && q.antHasta && q.antDesde > q.antHasta) {
      ctx.addIssue({ code: "custom", path: ["antDesde"], message: "El período anterior está al revés" });
    }
  });

const CAMPOS = ["planId", "contratoId", "desde", "hasta", "antDesde", "antHasta"] as const;

export const GET = withApiHandler("forestal-loth-extraccion", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "GENEROUS", "loth-extraccion");
  if (rl) return rl;

  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:loth-libro"))) {
    return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
  }

  const params = new URL(req.url).searchParams;
  // Un parámetro vacío («?desde=») es «sin filtro», no una fecha inválida.
  const crudo = Object.fromEntries(CAMPOS.map((k) => [k, params.get(k)?.trim() || undefined]));
  const parsed = querySchema.safeParse(crudo);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", message: parsed.error.issues[0]?.message }, { status: 400 });
  }

  try {
    const data = await ForestPlanDB.extraccion(auth.tenantId, parsed.data);
    if (!data) {
      return NextResponse.json({ error: "not_found", message: "Ese plan o permiso no existe en este negocio." }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (err) {
    logger.error("[loth.extraccion.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
