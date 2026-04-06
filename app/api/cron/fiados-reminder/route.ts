export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { timingSafeCompare } from "@/lib/timing-safe";
import { createNotification } from "@/lib/create-notification";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";

/**
 * GET /api/cron/fiados-reminder
 *
 * Cron diario (9am). Busca fiados ACTIVO/VENCIDO con fechaVence próxima
 * o ya vencida. Crea notificaciones con link wa.me pre-formateado.
 *
 * Autorización: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    // 1. Buscar fiados ACTIVOS con fecha de vencimiento
    const fiadosActivos = await prisma.fiado.findMany({
      where: {
        status: "ACTIVO",
        fechaVence: { not: null },
      },
      include: {
        customer: { select: { name: true, phone: true } },
      },
    });

    // 2. Buscar fiados VENCIDOS
    const fiadosVencidos = await prisma.fiado.findMany({
      where: { status: "VENCIDO" },
      include: {
        customer: { select: { name: true, phone: true } },
      },
    });

    let remindersCount = 0;

    // ── IDEA 4: Cobrador automatico — Secuencia con tono peruano natural ─────
    // Mensajes que suenan como el bodeguero de la esquina, no como un banco
    const telefonoBodega = process.env.BODEGA_PHONE ?? "";

    function getCobroLevel(diasVencido: number): {
      mensaje: (nombre: string, saldo: string, fecha: string, dias: number) => string;
      title: (nombre: string, saldo: string) => string;
      severity: "HIGH" | "MEDIUM" | "LOW";
      level: string;
    } | null {
      if (diasVencido <= 0) return null;

      if (diasVencido <= 1) {
        // Dia 1: Suave, amigable — como avisarle a un vecino
        return {
          mensaje: (nombre, saldo) =>
            `Hola ${nombre}! 👋 Te paso el aviso de tu cuentita en la bodega: S/${saldo}. Cuando puedas pasate! 😊`,
          title: (nombre, saldo) => `Aviso amigable: ${nombre} - S/${saldo}`,
          severity: "LOW",
          level: "SUAVE",
        };
      }
      if (diasVencido <= 3) {
        // Dia 2-3: Recordatorio amable
        return {
          mensaje: (nombre, saldo) =>
            `Hola ${nombre}, todo bien? Te recuerdo tu pendiente de S/${saldo} en la bodega. Cualquier cosa me avisas 👍`,
          title: (nombre, saldo) => `Recordatorio amable: ${nombre} - S/${saldo}`,
          severity: "LOW",
          level: "AMABLE",
        };
      }
      if (diasVencido <= 7) {
        // Dia 4-7: Directo pero educado
        return {
          mensaje: (nombre, saldo) =>
            `${nombre}, ya va una semanita con tu cuenta de S/${saldo}. Puedes pasar hoy o manana a ponerte al dia?`,
          title: (nombre, saldo) => `Recordatorio directo: ${nombre} - S/${saldo}`,
          severity: "MEDIUM",
          level: "DIRECTO",
        };
      }
      if (diasVencido <= 15) {
        // Dia 8-15: Firme pero respetuoso
        return {
          mensaje: (nombre, saldo, _fecha, dias) =>
            `Hola ${nombre}. Tu deuda de S/${saldo} ya lleva ${dias} dias. Necesito que regularices para seguir dandote credito. Pasa por la bodega por favor 🙏`,
          title: (nombre, saldo) => `Cobro firme: ${nombre} - S/${saldo}`,
          severity: "HIGH",
          level: "FIRME",
        };
      }
      if (diasVencido <= 30) {
        // Dia 16-30: Ultimo aviso antes de cortar credito
        return {
          mensaje: (nombre, saldo, _fecha, dias) =>
            `${nombre}, lamentablemente tu cuenta de S/${saldo} lleva ${dias} dias vencida. Si no se regulariza esta semana, no podre darte mas credito.${telefonoBodega ? ` Llamame al ${telefonoBodega} para coordinar.` : " Pasate por la bodega para coordinar."}`,
          title: (nombre, saldo) => `ULTIMO AVISO: ${nombre} - S/${saldo}`,
          severity: "HIGH",
          level: "ULTIMO_AVISO",
        };
      }
      // Dia 31+: Credito suspendido
      return {
        mensaje: (nombre, saldo, _fecha, dias) =>
          `${nombre}, tu cuenta de S/${saldo} lleva ${dias} dias sin pago. Tu credito ha sido suspendido. Para reactivarlo necesitas ponerte al dia. Acercate a la bodega.`,
        title: (nombre, saldo) => `SUSPENDIDO: ${nombre} - S/${saldo}`,
        severity: "HIGH",
        level: "SUSPENDIDO",
      };
    }

    // 3. Procesar fiados ACTIVOS con fecha de vencimiento (por vencer + vencidos)
    for (const fiado of fiadosActivos) {
      if (!fiado.fechaVence) continue;
      const vence = new Date(fiado.fechaVence);
      const isPorVencer = vence >= now && vence <= threeDaysFromNow;
      const isVencido = vence < now;

      if (!isPorVencer && !isVencido) continue;

      const nombre = fiado.customer?.name ?? "Cliente";
      const phone = fiado.customer?.phone ?? fiado.customerId;
      const saldo = Number(fiado.saldo);
      const fechaStr = vence.toLocaleDateString("es-PE", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

      let mensaje: string;
      let title: string;
      let severity: "HIGH" | "MEDIUM" | "LOW";

      if (isVencido) {
        // Mejora 12: Usar secuencia escalonada según días vencido
        const diasVencido = Math.floor((now.getTime() - vence.getTime()) / (1000 * 60 * 60 * 24));
        const level = getCobroLevel(diasVencido);
        if (level) {
          mensaje = level.mensaje(nombre, saldo.toFixed(2), fechaStr, diasVencido);
          title = level.title(nombre, saldo.toFixed(2));
          severity = level.severity;
        } else {
          mensaje = `Hola ${nombre}, tienes un pendiente de S/${saldo.toFixed(2)} vencido desde el ${fechaStr} en Buleje. Cuando puedas pasa a regularizarlo?`;
          title = `Fiado vencido: ${nombre} - S/${saldo.toFixed(2)}`;
          severity = "HIGH";
        }
      } else {
        mensaje = `Hola ${nombre}, te recordamos que tienes un pendiente de S/${saldo.toFixed(2)} en Buleje que vence el ${fechaStr}. Pasa cuando puedas!`;
        title = `Fiado por vencer: ${nombre} - S/${saldo.toFixed(2)}`;
        severity = "MEDIUM";
      }

      const cleanPhone = phone.replace(/\D/g, "");
      const waLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(mensaje)}`;

      await createNotification({
        tenantId: fiado.tenantId,
        type: "FIADO_REMINDER",
        severity,
        title,
        body: mensaje,
        actionUrl: waLink,
        actionLabel: "Enviar WhatsApp",
        entityId: fiado.id,
      });

      remindersCount++;
    }

    // 4. Procesar fiados ya marcados como VENCIDOS (con secuencia escalonada)
    for (const fiado of fiadosVencidos) {
      const nombre = fiado.customer?.name ?? "Cliente";
      const phone = fiado.customer?.phone ?? fiado.customerId;
      const saldo = Number(fiado.saldo);
      const venceDate = fiado.fechaVence ? new Date(fiado.fechaVence) : null;
      const fechaStr = venceDate
        ? venceDate.toLocaleDateString("es-PE", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        : "fecha no especificada";

      // Mejora 12: Secuencia escalonada para vencidos
      const diasVencido = venceDate
        ? Math.floor((now.getTime() - venceDate.getTime()) / (1000 * 60 * 60 * 24))
        : 30; // Si no tiene fecha, tratar como urgente
      const level = getCobroLevel(diasVencido);

      const mensaje = level
        ? level.mensaje(nombre, saldo.toFixed(2), fechaStr, diasVencido)
        : `Hola ${nombre}, tienes un pendiente de S/${saldo.toFixed(2)} vencido desde el ${fechaStr} en Buleje. Cuando puedas pasa a regularizarlo?`;
      const severity = level?.severity ?? "HIGH";
      const title = level
        ? level.title(nombre, saldo.toFixed(2))
        : `Fiado vencido: ${nombre} - S/${saldo.toFixed(2)}`;

      const cleanPhone = phone.replace(/\D/g, "");
      const waLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(mensaje)}`;

      await createNotification({
        tenantId: fiado.tenantId,
        type: "FIADO_REMINDER",
        severity,
        title,
        body: mensaje,
        actionUrl: waLink,
        actionLabel: "Enviar WhatsApp",
        entityId: fiado.id,
      });

      remindersCount++;
    }

    const totalProcessed = fiadosActivos.length + fiadosVencidos.length;

    logActivity(
      "cron",
      "fiado",
      `Fiados-reminder: ${totalProcessed} procesados, ${remindersCount} recordatorios creados`,
      undefined,
      "cron",
    ).catch(() => {});

    logger.info("[cron/fiados-reminder]", {
      processed: totalProcessed,
      reminders: remindersCount,
    });

    return NextResponse.json({
      ok: true,
      processed: totalProcessed,
      reminders: remindersCount,
      processedAt: now.toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("[cron/fiados-reminder] Error", { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
