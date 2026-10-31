import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import type { AdminRole } from "@/lib/session";
import { assertCsrf } from "@/lib/auth/csrf";
import { rateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { cuerpoConTope } from "@/lib/cuerpo-con-tope";
import { ImagenNoPermitida } from "@/lib/camaras/imagen-segura";
import {
  CAMARA_ESPEJO,
  CuadroEspejoGrande,
  anotarMiradaEspejo,
  borrarCuadroEspejo,
  guardarCuadroEspejo,
  leerCuadroEspejo,
  prepararCuadroEspejo,
} from "@/lib/camaras/espejo-remoto.server";
import {
  EMISOR_RE,
  HEADER_EDAD,
  HEADER_EMISOR,
  MAX_BYTES_CUADRO,
  TIPOS_CUADRO,
} from "@/lib/camaras/espejo-remoto";

/**
 * /api/admin/camaras/espejo/cuadro — el «Espejo del celular» visto desde otro
 * equipo (24-10). Contrato en `lib/camaras/espejo-remoto.ts`; dónde vive el
 * cuadro, en `espejo-remoto.server.ts`.
 *
 *   POST   cuerpo = el cuadro (JPEG o WebP, ≤ 200 KB) + header del emisor →
 *          queda como el último de ESTE usuario por 10 s. 409 si otra
 *          pestaña suya ya comparte.
 *   GET    → 200 `image/webp` (+ edad en ms medida acá) · 204 «no hay espejo ahora».
 *   DELETE header del emisor → lo borra (al apagar el interruptor o cerrar la pestaña).
 *
 * Mismos roles que miran el cuadro en vivo de las cámaras. El negocio y el
 * usuario salen del JWT y arman la clave: el de otro negocio u otra persona
 * no se lee ni se pisa. Se anota quién prende y apaga (sin el cuadro) y quién
 * mira (Ley 29733, el mismo registro «quién miró» de las cámaras).
 */
const ROLES: AdminRole[] = ["admin", "owner", "almacenero"];
/** Compartir la pantalla del celular del dueño: sólo la gestión (revisión 24-10: si la PC de la
 *  tienda tenía la sesión del almacenero, él lo veía desde su teléfono fuera de la tienda). */
const ROLES_COMPARTIR: AdminRole[] = ["admin", "owner"];

/** De dónde mira: la primera IP del proxy y una huella corta del navegador (sin guardar el UA entero). */
function desdeDonde(req: NextRequest): { ip?: string; equipo?: string } {
  const ip = (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "").trim().slice(0, 45);
  const ua = req.headers.get("user-agent") ?? "";
  const equipo = createHash("sha256").update(`${ua}|${ip}`).digest("hex").slice(0, 12);
  return { ...(ip ? { ip } : {}), equipo };
}
/** 1 cada 1,5 s son 40/min: margen para reintentos y dos pestañas, no para un bucle. */
const SUBIR = { max: 90, ventanaSeg: 60 };
const MIRAR = { max: 300, ventanaSeg: 60 };

const tipoSchema = z.enum(TIPOS_CUADRO);
const emisorSchema = z.string().regex(EMISOR_RE);

const ACCION = {
  prender: "camara.espejo_compartir_prendido",
  apagar: "camara.espejo_compartir_apagado",
} as const;

type Auth = Exclude<Awaited<ReturnType<typeof requireAdmin>>, NextResponse>;

const falla = (error: string, status: number) =>
  NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } });

function limite(clave: string, cupo: { max: number; ventanaSeg: number }): NextResponse | null {
  const rl = rateLimit(clave, cupo.max, cupo.ventanaSeg);
  if (rl.allowed) return null;
  return NextResponse.json(
    { ok: false, error: "rate_limited" },
    {
      status: 429,
      headers: { "Retry-After": String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))) },
    },
  );
}

function anotar(auth: Auth, que: keyof typeof ACCION) {
  logActivity(
    ACCION[que],
    "camara",
    JSON.stringify({ rol: auth.role }),
    CAMARA_ESPEJO.id,
    auth.username,
    undefined,
    auth.tenantId,
  ).catch((err) =>
    logger.error("[camaras.espejo] anotar el compartir falló", {
      tenantId: auth.tenantId,
      error: String(err),
    }),
  );
}

export const GET = withApiHandler("camaras-espejo-cuadro-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  const rl = limite(`camara-espejo-mirar:${auth.tenantId}:${auth.username}`, MIRAR);
  if (rl) return rl;

  const cuadro = await leerCuadroEspejo(auth.tenantId, auth.username);
  if (!cuadro)
    return new NextResponse(null, {
      status: 204,
      headers: { "Cache-Control": "private, no-store" },
    });
  anotarMiradaEspejo(auth.tenantId, { usuario: auth.username, rol: auth.role }, Date.now(), desdeDonde(req));
  return new NextResponse(new Uint8Array(cuadro.imagen), {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      [HEADER_EDAD]: String(cuadro.edadMs),
    },
  });
});

export const POST = withApiHandler("camaras-espejo-cuadro-post", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ROLES_COMPARTIR);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = limite(`camara-espejo-subir:${auth.tenantId}:${auth.username}`, SUBIR);
  if (rl) return rl;

  const emisor = emisorSchema.safeParse(req.headers.get(HEADER_EMISOR));
  if (!emisor.success) return falla("emisor_invalido", 400);
  const tipo = tipoSchema.safeParse(
    (req.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase(),
  );
  if (!tipo.success) return falla("tipo_no_permitido", 415);

  /* El tope se aplica mientras se lee: ni `content-length` ni el cliente deciden cuánto entra. */
  const cuerpo = await cuerpoConTope(req, MAX_BYTES_CUADRO);
  if (cuerpo === "grande") return falla("muy_grande", 413);
  if (cuerpo.byteLength === 0) return falla("sin_imagen", 400);

  let webp: Buffer;
  try {
    webp = await prepararCuadroEspejo(Buffer.from(cuerpo));
  } catch (err) {
    if (err instanceof ImagenNoPermitida) return falla(err.message, 415);
    if (err instanceof CuadroEspejoGrande) return falla(err.message, 413);
    throw err;
  }

  const r = await guardarCuadroEspejo(auth.tenantId, auth.username, emisor.data, webp);
  if (r === "otro_equipo") return falla("otro_equipo", 409);
  if (r === "nuevo") anotar(auth, "prender");
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
});

export const DELETE = withApiHandler("camaras-espejo-cuadro-delete", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ROLES_COMPARTIR);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = limite(`camara-espejo-subir:${auth.tenantId}:${auth.username}`, SUBIR);
  if (rl) return rl;
  const emisor = emisorSchema.safeParse(req.headers.get(HEADER_EMISOR));
  if (!emisor.success) return falla("emisor_invalido", 400);

  if ((await borrarCuadroEspejo(auth.tenantId, auth.username, emisor.data)) === "borrado")
    anotar(auth, "apagar");
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
});
