import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { esSuplantacion } from "@/lib/auth/suplantacion";
import { ROLES_LEER_AGENDA, puedeLeerAgenda } from "@/lib/admin/agenda-acceso";
import { endpointDePushValido, etiquetaDispositivo } from "@/lib/camaras/avisar-push";
import { clavesVapid } from "@/lib/camaras/avisar-push.server";
import { idDeEndpointServidor } from "@/lib/db/camaras-celulares.db";
import { dispositivosDe, type EstadoAgendaCelulares } from "@/lib/agenda/push-agenda";
import { AgendaCelularesStore } from "@/lib/agenda/push-agenda-dispositivos.server";
import { probarPushAgenda } from "@/lib/agenda/push-agenda.server";

/**
 * /api/admin/agenda/celular — «Avisarme en este celular» de la agenda (Brandon 20-10).
 *
 *   GET            → mis celulares con el aviso + la clave pública VAPID (null =
 *                    el servidor no la tiene: la pantalla lo dice). El navegador
 *                    sabe si es uno comparando su `idDeEndpoint`.
 *   POST           → { subscription } prende ESTE navegador para mí.
 *   POST ?prueba=1 → un push de prueba a todos MIS celulares.
 *   DELETE         → { id } apaga uno de MIS celulares.
 *
 * Los que leen la agenda (`ROLES_LEER_AGENDA`); cada uno gestiona sólo los
 * suyos: el dueño es el `username` de la sesión, nunca el del cuerpo, y la
 * lista vive en la clave del negocio de la sesión. La vista de tienda del
 * superadmin no da de alta (el aviso le seguiría llegando al cerrar la vista).
 */
const suscribirSchema = z.object({
  subscription: z.object({
    endpoint: z.string().max(1024).refine(endpointDePushValido, "servicio de push no permitido"),
    keys: z.object({ p256dh: z.string().min(16).max(256), auth: z.string().min(8).max(64) }),
  }),
});
const bajaSchema = z.object({ id: z.string().regex(/^[0-9a-f]{16}$/) });

const falla = (error: string, status: number, motivo?: string) =>
  NextResponse.json({ ok: false, error, ...(motivo ? { motivo } : {}) }, { status });

type Auth = Exclude<Awaited<ReturnType<typeof requireAdmin>>, NextResponse>;

/** Sesión que lee la agenda y tiene usuario (sin usuario no hay de quién son los celulares). */
async function sesion(req: NextRequest): Promise<(Auth & { username: string }) | NextResponse> {
  const auth = await requireAdmin(req, ROLES_LEER_AGENDA);
  if (auth instanceof NextResponse) return auth;
  if (!puedeLeerAgenda(auth.role) || !auth.username) return falla("forbidden", 403);
  return { ...auth, username: auth.username };
}

function respuesta(estado: EstadoAgendaCelulares, username: string) {
  return NextResponse.json(
    { ok: true, clavePublica: clavesVapid()?.publicKey ?? null, mios: dispositivosDe(estado, username), puedePrender: !esSuplantacion(username) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export const GET = withApiHandler("agenda-celular", async (req: NextRequest) => {
  const auth = await sesion(req);
  if (auth instanceof NextResponse) return auth;
  return respuesta(await AgendaCelularesStore.listar(auth.tenantId), auth.username);
});

export const POST = withApiHandler("agenda-celular", async (req: NextRequest) => {
  const auth = await sesion(req);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const prueba = req.nextUrl.searchParams.get("prueba") === "1";
  const rl = applyRateLimit(req, "MODERATE", prueba ? "agenda-celular-prueba" : "agenda-celular");
  if (rl) return rl;

  if (prueba) {
    const r = await probarPushAgenda(auth.tenantId, auth.username);
    return NextResponse.json(r, { status: r.ok ? 200 : r.motivo === "sin_claves" ? 503 : r.motivo === "not_found" ? 404 : 502 });
  }

  if (esSuplantacion(auth.username)) {
    return falla("suplantacion", 403, "La vista de tienda no puede prender avisos en un celular (seguirían llegando al cerrarla).");
  }
  if (!clavesVapid()) return falla("sin_claves", 503);
  const body = suscribirSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return falla("datos_invalidos", 400);
  const { endpoint, keys } = body.data.subscription;
  const r = await AgendaCelularesStore.alta(auth.tenantId, {
    id: idDeEndpointServidor(endpoint),
    endpoint,
    keys,
    username: auth.username,
    role: auth.role,
    nombre: etiquetaDispositivo(req.headers.get("user-agent") ?? ""),
  });
  if (!r.ok) return falla("tope", 409, r.motivo);
  return respuesta(r.estado, auth.username);
});

export const DELETE = withApiHandler("agenda-celular", async (req: NextRequest) => {
  const auth = await sesion(req);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = applyRateLimit(req, "MODERATE", "agenda-celular");
  if (rl) return rl;
  const body = bajaSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return falla("datos_invalidos", 400);
  const estado = await AgendaCelularesStore.baja(auth.tenantId, body.data.id, auth.username);
  if (!estado) return falla("not_found", 404);
  return respuesta(estado, auth.username);
});
