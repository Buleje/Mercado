import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { isSpecializationEnabled } from "@/lib/specializations";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { EspecieCatalogoError, ForestEspeciesDB } from "@/lib/db/forest-especies.db";
import { especiesDisponibles, especiesOcultas } from "@/lib/forestal/especies-catalogo";

/**
 * /api/admin/forestal/especies — el catálogo de especies del aserradero.
 *
 * GET    — la lista que se ofrece al cargar (fábrica − ocultas + propias) y las
 *          de fábrica que este tenant ocultó, para poder devolverlas.
 * POST   — agrega una especie propia.
 * PATCH  — renombra / cambia el científico, o restaura una de fábrica oculta.
 * DELETE — `?clave=`: borra la propia, oculta la de fábrica.
 *
 * Guard: requireAdmin → CSRF → rate limit → `spec:forestal:ctp-libro`, la misma
 * que gatea el Libro; la especie es lo que el libro declara ante SERFOR.
 *
 * Lo que el catálogo rechaza por sus reglas (nombre vacío, especie repetida)
 * sale como **422 con el motivo tal cual**: está escrito para quien carga.
 */

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro");
  return ok
    ? null
    : NextResponse.json(
        {
          error: "specialization_disabled",
          message: "El Libro CTP no está habilitado para esta tienda.",
        },
        { status: 403 },
      );
}

const nombreSchema = z.string().trim().min(1).max(120);
const cientificoSchema = z.string().trim().max(160).nullish();

const postSchema = z.object({ nombre: nombreSchema, cientifico: cientificoSchema });
const patchSchema = z.union([
  z.object({
    clave: z.string().trim().min(1).max(160),
    accion: z.literal("restaurar"),
  }),
  z
    .object({
      clave: z.string().trim().min(1).max(160),
      nombre: nombreSchema.optional(),
      cientifico: cientificoSchema,
    })
    .refine((c) => c.nombre !== undefined || c.cientifico !== undefined, {
      message: "Mandá el nombre o el nombre científico.",
    }),
]);

/** Las tres escrituras comparten guardas, parseo del cuerpo y traducción de errores. */
async function escribir(
  req: NextRequest,
  correr: (tenantId: string, user: string, body: unknown) => Promise<unknown>,
) {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  let body: unknown = null;
  if (req.method !== "DELETE") {
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }
  }

  try {
    return NextResponse.json(await correr(auth.tenantId, auth.username ?? "unknown", body));
  } catch (err) {
    if (err instanceof EspecieCatalogoError) {
      return NextResponse.json(
        { error: "catalogo_rechazado", message: err.message },
        { status: 422 },
      );
    }
    logger.error("[forestal.especies] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

const respuesta = async (tenantId: string, mensaje?: string) => {
  const catalogo = await ForestEspeciesDB.get(tenantId);
  return {
    catalogo,
    especies: especiesDisponibles(catalogo),
    ocultas: especiesOcultas(catalogo),
    ...(mensaje ? { mensaje } : {}),
  };
};

export const GET = withApiHandler("forestal-especies-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;
  try {
    return NextResponse.json(await respuesta(auth.tenantId));
  } catch (err) {
    logger.error("[forestal.especies.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const POST = withApiHandler("forestal-especies-post", (req: NextRequest) =>
  escribir(req, async (tenantId, user, body) => {
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) throw new EspecieCatalogoError("Escribí el nombre de la especie.");
    const { mensaje } = await ForestEspeciesDB.agregar(tenantId, parsed.data, user);
    return respuesta(tenantId, mensaje);
  }),
);

export const PATCH = withApiHandler("forestal-especies-patch", (req: NextRequest) =>
  escribir(req, async (tenantId, user, body) => {
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      throw new EspecieCatalogoError(
        parsed.error.issues[0]?.message ?? "No se entendió qué cambiar de la especie.",
      );
    }
    const d = parsed.data;
    const { mensaje } =
      "accion" in d
        ? await ForestEspeciesDB.restaurar(tenantId, d.clave, user)
        : await ForestEspeciesDB.editar(
            tenantId,
            d.clave,
            { nombre: d.nombre, cientifico: d.cientifico },
            user,
          );
    return respuesta(tenantId, mensaje);
  }),
);

export const DELETE = withApiHandler("forestal-especies-delete", (req: NextRequest) =>
  escribir(req, async (tenantId, user) => {
    const clave = new URL(req.url).searchParams.get("clave")?.trim();
    if (!clave) throw new EspecieCatalogoError("Falta decir qué especie sacar.");
    const { mensaje } = await ForestEspeciesDB.quitar(tenantId, clave, user);
    return respuesta(tenantId, mensaje);
  }),
);
