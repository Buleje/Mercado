/**
 * lib/llm-providers/types.ts
 *
 * Interfaz común para providers LLM. Permite swap entre Groq, Anthropic,
 * OpenAI, etc sin cambiar el código que llama al LLM.
 *
 * Ver ADR-010 para la estrategia de router y tiers.
 */

/**
 * Una parte de un mensaje multimodal (Buleje IA, ADR-528). Las fotos viajan en
 * base64 y cada adaptador las traduce a su formato: OpenAI-compatible →
 * `image_url` con `data:`; Anthropic → bloque `image` base64. Groq no lee fotos
 * y lo dice claro en vez de mandarlas como texto.
 */
export type ParteContenido =
  | { type: "text"; text: string }
  | { type: "image"; mime: string; base64: string };

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ParteContenido[];
  tool_call_id?: string;
  tool_calls?: unknown[];
}

export interface ToolCallResult {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface LLMCallOptions {
  messages: ChatMessage[];
  temperature: number;
  maxTokens?: number;
  tools?: unknown[];
  toolChoice?: "auto" | "none" | { type: "function"; function: { name: string } };
  stream?: boolean;
  /** Solo informativo para logging/tracking. No cambia comportamiento. */
  label?: string;
}

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LLMResponse {
  ok: boolean;
  /** Contenido textual de la respuesta (null si hubo tool_calls o error). */
  content: string | null;
  /** Llamadas a tools solicitadas por el modelo. */
  toolCalls: ToolCallResult[] | null;
  usage: LLMUsage;
  /** Body raw para streaming — null si stream=false o si hubo error. */
  body: ReadableStream<Uint8Array> | null;
  /** Mensaje de error legible si ok=false. */
  error?: string;
  /** Identificador del provider que atendió la llamada (para observabilidad). */
  provider: "groq" | "anthropic" | "openai" | "xai";
  /** Modelo concreto usado (para observabilidad). */
  model: string;
  /**
   * Raw response data del provider (shape nativo de OpenAI/Groq/Anthropic).
   * Opcional — algunos callers legacy lo consumen directo. Nuevos callers
   * deberían preferir `content` + `toolCalls` normalizados. TECH-DEBT para limpieza.
   */
  data?: unknown;
  /** Cantidad de intentos que hizo el router (incluye retries + fallback). */
  attempts?: number;
}

export interface LLMProvider {
  readonly name: "groq" | "anthropic" | "openai" | "xai";
  /** Modelo default para este provider en cada tier. */
  readonly models: Readonly<Record<"cheap" | "balanced" | "premium", string>>;
  /** Indica si el provider tiene API key configurada en el entorno actual. */
  isAvailable(): boolean;
  /** Llamada síncrona — devuelve la respuesta completa. */
  chat(opts: LLMCallOptions, model: string): Promise<LLMResponse>;
}

/** El texto de un contenido (las fotos se omiten). */
export function contenidoComoTexto(content: string | ParteContenido[]): string {
  if (typeof content === "string") return content;
  return content
    .filter((p): p is Extract<ParteContenido, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}

/** ¿Algún mensaje trae una foto? */
export function hayImagenes(messages: ChatMessage[]): boolean {
  return messages.some((m) => Array.isArray(m.content) && m.content.some((p) => p.type === "image"));
}

/** Mensaje de error estándar para un proveedor que no lee fotos. */
export const ERROR_SIN_VISION = "sin_vision: este modelo no lee fotos";
