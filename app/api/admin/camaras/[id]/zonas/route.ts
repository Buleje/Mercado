import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { CamarasDB } from "@/lib/db/camaras.db";
import { LADO_MINIMO_ZONA, MAX_ZONAS_IGNORAR, zonasDeCamara } from "@/lib/camaras/zonas-ignorar";

/**
 * PUT /api/admin/camaras/[id]/zonas — «Zonas a ignorar» del detector de
 * personas del mosaico (2026-10-08): `{ zonas: [{ x, y, w, h }] }`, 0 a 4
 * rectángulos en fracciones 0-1 del cuadro. `[]` = el detector mira todo.
 *
 * Reemplaza la lista entera (no suma): la pantalla manda lo que se ve. Es
 * configuración del negocio: admin y dueño (el almacenero mira el video y el
 * detector igual respeta las zonas, pero no las cambia). El tenant sale del JWT.
 */
const idSchema = z.string().trim().min(1).max(64);

/** El modelo puro revalida, acota al cuadro y redondea (`normalizarZonas`). */
const zonaSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().min(LADO_MINIMO_ZONA).max(1),
    h: z.number().min(LADO_MINIMO_ZONA).max(1),
  })
  .refine((r) => r.x + r.w <= 1.0005 && r.y + r.h <= 1.0005, {
    message: "Una zona se sale del cuadro.",
  });

const cuerpoSchema = z.object({
  zonas: z.array(zonaSchema).max(MAX_ZONAS_IGNORAR, {
    message: `Hasta ${MAX_ZONAS_IGNORAR} zonas por cámara.`,
  }),
});

export const PUT = withApiHandler(
  "camaras-zonas",
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requireAdmin(req, ["admin", "owner"]);
    if (auth instanceof NextResponse) return auth;
    const csrf = assertCsrf(req);
    if (csrf) return csrf;
    const rl = applyRateLimit(req, "MODERATE", "camaras");
    if (rl) return rl;

    const id = idSchema.safeParse((await ctx.params).id);
    if (!id.success) return NextResponse.json({ error: "not_found" }, { status: 404 });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }
    const p = cuerpoSchema.safeParse(body);
    if (!p.success) {
      /* El mensaje de Zod sale en inglés salvo los nuestros (refine / max). */
      const propio = p.error.issues.find((i) => i.code === "custom" || i.code === "too_big")?.message;
      return NextResponse.json(
        {
          error: "validation_error",
          message: propio?.startsWith("Una") || propio?.startsWith("Hasta") ? propio : "Revisa las zonas marcadas.",
        },
        { status: 400 },
      );
    }

    try {
      const r = await CamarasDB.configurarZonasIgnorar(auth.tenantId, id.data, p.data.zonas, auth.username ?? "unknown");
      if (!r.ok) {
        const noEsta = r.motivo.startsWith("Esa cámara");
        return NextResponse.json(
          { error: noEsta ? "not_found" : "rechazado", message: r.motivo },
          { status: noEsta ? 404 : 400 },
        );
      }
      const camara = r.camaras.find((c) => c.id === id.data);
      return NextResponse.json({ ok: true, zonas: zonasDeCamara(camara), mensaje: r.mensaje });
    } catch (err) {
      logger.error("[camaras.zonas] write failed", { error: String(err), tenantId: auth.tenantId });
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
  },
);
