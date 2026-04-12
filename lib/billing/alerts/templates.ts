/**
 * ADR-047 — Email templates para quota alerts.
 *
 * Genera el HTML del email de alerta según el nivel:
 * - "warning":  80-89% del límite alcanzado
 * - "critical": 90%+ del límite alcanzado
 */
import type { AlertLevel } from "./deduper";
import type { MeteredEvent } from "@/lib/billing/metering";

export interface QuotaAlertTemplateInput {
  tenantId: string;
  businessName?: string;
  event: MeteredEvent;
  currentUsage: number;
  limit: number;
  percentUsed: number;
  level: AlertLevel;
  planName: string;
}

const EVENT_LABELS: Record<MeteredEvent, string> = {
  "order.created":  "Pedidos creados",
  "ai.call":        "Llamadas a IA (LLM)",
  "ai.recommend":   "Recomendaciones IA",
  "ai.insight":     "Insights IA",
  "sms.sent":       "SMS enviados",
  "whatsapp.sent":  "Mensajes WhatsApp",
  "sunat.emitted":  "Comprobantes SUNAT",
  "storage.blob":   "Almacenamiento (KB)",
};

const LEVEL_COLOR: Record<AlertLevel, string> = {
  warning:  "#f59e0b", // amber
  critical: "#ef4444", // red
};

const LEVEL_LABEL: Record<AlertLevel, string> = {
  warning:  "Alerta de uso",
  critical: "Uso crítico — acción requerida",
};

export function buildQuotaAlertHtml(input: QuotaAlertTemplateInput): string {
  const {
    businessName,
    event,
    currentUsage,
    limit,
    percentUsed,
    level,
    planName,
    tenantId,
  } = input;

  const color = LEVEL_COLOR[level];
  const label = LEVEL_LABEL[level];
  const eventLabel = EVENT_LABELS[event] ?? event;
  const remaining = Math.max(0, limit - currentUsage);
  const upgradeHref = `https://buleje.pe/${tenantId}/admin?tab=subscription`;

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${label}</title>
</head>
<body style="font-family:system-ui,sans-serif;background:#f9fafb;padding:32px 16px;margin:0;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:2px solid ${color};">
    <div style="font-size:28px;margin-bottom:8px;">${level === "critical" ? "🚨" : "⚠️"}</div>
    <h1 style="font-size:20px;color:${color};margin:0 0 8px;">${label}</h1>
    <p style="color:#374151;margin:0 0 24px;">
      ${businessName ? `<strong>${businessName}</strong> ha` : "Tu bodega ha"} alcanzado el
      <strong>${percentUsed.toFixed(0)}%</strong> del límite mensual para
      <strong>${eventLabel}</strong> en el plan <strong>${planName}</strong>.
    </p>

    <div style="background:#f3f4f6;border-radius:8px;padding:16px;margin-bottom:24px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
        <span style="color:#6b7280;font-size:14px;">Uso actual</span>
        <span style="font-weight:600;color:#111827;">${currentUsage.toLocaleString("es-PE")}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
        <span style="color:#6b7280;font-size:14px;">Límite mensual</span>
        <span style="font-weight:600;color:#111827;">${limit.toLocaleString("es-PE")}</span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="color:#6b7280;font-size:14px;">Restante</span>
        <span style="font-weight:600;color:${color};">${remaining.toLocaleString("es-PE")}</span>
      </div>
      <div style="margin-top:12px;background:#e5e7eb;border-radius:999px;height:8px;overflow:hidden;">
        <div style="height:100%;background:${color};width:${Math.min(100, percentUsed).toFixed(0)}%;border-radius:999px;"></div>
      </div>
    </div>

    ${
      level === "critical"
        ? `<p style="color:#ef4444;font-size:14px;margin-bottom:20px;">
            Si superas el límite, las operaciones de <strong>${eventLabel.toLowerCase()}</strong>
            podrían bloquearse o generar cargos adicionales.
           </p>`
        : ""
    }

    <a href="${upgradeHref}"
       style="display:inline-block;background:${color};color:#fff;padding:12px 24px;
              border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
      ${level === "critical" ? "Actualizar plan ahora" : "Ver mi uso y planes"}
    </a>

    <p style="color:#9ca3af;font-size:12px;margin-top:24px;margin-bottom:0;">
      Buleje ERP · Este email es automático. No responder a este correo.
    </p>
  </div>
</body>
</html>
  `.trim();
}

export function buildQuotaAlertText(input: QuotaAlertTemplateInput): string {
  const eventLabel = EVENT_LABELS[input.event] ?? input.event;
  return (
    `[${input.level === "critical" ? "CRITICO" : "ALERTA"}] ` +
    `${input.businessName ?? input.tenantId}: ` +
    `${eventLabel} al ${input.percentUsed.toFixed(0)}% del limite mensual ` +
    `(${input.currentUsage}/${input.limit}). Plan: ${input.planName}.`
  );
}
