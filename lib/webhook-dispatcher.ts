/**
 * Webhook Dispatcher
 *
 * Despacha eventos a los webhooks configurados por el tenant.
 * Uso: dispatchWebhook(tenantId, "new_order", { orderId, total })
 *
 * - Fire-and-forget con timeout de 5 segundos por llamada
 * - Registra resultado en ActivityLog (también fire-and-forget)
 */

import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-logger";
import type { WebhookConfig, WebhookEvent } from "@/app/api/webhooks/config/route";

// ── Helpers internos ──────────────────────────────────────────────────────────

function parseWebhooks(featureFlagsJson: string | null | undefined): WebhookConfig[] {
  if (!featureFlagsJson) return [];
  try {
    const parsed = JSON.parse(featureFlagsJson) as Record<string, unknown>;
    const webhooks = parsed["webhooks"];
    if (Array.isArray(webhooks)) return webhooks as WebhookConfig[];
  } catch {
    // JSON corrupto — ignorar
  }
  return [];
}

async function getActiveWebhooksForEvent(
  tenantId: string,
  event: WebhookEvent,
): Promise<WebhookConfig[]> {
  const row = await prisma.settings.findUnique({
    where: { tenantId },
    select: { featureFlagsJson: true },
  }) as { featureFlagsJson: string | null } | null;

  return parseWebhooks(row?.featureFlagsJson).filter(
    (w) => w.active && w.events.includes(event),
  );
}

async function postToUrl(
  url: string,
  payload: Record<string, unknown>,
  secret: string,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5_000);

    // SECURITY 2026-05-05 (audit webhooks #2): firma HMAC saliente.
    // Antes los outgoing webhooks no llevaban firma — el receptor del tenant
    // no podía verificar que el POST viniera de Buleje, permitiendo a un
    // atacante registrar su propia URL y suplantar eventos.
    const body = JSON.stringify(payload);
    const crypto = await import("crypto");
    const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");
    const ts = Math.floor(Date.now() / 1000).toString();

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Buleje-Signature": `sha256=${signature}`,
        "X-Buleje-Timestamp": ts,
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return { ok: res.ok, status: res.status };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { ok: false, error };
  }
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Despacha un evento a todos los webhooks activos del tenant que escuchen
 * ese evento. Siempre fire-and-forget — no lanza excepciones al caller.
 *
 * @param tenantId  ID del tenant
 * @param event     Nombre del evento (new_order, low_stock, new_customer, payment)
 * @param payload   Datos del evento — se envían como JSON body
 */
export async function dispatchWebhook(
  tenantId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const webhooks = await getActiveWebhooksForEvent(tenantId, event);
    if (webhooks.length === 0) return;

    const envelope = {
      event,
      tenantId,
      timestamp: new Date().toISOString(),
      data: payload,
    };

    // SECURITY: firma HMAC compartida — clave por tenant (env), o fallback
    // a AUTH_SECRET. Para soporte multi-tenant real, migrar a `webhookSecret`
    // por tenant en Settings.
    const dispatcherSecret =
      process.env.WEBHOOK_DISPATCH_SECRET ?? process.env.AUTH_SECRET ?? "";
    if (!dispatcherSecret) return; // fail-closed si no hay secret configurado

    await Promise.allSettled(
      webhooks.map(async (webhook) => {
        const result = await postToUrl(webhook.url, envelope, dispatcherSecret);

        const detail = result.ok
          ? `Webhook OK [${result.status}]: ${webhook.url} — evento: ${event}`
          : `Webhook FAIL [${result.status ?? result.error}]: ${webhook.url} — evento: ${event}`;

        logActivity(
          result.ok ? "Webhook enviado" : "Webhook fallido",
          "webhook",
          detail,
          webhook.id,
        ).catch(() => {});
      }),
    );
  } catch {
    // No propagar errores al caller — el dispatch nunca debe romper el flujo principal
  }
}
