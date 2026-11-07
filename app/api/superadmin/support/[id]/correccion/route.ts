import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { SupportTicketsDB, aSolicitudDTO } from "@/lib/db/support-tickets.db";
import { NotificationCenterDB } from "@/lib/db/notification-center.db";
import { applyRateLimit } from "@/lib/rate-limit";
import { validateSuperadminCsrf, csrfForbiddenResponse } from "@/lib/csrf";
import { logSuperadminAction } from "@/lib/audit/superadmin-audit";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import {
  EQUIPO_BULEJE,
  ESTADO_CORRECCION_ETIQUETA,
  cambiarEstadoCorreccionSchema,
  rutaGuiaEnPanel,
  type CambiarEstadoCorreccionRespuesta,
  type ErrorCambiarEstadoCorreccion,
  type EstadoCorreccion,
  type SolicitudCorreccionDTO,
} from "@/lib/soporte/correccion-guia";

/**
 * PATCH /api/superadmin/support/[id]/correccion — ADR-512: el superadmin
 * mueve una solicitud de corrección de guía.
 *
 *   body `CambiarEstadoCorreccionBody` = { estado: open|in_review|closed|rejected,
 *   resolucion? } — cerrar/rechazar exige la resolución (qué guía se emitió o
 *   por qué no). 200 { ok, solicitud } | 400 | 401 | 403 (CSRF) | 404 | 409.
 *
 * 409 `cambio_concurrente`: otro superadmin la movió entre la lectura y la
 * escritura (`updateMany` con el estado leído en el WHERE): nada se pisa.
 * Si el estado cambió, el negocio recibe un aviso en su campana con la
 * respuesta (sin dedup: cada paso es un aviso).
 */

async function requirePlatform(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getPlatformSession(token);
}

function fallo(
  status: number,
  codigo: ErrorCambiarEstadoCorreccion,
  error: string,
  extra: { solicitudAbiertaId?: string } = {},
): NextResponse<CambiarEstadoCorreccionRespuesta> {
  return NextResponse.json({ ok: false, error, codigo, ...extra }, { status });
}

const AVISO: Record<EstadoCorreccion, { titulo: (n: string) => string; severity: "MEDIUM" | "LOW" }> = {
  open: { titulo: (n) => `Guía ${n}: tu solicitud de corrección se reabrió`, severity: "LOW" },
  in_review: { titulo: (n) => `Guía ${n}: tu solicitud de corrección está en revisión`, severity: "LOW" },
  closed: { titulo: (n) => `Guía ${n}: corrección resuelta`, severity: "MEDIUM" },
  rejected: { titulo: (n) => `Guía ${n}: corrección rechazada`, severity: "MEDIUM" },
};

function avisarAlNegocio(tenantId: string, s: SolicitudCorreccionDTO): Promise<unknown> {
  const a = AVISO[s.estado];
  const cuerpo =
    s.resolucion ??
    (s.estado === "in_review" ? "El equipo de Buleje está revisando lo que pediste." : "La solicitud volvió a Pendiente.");
  return NotificationCenterDB.create({
    tenantId,
    type: "soporte_correccion_guia",
    severity: a.severity,
    title: a.titulo(s.guiaNumero),
    body: cuerpo.slice(0, 1000),
    actionUrl: rutaGuiaEnPanel(s.entityType),
    actionLabel: "Ver la guía",
    entityId: s.id,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const rl = applyRateLimit(req, "MODERATE", "sa-support-correccion");
  if (rl) return rl;
  if (!validateSuperadminCsrf(req)) return csrfForbiddenResponse();
  const session = await requirePlatform(req);
  if (!session) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  let raw: unknown = null;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const parsed = cambiarEstadoCorreccionSchema.safeParse(raw);
  if (!parsed.success) return fallo(400, "validation_error", parsed.error.issues[0]?.message ?? "Datos inválidos");

  try {
    const antes = await SupportTicketsDB.obtener(id);
    if (!antes || antes.kind !== "correccion_guia") return fallo(404, "no_existe", "Solicitud no encontrada");

    const r = await SupportTicketsDB.cambiarEstado(id, {
      estado: parsed.data.estado,
      resolucion: parsed.data.resolucion ?? null,
      por: session.username,
    });
    if (!r.ok) {
      switch (r.error) {
        case "no_existe":
          return fallo(404, "no_existe", "Solicitud no encontrada");
        case "falta_resolucion":
          return fallo(400, "falta_resolucion", "Di qué se hizo o por qué se rechaza");
        case "cambio_concurrente":
          return fallo(409, "cambio_concurrente", "Otra persona cambió esta solicitud recién: recarga y vuelve a intentar");
        case "ya_hay_una_abierta":
          return fallo(
            409,
            "ya_hay_una_abierta",
            "Esta guía ya tiene otra solicitud abierta: resuélvela o recházala antes de reabrir esta",
            { solicitudAbiertaId: r.solicitudAbiertaId },
          );
        default:
          return fallo(409, r.error, `No se puede pasar a «${ESTADO_CORRECCION_ETIQUETA[parsed.data.estado]}» desde el estado actual`);
      }
    }

    const solicitud = aSolicitudDTO(r.ticket);
    if (r.ticket.status !== antes.status) {
      const tenantId = r.ticket.tenantId;
      const detalle = `Corrección de la guía ${solicitud.guiaNumero}: ${antes.status} → ${r.ticket.status}`;
      logSuperadminAction(
        "support_correccion",
        detalle,
        { ticketId: id, tenantId, estado: r.ticket.status },
        session.username,
      ).catch((err) => logger.error("[superadmin/support/correccion] audit superadmin falló", { error: String(err) }));
      logActivity(
        `soporte_correccion_${r.ticket.status}`,
        "SupportTicket",
        `${detalle} (${EQUIPO_BULEJE})`,
        id,
        // El negocio lee su registro: va el equipo, no el usuario de entrada (ése, en el del superadmin).
        EQUIPO_BULEJE,
        undefined,
        tenantId,
      ).catch((err) => logger.error("[superadmin/support/correccion] activity log falló", { error: String(err), tenantId }));
      avisarAlNegocio(tenantId, solicitud).catch((err) =>
        logger.error("[superadmin/support/correccion] aviso al negocio falló", { error: String(err), tenantId }),
      );
    }

    // El aviso al negocio lleva `EQUIPO_BULEJE`; la bandeja del superadmin, quién fue.
    const ok: CambiarEstadoCorreccionRespuesta = { ok: true, solicitud: { ...solicitud, resolvedBy: r.ticket.resolvedBy } };
    return NextResponse.json(ok);
  } catch (err) {
    logger.error("[superadmin/support/correccion] error", { error: String(err) });
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
