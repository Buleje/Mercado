import "server-only";

import { Resend } from "resend";
import { buildQuotaAlertHtml } from "./templates";
import type { QuotaAlertTemplateInput } from "./templates";

const FROM = process.env.RESEND_FROM_EMAIL || "Buleje <noreply@buleje.pe>";

export async function sendQuotaAlert(
  to: string,
  input: QuotaAlertTemplateInput,
): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;

  const resend = new Resend(process.env.RESEND_API_KEY);
  const levelLabel = input.level === "critical" ? "CRITICA" : "ALERTA";

  await resend.emails.send({
    from: FROM,
    to,
    subject: `[${levelLabel}] Uso de cuota ${input.percentUsed.toFixed(0)}%`,
    html: buildQuotaAlertHtml(input),
  });
}
