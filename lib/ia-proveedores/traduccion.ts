/**
 * Buleje IA (ADR-528) — traducir los mensajes del formato común
 * (`lib/llm-providers/types`, estilo OpenAI) a cada protocolo.
 *
 * Puro y sin `server-only`: lo usan el adaptador con la clave del negocio y el
 * proveedor Anthropic de la plataforma (`lib/llm-providers/anthropic.ts`).
 */

import type { ChatMessage, ParteContenido, ToolCallResult } from "@/lib/llm-providers/types";

function dataUrl(p: Extract<ParteContenido, { type: "image" }>): string {
  return `data:${p.mime};base64,${p.base64}`;
}

/** Mensajes al formato OpenAI: las fotos como `image_url` con `data:`. */
export function aMensajesOpenAI(messages: ChatMessage[]): Array<Record<string, unknown>> {
  return messages.map((m) => {
    const out: Record<string, unknown> = { role: m.role };
    if (typeof m.content === "string") {
      out.content = m.content;
    } else {
      out.content = m.content.map((p) =>
        p.type === "text" ? { type: "text", text: p.text } : { type: "image_url", image_url: { url: dataUrl(p) } },
      );
    }
    if (m.tool_call_id) out.tool_call_id = m.tool_call_id;
    if (m.tool_calls && m.tool_calls.length > 0) {
      out.tool_calls = (m.tool_calls as ToolCallResult[]).map((t) => ({
        id: t.id,
        type: "function",
        function: { name: t.function?.name ?? "", arguments: t.function?.arguments ?? "{}" },
      }));
    }
    return out;
  });
}

type BloqueAnthropic = Record<string, unknown>;
type MensajeAnthropic = { role: "user" | "assistant"; content: BloqueAnthropic[] };

function bloquesAnthropic(content: string | ParteContenido[]): BloqueAnthropic[] {
  if (typeof content === "string") return content ? [{ type: "text", text: content }] : [];
  return content.map((p) =>
    p.type === "text"
      ? { type: "text", text: p.text }
      : { type: "image", source: { type: "base64", media_type: p.mime, data: p.base64 } },
  );
}

/**
 * Mensajes al formato de Claude: `system` aparte, `tool` → bloque
 * `tool_result` (con `tool_use_id`) dentro de un `user`, `tool_calls` del
 * asistente → bloques `tool_use`. Mensajes seguidos del mismo rol se juntan
 * (Claude exige que alternen).
 */
export function aMensajesAnthropic(messages: ChatMessage[]): { system: string | null; messages: MensajeAnthropic[] } {
  const sistema: string[] = [];
  const out: MensajeAnthropic[] = [];
  const empujar = (role: "user" | "assistant", bloques: BloqueAnthropic[]) => {
    if (bloques.length === 0) return;
    const ultimo = out[out.length - 1];
    if (ultimo && ultimo.role === role) ultimo.content.push(...bloques);
    else out.push({ role, content: bloques });
  };

  for (const m of messages) {
    if (m.role === "system") {
      sistema.push(typeof m.content === "string" ? m.content : bloquesAnthropic(m.content).map((b) => String(b.text ?? "")).join("\n"));
      continue;
    }
    if (m.role === "tool") {
      const texto = typeof m.content === "string" ? m.content : bloquesAnthropic(m.content).map((b) => String(b.text ?? "")).join("\n");
      empujar("user", [{ type: "tool_result", tool_use_id: m.tool_call_id ?? "", content: texto }]);
      continue;
    }
    if (m.role === "assistant") {
      const bloques = bloquesAnthropic(m.content);
      for (const t of (m.tool_calls ?? []) as ToolCallResult[]) {
        let input: unknown = {};
        try { input = JSON.parse(t.function?.arguments || "{}"); } catch { input = {}; }
        bloques.push({ type: "tool_use", id: t.id, name: t.function?.name ?? "", input });
      }
      empujar("assistant", bloques);
      continue;
    }
    empujar("user", bloquesAnthropic(m.content));
  }
  return { system: sistema.length > 0 ? sistema.join("\n\n") : null, messages: out };
}

/** Herramientas OpenAI `{type:function,function:{…}}` → Claude `{name,description,input_schema}`. */
export function aToolsAnthropic(tools: unknown[]): Array<{ name: string; description: string; input_schema: unknown }> {
  return tools
    .map((t) => {
      const f = (t as { function?: { name: string; description?: string; parameters?: unknown } }).function;
      if (!f) return null;
      return { name: f.name, description: f.description ?? "", input_schema: f.parameters ?? { type: "object", properties: {} } };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null);
}

