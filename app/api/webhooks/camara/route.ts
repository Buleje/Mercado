import { NextRequest, NextResponse } from "next/server";
import { ImagenNoPermitida, sharpSeguro, verificarImagen } from "@/lib/camaras/imagen-segura";
import { guardarFoto } from "@/lib/camaras/ingesta.server";
import { z } from "zod";
import { applyRateLimit, getClientIp, rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { CamarasDB } from "@/lib/db/camaras.db";
import { normalizarEvento, type Camara, type EventoCamara } from "@/lib/camaras/camaras";
import { CuadroIlegible, recibirCuadro } from "@/lib/camaras/cuadro-vivo.server";
import { anotarContacto } from "@/lib/camaras/contacto.server";
import { esLatido } from "@/lib/camaras/contacto";
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
 * POST /api/webhooks/camara?k=<token>&modo=vivo — un cuadro del puente de
 *      pantalla (ADR-466): JPEG/WebP ≤ 1 MB, crudo o en multipart. Responde
 *      `{ ok, guardada, motivo: "cambio"|"intervalo"|"sin_cambio"|"tope_del_dia" }`.
 *      Misma RUTA a propósito: el portero del túnel compara la ruta exacta.
 * POST /api/webhooks/camara?k=<token>&modo=prueba — «Probar recepción»
 *      (2026-10-05): lee el aviso ENTERO (multipart, alerta, foto, sharp) y
 *      contesta `{ ok, prueba: true, conFoto, evento }` SIN escribir nada: ni
 *      storage, ni historial, ni IA, ni «último aviso». Ver `lib/camaras/recepcion.ts`.
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
const TIPOS = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

/** Responde igual ante token malo y cámara inexistente: no confirma cuál existe. */
const rechazo = () => NextResponse.json({ ok: false }, { status: 401 });

/**
 * Lo que trae la dirección. El token se valida igual que siempre (≥ 16, lo
 * resuelve el índice); `modo` sólo conoce `vivo` — otro valor es un error del
 * script, no una foto normal con un parámetro de más.
 */
const consultaSchema = z.object({
  k: z.string().trim().min(16).max(128),
  modo: z.enum(["vivo", "prueba"]).optional(),
});

/* ── Modo vivo (ADR-466) ─────────────────────────────────────────────────── */

/** Un cuadro de una ventana de 1280–1920 px en JPEG ronda 100–400 KB. */
const MAX_VIVO = 1024 * 1024;
const MAX_CUERPO_VIVO = MAX_VIVO + 16 * 1024;
const TIPOS_VIVO = new Set(["image/jpeg", "image/jpg", "image/webp"]);
/**
 * Topes propios: la PC manda ~1 cuadro/s y el MODERATE de las fotos (20 cada 5
 * min) lo cortaría en 20 segundos. Por IP antes del token (corta un bucle o un
 * barrido de tokens) y por cámara después (≈ 2/s). En memoria de la instancia,
 * a propósito: cada cuadro ya gasta comandos de Upstash y el techo distribuido
 * por IP lo pone el middleware en producción.
 */
const VIVO_POR_IP = { max: 300, ventanaSeg: 60 };
const VIVO_POR_CAMARA = { max: 20, ventanaSeg: 10 };

const demasiado = (resetAt: number) =>
  NextResponse.json(
    { ok: false, error: "muy_seguido" },
    {
      status: 429,
      headers: { "Retry-After": String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))) },
    },
  );

/**
 * Un cuadro del puente de pantalla. El cuadro queda 60 s para mirar; pasa al
 * historial como foto `programada` sólo si cambió o pasó el intervalo, con
 * tope diario (`lib/camaras/vivo.ts`). Responde siempre rápido: la PC manda el
 * siguiente en un segundo.
 */
async function ingestaVivo(
  req: NextRequest,
  destino: { tenantId: string; camara: Camara },
): Promise<Response> {
  const porCamara = rateLimit(
    `camara-vivo:${destino.tenantId}:${destino.camara.id}`,
    VIVO_POR_CAMARA.max,
    VIVO_POR_CAMARA.ventanaSeg,
  );
  if (!porCamara.allowed) return demasiado(porCamara.resetAt);

  if (Number(req.headers.get("content-length") ?? 0) > MAX_CUERPO_VIVO) {
    return NextResponse.json({ ok: false, error: "muy_grande" }, { status: 413 });
  }
  let bytes: Buffer | null = null;
  let tipo = req.headers.get("content-type") ?? "";
  try {
    const cuerpo = Buffer.from(await req.arrayBuffer());
    if (cuerpo.length > MAX_CUERPO_VIVO)
      return NextResponse.json({ ok: false, error: "muy_grande" }, { status: 413 });
    if (tipo.includes("multipart/")) {
      const imagen = imagenDelAviso(partesMultipart(cuerpo, tipo));
      if (imagen) {
        bytes = imagen.datos;
        tipo = imagen.tipo;
      }
    } else if (tipo.startsWith("image/")) {
      bytes = cuerpo;
    }
  } catch (err) {
    logger.warn("[camaras.vivo] cuerpo ilegible", { error: String(err) });
    return NextResponse.json({ ok: false, error: "cuerpo_invalido" }, { status: 400 });
  }
  if (!bytes || bytes.length === 0)
    return NextResponse.json({ ok: false, error: "sin_imagen" }, { status: 400 });
  if (bytes.length > MAX_VIVO)
    return NextResponse.json({ ok: false, error: "muy_grande" }, { status: 413 });
  if (!TIPOS_VIVO.has(tipo.split(";")[0]!.trim().toLowerCase())) {
    return NextResponse.json({ ok: false, error: "formato_no_permitido" }, { status: 415 });
  }

  try {
    const paso = await recibirCuadro(
      destino.tenantId,
      destino.camara,
      bytes,
      async (foto, motivo) => {
        const ok = await guardarFoto(destino, foto, {
          evento: "programada",
          nota:
            motivo === "cambio"
              ? "Puente de pantalla: cambió la imagen"
              : "Puente de pantalla: foto de intervalo",
        });
        if (!ok) throw new Error("storage");
      },
    );
    return NextResponse.json({ ok: true, guardada: paso.guardada, motivo: paso.motivo });
  } catch (err) {
    if (err instanceof CuadroIlegible) {
      return NextResponse.json({ ok: false, error: "formato_no_permitido" }, { status: 415 });
    }
    logger.error("[camaras.vivo] falló", { error: String(err), camaraId: destino.camara.id });
    const storage = err instanceof Error && err.message === "storage";
    return NextResponse.json(
      { ok: false, error: storage ? "storage" : "no_se_pudo_procesar" },
      { status: storage ? 502 : 500 },
    );
  }
}

/* ── El aviso: leerlo y, en modo prueba, contestar sin guardar ─────────────── */

interface AvisoLeido {
  bytes: Buffer | null;
  tipo: string;
  alerta: AlertaHikvision | null;
}

/**
 * La imagen puede venir en un multipart (lo normal: la cámara manda la alerta
 * y la foto en partes con el nombre que elige su firmware, o un formulario),
 * como el cuerpo crudo (algunos aparatos postean el JPEG pelado) o no venir:
 * la alerta sola en XML/JSON, o el latido de «sigo viva». Las partes se leen
 * sobre los bytes — ver `lib/camaras/hikvision-push.ts` por qué.
 */
async function leerAviso(req: NextRequest): Promise<AvisoLeido | Response> {
  let bytes: Buffer | null = null;
  let tipo = req.headers.get("content-type") ?? "";
  let alerta: AlertaHikvision | null = null;
  try {
    const cuerpo = Buffer.from(await req.arrayBuffer());
    if (cuerpo.length > MAX_CUERPO)
      return NextResponse.json({ ok: false, error: "muy_grande" }, { status: 413 });
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
  return { bytes, tipo, alerta };
}

/**
 * «Probar recepción»: las mismas validaciones que una foto real —tamaño,
 * formato declarado, formato REAL y que sharp la decodifique— y ninguna
 * escritura. Lo que contesta dice si una foto así se habría guardado.
 */
async function contestarPrueba(
  bytes: Buffer | null,
  tipo: string,
  alerta: AlertaHikvision | null,
): Promise<Response> {
  const evento: EventoCamara | null = alerta ? eventoDeAlerta(alerta) : null;
  if (!bytes || bytes.length === 0) {
    if (alerta) return NextResponse.json({ ok: true, prueba: true, conFoto: false, evento });
    return NextResponse.json({ ok: false, prueba: true, error: "sin_imagen" }, { status: 400 });
  }
  if (bytes.length > MAX_SIZE)
    return NextResponse.json({ ok: false, prueba: true, error: "muy_grande" }, { status: 413 });
  if (!TIPOS.has(tipo.split(";")[0]!.trim().toLowerCase())) {
    return NextResponse.json(
      { ok: false, prueba: true, error: "formato_no_permitido" },
      { status: 415 },
    );
  }
  try {
    await verificarImagen(bytes, new Set(["jpeg", "png", "webp"]));
    await sharpSeguro(bytes)
      .resize({ width: ANCHO_MAX, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
  } catch (err) {
    const motivo = err instanceof ImagenNoPermitida ? err.message : "formato_no_permitido";
    return NextResponse.json({ ok: false, prueba: true, error: motivo }, { status: 415 });
  }
  return NextResponse.json({ ok: true, prueba: true, conFoto: true, evento });
}

export const POST = withApiHandler("camaras-ingesta", async (req: NextRequest) => {
  const url = new URL(req.url);
  if (url.searchParams.get("modo") === "vivo") {
    const porIp = rateLimit(
      `camara-vivo-ip:${getClientIp(req)}`,
      VIVO_POR_IP.max,
      VIVO_POR_IP.ventanaSeg,
    );
    if (!porIp.allowed) return demasiado(porIp.resetAt);
  } else {
    const rl = applyRateLimit(req, "MODERATE", "camara-ingesta");
    if (rl) return rl;
  }

  const consulta = consultaSchema.safeParse({
    k: url.searchParams.get("k") ?? "",
    modo: url.searchParams.get("modo") ?? undefined,
  });
  if (!consulta.success) {
    if (consulta.error.issues.some((i) => i.path[0] === "modo")) {
      return NextResponse.json({ ok: false, error: "modo_invalido" }, { status: 400 });
    }
    return rechazo();
  }
  const destino = await CamarasDB.porToken(consulta.data.k);
  if (!destino) return rechazo();
  if (consulta.data.modo === "vivo") return ingestaVivo(req, destino);

  const leido = await leerAviso(req);
  if (leido instanceof Response) return leido;
  const { bytes, tipo, alerta } = leido;
  if (consulta.data.modo === "prueba") return contestarPrueba(bytes, tipo, alerta);

  /* Una alerta sin foto —el latido de «sigo viva» (`videoloss` / `inactive`) o
     un evento sin captura— se contesta 200 y no se escribe nada: con un error la
     cámara reintenta, y en el patio cada reintento es batería y datos móviles
     gastados en algo que no deja nada para ver. Con foto se guarda siempre,
     diga lo que diga el estado: perder una imagen es peor que un duplicado. */
  if (alerta && (!bytes || bytes.length === 0)) {
    /* Sin foto igual cuenta como «la cámara llegó»: es lo que dice si quedó conectada. */
    await anotarContacto(
      destino.tenantId,
      destino.camara.id,
      esLatido(alerta) ? "latido" : "alerta",
    );
    return NextResponse.json({ ok: true, guardada: false });
  }
  if (!bytes || bytes.length === 0) {
    return NextResponse.json({ ok: false, error: "sin_imagen" }, { status: 400 });
  }
  if (bytes.length > MAX_SIZE)
    return NextResponse.json({ ok: false, error: "muy_grande" }, { status: 413 });
  if (!TIPOS.has(tipo.split(";")[0]!.trim().toLowerCase())) {
    return NextResponse.json({ ok: false, error: "formato_no_permitido" }, { status: 415 });
  }

  try {
    /* Re-codificada por nosotros: lo que se guarda es una imagen nuestra, no el
       archivo que llegó de afuera. Si sharp no la puede leer, no era una foto. */
    /* Formato REAL y techo de píxeles (revisión de seguridad 03-10): el
       content-type del cliente no alcanza. */
    await verificarImagen(bytes, new Set(["jpeg", "png", "webp"]));
    const webp = await sharpSeguro(bytes)
      .resize({ width: ANCHO_MAX, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    const guardada = await guardarFoto(destino, webp, {
      /* La alerta de la cámara dice qué disparó la foto; sin alerta (subida a
         mano, un FTP que reenvía) manda el `?evento=` de la dirección. */
      evento: alerta ? eventoDeAlerta(alerta) : normalizarEvento(url.searchParams.get("evento")),
      /* Lo que el aparato diga de sí mismo se guarda tal cual y acotado: sirve
         para entender qué mandó, no para confiar en ello. */
      nota:
        (url.searchParams.get("nota") ?? "").slice(0, 200) ||
        (alerta ? notaDeAlerta(alerta) : null),
    });
    if (!guardada) return NextResponse.json({ ok: false, error: "storage" }, { status: 502 });
    /* «Guardar» del visor manda `evento=manual` por esta misma puerta: eso lo
       subió una persona, no dice que la cámara esté conectada. */
    if (alerta || url.searchParams.get("evento") !== "manual") {
      await anotarContacto(destino.tenantId, destino.camara.id, "foto");
    }

    /* Respuesta mínima: la cámara sólo necesita saber que entró. */
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ImagenNoPermitida) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 415 });
    }
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
  /* Ni el nombre del negocio ni el de la cámara: sólo que la dirección sirve.
     `prueba: true` = este servidor conoce `modo=prueba` («Probar recepción»
     pregunta antes de mandar la foto: uno viejo la guardaría como real). */
  return NextResponse.json({ ok: true, listo: true, prueba: true });
});
