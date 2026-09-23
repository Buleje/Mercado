import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { ForestParteTarifaDB, ParteNoEncontradaError, TarifaClienteError } from "@/lib/db/forest-parte-tarifa.db";
import { tarifaClienteInputSchema } from "@/lib/forestal/precio-cliente";

/**
 * /api/admin/forestal/tarifas-cliente — el trato de precio con cada cliente (ADR-430).
 *
 * GET    `?parteId=`   → `{ tarifas: TarifaCliente[] }` (por fecha y alta)
 * POST   `TarifaClienteInput` → 201 `{ tarifa }` (versión nueva) · 200 `{ tarifa }`
 *        si ese cliente ya tenía una de ese servicio ESE día (se corrigió)
 * DELETE `?id=`        → `{ ok: true }` (baja lógica)
 *
 * Errores: 400 cuerpo o parámetro inválido · 403 rol/CSRF/módulo · 404 la
 * parte o la versión no son de este tenant · 422 regla del trato (tipo que no
 * existe, grupo borrado). Cuerpo `{ error, message }`: el hook muestra `message`.
 *
 * Leer: admin/owner/almacenero/manager (como el Directorio). Escribir:
 * admin/owner (como la tarifa de la planta: es plata de un tercero).
 * Guard: `spec:forestal:ctp-libro` · rate limit GENEROUS bucket 'ctp'.
 */

const LEER = ["admin", "owner", "almacenero", "manager"] as const;
const ESCRIBIR = ["admin", "owner"] as const;

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro");
  return ok
    ? null
    : NextResponse.json(
        { error: "specialization_disabled", message: "El módulo CTP no está habilitado para este tenant." },
        { status: 403 },
      );
}

const falta = (campo: string, message: string) =>
  NextResponse.json({ error: `missing_${campo}`, message }, { status: 400 });

/* La LECTURA va en su propio balde («ctp-ficha»): el balde «ctp» lo comparten
   76 rutas del libro, y abrir unas 10 fichas seguidas lo agotaba (429 medido
   en el navegador el 22-09). Las escrituras siguen en «ctp». */
export const GET = withApiHandler("forestal-tarifas-cliente-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, LEER);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp-ficha");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const parteId = (req.nextUrl.searchParams.get("parteId") ?? "").trim();
  if (!parteId) return falta("parteId", "Falta decir de qué cliente.");
  try {
    return NextResponse.json({ tarifas: await ForestParteTarifaDB.listar(auth.tenantId, parteId) });
  } catch (err) {
    if (err instanceof ParteNoEncontradaError) {
      return NextResponse.json({ error: "not_found", message: err.message }, { status: 404 });
    }
    logger.error("[tarifas-cliente.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const POST = withApiHandler("forestal-tarifas-cliente-post", async (req: NextRequest) => {
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
  const parsed = tarifaClienteInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "validation_error",
        message: parsed.error.issues[0]?.message ?? "Los precios del cliente no son válidos.",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400 },
    );
  }

  try {
    const { tarifa, corrigio } = await ForestParteTarifaDB.guardar(
      auth.tenantId,
      parsed.data,
      auth.username ?? "unknown",
    );
    return NextResponse.json({ tarifa }, { status: corrigio ? 200 : 201 });
  } catch (err) {
    if (err instanceof ParteNoEncontradaError) {
      return NextResponse.json({ error: "not_found", message: err.message }, { status: 404 });
    }
    if (err instanceof TarifaClienteError) {
      return NextResponse.json({ error: "tarifa_invalida", message: err.message }, { status: 422 });
    }
    logger.error("[tarifas-cliente.POST] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const DELETE = withApiHandler("forestal-tarifas-cliente-delete", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ESCRIBIR);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id) return falta("id", "Falta decir qué precio quitar.");
  try {
    const ok = await ForestParteTarifaDB.quitar(auth.tenantId, id, auth.username ?? "unknown");
    if (!ok) {
      return NextResponse.json({ error: "not_found", message: "Ese precio ya no existe." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[tarifas-cliente.DELETE] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
