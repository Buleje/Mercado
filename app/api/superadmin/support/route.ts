import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { SupportTicketsDB, aSolicitudPlataformaDTO } from "@/lib/db/support-tickets.db";
import { filtroPlataformaSchema, type EvidenciaCorreccionDTO } from "@/lib/soporte/correccion-guia";
import { logger } from "@/lib/logger";

/**
 * GET /api/superadmin/support
 *
 * Bandeja de soporte cross-tenant (gestión de tiendas, Brandon 2026-06-14).
 * Devuelve los SupportTicket de todas las tiendas con el shape que espera
 * components/superadmin/SupportInbox.tsx. Storage usa status open|replied|closed
 * (general) y open|in_review|closed|rejected (corrección de guía, ADR-512);
 * acá se mapea replied/in_review→in_progress y rejected→closed para el componente.
 * `kind`/`entityType`/`entityId`/`rawStatus` van de más (aditivo) para la fase 2.
 *
 * Fase 2 (aditivo): filtros `?kind=correccion_guia&estado=&tenantId=&entityType=&limite=`
 * (`filtroPlataformaSchema`) y, en cada fila de corrección, `correccion` =
 * `SolicitudCorreccionPlataformaDTO` (qué casillero, qué dice, qué es lo correcto)
 * con `evidencia: [{ docId, nombre, mime }]` para enlazar
 * `rutaEvidenciaPlataforma(id, docId)`.
 */

function toUiStatus(s: string): "open" | "in_progress" | "closed" {
  if (s === "closed" || s === "rejected") return "closed";
  if (s === "replied" || s === "in_progress" || s === "in_review") return "in_progress";
  return "open";
}

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if ("status" in auth) return auth;

  const filtro = filtroPlataformaSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!filtro.success) {
    return NextResponse.json({ error: filtro.error.issues[0]?.message ?? "Filtro inválido" }, { status: 400 });
  }

  try {
    const tickets = await SupportTicketsDB.listarPlataforma({ limite: 200, ...filtro.data });
    // Sin la evidencia la bandeja igual sirve: las filas salen con la lista vacía.
    const evidencia = await SupportTicketsDB.evidenciaPlataforma(tickets.filter((t) => t.kind === "correccion_guia")).catch(
      (err: unknown) => {
        logger.warn("[superadmin/support] evidencia no leída", { error: String(err) });
        return new Map<string, EvidenciaCorreccionDTO[]>();
      },
    );

    const rows = tickets.map((t) => {
      const tenant = t.tenant;
      const messages: { id: string; from: "tenant" | "support"; body: string; createdAt: string }[] = [
        { id: `${t.id}-msg`, from: "tenant", body: t.message, createdAt: t.createdAt.toISOString() },
      ];
      if (t.reply) {
        messages.push({ id: `${t.id}-reply`, from: "support", body: t.reply, createdAt: (t.repliedAt ?? t.updatedAt).toISOString() });
      }
      return {
        id: t.id,
        subject: t.subject,
        tenantName: tenant?.name ?? t.tenantId,
        tenantSlug: tenant?.slug ?? "",
        senderEmail: tenant?.ownerEmail || t.createdBy,
        status: toUiStatus(t.status),
        priority: (["low", "medium", "high"].includes(t.priority) ? t.priority : "medium") as "low" | "medium" | "high",
        createdAt: t.createdAt.toISOString(),
        lastMessage: t.reply ?? t.message,
        messages,
        kind: t.kind,
        entityType: t.entityType,
        entityId: t.entityId,
        rawStatus: t.status,
        correccion: t.kind === "correccion_guia" ? { ...aSolicitudPlataformaDTO(t), evidencia: evidencia.get(t.id) ?? [] } : null,
      };
    });

    return NextResponse.json(rows);
  } catch (e) {
    logger.error("[superadmin/support] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
