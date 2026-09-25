import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { CamarasDB, destinoResuelto } from "@/lib/db/camaras.db";
import {
  camaraParaPantalla,
  camarasParaPantalla,
  textoDeFalla,
  type PruebaDeCamara,
} from "@/lib/camaras/camaras";
import { moverPtz, probarCamara } from "@/lib/camaras/isapi";

/**
 * /api/admin/camaras — las cámaras del negocio y su historial.
 *
 * GET    — cámaras + últimas capturas (`?camara=` acota, `?limite=`).
 * POST   — alta; devuelve la cámara CON su token, que es lo único que hay que
 *          copiar en el aparato.
 * PATCH  — `{ id, accion: "rotar" }`: dirección nueva, la vieja deja de entrar.
 *          `{ id, accion: "avisos", whatsapp, cuando }`: a quién avisa por WhatsApp.
 *          `{ id, accion: "conectar", host, puerto, usuario, clave, https?, canal? }`:
 *            prueba el aparato y, sólo si contesta, guarda cómo llamarlo.
 *          `{ id, accion: "desconectar" }`: borra la conexión y su clave.
 *          `{ id, accion: "probar" }`: vuelve a probar una conexión guardada.
 *          `{ id, accion: "ptz", x, y, zoom, ms? }`: mueve la cámara y la frena.
 * DELETE — `?id=`: deja de recibir. Las fotos que mandó no se borran.
 *
 * La ingesta (donde la cámara deja la foto) es otro endpoint y a propósito:
 * éste exige sesión de admin, aquél se identifica con el token del aparato.
 *
 * ## Dos caminos opuestos en el mismo recurso
 *
 * Las cámaras 4G empujan (CGNAT: nadie las puede llamar). Las de la bodega, en
 * cambio, están en la misma red que el panel y sí se pueden llamar por ISAPI —
 * Hik-Connect no tiene API pública, así que ése es el único camino. Eso mete
 * acá un riesgo que el resto del archivo no tiene: **un endpoint que llama a un
 * host escrito por una persona es un SSRF**. La lista de bloqueo y la
 * resolución del nombre están en `lib/camaras/camaras.ts` y `destinoResuelto`.
 *
 * ## La clave de la cámara nunca vuelve
 *
 * Se guarda cifrada y toda respuesta pasa por `camarasParaPantalla`, que arma
 * el objeto campo por campo y deja el secreto adentro del servidor.
 */

/** A quién avisa la cámara. El número se valida en el modelo puro (9 dígitos PE). */
const avisosSchema = z.object({
  whatsapp: z.string().trim().max(20),
  cuando: z.enum(["siempre", "noche", "nunca"]),
});

const altaSchema = z.object({
  nombre: z.string().trim().min(1).max(80),
  lugar: z.string().trim().max(120).optional(),
});

/** Cómo se llega a la cámara. El host se valida aparte: es la guarda anti-SSRF. */
const conectarSchema = z.object({
  host: z.string().trim().min(1).max(255),
  puerto: z.coerce.number().int().min(1).max(65535).default(80),
  usuario: z.string().trim().min(1).max(64),
  clave: z.string().min(1).max(128),
  https: z.boolean().default(false),
  canal: z.coerce.number().int().min(1).max(64).default(1),
});

/**
 * Mover la cámara. `x`/`y`/`zoom` son velocidad (−100 a 100), no posición: el
 * aparato se mueve mientras se lo pida y por eso `ms` —cuánto dura el empujón—
 * tiene techo. Sin freno, un clic la deja girando para siempre.
 */
const ptzSchema = z.object({
  x: z.coerce.number().int().min(-100).max(100),
  y: z.coerce.number().int().min(-100).max(100),
  zoom: z.coerce.number().int().min(-100).max(100),
  ms: z.coerce.number().int().min(50).max(2000).default(400),
});

/** Convierte lo que contestó el aparato en lo que el modelo sabe guardar. */
function comoPrueba(
  r: Awaited<ReturnType<typeof probarCamara>>,
  en = new Date().toISOString(),
): PruebaDeCamara {
  return r.ok
    ? {
        ok: true,
        en,
        info: {
          modelo: r.valor.info.modelo,
          firmware: r.valor.info.firmware,
          serie: r.valor.info.serie,
          soportaPtz: r.valor.info.soportaPtz,
        },
      }
    : { ok: false, en, motivo: r.motivo, detalle: r.detalle };
}

export const GET = withApiHandler("camaras-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner", "almacenero"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "camaras");
  if (rl) return rl;

  const url = new URL(req.url);
  const [camaras, capturas] = await Promise.all([
    /* Sin secretos: la conexión viaja con host y usuario, jamás con la clave. */
    CamarasDB.listaParaPantalla(auth.tenantId),
    CamarasDB.capturas(auth.tenantId, {
      camaraId: url.searchParams.get("camara") ?? undefined,
      limite: Math.min(Number(url.searchParams.get("limite") ?? 60) || 60, 200),
    }),
  ]);
  return NextResponse.json({ camaras, capturas });
});

/** Las escrituras comparten guardas: admin/owner, CSRF y rate limit. */
async function escribir(
  req: NextRequest,
  correr: (tenantId: string, user: string, body: unknown) => Promise<unknown>,
  preset: "MODERATE" | "GENEROUS" = "MODERATE",
) {
  /* El almacenero puede MIRAR las cámaras; darlas de alta o rotar su dirección
     es configuración del negocio. */
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = await applyRateLimit(req, preset, "camaras");
  if (rl) return rl;

  let body: unknown = null;
  if (req.method !== "DELETE") {
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }
  }
  try {
    const salida = await correr(auth.tenantId, auth.username ?? "unknown", body);
    /* Una acción puede necesitar su propio código (un 429 del límite extra de
       las que salen a la red): si devolvió una respuesta, va tal cual. */
    if (salida instanceof Response) return salida;
    return NextResponse.json(salida);
  } catch (err) {
    logger.error("[camaras] write failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export const POST = withApiHandler("camaras-post", (req: NextRequest) =>
  escribir(req, async (tenantId, user, body) => {
    const parsed = altaSchema.safeParse(body);
    if (!parsed.success) return { error: "validation_error", message: "Ponle un nombre a la cámara." };
    const r = await CamarasDB.crear(tenantId, parsed.data, user);
    if (!r.ok) return { error: "rechazado", message: r.motivo };
    return { camara: camaraParaPantalla(r.camara), camaras: camarasParaPantalla(r.camaras), mensaje: r.mensaje };
  }),
);

export const PATCH = withApiHandler("camaras-patch", (req: NextRequest) =>
  escribir(
    req,
    async (tenantId, user, body) => {
      const d = (body ?? {}) as { id?: string; accion?: string; whatsapp?: unknown; cuando?: unknown };
      if (!d.id) return { error: "validation_error", message: "No se entendió qué cambiar de la cámara." };
      const id = d.id;

      if (d.accion === "avisos") {
        const p = avisosSchema.safeParse({ whatsapp: d.whatsapp ?? "", cuando: d.cuando ?? "siempre" });
        if (!p.success) return { error: "validation_error", message: "Revisa el WhatsApp y cuándo avisar." };
        const r = await CamarasDB.configurarAvisos(tenantId, id, p.data, user);
        if (!r.ok) return { error: "rechazado", message: r.motivo };
        return { camaras: camarasParaPantalla(r.camaras), mensaje: r.mensaje };
      }

      if (d.accion === "conectar") {
        /* Salir a la red es caro y es la acción que un abuso usaría para
           escanear: límite propio, aparte del general de la pestaña. */
        const rl = await applyRateLimit(req, "MODERATE", "camaras-probar");
        if (rl) return rl;
        const p = conectarSchema.safeParse(body);
        if (!p.success) {
          return {
            error: "validation_error",
            message: "Faltan datos de la cámara: dirección, usuario y clave.",
          };
        }
        /* Guarda anti-SSRF: la forma del host, el puerto y —si es un nombre—
           TODAS las IP a las que resuelve. Antes de hablar con nadie. */
        const destino = await destinoResuelto(p.data.host, p.data.puerto);
        if (!destino.ok) {
          return { error: "bloqueado", motivo: destino.motivo, detalle: destino.detalle, message: destino.detalle };
        }
        const prueba = comoPrueba(
          await probarCamara({
            host: p.data.host,
            puerto: p.data.puerto,
            usuario: p.data.usuario,
            clave: p.data.clave,
            https: p.data.https,
            canal: p.data.canal,
          }),
        );
        if (!prueba.ok) {
          /* No contestó: no se guarda NADA. Una conexión guardada que nunca
             respondió es una cámara «conectada» que no se ve nunca. */
          return {
            error: "no_responde",
            motivo: prueba.motivo,
            detalle: prueba.detalle,
            message: textoDeFalla(prueba.motivo, prueba.detalle),
          };
        }
        const r = await CamarasDB.conectar(tenantId, id, { ...p.data, prueba }, user);
        if (!r.ok) return { error: "rechazado", message: r.motivo };
        return { camaras: camarasParaPantalla(r.camaras), mensaje: r.mensaje };
      }

      if (d.accion === "desconectar") {
        const r = await CamarasDB.desconectar(tenantId, id, user);
        if (!r.ok) return { error: "rechazado", message: r.motivo };
        return { camaras: camarasParaPantalla(r.camaras), mensaje: r.mensaje };
      }

      if (d.accion === "probar") {
        const rl = await applyRateLimit(req, "MODERATE", "camaras-probar");
        if (rl) return rl;
        const cred = await CamarasDB.credenciales(tenantId, id);
        if (!cred.ok) {
          /* «Todavía no está conectada» no es una falla del aparato: no ensucia
             el historial de la conexión. Lo demás sí queda anotado. */
          if (cred.motivo !== "sin-configurar" && cred.motivo !== "no-existe") {
            await CamarasDB.registrarPrueba(
              tenantId,
              id,
              { ok: false, motivo: cred.motivo, detalle: cred.detalle, en: new Date().toISOString() },
              user,
            );
          }
          return { error: "no_responde", motivo: cred.motivo, detalle: cred.detalle, message: cred.detalle };
        }
        const prueba = comoPrueba(await probarCamara(cred.credenciales));
        const r = await CamarasDB.registrarPrueba(tenantId, id, prueba, user);
        if (!r.ok) return { error: "rechazado", message: r.motivo };
        return {
          camaras: camarasParaPantalla(r.camaras),
          mensaje: r.mensaje,
          respondio: prueba.ok,
          ...(prueba.ok ? {} : { motivo: prueba.motivo, detalle: prueba.detalle }),
        };
      }

      if (d.accion === "ptz") {
        const p = ptzSchema.safeParse(body);
        if (!p.success) {
          return { error: "validation_error", message: "El movimiento tiene que ir entre −100 y 100." };
        }
        const cred = await CamarasDB.credenciales(tenantId, id);
        if (!cred.ok) return { error: "sin_conexion", motivo: cred.motivo, message: cred.detalle };
        if (cred.camara.conexion?.soportaPtz === false) {
          return { error: "rechazado", message: "Esta cámara es fija: no se mueve desde el panel." };
        }
        /* El empujón dura `ms` y el freno lo manda el propio cliente ISAPI: un
           `continuous` sin cero deja la cámara girando sola. Acá sólo se acota
           cuánto puede durar. */
        const r = await moverPtz(
          cred.credenciales,
          { x: p.data.x, y: p.data.y, zoom: p.data.zoom },
          { ms: p.data.ms },
        );
        if (!r.ok) {
          return { error: "no_responde", motivo: r.motivo, detalle: r.detalle, message: textoDeFalla(r.motivo, r.detalle) };
        }
        return { mensaje: "Listo." };
      }

      if (d.accion !== "rotar") {
        return { error: "validation_error", message: "No se entendió qué cambiar de la cámara." };
      }
      const r = await CamarasDB.rotar(tenantId, id, user);
      if (!r.ok) return { error: "rechazado", message: r.motivo };
      return { camaras: camarasParaPantalla(r.camaras), mensaje: r.mensaje };
    },
    /* Mover la cámara son muchos clics seguidos: con el tope normal el joystick
       se quedaría mudo a los veinte toques. El costo real de las acciones que
       salen a la red lo frena su propio límite, arriba. */
    "GENEROUS",
  ),
);

export const DELETE = withApiHandler("camaras-delete", (req: NextRequest) =>
  escribir(req, async (tenantId, user) => {
    const url = new URL(req.url);
    /* `?captura=` borra UNA foto del historial; `?id=` saca la cámara entera. */
    const captura = url.searchParams.get("captura")?.trim();
    if (captura) {
      const fue = await CamarasDB.borrarCaptura(tenantId, captura, user);
      return fue
        ? { mensaje: "Foto borrada del historial." }
        : { error: "rechazado", message: "Esa foto ya no está en el historial." };
    }
    const id = url.searchParams.get("id")?.trim();
    if (!id) return { error: "validation_error", message: "Falta decir qué cámara sacar." };
    const r = await CamarasDB.quitar(tenantId, id, user);
    if (!r.ok) return { error: "rechazado", message: r.motivo };
    return { camaras: camarasParaPantalla(r.camaras), mensaje: r.mensaje };
  }),
);
