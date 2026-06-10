/**
 * Superadmin · Repartidores — listado completo y aprobación.
 *
 * GET    /api/superadmin/repartidores
 *   - Devuelve TODOS los repartidores (todos los tenants) con su KYC parseado.
 *   - Query opcional: ?status=pendiente|activos|rechazados|todos (default: todos)
 *
 * PATCH  /api/superadmin/repartidores
 *   - Body: { partnerId, action: "approve" | "reject" | "deactivate", reviewNotes? }
 */
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { sendWhatsAppQueued } from "@/lib/whatsapp";
import { parseKycNotes } from "@/lib/schemas/driver-apply";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";

async function authSuperadmin(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getPlatformSession(token);
}

export async function GET(req: NextRequest) {
  const session = await authSuperadmin(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "todos";

  const partners = await prisma.deliveryPartner.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      zone: true,
      vehicleType: true,
      isActive: true,
      isOnline: true,
      rating: true,
      acceptanceRate: true,
      totalAccepted: true,
      totalOffers: true,
      tenantId: true,
      createdAt: true,
      lastPingAt: true,
      notes: true,
    },
  });

  const enriched = partners.map((p) => {
    const kyc = parseKycNotes(p.notes);
    const applicationStatus = kyc?.applicationStatus ?? (p.isActive ? "aprobada" : "pendiente");
    return {
      id: p.id,
      name: p.name,
      phone: p.phone,
      email: p.email,
      zone: p.zone,
      vehicleType: p.vehicleType,
      isActive: p.isActive,
      isOnline: p.isOnline,
      rating: p.rating,
      acceptanceRate: p.acceptanceRate,
      totalAccepted: p.totalAccepted,
      totalOffers: p.totalOffers,
      tenantId: p.tenantId,
      createdAt: p.createdAt.toISOString(),
      lastPingAt: p.lastPingAt?.toISOString() ?? null,
      applicationStatus,
      kyc,
    };
  });

  // Filtro server-side
  const filtered =
    status === "todos"
      ? enriched
      : enriched.filter((p) => {
          if (status === "pendiente") return p.applicationStatus === "pendiente" && !p.isActive;
          if (status === "activos") return p.isActive;
          if (status === "rechazados") return p.applicationStatus === "rechazada";
          return true;
        });

  // Métricas globales
  const stats = {
    total: enriched.length,
    pending: enriched.filter((p) => p.applicationStatus === "pendiente" && !p.isActive).length,
    active: enriched.filter((p) => p.isActive).length,
    online: enriched.filter((p) => p.isOnline).length,
    rejected: enriched.filter((p) => p.applicationStatus === "rechazada").length,
  };

  return NextResponse.json({ partners: filtered, stats });
}

const ActionSchema = z.object({
  partnerId: z.string().min(1),
  action: z.enum(["approve", "reject", "deactivate", "reactivate"]),
  reviewNotes: z.string().max(500).optional(),
});

export async function PATCH(req: NextRequest) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "GENEROUS", "superadmin-repartidores"); if (_rl) return _rl;
  const session = await authSuperadmin(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { body = null; }
  if (!body) return NextResponse.json({ error: "JSON inválido" }, { status: 400 });

  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  const { partnerId, action, reviewNotes } = parsed.data;

  try {
    const partner = await prisma.deliveryPartner.findUnique({
      where: { id: partnerId },
      select: { id: true, name: true, phone: true, notes: true, isActive: true, tenantId: true },
    });
    if (!partner) return NextResponse.json({ error: "Repartidor no encontrado" }, { status: 404 });

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://buleje.com";
    const reviewer = session.username ?? "superadmin";
    const existingKyc = parseKycNotes(partner.notes);

    if (action === "approve") {
      const updatedKyc = existingKyc
        ? {
            ...existingKyc,
            applicationStatus: "aprobada" as const,
            reviewedAt: new Date().toISOString(),
            reviewedBy: reviewer,
            reviewNotes,
          }
        : null;

      await prisma.deliveryPartner.update({
        where: { id: partner.id },
        data: {
          isActive: true,
          ...(updatedKyc ? { notes: JSON.stringify(updatedKyc) } : {}),
        },
      });

      // WhatsApp al repartidor
      const message = [
        `¡Felicidades ${partner.name}! Tu solicitud como repartidor fue APROBADA.`,
        "",
        "Siguientes pasos:",
        `1. Revisa tu bienvenida: ${baseUrl}/marketplace/repartidor/bienvenida`,
        `2. Ingresa al panel: ${baseUrl}/delivery-app/login`,
        `3. Tus ganancias: ${baseUrl}/marketplace/repartidor/ganancias?id=${partner.id}`,
        "",
        "¡Bienvenido al equipo de Buleje!",
      ].join("\n");
      await sendWhatsAppQueued(partner.phone, message, {
        tenantId: partner.tenantId,
        context: "superadmin/repartidores:approve",
      }).catch((err) => logger.error("[superadmin/repartidores] whatsapp failed", { error: String(err) }));
    } else if (action === "reject") {
      const updatedKyc = existingKyc
        ? {
            ...existingKyc,
            applicationStatus: "rechazada" as const,
            reviewedAt: new Date().toISOString(),
            reviewedBy: reviewer,
            reviewNotes,
          }
        : null;

      await prisma.deliveryPartner.update({
        where: { id: partner.id },
        data: {
          isActive: false,
          ...(updatedKyc ? { notes: JSON.stringify(updatedKyc) } : {}),
        },
      });

      const reason = reviewNotes ? `\n\nMotivo: ${reviewNotes}` : "";
      const message = `Hola ${partner.name}, tu solicitud como repartidor no fue aprobada en esta oportunidad.${reason}\n\nPuedes volver a postularte cuando reúnas los requisitos. ¡Gracias por tu interés!`;
      await sendWhatsAppQueued(partner.phone, message, {
        tenantId: partner.tenantId,
        context: "superadmin/repartidores:reject",
      }).catch((err) => logger.error("[superadmin/repartidores] whatsapp failed", { error: String(err) }));
    } else if (action === "deactivate") {
      await prisma.deliveryPartner.update({
        where: { id: partner.id },
        data: { isActive: false, isOnline: false },
      });
    } else if (action === "reactivate") {
      await prisma.deliveryPartner.update({
        where: { id: partner.id },
        data: { isActive: true },
      });
    }

    logger.info("[superadmin/repartidores] action applied", {
      reviewer,
      partnerId,
      action,
    });

    return NextResponse.json({ success: true, action });
  } catch (err) {
    logger.error("[superadmin/repartidores] PATCH failed", { error: String(err) });
    return NextResponse.json({ error: "Error al procesar" }, { status: 500 });
  }
}
