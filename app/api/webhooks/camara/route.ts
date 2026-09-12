import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { getSupabaseAdmin } from "@/lib/supabase";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { CamarasDB } from "@/lib/db/camaras.db";
import { normalizarEvento } from "@/lib/camaras/camaras";
import { leerFotoDeCamara } from "@/lib/ai/camara-vision";

/**
 * POST /api/webhooks/camara?k=<token>[&evento=motion][&nota=...]
 *
 * La puerta por la que ENTRA una foto del patio.
 *
 * La cámara es 4G detrás de CGNAT: no hay forma de que el servidor la llame, así
 * que la relación se invierte — ella deja la imagen acá. Sirve igual si la manda
 * la cámara, un FTP que la reenvía, el correo de alarma pasado por un webhook, o
 * una persona desde el celular: **una sola bandeja para todos los caminos**.
 *
 * ## Por qué no pide sesión
 *
 * Quien empuja es un aparato. No tiene login ni puede mandar un header (un FTP o
 * un correo no mandan headers), así que se identifica con el token de SU cámara
 * en la URL. Vive bajo `/api/webhooks/` — el prefijo que el guard global ya
 * exime de CSRF (`lib/csrf.ts`).
 *
 * Lo que eso obliga a cuidar, y se cuida:
 *  · el token se resuelve contra el índice y contra la cámara real; una cámara
 *    dada de baja o con el token rotado no entra aunque el token exista;
 *  · **nunca devuelve datos** — ni el nombre del negocio ni la lista de
 *    cámaras—: responde que sí o que no. Un token filtrado deja subir fotos
 *    basura a ESA cámara, y se rota desde el panel;
 *  · rate limit, tope de tamaño y allowlist de formatos, igual que `/api/upload`;
 *  · la imagen se re-codifica con sharp: lo que se guarda es un webp generado
 *    por nosotros, no el archivo que llegó (un JPEG con carga rara deja de serlo).
 */

const MAX_SIZE = 8 * 1024 * 1024; // una foto de cámara ronda 200 KB–2 MB
const ANCHO_MAX = 1600;
const BUCKET = "media";
const TIPOS = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

/** Responde igual ante token malo y cámara inexistente: no confirma cuál existe. */
const rechazo = () => NextResponse.json({ ok: false }, { status: 401 });

export const POST = withApiHandler("camaras-ingesta", async (req: NextRequest) => {
  const rl = await applyRateLimit(req, "MODERATE", "camara-ingesta");
  if (rl) return rl;

  const url = new URL(req.url);
  const token = (url.searchParams.get("k") ?? "").trim();
  const destino = await CamarasDB.porToken(token);
  if (!destino) return rechazo();

  /* La imagen puede venir como archivo (multipart, lo normal en una cámara o un
     formulario) o como el cuerpo crudo (algunos aparatos postean el JPEG pelado
     con Content-Type: image/jpeg). Los dos entran. */
  let bytes: Buffer | null = null;
  let tipo = req.headers.get("content-type") ?? "";
  try {
    if (tipo.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = (form.get("file") ?? form.get("image") ?? form.get("picture")) as File | null;
      if (!file) return NextResponse.json({ ok: false, error: "sin_imagen" }, { status: 400 });
      tipo = file.type || "image/jpeg";
      if (file.size > MAX_SIZE) return NextResponse.json({ ok: false, error: "muy_grande" }, { status: 413 });
      bytes = Buffer.from(await file.arrayBuffer());
    } else if (tipo.startsWith("image/")) {
      const raw = Buffer.from(await req.arrayBuffer());
      if (raw.length > MAX_SIZE) return NextResponse.json({ ok: false, error: "muy_grande" }, { status: 413 });
      bytes = raw;
    }
  } catch (err) {
    logger.warn("[camaras.ingesta] cuerpo ilegible", { error: String(err) });
    return NextResponse.json({ ok: false, error: "cuerpo_invalido" }, { status: 400 });
  }

  if (!bytes || bytes.length === 0) {
    return NextResponse.json({ ok: false, error: "sin_imagen" }, { status: 400 });
  }
  if (!TIPOS.has(tipo.split(";")[0]!.trim().toLowerCase())) {
    return NextResponse.json({ ok: false, error: "formato_no_permitido" }, { status: 415 });
  }

  try {
    /* Re-codificada por nosotros: lo que se guarda es una imagen nuestra, no el
       archivo que llegó de afuera. Si sharp no la puede leer, no era una foto. */
    const webp = await sharp(bytes)
      .resize({ width: ANCHO_MAX, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    const ahora = new Date();
    const dia = ahora.toISOString().slice(0, 10);
    const path = `${destino.tenantId}/camaras/${destino.camara.id}/${dia}/${ahora.getTime()}.webp`;

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.storage.from(BUCKET).upload(path, webp, {
      contentType: "image/webp",
      cacheControl: "public, max-age=31536000, immutable",
      upsert: false,
    });
    if (error) {
      logger.error("[camaras.ingesta] storage", { err: error.message, path });
      return NextResponse.json({ ok: false, error: "storage" }, { status: 502 });
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const { captura, descartadas } = await CamarasDB.registrarCaptura(destino.tenantId, {
      camaraId: destino.camara.id,
      url: data.publicUrl,
      evento: normalizarEvento(url.searchParams.get("evento")),
      /* Lo que el aparato diga de sí mismo se guarda tal cual y acotado: sirve
         para entender qué mandó, no para confiar en ello. */
      nota: (url.searchParams.get("nota") ?? "").slice(0, 200) || null,
    });
    if (descartadas > 0) {
      logger.info("[camaras.ingesta] historial en el tope, se descartaron las más viejas", {
        tenantId: destino.tenantId,
        descartadas,
      });
    }

    /**
     * La IA lee la foto DESPUÉS de contestar.
     *
     * La cámara está en el patio con 4G: dejarla esperando a que un modelo mire
     * la imagen es tenerla con la radio encendida y la batería corriendo por
     * algo que a ella no le importa. Responde ya; la descripción y la placa
     * aparecen cuando estén. Si el análisis falla, la foto ya está guardada —
     * por eso el `catch` sólo loguea (regla 4 de code-quality: nunca vacío).
     */
    void leerFotoDeCamara(destino.tenantId, data.publicUrl)
      .then((lectura) => CamarasDB.guardarLectura(destino.tenantId, captura.id, lectura))
      .catch((err) =>
        logger.error("[camaras.ingesta] no se pudo leer la foto con IA", {
          error: String(err),
          capturaId: captura.id,
        }),
      );

    /* Respuesta mínima: la cámara sólo necesita saber que entró. */
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[camaras.ingesta] falló", { error: String(err) });
    return NextResponse.json({ ok: false, error: "no_se_pudo_procesar" }, { status: 500 });
  }
});

/** GET con el token: la cámara (o el instalador) prueba que la dirección anda. */
export const GET = withApiHandler("camaras-ingesta-ping", async (req: NextRequest) => {
  const rl = await applyRateLimit(req, "MODERATE", "camara-ingesta");
  if (rl) return rl;
  const token = (new URL(req.url).searchParams.get("k") ?? "").trim();
  const destino = await CamarasDB.porToken(token);
  if (!destino) return rechazo();
  /* Ni el nombre del negocio ni el de la cámara: sólo que la dirección sirve. */
  return NextResponse.json({ ok: true, listo: true });
});
