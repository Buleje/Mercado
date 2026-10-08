import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit, getClientIp } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { CubicacionTrozasError, type ActorCubicacion } from "@/lib/db/forest-cubicacion-trozas.db";

/**
 * Lo común de /api/admin/forestal/cubicaciones-trozas/** (ADR-478 §3.4):
 * requireAdmin (sin sesión → 401) → rate limit → spec:forestal:herramientas →
 * CSRF en escrituras. `tenantId` SIEMPRE del JWT.
 */

export const noStore = { "Cache-Control": "private, no-store" };
export const ROLES_CUBICAR = ["admin", "almacenero", "owner"] as const;
export const ROLES_PLATA = ["admin", "owner"] as const;

type Sesion = Exclude<Awaited<ReturnType<typeof requireAdmin>>, NextResponse>;

export async function guardCubicacion(
  req: NextRequest,
  opts: {
    roles: readonly ("admin" | "almacenero" | "owner")[];
    escritura: boolean;
    /** Sólo admin y dueño, cortando el bypass de `manager` (borrar un borrador). */
    soloAdmin?: boolean;
    /** Aplicar/anular: `soloAdmin` + su propio bucket de rate limit. */
    plata?: boolean;
  },
): Promise<{ auth: Sesion; actor: ActorCubicacion } | Response> {
  const auth = await requireAdmin(req, opts.roles);
  if (auth instanceof NextResponse) return auth;
  /* `requireAdmin` deja pasar a `manager` por el bypass de gestión: la plata
     (aplicar/anular) es sólo de admin y dueño, como liquidar (ADR-413). */
  if ((opts.plata || opts.soloAdmin) && auth.role !== "admin" && auth.role !== "owner") {
    return NextResponse.json(
      {
        error: "forbidden",
        message: opts.plata
          ? "Solo el administrador o el dueño pueden descontar o anular una cubicación en la cuenta."
          : "Solo el administrador o el dueño pueden borrar una cubicación guardada.",
      },
      { status: 403 },
    );
  }
  const rl = opts.plata
    ? await applyRateLimit(req, "MODERATE", "cubicacion-plata")
    : await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:herramientas"))) {
    return NextResponse.json(
      { error: "specialization_disabled", message: "Las Herramientas Forestales no están habilitadas para esta tienda." },
      { status: 403 },
    );
  }
  if (opts.escritura) {
    const csrf = assertCsrf(req);
    if (csrf) return csrf;
  }
  return { auth, actor: { usuario: auth.username ?? "unknown", ip: getClientIp(req) } };
}

export async function leerJson(req: NextRequest): Promise<{ ok: true; body: unknown } | { ok: false; res: NextResponse }> {
  try {
    return { ok: true, body: await req.json() };
  } catch {
    return { ok: false, res: NextResponse.json({ error: "invalid_json", message: "El cuerpo no es JSON." }, { status: 400 }) };
  }
}

export function invalido(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>, porDefecto: string): NextResponse {
  return NextResponse.json(
    {
      error: "validation_error",
      message: issues[0]?.message ?? porDefecto,
      issues: issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message })),
    },
    { status: 422, headers: noStore },
  );
}

/** Error de negocio → `{ error: CODIGO, message, ...extra }`; lo demás, 503 con log. */
export function responderError(e: unknown, ctx: string, tenantId: string): NextResponse {
  if (e instanceof CubicacionTrozasError) {
    return NextResponse.json({ error: e.code, message: e.message, ...e.extra }, { status: e.status, headers: noStore });
  }
  logger.error(`[cubicaciones-trozas] ${ctx} error`, { err: e instanceof Error ? e.message : String(e), tenantId });
  return NextResponse.json({ error: "Database error", message: "No se pudo guardar. Intenta de nuevo." }, { status: 503 });
}
