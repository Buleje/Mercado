import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import type { AdminRole } from "@/lib/session";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { CamarasDB } from "@/lib/db/camaras.db";
import { CamarasCelularesDB } from "@/lib/db/camaras-celulares.db";
import {
  celularesDeLaCamara,
  endpointDePushValido,
  etiquetaDispositivo,
  type CelularVisible,
  type EstadoCelulares,
} from "@/lib/camaras/avisar-push";
import { clavesVapid, probarCelular } from "@/lib/camaras/avisar-push.server";

/**
 * /api/admin/camaras/[id]/celular — «Avisarme en el celular» (2026-10-10).
 *
 *   GET    → a qué dispositivos llega el aviso de esta cámara + la clave
 *            pública VAPID (null = el servidor no la tiene: la pantalla lo dice).
 *   PUT    → { subscription, cuando } prende ESTE navegador para esta cámara.
 *   DELETE → { id, todo? } apaga esta cámara en un dispositivo (o el
 *            dispositivo entero). El propio, cualquiera; el de otro, admin/dueño.
 *   POST   → { id } manda un push de prueba a ese dispositivo y devuelve el
 *            código del servicio de push (201 = aceptado).
 *
 * Mismos roles que ven el video y las fotos del detector. La cámara se busca
 * en la lista del negocio de la sesión: una de otro negocio es 404, y la lista
 * de dispositivos vive en la clave de ese negocio (`CamarasCelularesDB`).
 */
const ROLES: AdminRole[] = ["admin", "owner", "almacenero"];
const ROLES_QUE_QUITAN_OTROS = new Set(["admin", "owner"]);

const idSchema = z.string().trim().min(1).max(64);
const suscribirSchema = z.object({
  subscription: z.object({
    endpoint: z.string().max(1024).refine(endpointDePushValido, "servicio de push no permitido"),
    keys: z.object({ p256dh: z.string().min(16).max(256), auth: z.string().min(8).max(64) }),
  }),
  cuando: z.enum(["siempre", "noche"]),
});
const idDispositivoSchema = z.object({ id: z.string().regex(/^[0-9a-f]{16}$/), todo: z.boolean().optional() });

type Ctx = { params: Promise<{ id: string }> };
type Auth = Exclude<Awaited<ReturnType<typeof requireAdmin>>, NextResponse>;

const falla = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status });

async function camaraDe(tenantId: string, ctx: Ctx) {
  const id = idSchema.safeParse((await ctx.params).id);
  if (!id.success) return null;
  return (await CamarasDB.list(tenantId)).find((c) => c.id === id.data) ?? null;
}

function respuesta(estado: EstadoCelulares, camaraId: string, auth: Auth) {
  const dispositivos: (CelularVisible & { tuyo: boolean })[] = celularesDeLaCamara(estado, camaraId).map((d) => ({
    ...d,
    tuyo: d.usuario === auth.username,
  }));
  return NextResponse.json({
    ok: true,
    clavePublica: clavesVapid()?.publicKey ?? null,
    dispositivos,
    puedeQuitarOtros: ROLES_QUE_QUITAN_OTROS.has(auth.role),
  });
}

/** Lo que toca hacer sobre un dispositivo ajeno lo hace solo admin/dueño. */
function puedeTocar(estado: EstadoCelulares, id: string, auth: Auth): "ok" | "no_existe" | "ajeno" {
  const d = estado.dispositivos.find((x) => x.id === id);
  if (!d) return "no_existe";
  return d.usuario === auth.username || ROLES_QUE_QUITAN_OTROS.has(auth.role) ? "ok" : "ajeno";
}

export const GET = withApiHandler("camaras-celular", async (req: NextRequest, ctx: Ctx) => {
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  const camara = await camaraDe(auth.tenantId, ctx);
  if (!camara) return falla("not_found", 404);
  return respuesta(await CamarasCelularesDB.listar(auth.tenantId), camara.id, auth);
});

export const PUT = withApiHandler("camaras-celular", async (req: NextRequest, ctx: Ctx) => {
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = applyRateLimit(req, "MODERATE", "camaras-celular");
  if (rl) return rl;
  const camara = await camaraDe(auth.tenantId, ctx);
  if (!camara) return falla("not_found", 404);
  if (!clavesVapid()) return falla("sin_claves", 503);

  const body = suscribirSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return falla("datos_invalidos", 400);
  const r = await CamarasCelularesDB.suscribir(auth.tenantId, camara.id, {
    endpoint: body.data.subscription.endpoint,
    keys: body.data.subscription.keys,
    usuario: auth.username ?? "alguien",
    dispositivo: etiquetaDispositivo(req.headers.get("user-agent") ?? ""),
    cuando: body.data.cuando,
  });
  if (!r.ok) return NextResponse.json({ ok: false, error: "tope", motivo: r.motivo }, { status: 409 });
  return respuesta(r.estado, camara.id, auth);
});

export const DELETE = withApiHandler("camaras-celular", async (req: NextRequest, ctx: Ctx) => {
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = applyRateLimit(req, "MODERATE", "camaras-celular");
  if (rl) return rl;
  const camara = await camaraDe(auth.tenantId, ctx);
  if (!camara) return falla("not_found", 404);
  const body = idDispositivoSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return falla("datos_invalidos", 400);

  const permiso = puedeTocar(await CamarasCelularesDB.listar(auth.tenantId), body.data.id, auth);
  if (permiso === "no_existe") return falla("not_found", 404);
  if (permiso === "ajeno") return falla("forbidden", 403);
  const estado = await CamarasCelularesDB.quitar(
    auth.tenantId,
    body.data.id,
    body.data.todo ? null : camara.id,
    auth.username ?? "alguien",
  );
  return respuesta(estado, camara.id, auth);
});

export const POST = withApiHandler("camaras-celular", async (req: NextRequest, ctx: Ctx) => {
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = applyRateLimit(req, "MODERATE", "camaras-celular-prueba");
  if (rl) return rl;
  const camara = await camaraDe(auth.tenantId, ctx);
  if (!camara) return falla("not_found", 404);
  const body = idDispositivoSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return falla("datos_invalidos", 400);

  const permiso = puedeTocar(await CamarasCelularesDB.listar(auth.tenantId), body.data.id, auth);
  if (permiso === "no_existe") return falla("not_found", 404);
  if (permiso === "ajeno") return falla("forbidden", 403);
  const r = await probarCelular(auth.tenantId, body.data.id, { id: camara.id, nombre: camara.nombre });
  return NextResponse.json(r, { status: r.ok ? 200 : r.motivo === "sin_claves" ? 503 : 502 });
});
