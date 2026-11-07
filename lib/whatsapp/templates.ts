import "server-only";
import { getOrSet } from "@/lib/cache";
import { logger } from "@/lib/logger";
import type { DbWhatsAppConfig } from "@/lib/db/whatsapp-messages.db";

/**
 * lib/whatsapp/templates.ts — plantillas aprobadas de Meta (fuera de ventana 24h).
 *
 * Fuera de la ventana de 24h desde el último mensaje del cliente, Meta solo
 * permite enviar plantillas APROBADAS del WABA (error 131047 en texto libre).
 * Acá se listan (Graph API, cache 5 min) y se renderiza el body con params
 * para el log del inbox.
 */

export type WaTemplate = {
  name: string;
  language: string;
  category: string;
  /** Texto del componente BODY (con {{1}}, {{2}}… si tiene variables). */
  body: string;
  /** Cantidad de variables {{n}} del body. */
  paramCount: number;
};

type GraphTemplate = {
  name: string;
  language: string;
  category?: string;
  status?: string;
  components?: Array<{ type: string; text?: string }>;
};

function countParams(body: string): number {
  const matches = body.match(/\{\{\d+\}\}/g) ?? [];
  const nums = matches.map((m) => Number(m.replace(/\D/g, "")));
  return nums.length ? Math.max(...nums) : 0;
}

/** Reemplaza {{1}}, {{2}}… por los params (para persistir el texto real enviado). */
export function renderTemplateBody(body: string, params: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_, n: string) => params[Number(n) - 1] ?? `{{${n}}}`);
}

/**
 * Plantillas APROBADAS del WABA del número. Cache 5 min por WABA.
 * Devuelve null si el config no tiene wabaId (la UI pide completarlo).
 */
export async function getApprovedTemplates(
  config: DbWhatsAppConfig,
  fallbackToken: string,
): Promise<WaTemplate[] | null> {
  if (!config.wabaId) return null;
  const token = config.whatsappToken || fallbackToken;
  if (!token) return null;
  const wabaId = config.wabaId;

  return getOrSet(`whatsapp-inbox:${config.tenantId}:templates:${wabaId}`, 300, async () => {
    const res = await fetch(
      `https://graph.facebook.com/v18.0/${wabaId}/message_templates?status=APPROVED&limit=100&fields=name,language,category,status,components`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      logger.warn("[whatsapp/templates] Graph rechazó el listado", {
        tenantId: config.tenantId,
        status: res.status,
        detail: detail.slice(0, 200),
      });
      // Error de Meta (token/WABA mal) → lista vacía; la UI muestra el estado
      return [];
    }
    const json = (await res.json().catch(() => ({}))) as { data?: GraphTemplate[] };
    return (json.data ?? [])
      .map((t) => {
        const body = t.components?.find((c) => c.type === "BODY")?.text ?? "";
        return {
          name: t.name,
          language: t.language,
          category: t.category ?? "UTILITY",
          body,
          paramCount: countParams(body),
        };
      })
      .filter((t) => t.body.length > 0);
  });
}
