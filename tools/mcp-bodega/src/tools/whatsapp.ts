/** Tool: enviar_whatsapp — Templated WhatsApp via Twilio or DB log fallback. */

import { query } from "../db.js";
import type { WhatsAppResult } from "../types.js";

const TEMPLATES: Record<string, string> = {
  cobranza_fiado:
    "Hola {{nombre}}, te recordamos que tienes una deuda pendiente de S/{{monto}} con vencimiento {{fecha}}. Pasa por la bodega o llama al {{telefono_bodega}}.",
  pedido_listo:
    "Hola {{nombre}}, tu pedido #{{pedido_id}} esta listo para recoger. Te esperamos!",
  promocion:
    "Hola {{nombre}}, tenemos una promo especial: {{descripcion}}. Valida hasta {{fecha_fin}}. Visitanos!",
  bienvenida:
    "Hola {{nombre}}, bienvenido/a a {{bodega_nombre}}! Gracias por tu preferencia.",
  custom: "{{mensaje}}",
};

/** @param tenantId rule #3 @param clienteId Customer phone PK @param template name @param variables placeholders */
export async function enviarWhatsapp(
  tenantId: string,
  clienteId: string,
  template: string,
  variables: Record<string, string>
): Promise<WhatsAppResult> {
  // Validate template exists
  const tmpl = TEMPLATES[template];
  if (!tmpl) {
    return {
      success: false,
      message: `Template "${template}" no encontrado. Disponibles: ${Object.keys(TEMPLATES).join(", ")}`,
      auditId: "",
    };
  }

  // Verify customer belongs to tenant
  const customers = await query<{ phone: string; name: string }>(
    `SELECT phone, name FROM "Customer"
     WHERE phone = $1 AND "tenantId" = $2`,
    [clienteId, tenantId]
  );
  if (customers.length === 0) {
    return { success: false, message: "Cliente no encontrado en este tenant", auditId: "" };
  }

  // Render message
  let message = tmpl;
  for (const [key, value] of Object.entries(variables)) {
    message = message.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }

  // Try Twilio or fall back to DB logging
  let status = "logged";
  const hasTwilio = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN;

  if (hasTwilio) {
    try {
      const sid = process.env.TWILIO_ACCOUNT_SID!;
      const token = process.env.TWILIO_AUTH_TOKEN!;
      const from = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";
      const to = `whatsapp:${clienteId.startsWith("+") ? clienteId : "+51" + clienteId}`;
      const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
      const body = new URLSearchParams({ From: from, To: to, Body: message });
      const resp = await fetch(url, {
        method: "POST",
        headers: { Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64") },
        body,
      });
      status = resp.ok ? "sent" : "failed";
    } catch {
      status = "failed";
    }
  }

  // Log to NotificationLog (audit trail)
  const auditRows = await query<{ id: string }>(
    `INSERT INTO "NotificationLog" (id, type, channel, recipient, message, status, "tenantId", "createdAt")
     VALUES (gen_random_uuid()::text, $1, 'whatsapp', $2, $3, $4, $5, NOW())
     RETURNING id`,
    [template, clienteId, message.substring(0, 500), status, tenantId]
  );

  return {
    success: status !== "failed",
    message: status === "sent" ? "Mensaje enviado via WhatsApp" : `Mensaje registrado (${status})`,
    auditId: auditRows[0]?.id ?? "",
  };
}
