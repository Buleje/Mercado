import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import {
  createDistributedRateLimiter,
  getClientIp,
  type DistributedRateLimiter,
} from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { CamarasDB } from "@/lib/db/camaras.db";
import { CamarasHikConnectDB } from "@/lib/db/camaras-hik-connect.db";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import {
  ALARMA_HABILITADA,
  ALARMA_SEGUNDOS,
  alarmaQuizaSonando,
  DIRECCIONES,
  type ErrorEzviz,
} from "@/lib/camaras/ezviz-control";
import {
  alarma,
  cambiarDeteccion,
  cambiarMicrofono,
  controlesDe,
  mover,
  sacarFoto,
} from "@/lib/camaras/ezviz-control.server";
import type { CredencialesHik } from "@/lib/camaras/hik-connect-api.server";
import { registrarControl } from "@/lib/camaras/ezviz-control-registro.server";
import { avisarDesarme } from "@/lib/camaras/ezviz-control-aviso.server";
import { ImagenNoPermitida, sharpSeguro, verificarImagen } from "@/lib/camaras/imagen-segura";
import { guardarFoto } from "@/lib/camaras/ingesta.server";

/**
 * /api/admin/camaras/[id]/control — mover, detección, alarma y foto de una
 * cámara enlazada con Hik-Connect for Teams, por EZVIZ Open (ADR-472).
 *
 * GET  → `{ capacidades, deteccion, microfono, enLinea, bateria, tarjeta,
 *        puedeConfigurar, alarmaHabilitada }`: qué botones
 *        dibujar (sólo lo que la cámara sabe hacer) y el estado real.
 * POST → una acción:
 *   `{ accion: "ptz", direccion: up|down|left|right|stop, velocidad?: 1|2, ultima? }`
 *   `{ accion: "deteccion", activa }`               (admin/dueño)
 *   `{ accion: "microfono", activa }`               (admin/dueño; el de la cámara)
 *   `{ accion: "alarma", activa, duracion? }`        (admin/dueño; DESHABILITADA:
 *        `activa: true` → 409 mientras `ALARMA_HABILITADA` sea `false`;
 *        `activa: false` siempre, sin cupo)
 *   `{ accion: "captura" }` → la foto queda en Fotos como «del vivo».
 *
 * Roles: mover y foto = quien ve el vivo (admin, dueño, almacenero; el
 * encargado entra siempre por `requireAdmin`). Detección, micrófono y alarma
 * = SÓLO admin/dueño (`soloAdminODueno`). El rol se mira ANTES del cupo: un
 * pedido prohibido no gasta el cupo de nadie. El permiso de EZVIZ nunca sale
 * de acá. Errores de Hikvision → 422/429/502, nunca 401/403 (sacarían del panel).
 */

const ROLES_VEN = ["admin", "owner", "almacenero"] as const;

const cuerpoSchema = z.discriminatedUnion("accion", [
  z.object({
    accion: z.literal("ptz"),
    direccion: z.enum([...DIRECCIONES, "stop"]),
    velocidad: z.union([z.literal(1), z.literal(2)]).optional(),
    /** Con `stop`: la dirección que se estaba moviendo (EZVIZ lo recomienda). */
    ultima: z.enum(DIRECCIONES).optional(),
  }),
  z.object({ accion: z.literal("deteccion"), activa: z.boolean() }),
  z.object({ accion: z.literal("microfono"), activa: z.boolean() }),
  z.object({
    accion: z.literal("alarma"),
    activa: z.boolean(),
    duracion: z.number().int().min(ALARMA_SEGUNDOS.min).max(ALARMA_SEGUNDOS.max).optional(),
  }),
  z.object({ accion: z.literal("captura") }),
]);

/* Cupos compartidos entre instancias (Upstash; sin Upstash, en memoria) y por
   PERSONA: por 4G varios celulares salen por la misma IP. Mover: generoso (un
   toque son 2 pedidos, empezar + frenar). Detección/micrófono: estricto (cada
   desarme avisa al dueño). Alarma: además por IP. Apagar la alarma: sin cupo. */
const cupo = (key: string, maxRequests: number, windowMs: number) =>
  createDistributedRateLimiter({ key: `camaras:control:${key}`, maxRequests, windowMs });
const CUPOS = {
  ptz: { l: cupo("ptz", 150, 60_000), msg: "Muchos movimientos seguidos. Espera un minuto." },
  ajustes: {
    l: cupo("ajustes", 6, 10 * 60_000),
    msg: "Ya cambiaste la detección o el micrófono 6 veces en 10 min. Espera un rato.",
  },
  foto: { l: cupo("foto", 10, 60_000), msg: "Muchas fotos seguidas. Espera un minuto." },
  alarma: {
    l: cupo("alarma", 3, 10 * 60_000),
    msg: "La alarma ya sonó 3 veces en 10 min. Espera un rato.",
  },
  leer: { l: cupo("leer", 30, 60_000), msg: "Demasiadas consultas. Espera un minuto." },
} satisfies Record<string, { l: DistributedRateLimiter; msg: string }>;

async function sinCupo(
  c: (typeof CUPOS)[keyof typeof CUPOS],
  claves: string[],
): Promise<NextResponse | null> {
  for (const k of claves) {
    if (await c.l.check(k)) continue;
    return NextResponse.json(
      { error: "rate_limited", message: c.msg },
      { status: 429, headers: { "Retry-After": String(Math.ceil(c.l.windowMs / 1000)) } },
    );
  }
  return null;
}

const ANCHO_MAX = 1600;

function errorHik(e: ErrorEzviz, extra?: Record<string, unknown>) {
  const status =
    e.tipo === "red" || e.tipo === "desconectada" || e.tipo === "token"
      ? 502
      : e.tipo === "ocupada"
        ? 429
        : 422;
  return NextResponse.json(
    { error: "hikvision", codigo: e.codigo, message: e.mensaje, ...extra },
    { status },
  );
}

/** Apaga la alarma con hasta 3 intentos (2 s entre uno y otro). */
async function apagarConReintentos(
  tenantId: string,
  cred: CredencialesHik,
  serie: string,
  camaraId: string,
): Promise<void> {
  for (let intento = 1; intento <= 3; intento++) {
    const off = await alarma(tenantId, cred, serie, false);
    if (off.ok) return;
    if (intento === 3)
      logger.error("[camaras] la alarma no se apagó sola", {
        tenantId,
        camaraId,
        codigo: off.error.codigo,
      });
    else await new Promise((r) => setTimeout(r, 2000));
  }
}

type Contexto = { params: Promise<{ id: string }> };

/** Cámara del tenant + su enlace + las claves. `NextResponse` si falta algo. */
async function camaraYCuenta(tenantId: string, id: string) {
  const camara = (await CamarasDB.list(tenantId)).find((c) => c.id === id);
  if (!camara)
    return NextResponse.json(
      { error: "not_found", message: "Esa cámara no existe." },
      { status: 404 },
    );
  const enlace = await CamarasHikConnectDB.enlaceParaVideo(tenantId, id);
  if (!enlace)
    return NextResponse.json(
      { error: "sin_enlace", message: "Esta cámara no está enlazada con Hik-Connect." },
      { status: 409 },
    );
  const cred = await CamarasHikConnectDB.credenciales(tenantId);
  if (!cred.ok)
    return NextResponse.json({ error: "sin_cuenta", message: cred.motivo }, { status: 409 });
  return { camara, enlace, cred: cred.valor };
}

export const GET = withApiHandler(
  "camaras-control-leer",
  async (req: NextRequest, ctx: Contexto) => {
    const auth = await requireAdmin(req, [...ROLES_VEN]);
    if (auth instanceof NextResponse) return auth;
    const rl = await sinCupo(CUPOS.leer, [`${auth.tenantId}:${auth.username}`]);
    if (rl) return rl;
    const { id } = await ctx.params;
    const c = await camaraYCuenta(auth.tenantId, id);
    if (c instanceof NextResponse) return c;
    const r = await controlesDe(auth.tenantId, c.cred, c.enlace.deviceSerial);
    if (!r.ok) return errorHik(r.error);
    return NextResponse.json(
      {
        capacidades: r.valor.capacidades,
        deteccion: r.valor.estado.deteccion,
        microfono: r.valor.microfono,
        enLinea: r.valor.estado.enLinea,
        bateria: r.valor.salud.bateria,
        tarjeta: r.valor.salud.tarjeta,
        puedeConfigurar: soloAdminODueno(auth.role) === null,
        alarmaHabilitada: ALARMA_HABILITADA,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  },
);

export const POST = withApiHandler("camaras-control", async (req: NextRequest, ctx: Contexto) => {
  const auth = await requireAdmin(req, [...ROLES_VEN]);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const parsed = cuerpoSchema.safeParse(raw);
  if (!parsed.success)
    return NextResponse.json(
      { error: "validation_error", message: "Pedido de control inválido." },
      { status: 400 },
    );
  const p = parsed.data;

  /* 1) El rol, antes que nada: un pedido prohibido no gasta cupo. */
  if (p.accion === "deteccion" || p.accion === "alarma" || p.accion === "microfono") {
    const prohibido = soloAdminODueno(
      auth.role,
      p.accion === "alarma"
        ? "hacer sonar o apagar la alarma de la cámara"
        : p.accion === "microfono"
          ? "prender o apagar el micrófono de la cámara"
          : "cambiar la detección de la cámara",
    );
    if (prohibido) return prohibido;
  }

  /* 2) La alarma no suena hasta probarla en el sitio (ALARMA_HABILITADA). */
  if (p.accion === "alarma" && p.activa && !ALARMA_HABILITADA)
    return NextResponse.json(
      {
        error: "alarma_deshabilitada",
        message: "La alarma se habilita después de probarla en el sitio.",
      },
      { status: 409 },
    );

  /* 3) El cupo, por persona (la alarma también por IP). Apagar: sin cupo. */
  const persona = `${auth.tenantId}:${auth.username}`;
  const rl =
    p.accion === "alarma"
      ? p.activa
        ? await sinCupo(CUPOS.alarma, [persona, `ip:${getClientIp(req)}`])
        : null
      : await sinCupo(
          p.accion === "ptz" ? CUPOS.ptz : p.accion === "captura" ? CUPOS.foto : CUPOS.ajustes,
          [persona],
        );
  if (rl) return rl;

  const { id } = await ctx.params;
  const c = await camaraYCuenta(auth.tenantId, id);
  if (c instanceof NextResponse) return c;
  const { camara, enlace, cred } = c;
  const serie = enlace.deviceSerial;
  const quien = { usuario: auth.username, rol: auth.role };
  /* Después de contestar, pero dentro de la vida de la función (en Vercel un
     `void` suelto se puede perder al congelarse). `registrarControl` no tira. */
  const anotar = (que: Parameters<typeof registrarControl>[3]) =>
    after(() => registrarControl(auth.tenantId, quien, { id, nombre: camara.nombre }, que));
  const avisarSiDesarma = (que: "deteccion" | "microfono", activa: boolean) => {
    if (!activa) after(() => avisarDesarme(auth.tenantId, quien, camara, que));
  };

  if (p.accion === "ptz") {
    const r = await mover(auth.tenantId, cred, serie, p.direccion, p.velocidad ?? 1, p.ultima);
    if (!r.ok) return errorHik(r.error);
    if (p.direccion !== "stop") anotar({ accion: "ptz" });
    return NextResponse.json({ ok: true });
  }

  if (p.accion === "deteccion") {
    const r = await cambiarDeteccion(auth.tenantId, cred, serie, p.activa);
    if (!r.ok) return errorHik(r.error);
    anotar({ accion: "deteccion", activa: p.activa });
    avisarSiDesarma("deteccion", p.activa);
    return NextResponse.json({ ok: true, deteccion: r.valor });
  }

  if (p.accion === "microfono") {
    const r = await cambiarMicrofono(auth.tenantId, cred, serie, p.activa);
    if (!r.ok) return errorHik(r.error);
    anotar({ accion: "microfono", activa: p.activa });
    avisarSiDesarma("microfono", p.activa);
    return NextResponse.json({ ok: true, microfono: r.valor });
  }

  if (p.accion === "alarma") {
    const r = await alarma(auth.tenantId, cred, serie, p.activa);
    const duracion = p.duracion ?? ALARMA_SEGUNDOS.porDefecto;
    /* Un «sonar» con falla dudosa (red, 4G, «ocupada») puede haber llegado:
       se trata como sonando —la pantalla muestra «Apagar»— y se programa el
       apagado igual. Un «apagar» que falló lo reintenta la pantalla. */
    const quiza = !r.ok && p.activa && alarmaQuizaSonando(r.error);
    if (!r.ok && !quiza) return errorHik(r.error);
    anotar({ accion: "alarma", activa: p.activa, ...(p.activa && { duracion }) });
    if (p.activa)
      /* Sólo corre con ALARMA_HABILITADA. NO alcanza solo: en Vercel la
         función corta a los 30 s (ver ADR-472 § «Alarma: antes de habilitarla»). */
      after(async () => {
        await new Promise((res) => setTimeout(res, duracion * 1000));
        await apagarConReintentos(auth.tenantId, cred, serie, id);
      });
    if (!r.ok) return errorHik(r.error, { estado: "quiza_sonando", duracion });
    return NextResponse.json({ ok: true, activa: p.activa, ...(p.activa && { duracion }) });
  }

  /* captura: la foto que saca la cámara entra a Fotos como «del vivo». */
  const f = await sacarFoto(auth.tenantId, cred, serie, enlace.codigo);
  if (!f.ok) return errorHik(f.error);
  try {
    await verificarImagen(f.valor, new Set(["jpeg", "png", "webp"]));
    const webp = await sharpSeguro(f.valor)
      .rotate()
      .resize({ width: ANCHO_MAX, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    const nota =
      `del vivo (Hik-Connect), foto de la cámara pedida por ${auth.username ?? "alguien"}`.slice(
        0,
        200,
      );
    const ok = await guardarFoto({ tenantId: auth.tenantId, camara }, webp, {
      evento: "manual",
      nota,
    });
    if (!ok)
      return NextResponse.json(
        { error: "storage", message: "No se pudo guardar la foto." },
        { status: 502 },
      );
    const nueva = (
      await CamarasDB.capturas(auth.tenantId, { camaraId: camara.id, limite: 5 })
    ).find((x) => x.nota === nota);
    return NextResponse.json({ ok: true, capturaId: nueva?.id ?? null });
  } catch (err) {
    if (err instanceof ImagenNoPermitida)
      return NextResponse.json(
        { error: "imagen", message: "La cámara mandó una imagen que no se puede abrir." },
        { status: 422 },
      );
    logger.error("[camaras.control] la foto falló", {
      tenantId: auth.tenantId,
      error: String(err),
    });
    return NextResponse.json(
      { error: "foto", message: "No se pudo procesar la foto." },
      { status: 500 },
    );
  }
});
