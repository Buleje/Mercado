import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { GuiaPlataDB, PlataGuiaError } from "@/lib/db/guia-plata.db";
import { GuiaConPagosError } from "@/lib/db/forest-cuenta.db";
import { esNoCierra, guardarPlataGuiaSchema } from "@/lib/forestal/plata-de-guia";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";

/**
 * /api/admin/forestal/guias/plata — la plata de UNA guía de ingreso (ADR-437).
 *
 * GET `?gtf=`        → `PlataDeGuiaDTO` (costo por especie, a quién se le paga,
 *                      estado de pago, fletes, gastos, costo puesto en patio).
 * GET `?sinPagar=1`  → `{ porParte: GuiasSinPagarDeParte[] }` (aviso de la tira).
 * PUT                → `guardarPlataGuiaSchema` (servicio | compra | quitar_servicio).
 *
 * Todas: `requireAdmin` → CSRF en escrituras → rate limit → guard
 * `spec:forestal:ctp-libro` → `safeParse` → `auth.tenantId`.
 */

const LEER = ["admin", "almacenero", "owner"] as const;
const ESCRIBIR = ["admin", "owner"] as const;

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro");
  return ok
    ? null
    : NextResponse.json(
        { error: "specialization_disabled", message: "El módulo CTP no está habilitado para este negocio." },
        { status: 403 },
      );
}

/** Errores de negocio → su status; el resto, 500 con log. */
function responderError(err: unknown, ctx: string, tenantId: string) {
  if (err instanceof PlataGuiaError) {
    return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
  }
  if (err instanceof GuiaConPagosError) {
    return NextResponse.json({ error: "TIENE_PAGOS", message: err.message, pagado: err.pagado }, { status: 409 });
  }
  logger.error(`[guias/plata.${ctx}] failed`, { error: String(err), tenantId });
  return NextResponse.json({ error: "internal_error" }, { status: 500 });
}

export const GET = withApiHandler("forestal-guias-plata-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, LEER);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const sp = req.nextUrl.searchParams;
  try {
    if (sp.get("sinPagar") === "1") {
      const porParte = await GuiaPlataDB.sinPagarPorParte(auth.tenantId);
      return NextResponse.json({ porParte }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const gtf = (sp.get("gtf") ?? "").trim();
    if (!gtf || gtf.length > 80) {
      return NextResponse.json({ error: "missing_gtf", message: "Falta el número de guía (?gtf=)." }, { status: 400 });
    }
    const dto = await GuiaPlataDB.leer(auth.tenantId, gtf);
    if (!dto) return NextResponse.json({ error: "not_found", message: `La guía ${gtf} no existe.` }, { status: 404 });
    return NextResponse.json(dto, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    return responderError(err, "GET", auth.tenantId);
  }
});

export const PUT = withApiHandler("forestal-guias-plata-put", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ESCRIBIR);
  if (auth instanceof NextResponse) return auth;
  const rol = soloAdminODueno(auth.role);
  if (rol) return rol;
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
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = guardarPlataGuiaSchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    /* `no_cierra` sólo si es EL problema: con otros errores (una línea mal, un
       id repetido) el 422 genérico los lista todos y no esconde el real. */
    if (esNoCierra(parsed.error.issues) && parsed.error.issues.every((i) => esNoCierra([i]))) {
      const msg = parsed.error.issues.find((i) => esNoCierra([i]))?.message;
      return NextResponse.json({ error: "no_cierra", message: msg, issues }, { status: 422 });
    }
    return NextResponse.json({ error: "validation_error", issues }, { status: 422 });
  }
  try {
    const dto = await GuiaPlataDB.guardar(auth.tenantId, parsed.data, { username: auth.username });
    return NextResponse.json(dto);
  } catch (err) {
    return responderError(err, "PUT", auth.tenantId);
  }
});
