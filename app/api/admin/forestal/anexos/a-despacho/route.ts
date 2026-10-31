import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit, applyRateLimitWithTenant, RateLimitPresets } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { ORDEN_TIPO, type TipoComercial } from "@/lib/forestal/cubicacion-tipo";
import { CtpInvariantError } from "@/lib/db/forest-ctp-consumo.db";
import { ForestCtpGuiaDesdeAnexoDB } from "@/lib/db/forest-ctp-guia-desde-anexo.db";
import { ClaveOcupadaError } from "@/lib/db/platform-settings.db";

/**
 * /api/admin/forestal/anexos/a-despacho — «Guías sin registrar» (ADR-446).
 *
 * GET  ?pendientes=1   — los Anexos 04 cuya salida no está en el libro, con la
 *                         propuesta de cada guía en el orden en que se
 *                         registrarían (la más vieja primero).
 * GET  ?contar=1        — sólo cuántas hay y su m³ (sin armar propuestas): lo
 *                         que pinta la pastilla de Despacho al entrar. Mismo
 *                         guard y misma clasificación que `?pendientes=1`,
 *                         mucho más barato (2026-09-28, ADR-446 ronda 2).
 * GET  ?anexoId=…      — un anexo: su estado y lo que pasaría si se registra AHORA.
 * POST                 — registra una tanda (una transacción por guía) o, con
 *                         `simular: true`, devuelve la tanda como quedaría con
 *                         las elecciones de origen, sin escribir. Cada guía
 *                         lleva `confirmo` = lo que el dueño VIO: `sinOrigenM3`
 *                         (los m³ sin corrida) y `usadas` (ids de corridas
 *                         «usado»). Si bajo el lock hay más sin origen que eso
 *                         (+1 litro) o una «usado» que no está en la lista, el
 *                         alta la bloquea (decisiones 5 y 8, ADR-446 r3).
 * PATCH                — la revisión (26-10): `resolver` una duda de papeles
 *                         con una de sus opciones, `deshacer` un «reemplazado»,
 *                         o `responder` un hueco del talonario. Nunca borra un
 *                         anexo ni escribe en el libro.
 *
 * El cliente sólo elige DE QUÉ CORRIDAS sale cada grupo (especie × tipo); los
 * m³ y las piezas de cada línea los arma el servidor desde el anexo guardado.
 *
 * Guard: admin o dueño (el encargado no: `requireAdmin` lo deja pasar por el
 * «management tier», y registrar salidas del libro no es suyo — ADR-437) →
 * CSRF en la escritura → rate limit → especialización del Libro CTP.
 */

const esTipo = (v: string): v is TipoComercial => (ORDEN_TIPO as readonly string[]).includes(v);

const eleccionSchema = z.object({
  especie: z.string().trim().min(1).max(80),
  tipo: z
    .string()
    .refine(esTipo, "Ese tipo de pieza no existe")
    .transform((v) => v as TipoComercial),
  /** Corridas en el orden en que se toman. Vacío = sin origen (queda «sin atribuir»). */
  corridas: z.array(z.string().trim().min(1).max(40)).max(40),
});

const guiaSchema = z.object({
  anexoId: z.string().trim().min(1).max(60),
  elecciones: z.array(eleccionSchema).max(60).optional(),
  confirmo: z
    .object({
      sinOrigenM3: z.number().finite().min(0).max(100_000).optional(),
      usadas: z.array(z.string().trim().min(1).max(60)).max(60).optional(),
    })
    .optional(),
});

const clave = z.string().trim().min(1).max(400);
const patchSchema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("resolver"), duda: clave, opcion: clave }),
  z.object({ accion: z.literal("deshacer"), anexoId: z.string().trim().min(1).max(60) }),
  z.object({ accion: z.literal("responder"), clave, valor: z.string().trim().min(1).max(40).nullable() }),
]);

const postSchema = z
  .object({
    /* La pantalla manda una guía por POST; una tanda de más de 10 no entra en
       el tiempo de una función (cada guía es su propia transacción). */
    guias: z.array(guiaSchema).min(1).max(10),
    simular: z.boolean().optional(),
    /** Corridas «usado» que ninguna guía toma y que el dueño decide devolver al patio. */
    liberarUsadas: z.array(z.string().trim().min(1).max(40)).max(50).optional(),
  })
  .superRefine((v, ctx) => {
    const ids = v.guias.map((g) => g.anexoId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", path: ["guias"], message: "Un mismo anexo aparece dos veces." });
    }
    v.guias.forEach((g, i) => {
      const claves = (g.elecciones ?? []).map((e) => `${e.especie.trim().toLowerCase()}|${e.tipo}`);
      if (new Set(claves).size !== claves.length) {
        ctx.addIssue({ code: "custom", path: ["guias", i, "elecciones"], message: "Una especie y tipo aparece dos veces." });
      }
    });
  });

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro");
  return ok
    ? null
    : NextResponse.json(
        { error: "specialization_disabled", message: "El Libro CTP no está habilitado para esta tienda." },
        { status: 403 },
      );
}

export const GET = withApiHandler("forestal-anexos-a-despacho-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "anexos-a-despacho");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const url = new URL(req.url);
  const anexoId = url.searchParams.get("anexoId")?.trim() ?? "";
  const pendientes = url.searchParams.get("pendientes");
  const contar = url.searchParams.get("contar");
  if (anexoId.length > 60) return NextResponse.json({ error: "invalid_anexo_id" }, { status: 400 });
  if (!anexoId && pendientes !== "1" && contar !== "1") {
    /* Un parámetro mal escrito no devuelve «todo» en silencio. */
    return NextResponse.json(
      { error: "missing_param", message: "Pide ?pendientes=1, ?contar=1 o ?anexoId=<id del anexo>." },
      { status: 400 },
    );
  }
  try {
    if (!anexoId && contar === "1") {
      return NextResponse.json(await ForestCtpGuiaDesdeAnexoDB.contarPendientes(auth.tenantId));
    }
    const data = anexoId
      ? await ForestCtpGuiaDesdeAnexoDB.proponer(auth.tenantId, anexoId)
      : await ForestCtpGuiaDesdeAnexoDB.pendientes(auth.tenantId);
    return NextResponse.json(data);
  } catch (err) {
    logger.error("[anexos.a-despacho.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const POST = withApiHandler("forestal-anexos-a-despacho-post", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rol = soloAdminODueno(auth.role, "registrar en el libro las guías de un Anexo 04");
  if (rol) return rol;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = await applyRateLimit(req, "GENEROUS", "anexos-a-despacho");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "validation_error",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400 },
    );
  }
  const { guias, simular, liberarUsadas } = parsed.data;
  if (!simular) {
    /* Registrar toma la bandeja y las corridas del tenant: límite propio por IP
       y por tienda (seguridad S2). Simular no escribe y queda con el general.
       MODERATE (20 cada 5 min) y no STRICT (10 cada 15): Brandon registra las
       9 guías de Blas de a una, y con un par de reintentos STRICT le dejaba el
       botón en 429 un cuarto de hora. La carrera entre pestañas ya la corta el
       `pg_try_advisory_xact_lock` (TANDA_EN_CURSO), no este límite. */
    const rlTenant = applyRateLimitWithTenant(
      req, "MODERATE", auth.tenantId, "anexos-a-despacho-registrar", RateLimitPresets.MODERATE,
    );
    if (rlTenant) return rlTenant;
  }
  try {
    if (simular) return NextResponse.json(await ForestCtpGuiaDesdeAnexoDB.simularTanda(auth.tenantId, guias));
    const resultado = await ForestCtpGuiaDesdeAnexoDB.registrarTanda(auth.tenantId, guias, {
      user: auth.username ?? "unknown",
      liberarUsadas,
    });
    return NextResponse.json(resultado);
  } catch (err) {
    if (err instanceof CtpInvariantError) {
      return NextResponse.json({ error: err.code, message: err.message, detail: err.detail }, { status: 409 });
    }
    logger.error("[anexos.a-despacho.POST] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const PATCH = withApiHandler("forestal-anexos-a-despacho-patch", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rol = soloAdminODueno(auth.role, "contestar la revisión de las guías sin registrar");
  if (rol) return rol;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = applyRateLimitWithTenant(req, "MODERATE", auth.tenantId, "anexos-a-despacho-revision", RateLimitPresets.MODERATE);
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "validation_error",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400 },
    );
  }
  const user = auth.username ?? "unknown";
  const p = parsed.data;
  try {
    const resultado =
      p.accion === "resolver"
        ? await ForestCtpGuiaDesdeAnexoDB.resolverDuda(auth.tenantId, p.duda, p.opcion, user)
        : p.accion === "deshacer"
          ? await ForestCtpGuiaDesdeAnexoDB.deshacerReemplazo(auth.tenantId, p.anexoId, user)
          : await ForestCtpGuiaDesdeAnexoDB.responder(auth.tenantId, p.clave, p.valor, user);
    return NextResponse.json(resultado);
  } catch (err) {
    if (err instanceof CtpInvariantError) {
      return NextResponse.json({ error: err.code, message: err.message, detail: err.detail }, { status: 409 });
    }
    if (err instanceof ClaveOcupadaError) {
      return NextResponse.json(
        { error: "TANDA_EN_CURSO", message: "Se está registrando una guía o guardando un anexo: espera unos segundos y vuelve a intentar." },
        { status: 409 },
      );
    }
    logger.error("[anexos.a-despacho.PATCH] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
