/**
 * GET /api/admin/support/inbox
 *
 * Bandeja de soporte unificada — agrega mensajes de:
 *  1. ActivityLog con entity = "whatsapp.inbound"
 *  2. Review con status = "pending" (reportadas / pendientes de moderación)
 *
 * Degrade graceful: si un modelo no devuelve datos, la fuente se omite
 * sin romper la respuesta. ContactMessage no existe en el schema actual.
 *
 * Auth: requireAdmin(req, ["admin"]) — solo rol admin.
 * Multi-tenant: tenantId como primer parámetro de toda query.
 */

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { SupportInboxDB } from "@/lib/db/support-inbox.db";

export type SupportInboxItem = {
  id: string;
  source: "whatsapp" | "review";
  customer: string;
  message: string;
  receivedAt: string;
  status: "pending" | "resolved";
};

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { tenantId } = auth;
  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status"); // "pending" | "resolved" | null (all)

  const items: SupportInboxItem[] = [];

  // ── 1. WhatsApp inbound logs ─────────────────────────────────────────────
  try {
    const waLogs = await SupportInboxDB.getActivityLog(tenantId, statusFilter);

    for (const log of waLogs) {
      items.push({
        id: `wa-${log.id}`,
        source: "whatsapp",
        customer: log.user ?? "Desconocido",
        message: log.detail ?? "",
        receivedAt: log.createdAt.toISOString(),
        status: log.action === "resolved" ? "resolved" : "pending",
      });
    }
  } catch {
    // Degrade graceful — si ActivityLog no tiene los datos, omitir
  }

  // ── 2. Reviews pendientes de moderación ──────────────────────────────────
  try {
    const pendingReviews = await SupportInboxDB.getReviews(tenantId, statusFilter);

    for (const rev of pendingReviews) {
      items.push({
        id: `rev-${rev.id}`,
        source: "review",
        customer: rev.name,
        message: rev.text,
        receivedAt: rev.date.toISOString(),
        status: rev.status === "approved" ? "resolved" : "pending",
      });
    }
  } catch {
    // Degrade graceful
  }

  // Ordenar por fecha descendente
  items.sort(
    (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
  );

  return NextResponse.json({ items, total: items.length });
}
