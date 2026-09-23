import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { ParteNoEncontradaError } from "@/lib/db/forest-parte-tarifa.db";
import { ForestParteVinculoDB, VinculoDuplicadoError, VinculoParteError } from "@/lib/db/forest-parte-vinculo.db";
import { vinculoParteInputSchema } from "@/lib/forestal/vinculos-parte";

/**
 * /api/admin/forestal/directorio/vinculos — una parte atada a otra parte o a un
 * permiso (ADR-430). El vínculo no mueve plata: sólo deja ver saldos al lado.
 *
 * GET    `?parteId=`        → `{ vinculos: VinculoParte[] }` (los que salen de esa parte
 *                              Y los que otra parte anotó apuntando a ella — `vinculo.sentido`)
 * POST   `VinculoParteInput` → 201 `{ vinculo }`
 * DELETE `?id=`             → `{ ok: true }` (baja lógica)
 *
 * Errores: 400 cuerpo o parámetro inválido · 403 rol/CSRF/módulo · 404 la
 * parte, la vinculada o el permiso no son de este tenant · 409 ya está
 * anotado · 422 regla del vínculo. Cuerpo `{ error, message }`.
 *
 * Leer: admin/owner/almacenero/manager. Escribir: admin/owner.
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

const noEncontrado = (message: string) => NextResponse.json({ error: "not_found", message }, { status: 404 });

/* La LECTURA va en su propio balde («ctp-ficha»): el balde «ctp» lo comparten
   76 rutas del libro, y abrir unas 10 fichas seguidas lo agotaba (429 medido
   en el navegador el 22-09). Las escrituras siguen en «ctp». */
export const GET = withApiHandler("forestal-directorio-vinculos-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, LEER);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp-ficha");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const parteId = (req.nextUrl.searchParams.get("parteId") ?? "").trim();
  if (!parteId) {
    return NextResponse.json({ error: "missing_parteId", message: "Falta decir de qué parte." }, { status: 400 });
  }
  try {
    return NextResponse.json({ vinculos: await ForestParteVinculoDB.listar(auth.tenantId, parteId) });
  } catch (err) {
    if (err instanceof ParteNoEncontradaError) return noEncontrado(err.message);
    logger.error("[directorio.vinculos.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const POST = withApiHandler("forestal-directorio-vinculos-post", async (req: NextRequest) => {
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
  const parsed = vinculoParteInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "validation_error",
        message: parsed.error.issues[0]?.message ?? "El vínculo no es válido.",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400 },
    );
  }

  try {
    const vinculo = await ForestParteVinculoDB.crear(auth.tenantId, parsed.data, auth.username ?? "unknown");
    return NextResponse.json({ vinculo }, { status: 201 });
  } catch (err) {
    if (err instanceof ParteNoEncontradaError) return noEncontrado(err.message);
    if (err instanceof VinculoDuplicadoError) {
      return NextResponse.json({ error: "duplicado", message: err.message }, { status: 409 });
    }
    if (err instanceof VinculoParteError) {
      return NextResponse.json({ error: "vinculo_invalido", message: err.message }, { status: 422 });
    }
    logger.error("[directorio.vinculos.POST] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const DELETE = withApiHandler("forestal-directorio-vinculos-delete", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ESCRIBIR);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "missing_id", message: "Falta decir qué vínculo quitar." }, { status: 400 });
  try {
    const ok = await ForestParteVinculoDB.quitar(auth.tenantId, id, auth.username ?? "unknown");
    if (!ok) return noEncontrado("Ese vínculo ya no existe.");
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[directorio.vinculos.DELETE] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
