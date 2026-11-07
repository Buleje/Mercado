import type { AdminRole } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { TramitesDB } from "@/lib/db/tramites.db";
import { respuestaInvalida } from "@/lib/admin/sin-claves";
import { armarAlta, filtroTramitesSchema, tramiteCrearSchema } from "./esquemas";

/**
 * /api/admin/tramites — trámites de Administración (ADR-524): bancos, SUNAT,
 * SUNARP, municipalidad, notaría, RENIEC. Cualquier negocio (sin spec).
 * Solo admin/owner (manager entra por el bypass de `requireAdmin`).
 *
 * GET  ?estado&entidad&parteId&alquilerId&q&vencen=30 → { tramites }
 * POST cuerpo del trámite + requisitos? + plantilla? → 201 { tramite }
 */

const ROLES: readonly AdminRole[] = ["admin", "owner"];

export const GET = withApiHandler("admin-tramites-get", async (req: NextRequest) => {
  const rl = await applyRateLimit(req, "GENEROUS", "admin-tramites");
  if (rl) return rl;
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const parsed = filtroTramitesSchema.safeParse({
    estado: sp.get("estado") || undefined,
    entidad: sp.get("entidad") || undefined,
    parteId: sp.get("parteId") || undefined,
    alquilerId: sp.get("alquilerId") || undefined,
    q: sp.get("q") || undefined,
    vencen: sp.get("vencen") || undefined,
  });
  if (!parsed.success) {
    const r = respuestaInvalida(parsed.error);
    return NextResponse.json(r.body, { status: r.status });
  }
  try {
    const tramites = await TramitesDB.listar(auth.tenantId, parsed.data);
    return NextResponse.json({ tramites });
  } catch (err) {
    logger.error("[tramites.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const POST = withApiHandler("admin-tramites-post", async (req: NextRequest) => {
  const rl = await applyRateLimit(req, "GENEROUS", "admin-tramites");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body", message: "El cuerpo no es JSON." }, { status: 400 });
  }
  const parsed = tramiteCrearSchema.safeParse(body);
  if (!parsed.success) {
    const r = respuestaInvalida(parsed.error);
    return NextResponse.json(r.body, { status: r.status });
  }
  const alta = armarAlta(parsed.data);
  if (!alta) {
    return NextResponse.json(
      { error: "invalid_body", message: "Falta la entidad o el asunto (o una plantilla que los ponga)." },
      { status: 400 },
    );
  }
  try {
    const r = await TramitesDB.crear(auth.tenantId, alta, auth.username ?? "unknown");
    if (!r.ok) return NextResponse.json({ error: r.error, message: r.message }, { status: 404 });
    return NextResponse.json({ tramite: r.tramite }, { status: 201 });
  } catch (err) {
    logger.error("[tramites.POST] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
