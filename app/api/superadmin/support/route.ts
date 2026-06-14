import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * GET /api/superadmin/support
 *
 * Bandeja de soporte cross-tenant (gestión de tiendas, Brandon 2026-06-14).
 * Devuelve los SupportTicket de todas las tiendas con el shape que espera
 * components/superadmin/SupportInbox.tsx. Storage usa status open|replied|closed;
 * acá se mapea replied→in_progress para el componente.
 */

function toUiStatus(s: string): "open" | "in_progress" | "closed" {
  if (s === "closed") return "closed";
  if (s === "replied" || s === "in_progress") return "in_progress";
  return "open";
}

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if ("status" in auth) return auth;

  try {
    const tickets = await prisma.supportTicket.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const tenantIds = [...new Set(tickets.map((t) => t.tenantId))];
    const tenants = await prisma.tenant.findMany({
      where: { id: { in: tenantIds } },
      select: { id: true, name: true, slug: true, ownerEmail: true },
    });
    const tMap = new Map(tenants.map((t) => [t.id, t]));

    const rows = tickets.map((t) => {
      const tenant = tMap.get(t.tenantId);
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
      };
    });

    return NextResponse.json(rows);
  } catch (e) {
    logger.error("[superadmin/support] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
