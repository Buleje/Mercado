"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { AccionNavegar, AprobacionPendiente, Message, Tono } from "./tipos";

const STORAGE_KEY = "chat-ia-clean-history";

function loadHistory(): Message[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Message[];
    return Array.isArray(parsed) ? parsed.slice(-40) : [];
  } catch {
    return [];
  }
}

function saveHistory(msgs: Message[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-40)));
  } catch {
    /* noop */
  }
}

/**
 * Instrucción del tono: se antepone al mensaje para que el endpoint no requiera
 * cambios de schema. El system prompt del backend ya incluye Feynman; acá sólo
 * se refuerza cuando se cambia el tono.
 */
function prefijoDeTono(tono: Tono): string {
  if (tono === "ejecutivo")
    return "[TONO: ejecutivo — directo, números, sin explicaciones largas] ";
  if (tono === "tecnico") return "[TONO: técnico — jerga completa, asume audiencia experta] ";
  return "";
}

/** El stream terminó sin texto: qué decir según el error que llegó (o no). */
function textoSinRespuesta(sawError: string | null): string {
  // Caso típico: Vercel AI Gateway devuelve 401 (falta AI_GATEWAY_API_KEY).
  if (sawError && /401|unauthor|api.?key|invalid.*key/i.test(sawError)) {
    return `**API key del proveedor IA inválida o expirada.**\n\nDetalle: ${sawError}\n\n**Solución:** verifica que \`GROQ_API_KEY\` (o \`ANTHROPIC_API_KEY\` / \`XAI_API_KEY\`) en \`.env.local\` sea la key real del proveedor (Groq ~56 chars, Anthropic ~108 chars, xAI ~84 chars). Si vale solo \`gsk_...\` o similar corto, es un placeholder.`;
  }
  if (sawError) return `**No pude responder:** ${sawError}`;
  return `**El asistente está inactivo.** No se recibió respuesta de la IA.\n\nPosibles causas:\n- Falta configurar \`AI_GATEWAY_API_KEY\` o \`GROQ_API_KEY\` en el servidor\n- El servicio de IA externo está temporalmente caído\n- Se agotaron los tokens disponibles del mes\n\nContacta al administrador técnico para revisar la configuración.`;
}

/**
 * Estado y envío del Chat IA: historial en localStorage, streaming SSE desde
 * `/api/ai-assistant`, acciones de navegación y aprobaciones (HITL).
 *
 * `onCambioAprobaciones` avisa cuando llega o se resuelve una aprobación, para
 * que el contador «N esperan tu OK» de la cabecera no espere a su sondeo.
 */
export function useChatIA(tono: Tono, onCambioAprobaciones?: () => void) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const avisarRef = useRef(onCambioAprobaciones);
  useEffect(() => {
    avisarRef.current = onCambioAprobaciones;
  });

  // Hydrate desde localStorage en cliente
  useEffect(() => {
    setMessages(loadHistory());
  }, []);

  // Persistir mensajes
  useEffect(() => {
    if (messages.length > 0) saveHistory(messages);
  }, [messages]);

  const sendMessage = useCallback(
    async (trimmed: string) => {
      const userMsg: Message = {
        id: `u-${Date.now()}`,
        role: "user",
        content: trimmed,
        timestamp: Date.now(),
      };
      const assistantId = `a-${Date.now() + 1}`;
      const placeholder: Message = {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: Date.now() + 1,
      };
      const editar = (cambio: (m: Message) => Message) =>
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? cambio(m) : m)));

      setMessages((prev) => [...prev, userMsg, placeholder]);
      setStreaming(true);
      abortRef.current = new AbortController();

      try {
        const history = messages
          .filter((m) => m.role !== "assistant" || m.content.length > 0)
          .slice(-8)
          .map((m) => ({ role: m.role, content: m.content }));

        const res = await fetch("/api/ai-assistant", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ message: prefijoDeTono(tono) + trimmed, history, stream: true }),
          signal: abortRef.current.signal,
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({ error: "Error de red" }));
          throw new Error(errBody.error ?? `Error ${res.status}`);
        }

        if (res.headers.get("content-type")?.includes("text/event-stream") && res.body) {
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let fullContent = "";
          let sawError: string | null = null;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              const t = line.trim();
              if (!t || !t.startsWith("data: ")) continue;
              const payload = t.slice(6);
              if (payload === "[DONE]") break;
              try {
                const json = JSON.parse(payload) as {
                  content?: string;
                  error?: string;
                  accion?: AccionNavegar;
                  aprobacion?: AprobacionPendiente;
                };
                if (json.error) {
                  sawError = json.error;
                } else if (json.accion) {
                  // Se acumulan en el mensaje: llegan ANTES del texto (el tool
                  // corre antes de la segunda llamada al modelo).
                  const accion = json.accion;
                  editar((m) => ({
                    ...m,
                    acciones: [...(m.acciones ?? []).filter((a) => a.url !== accion.url), accion],
                  }));
                } else if (json.aprobacion) {
                  const ap = json.aprobacion;
                  editar((m) => ({
                    ...m,
                    aprobaciones: [...(m.aprobaciones ?? []).filter((x) => x.id !== ap.id), ap],
                  }));
                  avisarRef.current?.();
                } else if (json.content) {
                  fullContent += json.content;
                  const captured = fullContent;
                  editar((m) => ({ ...m, content: captured }));
                }
              } catch {
                /* línea SSE que no es JSON: se salta */
              }
            }
          }

          // Si el stream terminó sin contenido, se muestra un error claro.
          if (fullContent.length === 0) {
            const errorText = textoSinRespuesta(sawError);
            editar((m) => ({ ...m, content: errorText, error: true }));
          }
        } else {
          // Fallback JSON
          const data = (await res.json()) as { reply?: string; error?: string };
          const content = data.reply ?? "";
          editar((m) =>
            content
              ? { ...m, content }
              : {
                  ...m,
                  content: `**No pude responder:** ${data.error ?? "respuesta vacía del servidor"}`,
                  error: true,
                },
          );
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          // Cancelado por el usuario
          setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        } else {
          const msg = err instanceof Error ? err.message : "No pude conectarme a la IA.";
          editar((m) => ({
            ...m,
            content: `**No pude responder:** ${msg}\n\nVerifica tu conexión o intenta de nuevo en un momento.`,
            error: true,
          }));
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [messages, tono],
  );

  /** Manda el texto. Devuelve `false` si no salió (vacío o ya hay una respuesta en curso). */
  const enviar = useCallback(
    (text: string): boolean => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return false;
      void sendMessage(trimmed);
      return true;
    },
    [sendMessage, streaming],
  );

  /**
   * Confirma o descarta una acción que toca datos. El resultado se escribe en
   * la propia tarjeta: si el POST falla, la tarjeta lo dice y NO se marca como
   * hecha — dar por buena una escritura que no ocurrió es el peor final posible.
   */
  const resolverAprobacion = useCallback(async (id: string, accion: "approve" | "reject") => {
    const marcar = (estado: AprobacionPendiente["estado"], detalle?: string) =>
      setMessages((prev) =>
        prev.map((m) => ({
          ...m,
          aprobaciones: m.aprobaciones?.map((a) => (a.id === id ? { ...a, estado, detalle } : a)),
        })),
      );
    try {
      const res = await fetch("/api/ai-assistant/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        credentials: "include",
        body: JSON.stringify({ id, action: accion }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; result?: unknown };
      if (!res.ok) {
        marcar("error", body.error ?? `HTTP ${res.status}`);
        return;
      }
      if (accion === "reject") {
        marcar("cancelada");
        return;
      }
      const datos = body.result as Record<string, unknown> | undefined;
      /**
       * Lo que se muestra al confirmar es la frase que escribió el agente
       * («Anotado: S/ 675.00 de combustible para Camión N12»), no el volcado
       * de claves: `registrado: true · destino: activos · gastoId: cmtn…` dejaba
       * el dato que importa —cuánto y a qué— perdido al final.
       */
      const humano = typeof datos?.confirmacion === "string" ? datos.confirmacion : null;
      const crudo = datos
        ? Object.entries(datos)
            .filter(([k, v]) => v !== null && typeof v !== "object" && k !== "confirmacion")
            .map(([k, v]) => `${k}: ${String(v)}`)
            .join(" · ")
        : "";
      marcar("hecha", humano ?? crudo ?? "Acción ejecutada.");
    } catch (e) {
      marcar("error", e instanceof Error ? e.message : String(e));
    } finally {
      avisarRef.current?.();
    }
  }, []);

  const copiar = useCallback(async (msg: Message) => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopiedId(msg.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      /* noop */
    }
  }, []);

  const borrar = useCallback(() => {
    if (streaming) return;
    setMessages([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* noop */
    }
  }, [streaming]);

  const detener = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { messages, streaming, copiedId, enviar, resolverAprobacion, copiar, borrar, detener };
}
