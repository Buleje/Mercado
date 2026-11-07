import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { origenDeLaPeticion } from "@/lib/seo/origen-de-la-peticion";
import { ROLES_CONECTAR_AGENDA, puedeConectarAgenda } from "@/lib/admin/agenda-acceso";
import { esSuplantacion } from "@/lib/auth/suplantacion";
import { FeedIcsCrearSchema } from "@/lib/agenda/schemas";
import { AgendaConexionesDB, TOPE_FEEDS_ACTIVOS } from "@/lib/db/agenda-conexiones.db";

/**
 * GET  /api/admin/agenda/ics — los calendarios publicados (vivos) del negocio.
 * POST /api/admin/agenda/ics — publica uno nuevo; la URL con el token se ve UNA vez
 *      (en la base queda sólo su hash).
 *
 * Sólo admin y dueños: el manager pasa `requireAdmin` (management tier), por eso
 * además `puedeConectarAgenda` (ADR-501 §7).
 */

const SIN_PERMISO = { error: "Sólo el administrador o el dueño puede publicar el calendario" };
/** La vista de tienda del superadmin dura minutos; un feed ICS la sobreviviría para siempre. */
const SUPLANTACION_NO = { error: "La vista de tienda no puede publicar calendarios (sobrevivirían a la sesión)" };

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ROLES_CONECTAR_AGENDA);
  if (auth instanceof NextResponse) return auth;
  if (!puedeConectarAgenda(auth.role)) return NextResponse.json(SIN_PERMISO, { status: 403 });

  try {
    const feeds = await AgendaConexionesDB.listarFeeds(auth.tenantId);
    return NextResponse.json({ feeds }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    logger.error("[agenda/ics] GET error", { tenantId: auth.tenantId, error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudieron leer los calendarios publicados" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ROLES_CONECTAR_AGENDA);
  if (auth instanceof NextResponse) return auth;
  if (!puedeConectarAgenda(auth.role)) return NextResponse.json(SIN_PERMISO, { status: 403 });
  if (esSuplantacion(auth.username)) return NextResponse.json(SUPLANTACION_NO, { status: 403 });

  let body: unknown = {};
  try {
    const crudo = await req.text();
    body = crudo.trim() ? JSON.parse(crudo) : {};
  } catch {
    return NextResponse.json({ error: "Los datos no llegaron bien" }, { status: 400 });
  }
  const parsed = FeedIcsCrearSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }

  try {
    const creado = await AgendaConexionesDB.crearFeed(auth.tenantId, parsed.data, auth.username);
    if (!creado) {
      return NextResponse.json(
        { error: `Ya hay ${TOPE_FEEDS_ACTIVOS} calendarios publicados: revoca uno que no uses y vuelve a intentar` },
        { status: 409 },
      );
    }
    const origen = await origenDeLaPeticion();
    const url = `${origen}/api/public/agenda-ics/${creado.token}.ics`;
    // webcal:// abre la suscripción directo en Apple Calendar y Outlook de escritorio.
    const webcal = url.replace(/^https?:\/\//, "webcal://");
    return NextResponse.json({ feed: creado.feed, url, webcal }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    logger.error("[agenda/ics] POST error", { tenantId: auth.tenantId, error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo publicar el calendario" }, { status: 503 });
  }
}
