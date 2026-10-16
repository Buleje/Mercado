import { NextRequest, NextResponse } from "next/server";
import { ClaveOcupadaError } from "@/lib/db/platform-settings.db";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import type { AdminRole } from "@/lib/session";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestGtfMatricialDB } from "@/lib/db/forest-gtf-matricial.db";
import { hojaSchema } from "@/lib/forestal/gtf-matricial-disposicion";
import { formaIdSchema, MENSAJE_ERROR_FORMA, type ErrorForma } from "@/lib/forestal/gtf-matricial-formas";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/forestal/loth/gtf-matricial — dónde cae cada valor de la GTF y de
 * su lista en el talonario preimpreso de la matricial («Imprimir en talonario»).
 *
 * En «formas» con nombre (16-10): la de la guía se elige SOLA con su dueño
 * (permiso + titular), que pone el SERVIDOR desde la guía (`ForestGtf.titularName`
 * / `tituloHabilitante` / `planId`, los mismos datos con que se numera), nunca
 * el cliente. Crear, renombrar y borrar formas: `./formas`.
 *
 * GET `?gtf=<id>[&forma=<id>]` — la forma de esa guía (o la elegida a mano),
 *   por qué se eligió, todas las formas (las del dueño arriba) y las impresoras.
 *   Sin forma propia: la de la empresa (o la de fábrica) y el nombre con que se
 *   creará. 404 si la forma pedida no existe.
 * GET `?de=<id|empresa>` — las dos hojas de otra forma, para «Copiar de otra forma».
 * PUT — guarda UNA hoja: `{ gtfId?, formaId?, formato: "guia" | "lista", hoja }`.
 *   Sin `formaId`: en la del dueño; si no tiene, la crea (409 al tope).
 *
 * Quien imprime las guías (almacenero) también acomoda su talonario: es la
 * medida de un papel, no un dato del libro.
 */

const ROLES: readonly AdminRole[] = ["admin", "almacenero", "owner"];

const getSchema = z.object({
  gtf: z.string().trim().min(1).max(64).optional(),
  de: z.string().trim().min(1).max(300).optional(),
  forma: formaIdSchema.optional(),
});

const putSchema = z.object({
  gtfId: z.string().trim().min(1).max(64).optional(),
  formaId: formaIdSchema.optional(),
  formato: z.enum(["guia", "lista"]),
  hoja: hojaSchema,
});

const NO_HAY_GUIA = { error: "not_found", message: "No encontramos esa guía." } as const;

const ESTADO: Record<ErrorForma, number> = { no_existe: 404, tope: 409, nombre_repetido: 409 };
const errorForma = (e: ErrorForma) => NextResponse.json({ error: e, message: MENSAJE_ERROR_FORMA[e] }, { status: ESTADO[e] });

async function ensureSpec(tenantId: string) {
  const enabled = await isSpecializationEnabled(tenantId, "spec:forestal:loth-libro");
  return enabled ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

export const GET = withApiHandler("forestal-loth-gtf-matricial-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;
  const q = getSchema.safeParse({
    gtf: req.nextUrl.searchParams.get("gtf") ?? undefined,
    de: req.nextUrl.searchParams.get("de") ?? undefined,
    forma: req.nextUrl.searchParams.get("forma") ?? undefined,
  });
  if (!q.success) return NextResponse.json({ error: "validation_error", issues: q.error.issues.slice(0, 5) }, { status: 400 });
  try {
    if (q.data.de) {
      const disposicion = await ForestGtfMatricialDB.de(auth.tenantId, q.data.de);
      if (!disposicion) return errorForma("no_existe");
      return NextResponse.json({ disposicion });
    }
    const dueno = await ForestGtfMatricialDB.duenoDeLaGuia(auth.tenantId, q.data.gtf);
    if (!dueno) return NextResponse.json(NO_HAY_GUIA, { status: 404 });
    const r = await ForestGtfMatricialDB.paraDueno(auth.tenantId, dueno, q.data.forma);
    return r ? NextResponse.json(r) : errorForma("no_existe");
  } catch (err) {
    logger.error("[loth.gtf-matricial.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const PUT = withApiHandler("forestal-loth-gtf-matricial-put", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const body = await req.json().catch(() => null);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", message: "Alguna medida está fuera de rango.", issues: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }
  try {
    const dueno = await ForestGtfMatricialDB.duenoDeLaGuia(auth.tenantId, parsed.data.gtfId);
    if (!dueno) return NextResponse.json(NO_HAY_GUIA, { status: 404 });
    const r = await ForestGtfMatricialDB.guardar(
      auth.tenantId,
      dueno,
      parsed.data.formaId ?? null,
      parsed.data.formato,
      parsed.data.hoja,
      auth.username ?? "unknown",
    );
    if (!r.ok) return errorForma(r.error);
    if (r.creada) {
      auditCtp({ tenantId: auth.tenantId, action: "gtf_talonario_forma_crear", entity: "ForestGtfTalonario", entityId: r.forma.id, detail: `Forma del talonario «${r.forma.nombre}» creada al guardar`, user: auth.username ?? "unknown" });
    }
    return NextResponse.json({ disposicion: r.disposicion, forma: r.forma, creada: r.creada });
  } catch (err) {
    if (err instanceof ClaveOcupadaError) {
      return NextResponse.json({ error: "ocupada", message: "Otra PC está guardando el talonario. Prueba de nuevo en unos segundos." }, { status: 409 });
    }
    logger.error("[loth.gtf-matricial.PUT] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
