/**
 * GET /api/cron/credit-reminders
 *
 * Fiado Digital Phase 2 — Smart reminder cron with idempotency.
 *
 * Runs daily at 9am. For each active/overdue fiado, determines the
 * appropriate escalation stage and sends a reminder ONLY if it hasn't
 * been sent for that fiado+stage+date combination.
 *
 * Stages: pre_3d | pre_1d | due_day | post_1d | post_7d | post_30d
 *
 * Uses CreditReminder table with unique idempotencyKey to guarantee
 * exactly-once delivery per stage per day.
 *
 * Auth: Bearer CRON_SECRET
 * ADR-021 §4: idempotent, tenant-isolated, escalating.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { timingSafeCompare } from "@/lib/timing-safe";
import { createNotification } from "@/lib/create-notification";
import { queue } from "@/lib/queue";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";
import { isFiadoDigitalPhase2Enabled } from "@/lib/feature-flags/fiado-digital";

// ── Stage definitions ──────────────────────────────────────────────────────

type ReminderStage = {
  id: string;
  daysFromDue: number; // negative = before, positive = after
  match: (daysFromDue: number) => boolean;
  getMessage: (nombre: string, saldo: string, dias: number) => string;
  severity: "HIGH" | "MEDIUM" | "LOW";
};

const STAGES: ReminderStage[] = [
  {
    id: "pre_3d",
    daysFromDue: -3,
    match: (d) => d === -3,
    getMessage: (nombre, saldo) =>
      `Hola ${nombre}! 📋 Te aviso que tu pendiente de S/${saldo} vence en 3 días. Si puedes ir adelantando, genial! 😊`,
    severity: "LOW",
  },
  {
    id: "pre_1d",
    daysFromDue: -1,
    match: (d) => d === -1,
    getMessage: (nombre, saldo) =>
      `Hola ${nombre}, mañana vence tu pendiente de S/${saldo}. Pásate por la bodega cuando puedas 👍`,
    severity: "LOW",
  },
  {
    id: "due_day",
    daysFromDue: 0,
    match: (d) => d === 0,
    getMessage: (nombre, saldo) =>
      `${nombre}, hoy vence tu pendiente de S/${saldo}. Te esperamos en la bodega! 🙏`,
    severity: "MEDIUM",
  },
  {
    id: "post_1d",
    daysFromDue: 1,
    match: (d) => d === 1,
    getMessage: (nombre, saldo) =>
      `Hola ${nombre}, tu pendiente de S/${saldo} venció ayer. Puedes pasarte hoy o mañana a ponerte al día?`,
    severity: "MEDIUM",
  },
  {
    id: "post_7d",
    daysFromDue: 7,
    match: (d) => d >= 3 && d <= 10,
    getMessage: (nombre, saldo, dias) =>
      `${nombre}, tu deuda de S/${saldo} ya lleva ${dias} días. Necesito que regularices para seguir dándote crédito. Pasa por la bodega 🙏`,
    severity: "HIGH",
  },
  {
    id: "post_30d",
    daysFromDue: 30,
    match: (d) => d >= 15,
    getMessage: (nombre, saldo, dias) =>
      `${nombre}, tu cuenta de S/${saldo} lleva ${dias} días vencida. Si no se regulariza, tu crédito será suspendido. Acércate a la bodega para coordinar.`,
    severity: "HIGH",
  },
];

function findStage(daysFromDue: number): ReminderStage | null {
  // Find the most appropriate stage (last match wins = most severe)
  let matched: ReminderStage | null = null;
  for (const stage of STAGES) {
    if (stage.match(daysFromDue)) {
      matched = stage;
    }
  }
  return matched;
}

// ── Handler ────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Phase 2 feature flag gate
  if (!isFiadoDigitalPhase2Enabled()) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "FIADO_DIGITAL_V2_PHASE2 not enabled",
    });
  }

  try {
    const now = new Date();
    const today = now.toISOString().split("T")[0]; // YYYY-MM-DD

    // Fetch all fiados with due dates that are ACTIVO or VENCIDO
    const fiados = await prisma.fiado.findMany({
      where: {
        status: { in: ["ACTIVO", "VENCIDO"] },
        fechaVence: { not: null },
      },
      include: {
        customer: { select: { name: true, phone: true } },
      },
    });

    let sent = 0;
    let skippedDuplicates = 0;
    let skippedNoStage = 0;

    for (const fiado of fiados) {
      if (!fiado.fechaVence) continue;

      const dueDate = new Date(fiado.fechaVence);
      const daysFromDue = Math.floor(
        (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      const stage = findStage(daysFromDue);
      if (!stage) {
        skippedNoStage++;
        continue;
      }

      // Idempotency check: has this exact reminder been sent?
      const idempotencyKey = `${fiado.id}:${stage.id}:${today}`;

      const existing = await prisma.creditReminder.findUnique({
        where: { idempotencyKey },
      });

      if (existing) {
        skippedDuplicates++;
        continue;
      }

      const nombre = fiado.customer?.name ?? "Cliente";
      const phone = fiado.customer?.phone ?? fiado.customerId;
      const saldo = Number(fiado.saldo).toFixed(2);
      const message = stage.getMessage(nombre, saldo, Math.abs(daysFromDue));

      // Persist reminder with idempotency key
      await prisma.creditReminder.create({
        data: {
          tenantId: fiado.tenantId,
          fiadoId: fiado.id,
          customerId: fiado.customerId,
          stage: stage.id,
          channel: "whatsapp",
          message,
          idempotencyKey,
        },
      });

      // Send WhatsApp via queue (fire-and-forget)
      queue
        .enqueue("send-whatsapp", {
          tenantId: fiado.tenantId,
          phone,
          message,
        })
        .catch((err) => logger.warn("[cron] activity log failed", { error: String(err) }));

      // Also create notification for the admin dashboard
      const cleanPhone = phone.replace(/\D/g, "");
      const waLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;

      await createNotification({
        tenantId: fiado.tenantId,
        type: "CREDIT_REMINDER",
        severity: stage.severity,
        title: `${stage.id.replace("_", " ").toUpperCase()}: ${nombre} - S/${saldo}`,
        body: message,
        actionUrl: waLink,
        actionLabel: "Enviar WhatsApp",
        entityId: fiado.id,
      });

      sent++;
    }

    logActivity(
      "cron",
      "credit",
      `Credit-reminders: ${sent} sent, ${skippedDuplicates} deduped, ${skippedNoStage} no-stage`,
      undefined,
      "cron",
    ).catch((err) => logger.warn("[cron] activity log failed", { error: String(err) }));

    logger.info("[cron/credit-reminders]", {
      total: fiados.length,
      sent,
      skippedDuplicates,
      skippedNoStage,
    });

    return NextResponse.json({
      ok: true,
      processed: fiados.length,
      sent,
      skippedDuplicates,
      skippedNoStage,
      processedAt: now.toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("[cron/credit-reminders] Error", { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
