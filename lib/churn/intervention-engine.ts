import "server-only";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { ChurnSignalDetected } from "./health-scorer";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface TenantInfo {
  id: string;
  slug: string;
  name: string;
  ownerEmail: string | null;
  ownerPhone: string | null;
  plan: string;
  trialEndsAt: Date | null;
}

interface PlaybookRow {
  id: string;
  name: string;
  triggerSignal: string;
  triggerSeverity: string;
  action: string;
  templateId: string | null;
  discountPercent: number | null;
  discountDays: number | null;
}

// ─── Rate limit: máximo 1 intervención por tipo por tenant por semana ─────────

async function isRateLimited(tenantId: string, signalType: string): Promise<boolean> {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recent = await prisma.churnSignal.findFirst({
    where: {
      tenantId,
      signalType,
      intervention: { not: null },
      createdAt: { gte: oneWeekAgo },
    },
  });
  return recent !== null;
}

// ─── Helpers de envío ────────────────────────────────────────────────────────

async function sendChurnEmail(
  tenant: TenantInfo,
  subject: string,
  html: string
): Promise<boolean> {
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  if (!smtpUser || !smtpPass) {
    logger.warn("[churn/email] SMTP no configurado, skip");
    return false;
  }
  const to = tenant.ownerEmail;
  if (!to) {
    logger.warn("[churn/email] Tenant sin ownerEmail", { slug: tenant.slug });
    return false;
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user: smtpUser, pass: smtpPass },
  });

  await transporter.sendMail({
    from: `"Buleje - Soporte" <${smtpUser}>`,
    to,
    subject,
    html,
  });

  logger.info("[churn/email] Email enviado", { slug: tenant.slug, subject });
  return true;
}

async function sendChurnWhatsApp(
  tenant: TenantInfo,
  message: string
): Promise<boolean> {
  const phone = tenant.ownerPhone;
  if (!phone) {
    logger.warn("[churn/whatsapp] Tenant sin ownerPhone", { slug: tenant.slug });
    return false;
  }

  const apiUrl = process.env.WHATSAPP_API_URL;
  const apiToken = process.env.WHATSAPP_API_TOKEN;
  if (!apiUrl || !apiToken) {
    logger.warn("[churn/whatsapp] WhatsApp API no configurada, skip");
    return false;
  }

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify({ phone, message }),
  });

  if (!res.ok) {
    logger.warn("[churn/whatsapp] Error API", { slug: tenant.slug, status: res.status });
    return false;
  }

  logger.info("[churn/whatsapp] Mensaje enviado", { slug: tenant.slug });
  return true;
}

// ─── Templates de comunicación ───────────────────────────────────────────────

function buildEmailHtml(templateId: string, tenant: TenantInfo): { subject: string; html: string } {
  const dashboardUrl = `https://${tenant.slug}.buleje.pe/admin`;

  switch (templateId) {
    case "trial_expiring_cta":
      return {
        subject: `Tu prueba gratuita de Buleje termina pronto — Activa tu plan ahora`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;border:1px solid #e0e0e0;border-radius:12px;overflow:hidden;">
            <div style="background:#00B4A6;padding:24px;">
              <h2 style="color:#fff;margin:0;font-size:20px;">Tu prueba gratuita está por terminar</h2>
            </div>
            <div style="padding:24px;">
              <p style="font-size:15px;color:#333;">Hola, equipo de <strong>${tenant.name}</strong>.</p>
              <p style="font-size:14px;color:#555;">
                Tu periodo de prueba gratuita de Buleje está a punto de finalizar. Para seguir gestionando
                tus pedidos, inventario y clientes sin interrupciones, activa tu plan hoy.
              </p>
              <div style="text-align:center;margin:28px 0;">
                <a href="${dashboardUrl}/settings?tab=billing" style="background:#00B4A6;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;">
                  Activar mi plan ahora
                </a>
              </div>
              <p style="font-size:13px;color:#888;">¿Tienes preguntas? Responde este email y te ayudamos.</p>
            </div>
          </div>
        `,
      };

    case "order_drop_tips":
      return {
        subject: `Consejos para reactivar las ventas en ${tenant.name}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;border:1px solid #e0e0e0;border-radius:12px;overflow:hidden;">
            <div style="background:#f4a261;padding:24px;">
              <h2 style="color:#fff;margin:0;font-size:20px;">Impulsa tus ventas con Buleje</h2>
            </div>
            <div style="padding:24px;">
              <p style="font-size:15px;color:#333;">Hola, equipo de <strong>${tenant.name}</strong>.</p>
              <p style="font-size:14px;color:#555;">
                Notamos que hubo menos pedidos en tu tienda últimamente. Aquí van algunos tips para reactitar:
              </p>
              <ul style="font-size:14px;color:#555;line-height:1.8;">
                <li>Crea una <strong>promocion del dia</strong> con descuento especial</li>
                <li>Envia un cupón a tus clientes frecuentes</li>
                <li>Activa el <strong>recordatorio de recompra</strong> para clientes inactivos</li>
                <li>Revisa si hay productos agotados que bloquean pedidos</li>
              </ul>
              <div style="text-align:center;margin:24px 0;">
                <a href="${dashboardUrl}" style="background:#f4a261;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;">
                  Ir a mi panel
                </a>
              </div>
            </div>
          </div>
        `,
      };

    default:
      return {
        subject: `Novedad de Buleje para ${tenant.name}`,
        html: `<p>Mensaje de Buleje para ${tenant.name}. Visita tu panel: <a href="${dashboardUrl}">${dashboardUrl}</a></p>`,
      };
  }
}

function buildWhatsAppMessage(templateId: string, tenant: TenantInfo): string {
  const dashboardUrl = `https://${tenant.slug}.buleje.pe/admin`;

  switch (templateId) {
    case "login_drop_wa":
      return (
        `Hola equipo de *${tenant.name}* 👋\n\n` +
        `Notamos que no han ingresado a su panel de Buleje en los últimos días.\n\n` +
        `Si tienen alguna duda o necesitan ayuda, estamos disponibles. 🚀\n\n` +
        `Accede aqui: ${dashboardUrl}`
      );
    default:
      return `Hola ${tenant.name}, tienes un mensaje de Buleje: ${dashboardUrl}`;
  }
}

// ─── Ejecución del playbook ──────────────────────────────────────────────────

export async function executePlaybook(
  signal: ChurnSignalDetected,
  tenant: TenantInfo
): Promise<void> {
  // Verificar rate limit antes de buscar playbooks
  const limited = await isRateLimited(tenant.id, signal.signalType);
  if (limited) {
    logger.info("[churn/playbook] Rate limited, skip intervención", {
      slug: tenant.slug,
      signalType: signal.signalType,
    });
    return;
  }

  // Buscar playbooks que aplican para este signal y severity
  const severityOrder: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };
  const signalSeverityLevel = severityOrder[signal.severity] ?? 0;

  const playbooks = await prisma.churnPlaybook.findMany({
    where: {
      triggerSignal: signal.signalType,
      isActive: true,
    },
  });

  const applicablePlaybooks = playbooks.filter((p) => {
    const minLevel = severityOrder[p.triggerSeverity] ?? 0;
    return signalSeverityLevel >= minLevel;
  });

  if (applicablePlaybooks.length === 0) {
    logger.info("[churn/playbook] Sin playbooks aplicables", {
      slug: tenant.slug,
      signalType: signal.signalType,
      severity: signal.severity,
    });
    return;
  }

  // Ejecutar el primer playbook aplicable
  const playbook = applicablePlaybooks[0] as PlaybookRow;
  let interventionDescription: string | null = null;

  try {
    switch (playbook.action) {
      case "email": {
        if (playbook.templateId) {
          const { subject, html } = buildEmailHtml(playbook.templateId, tenant);
          const sent = await sendChurnEmail(tenant, subject, html);
          interventionDescription = sent ? `Email enviado: ${playbook.templateId}` : "Email skip (sin config)";
        }
        break;
      }

      case "whatsapp": {
        if (playbook.templateId) {
          const message = buildWhatsAppMessage(playbook.templateId, tenant);
          const sent = await sendChurnWhatsApp(tenant, message);
          interventionDescription = sent ? `WhatsApp enviado: ${playbook.templateId}` : "WhatsApp skip (sin config)";
        }
        break;
      }

      case "discount": {
        // Registrar intención de descuento (la aplicación real depende del módulo de cupones)
        interventionDescription = `Descuento marcado: ${playbook.discountPercent ?? 0}% por ${playbook.discountDays ?? 7} días`;
        logger.info("[churn/playbook] Descuento marcado para aplicación manual", {
          slug: tenant.slug,
          discountPercent: playbook.discountPercent,
          discountDays: playbook.discountDays,
        });
        break;
      }

      case "call": {
        interventionDescription = "Marcado para llamada manual por equipo de retención";
        logger.info("[churn/playbook] Tenant marcado para llamada", { slug: tenant.slug });
        break;
      }

      default:
        logger.warn("[churn/playbook] Acción desconocida", { action: playbook.action });
    }
  } catch (err) {
    logger.error("[churn/playbook] Error ejecutando playbook", {
      slug: tenant.slug,
      playbook: playbook.name,
      error: err instanceof Error ? err.message : String(err),
    });
    interventionDescription = `Error: ${err instanceof Error ? err.message : String(err)}`;
  }

  // Persistir el signal con la intervención ejecutada
  await prisma.churnSignal.create({
    data: {
      tenantId: tenant.id,
      signalType: signal.signalType,
      severity: signal.severity,
      detail: signal.detail,
      resolved: false,
      intervention: interventionDescription,
    },
  });

  logger.info("[churn/playbook] Intervención registrada", {
    slug: tenant.slug,
    playbook: playbook.name,
    action: playbook.action,
    intervention: interventionDescription,
  });
}
