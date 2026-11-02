import "server-only";

/**
 * lib/asistente/confirmar-app.ts — resolver una tarjeta «por confirmar» del chat
 * de la app (ADR-528). Misma lógica que `POST /api/ai-assistant/approvals` y que
 * el botón de Telegram: el tenant del pendiente TIENE que ser el de la sesión.
 */

import { orchestrator, ensureAgentsRegistered } from "@/lib/agents";
import { getPendingApproval, removePendingApproval } from "@/lib/agents/pending-approvals";
import { anotarHecho } from "@/lib/asistente/memoria";
import { logger } from "@/lib/logger";
import type { PapelDevuelto } from "@/lib/ia-proveedores/tipos";
import type { ExtraMensaje } from "@/lib/db/ia-conversaciones.db";

export type ResultadoConfirmar =
  | { ok: true; texto: string; extra?: ExtraMensaje }
  | { ok: false; status: 403 | 404; message: string };

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const esPapel = (v: unknown): v is PapelDevuelto =>
  esObjeto(v) && typeof v.titulo === "string" && typeof v.url === "string" && typeof v.tipo === "string";

/** `data.papel` (uno) y `data.papeles` (varios) → lista. */
export function papelesDeDatos(datos: Record<string, unknown>): PapelDevuelto[] {
  const out: PapelDevuelto[] = [];
  if (esPapel(datos.papel)) out.push(datos.papel);
  if (Array.isArray(datos.papeles)) out.push(...datos.papeles.filter(esPapel));
  return out;
}

export async function resolverAprobacion(args: {
  tenantId: string;
  username: string;
  role: string;
  conversacionId: string;
  aprobacionId: string;
  decision: "aprobar" | "rechazar";
}): Promise<ResultadoConfirmar> {
  const { tenantId, username, role, conversacionId, aprobacionId, decision } = args;
  const vencido = { ok: false as const, status: 404 as const, message: "Esa operación ya no está pendiente (se confirmó, se canceló, o pasaron los 10 minutos). Mándamela de nuevo." };
  const visto = getPendingApproval(aprobacionId);
  if (!visto) return vencido;
  // Aislamiento: solo el negocio del pendiente puede resolverlo (y no se borra:
  // el intento ajeno no le quita la tarjeta al dueño).
  if (visto.tenantId !== tenantId) {
    logger.warn("[ia-confirmar] intento entre negocios bloqueado", { tenantId, aprobacionId });
    return { ok: false, status: 403, message: "Forbidden" };
  }
  // Y solo quien lo pidió, desde esa conversación (cuando el pendiente lo trae).
  if ((visto.requestedBy && visto.requestedBy !== username) || (visto.conversationId && visto.conversationId !== conversacionId)) {
    logger.warn("[ia-confirmar] pendiente de otra persona o conversación", { tenantId, aprobacionId });
    return { ok: false, status: 403, message: "Esa operación no es de esta conversación." };
  }
  /**
   * Tomarlo Y borrarlo antes del primer `await`: dos «Sí» simultáneos (doble
   * clic, dos pestañas) anotaban el gasto dos veces porque el segundo leía el
   * pendiente mientras el primero todavía ejecutaba.
   */
  const pendiente = removePendingApproval(aprobacionId);
  if (!pendiente) return vencido;

  if (decision === "rechazar") {
    return { ok: true, texto: "✖ Listo, no anoté nada." };
  }

  await ensureAgentsRegistered();
  const res = await orchestrator.executeSync({
    domain: pendiente.domain as Parameters<typeof orchestrator.executeSync>[0]["domain"],
    action: pendiente.action,
    payload: pendiente.payload,
    tenantId: pendiente.tenantId,
    actorRole: role as Parameters<typeof orchestrator.executeSync>[0]["actorRole"],
    actorId: username,
    actorUsuario: username,
  });

  if (!res.success) {
    return { ok: true, texto: `⚠️ No se pudo anotar: ${res.error ?? "error desconocido"}` };
  }
  const datos = esObjeto(res.data) ? res.data : {};
  const confirmacion = String(datos.confirmacion ?? "Operación registrada.");
  const pantalla = (datos.dondeVerlo as { pantalla?: string } | undefined)?.pantalla;
  logger.info("[ia-confirmar] operación anotada", { tenantId, tool: pendiente.toolName });
  // Que la conversación sepa que esto YA quedó (si no, un «anótalo» vuelve a proponerlo).
  anotarHecho(`app:${conversacionId}`, tenantId, String(datos.confirmacion ?? pendiente.toolName));
  const papeles = papelesDeDatos(datos);
  return {
    ok: true,
    texto: `✅ ${confirmacion}`,
    extra: {
      registradas: [{ resumen: confirmacion, ...(pantalla ? { pantalla } : {}) }],
      ...(papeles.length ? { papeles } : {}),
    },
  };
}
