import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { CamarasDB } from "@/lib/db/camaras.db";
import { CamarasHikConnectDB, estadoParaPantalla } from "@/lib/db/camaras-hik-connect.db";
import { normalizarCodigo, type ErrorHik, type RegionHik } from "@/lib/camaras/hik-connect-api";
import {
  listarCamarasHik,
  olvidarTokens,
  probarCredenciales,
} from "@/lib/camaras/hik-connect-api.server";

/**
 * /api/admin/camaras/hik-connect — la cuenta de Hik-Connect for Teams (ADR-471).
 *
 * GET    — `{ vinculado, region, regionNombre, ultimos4, vinculadoAt, enlaces }`.
 *          Sin claves: los enlaces dicen el nombre en Hikvision, los últimos 4
 *          de la serie y si hay código. Lo ven quienes ven las cámaras (el botón
 *          «En vivo» lo necesita para saber si abre el visor del panel).
 * POST   — `{ appKey, secretKey, region: "auto"|"sa"|"us"|"eu"|"sgp" }`: PRUEBA
 *          las claves pidiendo un token y sólo si Hikvision lo da, las guarda
 *          cifradas. Si no, contesta el error de Hikvision traducido y no guarda.
 * PATCH  — `{ accion: "enlazar", camaraId, resourceId, codigo? }`: el nombre y la
 *          serie se toman de la lista de Hikvision, no del pedido.
 *          `{ accion: "codigo", camaraId, codigo | null }`: el código de verificación.
 *          `{ accion: "desenlazar", camaraId }`.
 * DELETE — desvincula: borra claves, enlaces y códigos.
 *
 * Escribir es SÓLO de admin y dueño (`soloAdminODueno`: `requireAdmin` deja
 * pasar al encargado). Las claves nunca vuelven en ninguna respuesta.
 */

/** «auto» = probar América del Sur y seguir con las otras mientras Hikvision no conozca la AppKey. */
const REGION_O_AUTO = ["auto", "sa", "us", "eu", "sgp"] as const satisfies readonly (
  | "auto"
  | RegionHik
)[];

const vincularSchema = z.object({
  appKey: z.string().trim().min(8).max(128),
  secretKey: z.string().trim().min(8).max(256),
  region: z.enum(REGION_O_AUTO).default("auto"),
});

const codigoSchema = z
  .string()
  .max(20)
  .transform((v, ctx) => {
    const c = normalizarCodigo(v);
    if (!c) {
      ctx.addIssue({
        code: "custom",
        message: "El código son las 6 letras de la etiqueta de la cámara.",
      });
      return z.NEVER;
    }
    return c;
  });

const patchSchema = z.discriminatedUnion("accion", [
  z.object({
    accion: z.literal("enlazar"),
    camaraId: z.string().min(1).max(64),
    resourceId: z.string().min(1).max(128),
    codigo: codigoSchema.nullish(),
  }),
  z.object({
    accion: z.literal("codigo"),
    camaraId: z.string().min(1).max(64),
    codigo: codigoSchema.nullable(),
  }),
  z.object({ accion: z.literal("desenlazar"), camaraId: z.string().min(1).max(64) }),
]);

/** El error de Hikvision para la pantalla: 401/403 sería «se cerró la sesión del panel», así que va 422/502. */
function errorHik(e: ErrorHik) {
  const status = e.tipo === "red" ? 502 : e.tipo === "limite" ? 429 : 422;
  return NextResponse.json(
    { error: "hikvision", codigo: e.codigo, message: e.mensaje },
    { status },
  );
}

export const GET = withApiHandler("camaras-hik-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner", "almacenero"]);
  if (auth instanceof NextResponse) return auth;
  const rl = applyRateLimit(req, "GENEROUS", "camaras-hik");
  if (rl) return rl;
  return NextResponse.json(await CamarasHikConnectDB.estado(auth.tenantId));
});

/** Admin/dueño + CSRF + cupo chico: cada escritura puede salir a Hikvision. */
async function guardas(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rol = soloAdminODueno(auth.role, "vincular Hik-Connect");
  if (rol) return rol;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = applyRateLimit(req, "MODERATE", "camaras-hik-escribir");
  if (rl) return rl;
  return auth;
}

async function cuerpo(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

export const POST = withApiHandler("camaras-hik-vincular", async (req: NextRequest) => {
  const auth = await guardas(req);
  if (auth instanceof Response) return auth;
  const parsed = vincularSchema.safeParse(await cuerpo(req));
  if (!parsed.success)
    return NextResponse.json(
      {
        error: "validation_error",
        message: "Pega la AppKey y la SecretKey completas (las dos son largas).",
      },
      { status: 400 },
    );
  const { appKey, secretKey, region } = parsed.data;
  const prueba = await probarCredenciales(appKey, secretKey, region);
  if (!prueba.ok) {
    logger.info("[hik-connect] vincular rechazado", {
      tenantId: auth.tenantId,
      codigo: prueba.error.codigo,
    });
    return errorHik(prueba.error);
  }
  olvidarTokens(auth.tenantId);
  const r = await CamarasHikConnectDB.vincular(
    auth.tenantId,
    { appKey, secretKey, region: prueba.valor.region },
    auth.username ?? "unknown",
  );
  if (!r.ok) return NextResponse.json({ error: "no_guardado", message: r.motivo }, { status: 500 });
  return NextResponse.json({ ...r.valor, mensaje: `Cuenta vinculada (${r.valor.regionNombre}).` });
});

export const PATCH = withApiHandler("camaras-hik-enlazar", async (req: NextRequest) => {
  const auth = await guardas(req);
  if (auth instanceof Response) return auth;
  const parsed = patchSchema.safeParse(await cuerpo(req));
  if (!parsed.success) {
    const msg =
      parsed.error.issues.find((i) => i.code === "custom")?.message ?? "Datos incompletos.";
    return NextResponse.json({ error: "validation_error", message: msg }, { status: 400 });
  }
  const p = parsed.data;
  const user = auth.username ?? "unknown";
  /* La cámara del sistema tiene que ser de ESTE negocio. */
  if (!(await CamarasDB.list(auth.tenantId)).some((c) => c.id === p.camaraId))
    return NextResponse.json(
      { error: "not_found", message: "Esa cámara no existe." },
      { status: 404 },
    );

  if (p.accion === "desenlazar") {
    const r = await CamarasHikConnectDB.desenlazar(auth.tenantId, p.camaraId, user);
    return r.ok
      ? NextResponse.json(r.valor)
      : NextResponse.json({ error: "rechazado", message: r.motivo }, { status: 409 });
  }

  if (p.accion === "codigo") {
    const cuenta = await CamarasHikConnectDB.leer(auth.tenantId);
    const e = cuenta?.enlaces[p.camaraId];
    if (!e)
      return NextResponse.json(
        { error: "sin_enlace", message: "Primero enlaza la cámara." },
        { status: 409 },
      );
    const r = await CamarasHikConnectDB.enlazar(
      auth.tenantId,
      p.camaraId,
      {
        resourceId: e.resourceId,
        deviceSerial: e.deviceSerial,
        nombre: e.nombreHik,
        enLinea: null,
      },
      p.codigo,
      user,
    );
    return r.ok
      ? NextResponse.json(r.valor)
      : NextResponse.json({ error: "rechazado", message: r.motivo }, { status: 409 });
  }

  const cred = await CamarasHikConnectDB.credenciales(auth.tenantId);
  if (!cred.ok)
    return NextResponse.json({ error: "sin_cuenta", message: cred.motivo }, { status: 409 });
  const lista = await listarCamarasHik(auth.tenantId, cred.valor);
  if (!lista.ok) return errorHik(lista.error);
  const hik = lista.valor.find((c) => c.resourceId === p.resourceId);
  if (!hik)
    return NextResponse.json(
      {
        error: "not_found",
        message: "Esa cámara ya no está en la cuenta de Hik-Connect. Recarga la lista.",
      },
      { status: 404 },
    );
  if (!hik.deviceSerial)
    return NextResponse.json(
      {
        error: "sin_serie",
        message:
          "Hikvision no informó el número de serie de esa cámara: no se puede pedir su video.",
      },
      { status: 422 },
    );
  const r = await CamarasHikConnectDB.enlazar(auth.tenantId, p.camaraId, hik, p.codigo, user);
  return r.ok
    ? NextResponse.json(r.valor)
    : NextResponse.json({ error: "rechazado", message: r.motivo }, { status: 409 });
});

export const DELETE = withApiHandler("camaras-hik-desvincular", async (req: NextRequest) => {
  const auth = await guardas(req);
  if (auth instanceof Response) return auth;
  await CamarasHikConnectDB.desvincular(auth.tenantId, auth.username ?? "unknown");
  olvidarTokens(auth.tenantId);
  return NextResponse.json({
    ...estadoParaPantalla(null),
    mensaje: "Cuenta desvinculada: claves y enlaces borrados.",
  });
});
