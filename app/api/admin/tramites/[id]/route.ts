import type { AdminRole } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { TramitesDB } from "@/lib/db/tramites.db";
import { respuestaInvalida } from "@/lib/admin/sin-claves";
import { sinVacios, tramitePatchSchema } from "../esquemas";

/**
 * /api/admin/tramites/[id] (ADR-524) — admin/owner.
 * GET → { tramite } · PATCH parcial (ausente = no se toca, null = borra; los
 * requisitos van por `/requisitos`) → { tramite } · DELETE suave → { ok }.
 * Un id de otro negocio = 404 (el tenant va en el WHERE).
 */

const ROLES: readonly AdminRole[] = ["admin", "owner"];
type Ctx = { params: Promise<{ id: string }> };

async function idDe(ctx: Ctx): Promise<string | null> {
  const { id } = await ctx.params;
  const limpio = (id ?? "").trim();
  return limpio && limpio.length <= 40 ? limpio : null;
}

const noExiste = (message = "Ese trámite no existe en este negocio.") =>
  NextResponse.json({ error: "not_found", message }, { status: 404 });

export const GET = withApiHandler("admin-tramite-get", async (req: NextRequest, ctx: Ctx) => {
  const rl = await applyRateLimit(req, "GENEROUS", "admin-tramites");
  if (rl) return rl;
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  const id = await idDe(ctx);
  if (!id) return noExiste();
  try {
    const tramite = await TramitesDB.obtener(auth.tenantId, id);
    return tramite ? NextResponse.json({ tramite }) : noExiste();
  } catch (err) {
    logger.error("[tramites.GET.id] failed", { error: String(err), tenantId: auth.tenantId, id });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const PATCH = withApiHandler("admin-tramite-patch", async (req: NextRequest, ctx: Ctx) => {
  const rl = await applyRateLimit(req, "GENEROUS", "admin-tramites");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  const id = await idDe(ctx);
  if (!id) return noExiste();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body", message: "El cuerpo no es JSON." }, { status: 400 });
  }
  const parsed = tramitePatchSchema.safeParse(body);
  if (!parsed.success) {
    const r = respuestaInvalida(parsed.error);
    return NextResponse.json(r.body, { status: r.status });
  }
  try {
    const r = await TramitesDB.actualizar(auth.tenantId, id, sinVacios(parsed.data), auth.username ?? "unknown");
    return r.ok ? NextResponse.json({ tramite: r.tramite }) : noExiste(r.message);
  } catch (err) {
    logger.error("[tramites.PATCH.id] failed", { error: String(err), tenantId: auth.tenantId, id });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const DELETE = withApiHandler("admin-tramite-delete", async (req: NextRequest, ctx: Ctx) => {
  const rl = await applyRateLimit(req, "GENEROUS", "admin-tramites");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  const id = await idDe(ctx);
  if (!id) return noExiste();
  try {
    const ok = await TramitesDB.borrar(auth.tenantId, id, auth.username ?? "unknown");
    return ok ? NextResponse.json({ ok: true }) : noExiste();
  } catch (err) {
    logger.error("[tramites.DELETE.id] failed", { error: String(err), tenantId: auth.tenantId, id });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
