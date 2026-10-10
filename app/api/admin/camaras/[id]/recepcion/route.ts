import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { CamarasDB } from "@/lib/db/camaras.db";
import { probarRecepcion } from "@/lib/camaras/recepcion.server";

/**
 * POST /api/admin/camaras/[id]/recepcion — «Probar recepción» (2026-10-05).
 *
 * Manda a la dirección pública de la cámara (la MISMA que se copia) un aviso
 * con el formato real de Hikvision —alerta XML + foto en multipart— en
 * `modo=prueba`: el receptor lo lee entero y no guarda nada. Contesta paso por
 * paso qué llegó: la dirección, HTTPS y HTTP.
 *
 * Sólo admin y dueño: el token de la cámara es lo que se prueba, y es lo mismo
 * que sólo ellos ven en la pantalla (revisión de seguridad 03-10).
 */
const idSchema = z.string().trim().min(1).max(64);

export const POST = withApiHandler(
  "camaras-probar-recepcion",
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requireAdmin(req, ["admin", "owner"]);
    if (auth instanceof NextResponse) return auth;
    const csrf = assertCsrf(req);
    if (csrf) return csrf;
    const rl = applyRateLimit(req, "MODERATE", "camaras-recepcion");
    if (rl) return rl;

    const id = idSchema.safeParse((await ctx.params).id);
    if (!id.success) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    const camara = (await CamarasDB.list(auth.tenantId)).find((c) => c.id === id.data);
    if (!camara) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    if (!camara.activa) return NextResponse.json({ ok: false, error: "inactiva" }, { status: 409 });

    const resultado = await probarRecepcion(camara.token);
    return NextResponse.json(
      { ok: true, ...resultado },
      { headers: { "Cache-Control": "no-store" } },
    );
  },
);
