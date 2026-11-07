import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { CamarasDB } from "@/lib/db/camaras.db";
import { ImagenNoPermitida, sharpSeguro, verificarImagen } from "@/lib/camaras/imagen-segura";
import { guardarFoto } from "@/lib/camaras/ingesta.server";

/**
 * POST /api/admin/camaras/[id]/foto — «Subir una foto a mano» / «desde la
 * galería» con la SESIÓN del usuario, sin el token de la cámara.
 *
 * El token deja subir como si fuera la cámara y sólo lo ven admin y dueño
 * (revisión de seguridad 03-10, ADR-466); el almacenero también sube fotos a
 * mano, así que entra por acá. Hace lo mismo que la entrada por token:
 * formato real y techo de píxeles, re-codificada a WebP, historial y la
 * lectura de la IA (`guardarFoto`).
 *
 * «Analizar» del visor de Hik-Connect (ADR-471) sube por acá el cuadro del
 * vivo con `origen=vivo`: queda anotado en la foto y la respuesta trae su id
 * para que el visor espere la lectura de ESA foto.
 */
const MAX_SIZE = 8 * 1024 * 1024;
const ANCHO_MAX = 1600;
const idSchema = z.string().trim().min(1).max(64);

export const POST = withApiHandler(
  "camaras-foto-a-mano",
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requireAdmin(req, ["admin", "owner", "almacenero"]);
    if (auth instanceof NextResponse) return auth;
    const csrf = assertCsrf(req);
    if (csrf) return csrf;
    const rl = await applyRateLimit(req, "MODERATE", "camaras-foto");
    if (rl) return rl;

    const id = idSchema.safeParse((await ctx.params).id);
    if (!id.success) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    const camara = (await CamarasDB.list(auth.tenantId)).find((c) => c.id === id.data);
    if (!camara) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

    const largo = Number(req.headers.get("content-length") ?? 0);
    if (largo > MAX_SIZE + 64 * 1024) return NextResponse.json({ ok: false, error: "muy_grande" }, { status: 413 });
    let archivo: File | null = null;
    let delVivo = false;
    try {
      const form = await req.formData();
      const f = form.get("file");
      archivo = f instanceof File ? f : null;
      delVivo = form.get("origen") === "vivo";
    } catch {
      archivo = null;
    }
    if (!archivo) return NextResponse.json({ ok: false, error: "sin_imagen" }, { status: 400 });
    if (archivo.size > MAX_SIZE) return NextResponse.json({ ok: false, error: "muy_grande" }, { status: 413 });

    try {
      const bytes = Buffer.from(await archivo.arrayBuffer());
      await verificarImagen(bytes, new Set(["jpeg", "png", "webp"]));
      const webp = await sharpSeguro(bytes).rotate().resize({ width: ANCHO_MAX, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
      const quien = auth.username ?? "alguien";
      const nota = (delVivo ? `del vivo (Hik-Connect), analizada por ${quien}` : `subida desde el panel por ${quien}`).slice(0, 200);
      const ok = await guardarFoto({ tenantId: auth.tenantId, camara }, webp, { evento: "manual", nota });
      if (!ok) return NextResponse.json({ ok: false, error: "storage" }, { status: 502 });
      /* `guardarFoto` no devuelve la foto: la más nueva de esta cámara con ESTA nota es la recién guardada. */
      const nueva = (await CamarasDB.capturas(auth.tenantId, { camaraId: camara.id, limite: 5 })).find((c) => c.nota === nota);
      return NextResponse.json({ ok: true, capturaId: nueva?.id ?? null });
    } catch (err) {
      if (err instanceof ImagenNoPermitida) return NextResponse.json({ ok: false, error: err.message }, { status: 415 });
      logger.error("[camaras.foto-a-mano] falló", { tenantId: auth.tenantId, error: String(err) });
      return NextResponse.json({ ok: false, error: "no_se_pudo_procesar" }, { status: 500 });
    }
  },
);
