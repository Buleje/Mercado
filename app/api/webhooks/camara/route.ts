import { NextRequest, NextResponse, after } from "next/server";
import sharp from "sharp";
import { getSupabaseAdmin } from "@/lib/supabase";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { CamarasDB } from "@/lib/db/camaras.db";
import { normalizarEvento } from "@/lib/camaras/camaras";
import { procesarCapturaNueva } from "@/lib/camaras/cruces.server";
import {
  alertaDelAviso,
  eventoDeAlerta,
  imagenDelAviso,
  leerAlerta,
  notaDeAlerta,
  partesMultipart,
  type AlertaHikvision,
} from "@/lib/camaras/hikvision-push";

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
/** El aviso de Hikvision trae la foto MÁS la alerta en XML/JSON: holgura para el texto. */
const MAX_CUERPO = MAX_SIZE + 256 * 1024;
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

  /* La imagen puede venir en un multipart (lo normal: la cámara manda la alerta
     y la foto en partes con el nombre que elige su firmware, o un formulario),
     como el cuerpo crudo (algunos aparatos postean el JPEG pelado) o no venir:
     la alerta sola en XML/JSON, o el latido de «sigo viva». Las partes se leen
     sobre los bytes — ver `lib/camaras/hikvision-push.ts` por qué. */
  let bytes: Buffer | null = null;
  let tipo = req.headers.get("content-type") ?? "";
  let alerta: AlertaHikvision | null = null;
  try {
    const cuerpo = Buffer.from(await req.arrayBuffer());
    if (cuerpo.length > MAX_CUERPO) return NextResponse.json({ ok: false, error: "muy_grande" }, { status: 413 });
    if (tipo.includes("multipart/")) {
      const partes = partesMultipart(cuerpo, tipo);
      alerta = alertaDelAviso(partes);
      const imagen = imagenDelAviso(partes);
      if (imagen) {
        bytes = imagen.datos;
        tipo = imagen.tipo;
      }
    } else if (tipo.startsWith("image/")) {
      bytes = cuerpo;
    } else {
      alerta = leerAlerta(cuerpo.toString("utf8"));
    }
  } catch (err) {
    logger.warn("[camaras.ingesta] cuerpo ilegible", { error: String(err) });
    return NextResponse.json({ ok: false, error: "cuerpo_invalido" }, { status: 400 });
  }

  /* Una alerta sin foto —el latido de «sigo viva» (`videoloss` / `inactive`) o
     un evento sin captura— se contesta 200 y no se escribe nada: con un error la
     cámara reintenta, y en el patio cada reintento es batería y datos móviles
     gastados en algo que no deja nada para ver. Con foto se guarda siempre,
     diga lo que diga el estado: perder una imagen es peor que un duplicado. */
  if (alerta && (!bytes || bytes.length === 0)) {
    return NextResponse.json({ ok: true, guardada: false });
  }
  if (!bytes || bytes.length === 0) {
    return NextResponse.json({ ok: false, error: "sin_imagen" }, { status: 400 });
  }
  if (bytes.length > MAX_SIZE) return NextResponse.json({ ok: false, error: "muy_grande" }, { status: 413 });
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
      /* La alerta de la cámara dice qué disparó la foto; sin alerta (subida a
         mano, un FTP que reenvía) manda el `?evento=` de la dirección. */
      evento: alerta ? eventoDeAlerta(alerta) : normalizarEvento(url.searchParams.get("evento")),
      /* Lo que el aparato diga de sí mismo se guarda tal cual y acotado: sirve
         para entender qué mandó, no para confiar en ello. */
      nota: (url.searchParams.get("nota") ?? "").slice(0, 200) || (alerta ? notaDeAlerta(alerta) : null),
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
     * algo que a ella no le importa. Responde ya; la lectura, los cruces
     * (placa ↔ guía/flete, chaleco ↔ persona) y la pila aparecen cuando estén,
     * guardados en UNA escritura. `after()` mantiene viva la función hasta que
     * termine: en Vercel, lo que sigue corriendo después de la respuesta sin
     * él se puede cortar a mitad. Si el análisis falla, la foto ya está
     * guardada — por eso el `catch` sólo loguea (code-quality §4).
     */
    after(() =>
      procesarCapturaNueva(destino.tenantId, destino.camara, captura).catch((err) =>
        logger.error("[camaras.ingesta] el análisis de la foto falló", {
          error: String(err),
          capturaId: captura.id,
        }),
      ),
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
