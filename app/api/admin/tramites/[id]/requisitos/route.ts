import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { TramitesDB } from "@/lib/db/tramites.db";
import { respuestaInvalida } from "@/lib/admin/sin-claves";
import { requisitosOpsSchema } from "../../esquemas";

/**
 * PATCH /api/admin/tramites/[id]/requisitos (ADR-524) — admin/owner.
 * `{ agregar?, cambiar?: [{id, estado?, documentId?|null, nota?, nombre?, orden?}], quitar? }`
 * en UNA transacción con el trámite bloqueado. Enlazar un documento sin
 * estado = «hay». El documento tiene que estar en el Drive de este negocio
 * (404) y queda atado al trámite (tag `tramiteadm:<id>`). → { tramite }
 */

export const PATCH = withApiHandler(
  "admin-tramite-requisitos",
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const rl = await applyRateLimit(req, "GENEROUS", "admin-tramites");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req, ["admin", "owner"]);
    if (auth instanceof NextResponse) return auth;
    const { id: rawId } = await ctx.params;
    const id = (rawId ?? "").trim();
    if (!id || id.length > 40) return NextResponse.json({ error: "not_found" }, { status: 404 });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "invalid_body", message: "El cuerpo no es JSON." }, { status: 400 });
    }
    const parsed = requisitosOpsSchema.safeParse(body);
    if (!parsed.success) {
      const r = respuestaInvalida(parsed.error);
      return NextResponse.json(r.body, { status: r.status });
    }
    try {
      const r = await TramitesDB.requisitos(auth.tenantId, id, parsed.data, auth.username ?? "unknown");
      return r.ok
        ? NextResponse.json({ tramite: r.tramite })
        : NextResponse.json({ error: r.error, message: r.message }, { status: 404 });
    } catch (err) {
      logger.error("[tramites.requisitos] failed", { error: String(err), tenantId: auth.tenantId, id });
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
  },
);
