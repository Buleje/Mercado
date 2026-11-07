import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { requireAdmin } from "@/lib/require-admin";
import { isSpecializationEnabled } from "@/lib/specializations";
import { ForestPlanillasDB } from "@/lib/db/forest-planillas.db";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { esPlanillaId, parteEditable, planillaPorId } from "@/lib/forestal/planillas/catalogo";
import type { PlanillaId } from "@/lib/forestal/planillas/tipos";

/**
 * /api/admin/forestal/planillas/prompts — el prompt PROPIO del negocio para
 * leer cada planilla de campo (17-10).
 *
 *   GET                       → { guardados } (sólo los que el negocio cambió)
 *   PUT { planillaId, texto } → { guardado } · { guardado: null, fabrica: true }
 *                               si el texto es el de fábrica (no se guarda copia)
 *   DELETE ?planillaId=       → { borrado } — vuelve al de fábrica
 *
 * Se guarda sólo la parte que se cuenta de la hoja: el bloque «Qué devolver»
 * lo arma el sistema con las columnas y se pega al leer (`promptParaLeer`), así
 * un prompt propio nunca rompe la forma de la respuesta.
 */

const ROLES = ["admin", "almacenero", "owner"] as const;
const MIN_TEXTO = 40;
const MAX_TEXTO = 8000;

const IdSchema = z.custom<PlanillaId>(esPlanillaId, { message: "Planilla desconocida" });

const PutSchema = z.object({
  planillaId: IdSchema,
  texto: z.string().max(MAX_TEXTO * 2, `El prompt pasa de ${MAX_TEXTO} caracteres`),
});

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:herramientas");
  return ok ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "GENEROUS", "planillas-prompts-ver");
  if (rl) return rl;
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  return NextResponse.json({ guardados: await ForestPlanillasDB.prompts(auth.tenantId) });
}

export async function PUT(req: NextRequest) {
  const rl = await applyRateLimit(req, "MODERATE", "planillas-prompts-editar");
  if (rl) return rl;
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });

  const planilla = planillaPorId(parsed.data.planillaId);
  if (!planilla) return NextResponse.json({ error: "Planilla desconocida" }, { status: 400 });

  /* Lo que se manda puede traer el bloque «Qué devolver» (el editor muestra el
     prompt entero): se corta y se guarda sólo lo editable. */
  const texto = parteEditable(parsed.data.texto);
  if (texto.length < MIN_TEXTO) {
    return NextResponse.json({ error: `El prompt necesita al menos ${MIN_TEXTO} caracteres (sin el bloque «Qué devolver»).` }, { status: 400 });
  }
  if (texto.length > MAX_TEXTO) {
    return NextResponse.json({ error: `El prompt pasa de ${MAX_TEXTO} caracteres.` }, { status: 400 });
  }

  // Igual al de fábrica = no es «propio»: se borra el guardado, si había.
  if (texto === parteEditable(planilla.prompt)) {
    const borrado = await ForestPlanillasDB.borrar(auth.tenantId, planilla.id, auth.username);
    if (borrado) {
      auditCtp({
        tenantId: auth.tenantId,
        action: "ctp_planilla_prompt_borrar",
        entity: "ForestPlanillaPrompt",
        entityId: planilla.id,
        detail: `Prompt de «${planilla.nombre}»: vuelve al de fábrica (v${planilla.versionPrompt})`,
        user: auth.username,
      });
    }
    return NextResponse.json({ guardado: null, fabrica: true });
  }

  const guardado = await ForestPlanillasDB.guardar(
    auth.tenantId,
    planilla.id,
    { texto, basadoEnVersion: planilla.versionPrompt },
    auth.username,
  );
  auditCtp({
    tenantId: auth.tenantId,
    action: "ctp_planilla_prompt_guardar",
    entity: "ForestPlanillaPrompt",
    entityId: planilla.id,
    detail: `Prompt propio de «${planilla.nombre}» (${texto.length} caracteres, sobre la v${planilla.versionPrompt} de fábrica)`,
    user: auth.username,
  });
  return NextResponse.json({ guardado });
}

export async function DELETE(req: NextRequest) {
  const rl = await applyRateLimit(req, "MODERATE", "planillas-prompts-editar");
  if (rl) return rl;
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const id = IdSchema.safeParse(req.nextUrl.searchParams.get("planillaId"));
  if (!id.success) return NextResponse.json({ error: "Planilla desconocida" }, { status: 400 });
  const planilla = planillaPorId(id.data);
  if (!planilla) return NextResponse.json({ error: "Planilla desconocida" }, { status: 400 });

  const borrado = await ForestPlanillasDB.borrar(auth.tenantId, planilla.id, auth.username);
  if (borrado) {
    auditCtp({
      tenantId: auth.tenantId,
      action: "ctp_planilla_prompt_borrar",
      entity: "ForestPlanillaPrompt",
      entityId: planilla.id,
      detail: `Prompt de «${planilla.nombre}»: vuelve al de fábrica (v${planilla.versionPrompt})`,
      user: auth.username,
    });
  }
  return NextResponse.json({ borrado });
}
