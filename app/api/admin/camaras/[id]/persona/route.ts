import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit, createRateLimiter } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { CamarasDB } from "@/lib/db/camaras.db";
import { ImagenNoPermitida, sharpSeguro, verificarImagen } from "@/lib/camaras/imagen-segura";
import { guardarFotoPersona, metaFotoPersonaSchema } from "@/lib/camaras/personas-drive.server";
import { avisarPersonaDelMosaico } from "@/lib/camaras/avisar";
import type { RespuestaFotoPersona } from "@/lib/camaras/personas";

/**
 * POST /api/admin/camaras/[id]/persona — foto que toma el detector de personas
 * del mosaico «Ver todas en vivo» (2026-10-07). Va al Drive, en
 * «Cámaras / Personas / <cámara> / <día>», y NO al historial de la cámara
 * (tope de 800 compartido + IA paga por foto): ver `personas-drive.server.ts`.
 *
 * Multipart: `file` (JPEG/PNG/WebP del cuadro), `motivo`, `personas`, `confianza`.
 * Mismos roles que ven el video en vivo (`en-vivo-nube`): admin, dueño, almacenero.
 *
 * Después de contestar, avisa por WhatsApp con la configuración de avisos de la
 * cámara (número, franja, pausa de 10 min compartida con las fotos de la IA):
 * sólo «apareció» y «llegó otra», nunca «sigue» (`avisarPersonaDelMosaico`).
 */
const MAX_SIZE = 3 * 1024 * 1024;
const ANCHO_MAX = 1280;
const idSchema = z.string().trim().min(1).max(64);

/**
 * Cupo propio. En régimen el detector manda ≤1 foto por minuto por cámara
 * (2-4 cámaras = 4/min); al llegar gente a varias a la vez salen «apareció» +
 * «llegó otra persona» juntas (~12 en un minuto). 30 por minuto por IP deja
 * ~2,5 veces de margen y aun así acota el peor caso (un cliente desbocado) a
 * 1.800 fotos por hora en el Drive.
 */
const fotosDePersonas = createRateLimiter({ maxRequests: 30, windowMs: 60_000 });

const falla = (error: string, status: number) => NextResponse.json({ ok: false, error } satisfies RespuestaFotoPersona, { status });

export const POST = withApiHandler(
  "camaras-persona",
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requireAdmin(req, ["admin", "owner", "almacenero"]);
    if (auth instanceof NextResponse) return auth;
    const csrf = assertCsrf(req);
    if (csrf) return csrf;
    const rl = applyRateLimit(req, fotosDePersonas);
    if (rl) return rl;

    const id = idSchema.safeParse((await ctx.params).id);
    if (!id.success) return falla("not_found", 404);
    const camara = (await CamarasDB.list(auth.tenantId)).find((c) => c.id === id.data);
    if (!camara) return falla("not_found", 404);

    const largo = Number(req.headers.get("content-length") ?? 0);
    if (largo > MAX_SIZE + 64 * 1024) return falla("muy_grande", 413);
    let archivo: File | null = null;
    let campos: Record<string, unknown> = {};
    try {
      const form = await req.formData();
      const f = form.get("file");
      archivo = f instanceof File ? f : null;
      campos = { motivo: form.get("motivo"), personas: form.get("personas"), confianza: form.get("confianza") };
    } catch {
      archivo = null;
    }
    const meta = metaFotoPersonaSchema.safeParse(campos);
    if (!meta.success) return falla("datos_invalidos", 400);
    if (!archivo) return falla("sin_imagen", 400);
    if (archivo.size > MAX_SIZE) return falla("muy_grande", 413);

    try {
      const bytes = Buffer.from(await archivo.arrayBuffer());
      await verificarImagen(bytes, new Set(["jpeg", "png", "webp"]));
      const webp = await sharpSeguro(bytes).rotate().resize({ width: ANCHO_MAX, withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
      const cuando = new Date();
      const res = await guardarFotoPersona(auth.tenantId, {
        camara: { id: camara.id, nombre: camara.nombre },
        webp,
        meta: meta.data,
        autor: auth.username ?? "alguien",
        cuando,
      });
      /* Aunque el Drive haya fallado: la persona estuvo igual frente a la
         cámara, y el aviso es por ella, no por el archivo. */
      const tenantId = auth.tenantId;
      after(() =>
        avisarPersonaDelMosaico(tenantId, camara.id, meta.data, cuando).catch((err) =>
          logger.error("[camaras.persona] el aviso por WhatsApp falló", {
            tenantId,
            camaraId: camara.id,
            error: String(err),
          }),
        ),
      );
      return NextResponse.json(res, { status: res.ok ? 200 : res.error === "storage" ? 502 : 500 });
    } catch (err) {
      if (err instanceof ImagenNoPermitida) return falla(err.message, 415);
      logger.error("[camaras.persona] falló", { tenantId: auth.tenantId, error: String(err) });
      return falla("no_se_pudo_procesar", 500);
    }
  },
);
