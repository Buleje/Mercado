import "server-only";

/**
 * lib/plata/anotar.ts
 *
 * «Anotame la compra de combustible del camión N12» → un asiento real.
 *
 * Es el MISMO camino que usa el chat (buscar → escribir, con las herramientas
 * `plata_*`), pero empaquetado para que lo pueda usar algo que no es el chat:
 * hoy la entrada de n8n (`/api/integrations/n8n/anotar`), que es por donde
 * llegan los mensajes de WhatsApp, Telegram o un correo.
 *
 * Por qué no se reusa `/api/ai-assistant`: ese endpoint contesta en SSE, arrastra
 * el snapshot completo del negocio y redacta prosa. Para anotar sólo hacen falta
 * las herramientas de plata y una respuesta corta que n8n pueda reenviar tal
 * cual. Menos tokens, menos superficie, y sin depender de que el modelo redacte
 * bien para saber si se registró.
 */

import { orchestrator, ensureAgentsRegistered } from "@/lib/agents";
import { ALL_AGENT_TOOLS, resolveToolCall, isToolApprovalRequired } from "@/lib/agents/tool-definitions";
import { stashPendingApproval } from "@/lib/agents/pending-approvals";
import { callLLM } from "@/lib/llm-router";
import { logger } from "@/lib/logger";
import type { Role } from "@/lib/auth/role-permissions";

/** Sólo las herramientas de plata: el intérprete no navega ni analiza. */
const TOOLS_PLATA = ALL_AGENT_TOOLS.filter((t) => t.function.name.startsWith("plata_"));

const SISTEMA = (hoy: string) => `Sos el anotador de operaciones de Buleje, una empresa de Pucallpa, Perú
(bodega + aserradero + maquinaria). Hoy es ${hoy}.

Te llega UNA frase dictada o escrita por el dueño contando algo que pasó con la
plata. Tu único trabajo es convertirla en un asiento usando las herramientas.

Cómo trabajás:
1. Si la operación involucra una máquina (camión, tractor, cargador), una persona
   del padrón o una deuda, PRIMERO buscala con la herramienta de búsqueda. Nunca
   inventes un id: si la búsqueda no lo devolvió, no existe.
2. La búsqueda te dice qué hacer en su campo "mensaje". Si trae "recomendado",
   usá ESE id y seguí — que aparezcan otras filas parecidas no es duda. Sólo si
   el mensaje te pide preguntar, contestá en texto con las opciones.
3. Si tenés todo, llamá a la herramienta que anota.
4. Si falta un dato imprescindible (el monto, de quién, de qué máquina),
   contestá en texto UNA pregunta concreta. No inventes el dato que falta.

Reglas que no se negocian:
- Cuando hay cantidad y precio por unidad, pasá LOS DOS y no calcules el total:
  el sistema multiplica y muestra la operación.
- Los montos son en soles peruanos.
- No respondas con explicaciones largas: o llamás a una herramienta, o hacés una
  pregunta de una línea.`;

export type ResultadoAnotar =
  | { estado: "registrado"; resumen: string; detalle: Record<string, unknown> }
  | { estado: "pendiente"; aprobacionId: string; resumen: string; tool: string }
  | { estado: "pregunta"; mensaje: string }
  | { estado: "error"; mensaje: string };

interface OpcionesAnotar {
  tenantId: string;
  texto: string;
  /** Rol con el que se ejecuta. La entrada de n8n usa la credencial del dueño. */
  actorRole: Role;
  /** Quién queda registrado como solicitante de la aprobación. */
  solicitante: string;
  /**
   * `true` = escribir sin pedir confirmación.
   *
   * Existe porque del otro lado de n8n puede haber un flujo que YA le preguntó
   * a la persona por WhatsApp. Por defecto es `false`: la operación queda
   * pendiente y n8n recibe el resumen para hacer confirmar.
   */
  confirmar?: boolean;
  /** De dónde vino (whatsapp, telegram, correo) — queda en el log. */
  canal?: string;
}

/** Máximo de vueltas buscar→escribir. Dos alcanzan; una tercera es un loop. */
const MAX_RONDAS = 2;

export async function anotarOperacion(opts: OpcionesAnotar): Promise<ResultadoAnotar> {
  const { tenantId, texto, actorRole, solicitante, confirmar = false, canal } = opts;

  if (!texto.trim()) return { estado: "error", mensaje: "No llegó ningún texto para anotar." };
  if (texto.length > 2000) {
    return { estado: "error", mensaje: "El texto es demasiado largo para una sola operación." };
  }

  await ensureAgentsRegistered();

  const hoy = new Date().toISOString().slice(0, 10);
  const mensajes: Array<{
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    tool_call_id?: string;
    tool_calls?: unknown[];
  }> = [
    { role: "system", content: SISTEMA(hoy) },
    { role: "user", content: texto },
  ];

  for (let ronda = 0; ronda < MAX_RONDAS; ronda++) {
    const res = await callLLM("balanced", {
      messages: mensajes,
      temperature: 0.1,
      maxTokens: 800,
      stream: false,
      tools: TOOLS_PLATA,
      toolChoice: "auto",
      label: "plata-anotar",
    });

    if (!res.ok) {
      logger.error("[plata/anotar] el modelo no respondió", { tenantId, error: String(res.error) });
      return { estado: "error", mensaje: `No pude interpretar el mensaje: ${res.error ?? "el asistente no está disponible"}.` };
    }

    // Sin herramientas = el modelo pregunta o no entendió. Se devuelve tal cual:
    // es la pregunta que hay que hacerle a la persona.
    if (!res.toolCalls || res.toolCalls.length === 0) {
      return { estado: "pregunta", mensaje: (res.content ?? "").trim() || "No entendí qué operación anotar." };
    }

    mensajes.push({
      role: "assistant",
      content: res.content ?? "",
      tool_calls: res.toolCalls,
    });

    let huboBusqueda = false;

    for (const llamada of res.toolCalls.slice(0, 4)) {
      const nombre = llamada.function?.name ?? "";
      const mapping = resolveToolCall(nombre);
      if (!mapping) {
        mensajes.push({ role: "tool", tool_call_id: llamada.id, content: JSON.stringify({ error: `Herramienta "${nombre}" desconocida` }) });
        continue;
      }

      let args: Record<string, unknown> = {};
      try { args = JSON.parse(llamada.function.arguments || "{}"); } catch { args = {}; }

      // ── Escritura: ensayo obligatorio ──────────────────────────────────
      if (isToolApprovalRequired(nombre)) {
        const ensayo = await orchestrator.executeSync({
          domain: mapping.domain,
          action: mapping.action,
          payload: { ...args, __validar: true },
          tenantId,
          actorRole,
        });
        if (!ensayo.success) {
          // El error vuelve al modelo: puede corregir en la ronda siguiente
          // (buscar bien la máquina, preguntar por el monto que no cuadra).
          mensajes.push({ role: "tool", tool_call_id: llamada.id, content: JSON.stringify({ error: ensayo.error }) });
          continue;
        }
        const resumen = (ensayo.data as { resumen?: string } | undefined)?.resumen ?? "Operación lista para confirmar.";

        if (!confirmar) {
          const aprobacionId = stashPendingApproval({
            tenantId,
            toolName: nombre,
            domain: mapping.domain,
            action: mapping.action,
            payload: args,
            requestedBy: solicitante,
          });
          logger.info("[plata/anotar] operación pendiente de confirmación", { tenantId, tool: nombre, canal });
          return { estado: "pendiente", aprobacionId, resumen, tool: nombre };
        }

        const escritura = await orchestrator.executeSync({
          domain: mapping.domain,
          action: mapping.action,
          payload: args,
          tenantId,
          actorRole,
        });
        if (!escritura.success) {
          return { estado: "error", mensaje: escritura.error ?? "No se pudo registrar la operación." };
        }
        const datos = (escritura.data ?? {}) as Record<string, unknown>;
        logger.info("[plata/anotar] operación registrada", { tenantId, tool: nombre, canal });
        return {
          estado: "registrado",
          resumen: String(datos.confirmacion ?? resumen),
          detalle: datos,
        };
      }

      // ── Lectura: alimenta la ronda siguiente ───────────────────────────
      huboBusqueda = true;
      const lectura = await orchestrator.executeSync({
        domain: mapping.domain,
        action: mapping.action,
        payload: args,
        tenantId,
        actorRole,
      });
      mensajes.push({
        role: "tool",
        tool_call_id: llamada.id,
        content: JSON.stringify(lectura.success ? lectura.data : { error: lectura.error }),
      });
    }

    // Si en esta vuelta no hubo ninguna búsqueda, la siguiente no va a tener
    // información nueva: cortar acá evita gastar una llamada para nada.
    if (!huboBusqueda && ronda > 0) break;
  }

  return {
    estado: "pregunta",
    mensaje: "No pude completar la operación con lo que me diste. Decime la máquina o la persona y el monto exacto.",
  };
}
