import "server-only";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { Resend } from "resend";

import WelcomeEmail, { type WelcomeProps } from "./templates/welcome";
import OrderConfirmationEmail, {
  type OrderConfirmationProps,
} from "./templates/order-confirmation";
import PaymentReceiptEmail, {
  type PaymentReceiptProps,
} from "./templates/payment-receipt";
import FiadoReminderEmail, {
  type FiadoReminderProps,
} from "./templates/fiado-reminder";
import DeliveryUpdateEmail, {
  type DeliveryUpdateProps,
} from "./templates/delivery-update";
import WeeklyReportEmail, {
  type WeeklyReportProps,
} from "./templates/weekly-report";

// ──────────────────────────────────────────────
//  Cliente Resend — singleton por módulo
// ──────────────────────────────────────────────

// Defensive init (mismo patrón que lib/email/resend.ts y lib/analytics/posthog.ts):
// si falta RESEND_API_KEY el constructor de Resend tira al evaluar el módulo,
// rompiendo el build estático ("Failed to collect page data"). No-op silencioso.
const RESEND_KEY = process.env.RESEND_API_KEY;
type EmailSendArgs = { from: string; to: string | string[]; subject: string; html: string };
type EmailSendResult = { data: { id: string } | null; error: { message?: string; name?: string } | null };
const noopResend = {
  emails: {
    send: async (_a: EmailSendArgs): Promise<EmailSendResult> => ({ data: null, error: null }),
  },
};
const resend = (RESEND_KEY ? new Resend(RESEND_KEY) : noopResend) as unknown as {
  emails: { send: (args: EmailSendArgs) => Promise<EmailSendResult> };
};
const FROM =
  process.env.RESEND_FROM_EMAIL ?? "Buleje <noreply@buleje.pe>";

// ──────────────────────────────────────────────
//  Helper interno: renderiza React → HTML
// ──────────────────────────────────────────────

function renderHtml<T extends object>(
  Component: React.ComponentType<T>,
  props: T,
): string {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:16px;background:#f3f4f6;">${renderToStaticMarkup(createElement(Component, props))}</body></html>`;
}

// ──────────────────────────────────────────────
//  Tipo base de resultado
// ──────────────────────────────────────────────

export interface SendResult {
  success: boolean;
  id?: string;
  error?: string;
}

// ──────────────────────────────────────────────
//  1. Bienvenida al nuevo tenant
// ──────────────────────────────────────────────

export async function sendWelcomeEmail(
  to: string,
  props: WelcomeProps,
): Promise<SendResult> {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to,
      subject: `¡Bienvenido a Buleje, ${props.storeName}!`,
      html: renderHtml(WelcomeEmail, props),
    });
    if (error) return { success: false, error: error.message };
    return { success: true, id: data?.id };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ──────────────────────────────────────────────
//  2. Confirmación de pedido
// ──────────────────────────────────────────────

export async function sendOrderConfirmationEmail(
  to: string,
  props: OrderConfirmationProps,
): Promise<SendResult> {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to,
      subject: `Pedido #${props.orderNumber} confirmado — ${props.storeName}`,
      html: renderHtml(OrderConfirmationEmail, props),
    });
    if (error) return { success: false, error: error.message };
    return { success: true, id: data?.id };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ──────────────────────────────────────────────
//  3. Recibo de pago
// ──────────────────────────────────────────────

export async function sendPaymentReceiptEmail(
  to: string,
  props: PaymentReceiptProps,
): Promise<SendResult> {
  const subject = props.sunatVoucher
    ? `Recibo de pago ${props.sunatVoucher} — ${props.storeName}`
    : `Recibo de pago — Pedido #${props.orderNumber}`;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to,
      subject,
      html: renderHtml(PaymentReceiptEmail, props),
    });
    if (error) return { success: false, error: error.message };
    return { success: true, id: data?.id };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ──────────────────────────────────────────────
//  4. Recordatorio de fiado
// ──────────────────────────────────────────────

export async function sendFiadoReminderEmail(
  to: string,
  props: FiadoReminderProps,
): Promise<SendResult> {
  const subject =
    props.daysOverdue && props.daysOverdue > 0
      ? `⚠️ Fiado vencido — S/ ${props.amountOwed.toFixed(2)} — ${props.storeName}`
      : `Recordatorio de fiado — S/ ${props.amountOwed.toFixed(2)} — ${props.storeName}`;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to,
      subject,
      html: renderHtml(FiadoReminderEmail, props),
    });
    if (error) return { success: false, error: error.message };
    return { success: true, id: data?.id };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ──────────────────────────────────────────────
//  5. Actualización de delivery
// ──────────────────────────────────────────────

const DELIVERY_SUBJECTS: Record<string, string> = {
  recibido: "Pedido recibido",
  preparando: "Preparando tu pedido",
  en_camino: "Tu pedido está en camino",
  cerca: "¡Tu pedido ya casi llega!",
  entregado: "Pedido entregado",
  no_entregado: "No se pudo entregar tu pedido",
};

export async function sendDeliveryUpdateEmail(
  to: string,
  props: DeliveryUpdateProps,
): Promise<SendResult> {
  const subject = `${DELIVERY_SUBJECTS[props.status] ?? "Actualización de pedido"} — ${props.storeName}`;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to,
      subject,
      html: renderHtml(DeliveryUpdateEmail, props),
    });
    if (error) return { success: false, error: error.message };
    return { success: true, id: data?.id };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ──────────────────────────────────────────────
//  6. Reporte semanal
// ──────────────────────────────────────────────

export async function sendWeeklyReportEmail(
  to: string,
  props: WeeklyReportProps,
): Promise<SendResult> {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to,
      subject: `Reporte semanal — ${props.storeName} — ${props.weekRange}`,
      html: renderHtml(WeeklyReportEmail, props),
    });
    if (error) return { success: false, error: error.message };
    return { success: true, id: data?.id };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ──────────────────────────────────────────────
//  Re-exportar tipos para uso externo
// ──────────────────────────────────────────────

export type {
  WelcomeProps,
  OrderConfirmationProps,
  PaymentReceiptProps,
  FiadoReminderProps,
  DeliveryUpdateProps,
  WeeklyReportProps,
};
