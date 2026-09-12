import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { CamarasDB } from "@/lib/db/camaras.db";

/**
 * /api/admin/camaras — las cámaras del negocio y su historial.
 *
 * GET    — cámaras + últimas capturas (`?camara=` acota, `?limite=`).
 * POST   — alta; devuelve la cámara CON su token, que es lo único que hay que
 *          copiar en el aparato.
 * PATCH  — `{ id, accion: "rotar" }`: dirección nueva, la vieja deja de entrar.
 *          `{ id, accion: "avisos", whatsapp, cuando }`: a quién avisa por WhatsApp.
 * DELETE — `?id=`: deja de recibir. Las fotos que mandó no se borran.
 *
 * La ingesta (donde la cámara deja la foto) es otro endpoint y a propósito:
 * éste exige sesión de admin, aquél se identifica con el token del aparato.
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

export const GET = withApiHandler("camaras-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner", "almacenero"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "camaras");
  if (rl) return rl;

  const url = new URL(req.url);
  const [camaras, capturas] = await Promise.all([
    CamarasDB.list(auth.tenantId),
    CamarasDB.capturas(auth.tenantId, {
      camaraId: url.searchParams.get("camara") ?? undefined,
      limite: Math.min(Number(url.searchParams.get("limite") ?? 60) || 60, 200),
    }),
  ]);
  return NextResponse.json({ camaras, capturas });
});

/** Las tres escrituras comparten guardas: admin/owner, CSRF y rate limit. */
async function escribir(
  req: NextRequest,
  correr: (tenantId: string, user: string, body: unknown) => Promise<unknown>,
) {
  /* El almacenero puede MIRAR las cámaras; darlas de alta o rotar su dirección
     es configuración del negocio. */
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = await applyRateLimit(req, "MODERATE", "camaras");
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
    return NextResponse.json(await correr(auth.tenantId, auth.username ?? "unknown", body));
  } catch (err) {
    logger.error("[camaras] write failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export const POST = withApiHandler("camaras-post", (req: NextRequest) =>
  escribir(req, async (tenantId, user, body) => {
    const parsed = altaSchema.safeParse(body);
    if (!parsed.success) return { error: "validation_error", message: "Ponele un nombre a la cámara." };
    const r = await CamarasDB.crear(tenantId, parsed.data, user);
    if (!r.ok) return { error: "rechazado", message: r.motivo };
    return { camara: r.camara, camaras: r.camaras, mensaje: r.mensaje };
  }),
);

export const PATCH = withApiHandler("camaras-patch", (req: NextRequest) =>
  escribir(req, async (tenantId, user, body) => {
    const d = (body ?? {}) as { id?: string; accion?: string; whatsapp?: unknown; cuando?: unknown };
    if (!d.id) return { error: "validation_error", message: "No se entendió qué cambiar de la cámara." };
    if (d.accion === "avisos") {
      const p = avisosSchema.safeParse({ whatsapp: d.whatsapp ?? "", cuando: d.cuando ?? "siempre" });
      if (!p.success) return { error: "validation_error", message: "Revisá el WhatsApp y cuándo avisar." };
      const r = await CamarasDB.configurarAvisos(tenantId, d.id, p.data, user);
      if (!r.ok) return { error: "rechazado", message: r.motivo };
      return { camaras: r.camaras, mensaje: r.mensaje };
    }
    if (d.accion !== "rotar") {
      return { error: "validation_error", message: "No se entendió qué cambiar de la cámara." };
    }
    const r = await CamarasDB.rotar(tenantId, d.id, user);
    if (!r.ok) return { error: "rechazado", message: r.motivo };
    return { camaras: r.camaras, mensaje: r.mensaje };
  }),
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
    return { camaras: r.camaras, mensaje: r.mensaje };
  }),
);
