import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { AdelantoTratoError, ParteNoEncontradaError } from "@/lib/db/forest-parte-tarifa.db";
import { ForestTratoSinCobrarDB } from "@/lib/db/forest-trato-sin-cobrar.db";
import {
  arregloTratoInputSchema,
  propuestaTratoQuerySchema,
  type MotivoNoAdelanta,
} from "@/lib/forestal/trato-sin-cobrar";

/**
 * /api/admin/forestal/tarifas-cliente/vigencia — corridas que el trato de un
 * cliente debería cobrar y no cobró, y su arreglo de un clic (ADR-430, caso
 * WASACO 23-09: trato desde el 14/09, 6 corridas del 07/09 sin precio).
 *
 * GET  `?parteId=[&desde=AAAA-MM-DD]` → `PropuestaDelTrato` (`arreglo: null` =
 *      no falta nada). Con `desde`, la propuesta para adelantar a esa fecha:
 *      lo que la línea del trato muestra ANTES de su botón.
 * POST `ArregloTratoInput` → `ResultadoDelArreglo`: adelanta el trato (si vienen
 *      `tarifaId` + `desde`) y cobra lo que ahora cubre por `cobrarCorrida`.
 *
 * Errores: 400 cuerpo o parámetro inválido · 403 rol/CSRF/módulo · 404 la parte
 * no es de este tenant o no tiene trato · 409 el trato cambió (hay otra versión
 * que ya empieza antes: no se pisa) · 422 la fecha no es anterior al trato.
 * Cuerpo `{ error, message }`.
 *
 * Leer: admin/owner/manager/almacenero (como la ficha). Escribir: admin/owner/
 * manager — `ESCRIBIR` nombra admin/owner, pero `requireAdmin` deja pasar
 * SIEMPRE al tier de gestión (admin/owner/manager); el almacenero no entra.
 * Como el trato: mueve un precio y carga deuda en la cuenta de un tercero.
 * Guard: `spec:forestal:ctp-libro` · GET en el balde `ctp-ficha`, POST en `ctp`.
 */

const LEER = ["admin", "owner", "almacenero", "manager"] as const;
const ESCRIBIR = ["admin", "owner"] as const;

const ESTADO: Record<MotivoNoAdelanta, number> = { sin_trato: 404, otra_version: 409, no_es_antes: 422 };

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro");
  return ok
    ? null
    : NextResponse.json(
        { error: "specialization_disabled", message: "El módulo CTP no está habilitado para este tenant." },
        { status: 403 },
      );
}

export const GET = withApiHandler("forestal-tarifas-cliente-vigencia-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, LEER);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp-ficha");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const sp = req.nextUrl.searchParams;
  const query = propuestaTratoQuerySchema.safeParse({
    parteId: sp.get("parteId") ?? "",
    desde: sp.get("desde") || null,
  });
  if (!query.success) {
    const issue = query.error.issues[0];
    return NextResponse.json(
      {
        error: issue?.path[0] === "parteId" ? "missing_parteId" : "validation_error",
        message: issue?.message ?? "El pedido no es válido.",
      },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(
      await ForestTratoSinCobrarDB.propuesta(auth.tenantId, query.data.parteId, { desde: query.data.desde ?? null }),
    );
  } catch (err) {
    if (err instanceof ParteNoEncontradaError) {
      return NextResponse.json({ error: "not_found", message: err.message }, { status: 404 });
    }
    logger.error("[tarifas-cliente.vigencia.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const POST = withApiHandler("forestal-tarifas-cliente-vigencia-post", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ESCRIBIR);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json", message: "El cuerpo no es JSON." }, { status: 400 });
  }
  const parsed = arregloTratoInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "validation_error",
        message: parsed.error.issues[0]?.message ?? "El pedido no es válido.",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await ForestTratoSinCobrarDB.arreglar(auth.tenantId, parsed.data, auth.username ?? "unknown"),
    );
  } catch (err) {
    if (err instanceof ParteNoEncontradaError) {
      return NextResponse.json({ error: "not_found", message: err.message }, { status: 404 });
    }
    if (err instanceof AdelantoTratoError) {
      return NextResponse.json({ error: err.motivo, message: err.message }, { status: ESTADO[err.motivo] });
    }
    logger.error("[tarifas-cliente.vigencia.POST] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
