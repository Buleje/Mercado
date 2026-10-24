import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import type { AdminRole, SessionPayload } from "@/lib/session";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestGtfMatricialDB, type ResultadoFormaDB } from "@/lib/db/forest-gtf-matricial.db";
import { ForestGtfColaMonteDB } from "@/lib/db/forest-gtf-cola-monte.db";
import { ClaveOcupadaError } from "@/lib/db/platform-settings.db";
import { auditCtp, type CtpAuditAction } from "@/lib/forestal/ctp-audit";
import { hojaSchema } from "@/lib/forestal/gtf-matricial-disposicion";
import { formaIdSchema, MENSAJE_ERROR_FORMA, nombreFormaSchema, type ErrorForma } from "@/lib/forestal/gtf-matricial-formas";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/forestal/loth/gtf-matricial/formas — las «formas» del talonario
 * (16-10): cada una encaja un papel (las dos hojas con medida, corrimiento,
 * campos y tabla) y lleva un nombre y la referencia del permiso y titular para
 * los que se calibró. Guardar una hoja va por el PUT de la ruta de arriba.
 *
 * POST  `{ gtfId?, nombre?, guia, lista }` — «Nueva forma (copia de esta)»: las
 *       dos hojas que se ven, con la referencia de la guía (la pone el servidor).
 *       Sin nombre, «<permiso> · <titular>». 409 al tope o con un nombre repetido.
 * PATCH `{ gtfId?, formaId, nombre }` — renombrar.
 * DELETE `?forma=<id>[&gtf=<id>]` — borrar. 409 `en_uso` si una guía por
 *       imprimir en el monte saldría con esa forma (mandada con ella, o la
 *       que elige sola por su dueño).
 * `gtfId` sólo sirve para decir, en la respuesta, qué tanto es de esa guía.
 */

const ROLES: readonly AdminRole[] = ["admin", "almacenero", "owner"];
const ESTADO: Record<ErrorForma, number> = { no_existe: 404, tope: 409, nombre_repetido: 409 };
const gtfIdSchema = z.string().trim().min(1).max(64);

const postSchema = z.object({ gtfId: gtfIdSchema.optional(), nombre: nombreFormaSchema.optional(), guia: hojaSchema, lista: hojaSchema });
const patchSchema = z.object({ gtfId: gtfIdSchema.optional(), formaId: formaIdSchema, nombre: nombreFormaSchema });
const deleteSchema = z.object({ forma: formaIdSchema, gtf: gtfIdSchema.optional() });

async function ensureSpec(tenantId: string) {
  const enabled = await isSpecializationEnabled(tenantId, "spec:forestal:loth-libro");
  return enabled ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

/** Sesión + límite + especialización: lo mismo para los tres verbos. */
async function entrada(req: NextRequest): Promise<Response | SessionPayload> {
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof Response) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  return (await ensureSpec(auth.tenantId)) ?? auth;
}

function responder(r: ResultadoFormaDB, status = 200) {
  if (!r.ok) return NextResponse.json({ error: r.error, message: MENSAJE_ERROR_FORMA[r.error] }, { status: ESTADO[r.error] });
  return NextResponse.json({ forma: r.forma, disposicion: r.disposicion }, { status });
}

/** Otra PC guarda el talonario en este momento (la clave sigue tomada después de esperar). */
const OCUPADA = () =>
  NextResponse.json({ error: "ocupada", message: "Otra PC está guardando el talonario. Prueba de nuevo en unos segundos." }, { status: 409 });

/** Deja rastro de la forma (forestal: toda acción nueva se audita). Sólo si salió bien. */
function auditar(auth: SessionPayload, r: ResultadoFormaDB, action: CtpAuditAction, formaId: string, detail: string): void {
  if (!r.ok) return;
  auditCtp({ tenantId: auth.tenantId, action, entity: "ForestGtfTalonario", entityId: formaId, detail, user: auth.username ?? "unknown" });
}

const invalido = (issues: z.ZodError["issues"]) => {
  const message = issues.find((i) => i.message && !i.message.startsWith("Invalid"))?.message ?? "Algún dato de la forma está fuera de rango.";
  return NextResponse.json({ error: "validation_error", message, issues: issues.slice(0, 5) }, { status: 400 });
};
const NO_HAY_GUIA = () => NextResponse.json({ error: "not_found", message: "No encontramos esa guía." }, { status: 404 });

export const POST = withApiHandler("forestal-loth-gtf-matricial-formas-post", async (req: NextRequest) => {
  const auth = await entrada(req);
  if (auth instanceof Response) return auth;
  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error.issues);
  try {
    const dueno = await ForestGtfMatricialDB.duenoDeLaGuia(auth.tenantId, parsed.data.gtfId);
    if (!dueno) return NO_HAY_GUIA();
    const { nombre, guia, lista } = parsed.data;
    const r = await ForestGtfMatricialDB.crearForma(auth.tenantId, dueno, { nombre, guia, lista }, auth.username ?? "unknown");
    if (r.ok) auditar(auth, r, "gtf_talonario_forma_crear", r.forma.id, `Forma del talonario «${r.forma.nombre}» creada`);
    return responder(r, 201);
  } catch (err) {
    if (err instanceof ClaveOcupadaError) return OCUPADA();
    logger.error("[loth.gtf-matricial.formas.POST] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const PATCH = withApiHandler("forestal-loth-gtf-matricial-formas-patch", async (req: NextRequest) => {
  const auth = await entrada(req);
  if (auth instanceof Response) return auth;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalido(parsed.error.issues);
  try {
    const dueno = await ForestGtfMatricialDB.duenoDeLaGuia(auth.tenantId, parsed.data.gtfId);
    if (!dueno) return NO_HAY_GUIA();
    const r = await ForestGtfMatricialDB.renombrarForma(auth.tenantId, dueno, parsed.data.formaId, parsed.data.nombre, auth.username ?? "unknown");
    auditar(auth, r, "gtf_talonario_forma_renombrar", parsed.data.formaId, `Forma del talonario renombrada a «${parsed.data.nombre}»`);
    return responder(r);
  } catch (err) {
    if (err instanceof ClaveOcupadaError) return OCUPADA();
    logger.error("[loth.gtf-matricial.formas.PATCH] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const DELETE = withApiHandler("forestal-loth-gtf-matricial-formas-delete", async (req: NextRequest) => {
  const auth = await entrada(req);
  if (auth instanceof Response) return auth;
  const sp = req.nextUrl.searchParams;
  const parsed = deleteSchema.safeParse({ forma: sp.get("forma") ?? undefined, gtf: sp.get("gtf") ?? undefined });
  if (!parsed.success) return invalido(parsed.error.issues);
  try {
    /* El monte bajaría esa guía con una forma que ya no está: primero se imprime o se cambia el envío. */
    const cola = await ForestGtfColaMonteDB.leerAlDia(auth.tenantId);
    const pendientes = cola.trabajos.filter((t) => t.estado === "pendiente");
    const usa = await ForestGtfMatricialDB.guiaQueUsaLaForma(auth.tenantId, parsed.data.forma, pendientes);
    if (usa) {
      return NextResponse.json(
        { error: "en_uso", message: `No se puede borrar: la usa la guía ${usa}, que está por imprimir en el monte.` },
        { status: 409 },
      );
    }
    const dueno = await ForestGtfMatricialDB.duenoDeLaGuia(auth.tenantId, parsed.data.gtf);
    if (!dueno) return NO_HAY_GUIA();
    const r = await ForestGtfMatricialDB.borrarForma(auth.tenantId, dueno, parsed.data.forma, auth.username ?? "unknown");
    auditar(auth, r, "gtf_talonario_forma_borrar", parsed.data.forma, `Forma del talonario ${parsed.data.forma} borrada`);
    return responder(r);
  } catch (err) {
    if (err instanceof ClaveOcupadaError) return OCUPADA();
    logger.error("[loth.gtf-matricial.formas.DELETE] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
