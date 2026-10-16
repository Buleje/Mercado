import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import type { AdminRole } from "@/lib/session";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestGtfMatricialDB } from "@/lib/db/forest-gtf-matricial.db";
import { ForestGtfDB } from "@/lib/db/forest-gtf.db";
import type { DuenoTalonario } from "@/lib/forestal/gtf-matricial-titulares";
import { hojaSchema } from "@/lib/forestal/gtf-matricial-disposicion";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/forestal/loth/gtf-matricial — dónde cae cada valor de la GTF y de
 * su lista en el talonario preimpreso de la matricial («Imprimir en talonario»).
 *
 * Una disposición POR TITULAR (15-10): el titular lo pone el SERVIDOR desde
 * la guía (`ForestGtf.titularName` / `tituloHabilitante` / `planId`, los
 * mismos datos con que se numera), nunca el cliente.
 *
 * GET `?gtf=<id>` — la del titular de esa guía (o la de la empresa que copia
 *   mientras no tenga la suya), de dónde salió y qué titulares ya tienen la suya.
 *   Sin `gtf`: la de la empresa.
 * GET `?de=<clave|empresa>` — la de otro titular, para «Copiar de otro titular».
 * PUT — guarda UNA hoja: `{ gtfId?, formato: "guia" | "lista", hoja }`.
 *
 * Quien imprime las guías (almacenero) también acomoda su talonario: es la
 * medida de un papel, no un dato del libro.
 */

const ROLES: readonly AdminRole[] = ["admin", "almacenero", "owner"];

const getSchema = z.object({
  gtf: z.string().trim().min(1).max(64).optional(),
  de: z.string().trim().min(1).max(300).optional(),
});

const putSchema = z.object({
  gtfId: z.string().trim().min(1).max(64).optional(),
  formato: z.enum(["guia", "lista"]),
  hoja: hojaSchema,
});

const SIN_DUENO: DuenoTalonario = { titular: null, permiso: null, planId: null };

/** El dueño del talonario sale de la guía guardada. null = la guía no existe en este tenant. */
async function duenoDeLaGuia(tenantId: string, gtfId: string | undefined): Promise<DuenoTalonario | null> {
  if (!gtfId) return SIN_DUENO;
  const g = await ForestGtfDB.getById(tenantId, gtfId);
  if (!g) return null;
  return { titular: g.titularName ?? null, permiso: g.tituloHabilitante ?? null, planId: g.planId ?? null };
}

const NO_HAY_GUIA = { error: "not_found", message: "No encontramos esa guía." } as const;

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
  });
  if (!q.success) return NextResponse.json({ error: "validation_error", issues: q.error.issues.slice(0, 5) }, { status: 400 });
  try {
    if (q.data.de) {
      const disposicion = await ForestGtfMatricialDB.de(auth.tenantId, q.data.de);
      if (!disposicion) return NextResponse.json({ error: "not_found", message: "Ese titular no tiene su talonario guardado." }, { status: 404 });
      return NextResponse.json({ disposicion });
    }
    const dueno = await duenoDeLaGuia(auth.tenantId, q.data.gtf);
    if (!dueno) return NextResponse.json(NO_HAY_GUIA, { status: 404 });
    return NextResponse.json(await ForestGtfMatricialDB.paraDueno(auth.tenantId, dueno));
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
    const dueno = await duenoDeLaGuia(auth.tenantId, parsed.data.gtfId);
    if (!dueno) return NextResponse.json(NO_HAY_GUIA, { status: 404 });
    const disposicion = await ForestGtfMatricialDB.guardar(
      auth.tenantId,
      dueno,
      parsed.data.formato,
      parsed.data.hoja,
      auth.username ?? "unknown",
    );
    if (!disposicion) {
      return NextResponse.json(
        { error: "too_many", message: "Ya hay demasiados talonarios guardados; usa el de otro titular." },
        { status: 409 },
      );
    }
    return NextResponse.json({ disposicion });
  } catch (err) {
    logger.error("[loth.gtf-matricial.PUT] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
