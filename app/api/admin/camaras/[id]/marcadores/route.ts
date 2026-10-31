import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { rateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { limaDateKey } from "@/lib/utils";
import { CamarasDB } from "@/lib/db/camaras.db";
import { CamarasHikConnectDB } from "@/lib/db/camaras-hik-connect.db";
import { CamarasMarcadoresDB } from "@/lib/db/camaras-marcadores.db";
import { pasadaSchema } from "@/lib/camaras/marcadores";
import { sacarFoto } from "@/lib/camaras/ezviz-control.server";
import { ImagenNoPermitida, sharpSeguro, verificarImagen } from "@/lib/camaras/imagen-segura";

/**
 * Marcadores de UNA cámara (ADR-480).
 *
 * GET  → la foto de AHORA que saca la propia cámara (Hik-Connect), en JPEG y a
 *        su resolución (hasta 2560 px): «Contar ahora» lee los marcadores ahí,
 *        en el navegador. No se guarda en Fotos. El visor arranca en SD y a
 *        5 m un marcador de 20 cm no se lee en SD; la foto de la cámara sí
 *        viene en HD.
 * POST → `{ en, origen, calidad, marcadores: [{id, cuadros, ladoPx}] }`: una
 *        pasada ya confirmada en el navegador. Se suma al día de Lima.
 *
 * Admin, dueño y almacenero. La cámara tiene que estar en la lista de ESTE
 * negocio (el id de otra da 404).
 */
const ROLES = ["admin", "owner", "almacenero"] as const;
const idSchema = z.string().trim().min(1).max(64);
const ANCHO_MAX = 2560;
type Contexto = { params: Promise<{ id: string }> };

function sinCupo(clave: string, max: number) {
  const rl = rateLimit(clave, max, 60);
  if (rl.allowed) return null;
  return NextResponse.json(
    { error: "rate_limited", message: "Muchas lecturas seguidas. Espera un minuto." },
    { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))) } },
  );
}

async function camaraDelNegocio(tenantId: string, crudo: string) {
  const id = idSchema.safeParse(crudo);
  if (!id.success) return null;
  return (await CamarasDB.list(tenantId)).find((c) => c.id === id.data) ?? null;
}

export const GET = withApiHandler("camaras-marcadores-foto", async (req: NextRequest, ctx: Contexto) => {
  const auth = await requireAdmin(req, [...ROLES]);
  if (auth instanceof NextResponse) return auth;
  /* EZVIZ tarda ~3,7 s por foto: «Contar ahora» pide 3; 12 por minuto alcanza y frena un bucle. */
  const rl = sinCupo(`camara-marcadores-foto:${auth.tenantId}:${auth.username}`, 12);
  if (rl) return rl;
  const camara = await camaraDelNegocio(auth.tenantId, (await ctx.params).id);
  if (!camara) return NextResponse.json({ error: "not_found", message: "Esa cámara no existe." }, { status: 404 });
  const enlace = await CamarasHikConnectDB.enlaceParaVideo(auth.tenantId, camara.id);
  if (!enlace)
    return NextResponse.json(
      { error: "sin_enlace", message: "Esta cámara no está enlazada con Hik-Connect: prueba con una foto." },
      { status: 409 },
    );
  const cred = await CamarasHikConnectDB.credenciales(auth.tenantId);
  if (!cred.ok) return NextResponse.json({ error: "sin_cuenta", message: cred.motivo }, { status: 409 });
  const f = await sacarFoto(auth.tenantId, cred.valor, enlace.deviceSerial, enlace.codigo);
  if (!f.ok)
    return NextResponse.json(
      { error: "hikvision", codigo: f.error.codigo, message: f.error.mensaje },
      { status: f.error.tipo === "ocupada" ? 429 : 502 },
    );
  try {
    await verificarImagen(f.valor, new Set(["jpeg", "png", "webp"]));
    const jpeg = await sharpSeguro(f.valor)
      .rotate()
      .resize({ width: ANCHO_MAX, withoutEnlargement: true })
      .jpeg({ quality: 92 })
      .toBuffer();
    return new NextResponse(new Uint8Array(jpeg), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" },
    });
  } catch (err) {
    if (err instanceof ImagenNoPermitida)
      return NextResponse.json({ error: "imagen", message: "La cámara mandó una imagen que no se puede abrir." }, { status: 422 });
    logger.error("[camaras.marcadores] la foto falló", { tenantId: auth.tenantId, error: String(err) });
    return NextResponse.json({ error: "foto", message: "No se pudo procesar la foto." }, { status: 500 });
  }
});

export const POST = withApiHandler("camaras-marcadores-pasada", async (req: NextRequest, ctx: Contexto) => {
  const auth = await requireAdmin(req, [...ROLES]);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = sinCupo(`camara-marcadores-pasada:${auth.tenantId}:${auth.username}`, 30);
  if (rl) return rl;
  const camara = await camaraDelNegocio(auth.tenantId, (await ctx.params).id);
  if (!camara) return NextResponse.json({ error: "not_found", message: "Esa cámara no existe." }, { status: 404 });
  const p = pasadaSchema.safeParse(await req.json().catch(() => null));
  if (!p.success)
    return NextResponse.json({ error: "validation_error", message: "La pasada no tiene la forma esperada." }, { status: 400 });
  const en = new Date(p.data.en);
  /* Una pasada del futuro (reloj del equipo adelantado) o de otro día no se anota en hoy. */
  if (Math.abs(Date.now() - en.getTime()) > 10 * 60_000)
    return NextResponse.json(
      { error: "fuera_de_hora", message: "La hora del equipo no coincide con la del servidor: revisa el reloj." },
      { status: 422 },
    );
  const r = await CamarasMarcadoresDB.anotarPasada(
    auth.tenantId,
    limaDateKey(en),
    {
      en: en.toISOString(),
      camaraId: camara.id,
      origen: p.data.origen,
      calidad: p.data.calidad,
      ids: p.data.marcadores.map((m) => m.id),
    },
    auth.username ?? "unknown",
  );
  return NextResponse.json({ ok: true, ...r });
});
