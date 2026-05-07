import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { randomBytes } from "node:crypto";
import { requireAdmin } from "@/lib/require-admin";
import { requireActiveSubscription } from "@/lib/billing/require-active-subscription";
import { EmployeeInvitationsDb } from "@/lib/db/employee-invitations.db";
import { sendWhatsAppQueued } from "@/lib/whatsapp";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * Invitaciones a empleados (cajero/almacenero/manager).
 * El admin invita por WhatsApp con link único firmado.
 *
 * GET  → lista invitaciones del tenant
 * POST → crea invitación + envía WhatsApp
 */
const Body = z.object({
  phone: z.string().min(7).max(20),
  name: z.string().min(2).max(80),
  role: z.enum(["cajero", "almacenero", "manager"]),
});

const VALID_STATUSES = ["pending", "accepted", "revoked", "expired"];

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const rows = await EmployeeInvitationsDb.listByTenant(auth.tenantId);

  return NextResponse.json({
    invitations: rows.map((r) => ({
      id: r.id,
      phone: r.phone,
      name: r.name,
      role: r.role,
      status: VALID_STATUSES.includes(r.status) ? r.status : "pending",
      expiresAt: r.expiresAt,
      acceptedAt: r.acceptedAt,
      createdAt: r.createdAt,
    })),
  });
}

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "admin-invitations"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "manager"]);
  if (auth instanceof NextResponse) return auth;
  const blocked = await requireActiveSubscription(auth.tenantId);
  if (blocked) return blocked;

  let body: unknown;
  try { body = await req.json(); } catch { body = {}; }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const phone = parsed.data.phone.replace(/\s+/g, "");
  const id = `einv_${randomBytes(8).toString("hex")}`;
  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600_000);

  await EmployeeInvitationsDb.create({
    id, tenantId: auth.tenantId, phone, name: parsed.data.name,
    role: parsed.data.role, token, expiresAt,
    createdBy: auth.username ?? "admin",
  });

  // Construir URL del invite.
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  const inviteUrl = `${baseUrl}/invitar/${token}`;

  const wa = [
    `🎯 *Invitación de Buleje*`,
    ``,
    `Hola ${parsed.data.name}, fuiste invitado como *${parsed.data.role}* a una bodega en Buleje.`,
    ``,
    `Aceptá la invitación acá:`,
    inviteUrl,
    ``,
    `Vence en 7 días.`,
  ].join("\n");

  sendWhatsAppQueued(phone, wa, {
    tenantId: auth.tenantId,
    context: `invite-${id}`,
  }).catch((err) => logger.warn("[invitations] wa failed", { error: String(err) }));

  logger.info("[invitations] created", { tenantId: auth.tenantId, role: parsed.data.role });

  return NextResponse.json({ ok: true, id, inviteUrl });
}
