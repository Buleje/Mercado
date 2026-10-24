import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { SupportTicketsDB } from "@/lib/db/support-tickets.db";
import { applyRateLimit } from "@/lib/rate-limit";
import { validateSuperadminCsrf, csrfForbiddenResponse } from "@/lib/csrf";
import { logSuperadminAction } from "@/lib/audit/superadmin-audit";
import { logger } from "@/lib/logger";

// El componente manda open|in_progress|closed; storage usa open|replied|closed.
// Una corrección de guía (ADR-512) usa in_review en vez de replied, y cerrarla
// pide resolución: eso va por su propia ruta (`rutaEstadoCorreccionPlataforma`).
const StatusSchema = z.object({ status: z.enum(["open", "in_progress", "closed"]) });
const toStorage = { open: "open", in_progress: "replied", closed: "closed" } as const;
const toStorageCorreccion = { open: "open", in_progress: "in_review", closed: "closed" } as const;

async function requirePlatform(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getPlatformSession(token);
}

// PATCH /api/superadmin/support/[id]/status — cambiar estado de un ticket.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rl = applyRateLimit(req, "MODERATE", "sa-support-status"); if (rl) return rl;
  if (!validateSuperadminCsrf(req)) return csrfForbiddenResponse();
  const session = await requirePlatform(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const parsed = StatusSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Estado inválido" }, { status: 400 });

  try {
    const exists = await SupportTicketsDB.obtener(id);
    if (!exists) return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });

    const mapa = exists.kind === "correccion_guia" ? toStorageCorreccion : toStorage;
    const r = await SupportTicketsDB.cambiarEstado(id, { estado: mapa[parsed.data.status], por: session.username });
    if (!r.ok) {
      if (r.error === "no_existe") return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });
      const msg = r.error === "falta_resolucion"
        ? "Esta solicitud de corrección se cierra con su resolución"
        : r.error === "ya_hay_una_abierta"
          ? "Esta guía ya tiene otra solicitud de corrección abierta"
          : "No se puede pasar a ese estado";
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    logSuperadminAction("support_status", `Ticket ${id} -> ${parsed.data.status}`, { ticketId: id, tenantId: exists.tenantId }, session.username).catch((err) => logger.warn("[support/status] audit failed", { error: String(err) }));
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[superadmin/support/status] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
